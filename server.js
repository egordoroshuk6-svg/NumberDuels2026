const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const rooms = new Map();

function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function uniqueRoomCode() {
  let code = makeRoomCode();
  while (rooms.has(code)) code = makeRoomCode();
  return code;
}

function getRoomBySocket(socketId) {
  for (const room of rooms.values()) {
    if (room.players.some((p) => p.id === socketId)) return room;
  }
  return null;
}

function getPlayer(room, socketId) {
  return room.players.find((p) => p.id === socketId);
}

function getEnemy(room, socketId) {
  return room.players.find((p) => p.id !== socketId);
}

function publicRoom(room) {
  return {
    code: room.code,
    phase: room.phase,
    turnPlayerId: room.turnPlayerId,
    winnerId: room.winnerId,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      ready: p.ready,
      secretNumber: p.secretNumber,
      rematch: p.rematch
    })),
    history: room.history,
    chat: room.chat
  };
}

function broadcast(room) {
  io.to(room.code).emit('room:update', publicRoom(room));
}

function resetForNewRound(room) {
  room.phase = 'prepare';
  room.turnPlayerId = null;
  room.winnerId = null;
  room.history = [];
  room.chat = [];
  room.players.forEach((p) => {
    p.ready = false;
    p.secretNumber = null;
    p.rematch = false;
  });
}

function startBattleIfReady(room) {
  if (room.players.length !== 2) return;
  if (!room.players.every((p) => p.ready && Number.isFinite(p.secretNumber))) return;

  room.phase = 'battle';
  room.turnPlayerId = room.players[0].id;
  room.chat.push({
    system: true,
    text: 'Бій почався!'
  });
  broadcast(room);
}

function finishGame(room, winnerId, text) {
  room.phase = 'result';
  room.winnerId = winnerId;
  room.turnPlayerId = null;
  room.chat.push({
    system: true,
    text
  });
  broadcast(room);
}

io.on('connection', (socket) => {
  socket.emit('connected', { socketId: socket.id });

  socket.on('room:create', ({ name }) => {
    const code = uniqueRoomCode();

    const room = {
      code,
      phase: 'lobby',
      turnPlayerId: null,
      winnerId: null,
      players: [
        {
          id: socket.id,
          name: (name || 'Гравець 1').trim(),
          ready: false,
          secretNumber: null,
          rematch: false
        }
      ],
      history: [],
      chat: []
    };

    rooms.set(code, room);
    socket.join(code);

    socket.emit('room:created', { roomCode: code });
    broadcast(room);
  });

  socket.on('room:join', ({ roomCode, name }) => {
    const code = String(roomCode || '').trim().toUpperCase();
    const room = rooms.get(code);

    if (!room) {
      socket.emit('error:message', { message: 'Кімнату не знайдено' });
      return;
    }

    if (room.players.length >= 2) {
      socket.emit('error:message', { message: 'Кімната вже заповнена' });
      return;
    }

    if (room.phase !== 'lobby' && room.phase !== 'prepare') {
      socket.emit('error:message', { message: 'Зараз не можна приєднатись' });
      return;
    }

    room.players.push({
      id: socket.id,
      name: (name || 'Гравець 2').trim(),
      ready: false,
      secretNumber: null,
      rematch: false
    });

    socket.join(code);
    socket.emit('room:joined', { roomCode: code });

    room.chat.push({
      system: true,
      text: `${name || 'Гравець'} приєднався до кімнати`
    });

    if (room.players.length === 2) {
      room.phase = 'prepare';
      room.chat.push({
        system: true,
        text: 'Обидва гравці в кімнаті. Введіть секретні числа.'
      });
    }

    broadcast(room);
  });

  socket.on('player:setSecret', ({ roomCode, secretNumber }) => {
    const code = String(roomCode || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return;

    const player = getPlayer(room, socket.id);
    if (!player) return;

    const value = Number(secretNumber);
    if (!Number.isFinite(value)) {
      socket.emit('error:message', { message: 'Некоректне число' });
      return;
    }

    player.secretNumber = value;
    player.ready = true;

    room.chat.push({
      system: true,
      text: `${player.name} готовий`
    });

    broadcast(room);
    startBattleIfReady(room);
  });

  socket.on('turn:guess', ({ roomCode, guess }) => {
    const code = String(roomCode || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return;

    if (room.phase !== 'battle') {
      socket.emit('error:message', { message: 'Зараз не бойова фаза' });
      return;
    }

    if (room.turnPlayerId !== socket.id) {
      socket.emit('error:message', { message: 'Зараз не твій хід' });
      return;
    }

    const player = getPlayer(room, socket.id);
    const enemy = getEnemy(room, socket.id);
    if (!player || !enemy) return;

    const value = Number(guess);
    if (!Number.isFinite(value)) {
      socket.emit('error:message', { message: 'Некоректна спроба' });
      return;
    }

    if (value === enemy.secretNumber) {
      room.history.push({
        playerName: player.name,
        text: `вгадав ${value}`,
        result: 'hit'
      });
      finishGame(room, player.id, `${player.name} вгадав число ${value}`);
      return;
    }

    room.history.push({
      playerName: player.name,
      text: `${value} → ${value < enemy.secretNumber ? 'більше' : 'менше'}`,
      result: 'miss'
    });

    room.chat.push({
      system: true,
      text: `${player.name} сказав ${value} — ${value < enemy.secretNumber ? 'більше' : 'менше'}`
    });

    room.turnPlayerId = enemy.id;
    broadcast(room);
  });

  socket.on('chat:send', ({ roomCode, message }) => {
    const code = String(roomCode || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return;

    const player = getPlayer(room, socket.id);
    if (!player) return;

    const text = String(message || '').trim();
    if (!text) return;

    room.chat.push({
      playerName: player.name,
      text
    });

    broadcast(room);
  });

  socket.on('rematch:request', ({ roomCode }) => {
    const code = String(roomCode || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return;

    const player = getPlayer(room, socket.id);
    if (!player) return;

    player.rematch = true;
    room.chat.push({
      system: true,
      text: `${player.name} хоче рематч`
    });

    if (room.players.length === 2 && room.players.every((p) => p.rematch)) {
      resetForNewRound(room);
      room.chat.push({
        system: true,
        text: 'Рематч почався. Введіть нові секретні числа.'
      });
    }

    broadcast(room);
  });

  socket.on('room:leave', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;

    room.players = room.players.filter((p) => p.id !== socket.id);

    if (room.players.length === 0) {
      rooms.delete(room.code);
      return;
    }

    room.phase = 'lobby';
    room.turnPlayerId = null;
    room.winnerId = null;
    room.history = [];
    room.chat.push({
      system: true,
      text: 'Гравець вийшов з кімнати'
    });

    room.players.forEach((p) => {
      p.ready = false;
      p.secretNumber = null;
      p.rematch = false;
    });

    broadcast(room);
  });

  socket.on('disconnect', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;

    room.players = room.players.filter((p) => p.id !== socket.id);

    if (room.players.length === 0) {
      rooms.delete(room.code);
      return;
    }

    room.phase = 'lobby';
    room.turnPlayerId = null;
    room.winnerId = null;
    room.history = [];
    room.chat.push({
      system: true,
      text: 'Гравець відключився'
    });

    room.players.forEach((p) => {
      p.ready = false;
      p.secretNumber = null;
      p.rematch = false;
    });

    broadcast(room);
  });
});

server.listen(PORT, () => {
  console.log(`Сервер запущено: http://localhost:${PORT}`);
});

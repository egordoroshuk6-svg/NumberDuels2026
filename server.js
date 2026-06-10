<!-- server.js -->
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

function codeGen(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function makeRoom(hostId, hostName) {
  let code = codeGen();
  while (rooms.has(code)) code = codeGen();

  const room = {
    code,
    phase: 'lobby', // lobby | prepare | battle | result
    players: [
      {
        id: hostId,
        name: hostName || 'Гравець 1',
        secret: null,
        ready: false,
        rematch: false,
        connected: true
      }
    ],
    turnPlayerId: null,
    winnerId: null,
    history: [],
    chat: [
      { id: Date.now() + Math.random(), system: true, text: 'Кімнату створено. Очікування другого гравця.' }
    ]
  };

  rooms.set(code, room);
  return room;
}

function roomState(room) {
  return {
    code: room.code,
    phase: room.phase,
    turnPlayerId: room.turnPlayerId,
    winnerId: room.winnerId,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      ready: p.ready,
      rematch: p.rematch,
      connected: p.connected
    })),
    history: room.history,
    chat: room.chat.slice(-50)
  };
}

function emitRoom(room) {
  io.to(room.code).emit('room:update', roomState(room));
}

function getRoomBySocket(socketId) {
  for (const room of rooms.values()) {
    const player = room.players.find((p) => p.id === socketId);
    if (player) return room;
  }
  return null;
}

function getOpponent(room, socketId) {
  return room.players.find((p) => p.id !== socketId) || null;
}

function resetForRematch(room) {
  room.phase = room.players.length === 2 ? 'prepare' : 'lobby';
  room.turnPlayerId = null;
  room.winnerId = null;
  room.history = [];
  room.players.forEach((p) => {
    p.secret = null;
    p.ready = false;
    p.rematch = false;
  });
  room.chat.push({
    id: Date.now() + Math.random(),
    system: true,
    text: 'Рематч створено. Введіть нові секретні числа.'
  });
}

io.on('connection', (socket) => {
  socket.emit('connected', { socketId: socket.id });

  socket.on('room:create', ({ name }) => {
    const playerName = String(name || '').trim() || 'Гравець 1';
    const room = makeRoom(socket.id, playerName);
    socket.join(room.code);

    socket.emit('room:created', {
      roomCode: room.code,
      playerId: socket.id
    });

    emitRoom(room);
  });

  socket.on('room:join', ({ roomCode, name }) => {
    const code = String(roomCode || '').trim().toUpperCase();
    const playerName = String(name || '').trim() || 'Гравець 2';
    const room = rooms.get(code);

    if (!room) {
      socket.emit('error:message', { message: 'Кімнату не знайдено.' });
      return;
    }

    if (room.players.length >= 2) {
      socket.emit('error:message', { message: 'Кімната вже заповнена.' });
      return;
    }

    room.players.push({
      id: socket.id,
      name: playerName,
      secret: null,
      ready: false,
      rematch: false,
      connected: true
    });

    room.phase = 'prepare';
    room.chat.push({
      id: Date.now() + Math.random(),
      system: true,
      text: `${playerName} приєднався до кімнати.`
    });

    socket.join(room.code);
    socket.emit('room:joined', {
      roomCode: room.code,
      playerId: socket.id
    });

    emitRoom(room);
  });

  socket.on('player:setSecret', ({ roomCode, secretNumber }) => {
    const room = rooms.get(String(roomCode || '').trim().toUpperCase());
    if (!room) {
      socket.emit('error:message', { message: 'Кімнату не знайдено.' });
      return;
    }

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    const value = Number(secretNumber);
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      socket.emit('error:message', { message: 'Введи число від 1 до 100.' });
      return;
    }

    player.secret = value;
    player.ready = true;

    room.chat.push({
      id: Date.now() + Math.random(),
      system: true,
      text: `${player.name} готовий до бою.`
    });

    if (room.players.length === 2 && room.players.every((p) => p.ready)) {
      room.phase = 'battle';
      room.turnPlayerId = room.players[Math.floor(Math.random() * 2)].id;
      room.chat.push({
        id: Date.now() + Math.random(),
        system: true,
        text: 'Обидва гравці готові. Матч почався.'
      });
    }

    emitRoom(room);
  });

  socket.on('turn:guess', ({ roomCode, guess }) => {
    const room = rooms.get(String(roomCode || '').trim().toUpperCase());
    if (!room) {
      socket.emit('error:message', { message: 'Кімнату не знайдено.' });
      return;
    }

    if (room.phase !== 'battle') {
      socket.emit('error:message', { message: 'Матч ще не почався.' });
      return;
    }

    if (room.turnPlayerId !== socket.id) {
      socket.emit('error:message', { message: 'Зараз не ваша черга.' });
      return;
    }

    const player = room.players.find((p) => p.id === socket.id);
    const enemy = getOpponent(room, socket.id);
    if (!player || !enemy) return;

    const value = Number(guess);
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      socket.emit('error:message', { message: 'Спроба має бути числом від 1 до 100.' });
      return;
    }

    let result = 'lower';
    let text = '';

    if (value === enemy.secret) {
      room.phase = 'result';
      room.winnerId = player.id;
      result = 'correct';
      text = `${player.name} вгадав число ${value} і переміг.`;
      room.chat.push({
        id: Date.now() + Math.random(),
        system: true,
        text: `${player.name} переміг у матчі.`
      });
    } else if (value < enemy.secret) {
      result = 'higher';
      text = `${player.name}: ${value} → треба більше`;
      room.turnPlayerId = enemy.id;
    } else {
      result = 'lower';
      text = `${player.name}: ${value} → треба менше`;
      room.turnPlayerId = enemy.id;
    }

    room.history.push({
      id: Date.now() + Math.random(),
      playerId: player.id,
      playerName: player.name,
      guess: value,
      result,
      text
    });

    emitRoom(room);
  });

  socket.on('chat:send', ({ roomCode, message }) => {
    const room = rooms.get(String(roomCode || '').trim().toUpperCase());
    if (!room) return;

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    const text = String(message || '').trim();
    if (!text) return;

    room.chat.push({
      id: Date.now() + Math.random(),
      system: false,
      playerId: player.id,
      playerName: player.name,
      text: text.slice(0, 250)
    });

    emitRoom(room);
  });

  socket.on('rematch:request', ({ roomCode }) => {
    const room = rooms.get(String(roomCode || '').trim().toUpperCase());
    if (!room) return;

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    player.rematch = true;
    room.chat.push({
      id: Date.now() + Math.random(),
      system: true,
      text: `${player.name} хоче рематч.`
    });

    if (room.players.length === 2 && room.players.every((p) => p.rematch)) {
      resetForRematch(room);
    }

    emitRoom(room);
  });

  socket.on('room:leave', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;

    const leaving = room.players.find((p) => p.id === socket.id);
    room.players = room.players.filter((p) => p.id !== socket.id);
    socket.leave(room.code);

    if (room.players.length === 0) {
      rooms.delete(room.code);
      return;
    }

    room.phase = 'lobby';
    room.turnPlayerId = null;
    room.winnerId = null;
    room.history = [];
    room.players.forEach((p) => {
      p.ready = false;
      p.secret = null;
      p.rematch = false;
    });

    room.chat.push({
      id: Date.now() + Math.random(),
      system: true,
      text: `${leaving?.name || 'Гравець'} покинув кімнату.`
    });

    emitRoom(room);
  });

  socket.on('disconnect', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    room.players = room.players.filter((p) => p.id !== socket.id);

    if (room.players.length === 0) {
      rooms.delete(room.code);
      return;
    }

    room.phase = 'lobby';
    room.turnPlayerId = null;
    room.winnerId = null;
    room.history = [];
    room.players.forEach((p) => {
      p.ready = false;
      p.secret = null;
      p.rematch = false;
    });

    room.chat.push({
      id: Date.now() + Math.random(),
      system: true,
      text: `${player.name} відключився. Кімната скинута до лобі.`
    });

    emitRoom(room);
  });
});

server.listen(PORT, () => {
  console.log(`Сервер запущено: http://localhost:${PORT}`);
});

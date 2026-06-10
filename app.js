const socket = io();

const els = {
  globalStatus: document.getElementById('globalStatus'),

  stageLobby: document.getElementById('stageLobby'),
  stagePrepare: document.getElementById('stagePrepare'),
  stageBattle: document.getElementById('stageBattle'),
  stageResult: document.getElementById('stageResult'),

  playerName: document.getElementById('playerName'),
  roomCodeInput: document.getElementById('roomCodeInput'),
  createRoomBtn: document.getElementById('createRoomBtn'),
  joinRoomBtn: document.getElementById('joinRoomBtn'),
  copyRoomBtn: document.getElementById('copyRoomBtn'),

  prepareStatus: document.getElementById('prepareStatus'),
  secretNumberInput: document.getElementById('secretNumberInput'),
  setSecretBtn: document.getElementById('setSecretBtn'),

  turnBanner: document.getElementById('turnBanner'),
  guessInput: document.getElementById('guessInput'),
  guessBtn: document.getElementById('guessBtn'),
  historyList: document.getElementById('historyList'),
  chatList: document.getElementById('chatList'),
  chatInput: document.getElementById('chatInput'),
  sendChatBtn: document.getElementById('sendChatBtn'),

  resultTitle: document.getElementById('resultTitle'),
  resultText: document.getElementById('resultText'),
  resultHistoryList: document.getElementById('resultHistoryList'),
  rematchBtn: document.getElementById('rematchBtn'),

  leaveRoomBtnA: document.getElementById('leaveRoomBtnA'),
  leaveRoomBtnB: document.getElementById('leaveRoomBtnB'),
  leaveRoomBtnC: document.getElementById('leaveRoomBtnC')
};

let roomCode = '';

function showStage(name) {
  [els.stageLobby, els.stagePrepare, els.stageBattle, els.stageResult].forEach((el) => {
    el.classList.remove('active');
  });

  if (name === 'lobby') els.stageLobby.classList.add('active');
  if (name === 'prepare') els.stagePrepare.classList.add('active');
  if (name === 'battle') els.stageBattle.classList.add('active');
  if (name === 'result') els.stageResult.classList.add('active');
}

function renderRoom(room) {
  if (!room) return;

  roomCode = room.code;
  els.globalStatus.textContent = `кімната ${room.code}`;

  els.historyList.innerHTML = room.history.map((h) => `<div>${h.playerName}: ${h.text}</div>`).join('');
  els.chatList.innerHTML = room.chat.map((c) => {
    if (c.system) return `<div><em>${c.text}</em></div>`;
    return `<div><strong>${c.playerName}:</strong> ${c.text}</div>`;
  }).join('');

  const me = room.players.find((p) => p.id === socket.id);
  const enemy = room.players.find((p) => p.id !== socket.id);

  if (room.phase === 'lobby') {
    showStage('lobby');
  } else if (room.phase === 'prepare') {
    showStage('prepare');
    els.prepareStatus.textContent = `Гравців: ${room.players.length}/2`;
  } else if (room.phase === 'battle') {
    showStage('battle');
    els.turnBanner.textContent = room.turnPlayerId === socket.id ? 'Твій хід' : 'Хід суперника';
  } else if (room.phase === 'result') {
    showStage('result');
    if (room.winnerId === socket.id) {
      els.resultTitle.textContent = 'Ти переміг!';
    } else if (room.winnerId && enemy && room.winnerId === enemy.id) {
      els.resultTitle.textContent = 'Ти програв';
    } else {
      els.resultTitle.textContent = 'Нічия';
    }
    els.resultText.textContent = `Кімната: ${room.code}`;
    els.resultHistoryList.innerHTML = room.history.map((h) => `<div>${h.playerName}: ${h.text}</div>`).join('');
  }

  if (me && me.ready && room.phase === 'prepare') {
    els.prepareStatus.textContent = 'Ти вже готовий';
  }
}

function createRoom() {
  const name = els.playerName.value.trim() || 'Гравець';
  socket.emit('room:create', { name });
}

function joinRoom() {
  const name = els.playerName.value.trim() || 'Гравець';
  const code = els.roomCodeInput.value.trim().toUpperCase();

  if (!code) {
    alert('Введи код кімнати');
    return;
  }

  socket.emit('room:join', { roomCode: code, name });
}

function setSecret() {
  if (!roomCode) return alert('Немає кімнати');
  const value = Number(els.secretNumberInput.value);
  socket.emit('player:setSecret', { roomCode, secretNumber: value });
}

function sendGuess() {
  if (!roomCode) return alert('Немає кімнати');
  const value = Number(els.guessInput.value);
  socket.emit('turn:guess', { roomCode, guess: value });
  els.guessInput.value = '';
}

function sendChat() {
  if (!roomCode) return;
  const message = els.chatInput.value.trim();
  if (!message) return;
  socket.emit('chat:send', { roomCode, message });
  els.chatInput.value = '';
}

function rematch() {
  if (!roomCode) return;
  socket.emit('rematch:request', { roomCode });
}

function leaveRoom() {
  socket.emit('room:leave');
  roomCode = '';
  showStage('lobby');
}

socket.on('connected', () => {
  els.globalStatus.textContent = 'підключено';
});

socket.on('room:created', ({ roomCode: code }) => {
  roomCode = code;
  els.globalStatus.textContent = `кімната ${code}`;
  showStage('prepare');
});

socket.on('room:joined', ({ roomCode: code }) => {
  roomCode = code;
  els.globalStatus.textContent = `кімната ${code}`;
});

socket.on('room:update', (room) => {
  renderRoom(room);
});

socket.on('error:message', ({ message }) => {
  alert(message);
});

els.createRoomBtn.addEventListener('click', createRoom);
els.joinRoomBtn.addEventListener('click', joinRoom);
els.copyRoomBtn.addEventListener('click', () => {
  if (!roomCode) return alert('Немає коду кімнати');
  navigator.clipboard.writeText(roomCode);
});

els.setSecretBtn.addEventListener('click', setSecret);
els.guessBtn.addEventListener('click', sendGuess);
els.sendChatBtn.addEventListener('click', sendChat);
els.rematchBtn.addEventListener('click', rematch);

els.leaveRoomBtnA.addEventListener('click', leaveRoom);
els.leaveRoomBtnB.addEventListener('click', leaveRoom);
els.leaveRoomBtnC.addEventListener('click', leaveRoom);

els.roomCodeInput.addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase();
});

els.guessInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendGuess();
});

els.chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChat();
});

els.secretNumberInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') setSecret();
});

showStage('lobby');

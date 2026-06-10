// public/app.js
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

  roomCodeView: document.getElementById('roomCodeView'),
  phaseView: document.getElementById('phaseView'),
  playersCountView: document.getElementById('playersCountView'),
  turnView: document.getElementById('turnView'),
  meName: document.getElementById('meName'),
  meState: document.getElementById('meState'),
  enemyName: document.getElementById('enemyName'),
  enemyState: document.getElementById('enemyState'),

  prepareStatus: document.getElementById('prepareStatus'),
  secretNumberInput: document.getElementById('secretNumberInput'),
  setSecretBtn: document.getElementById('setSecretBtn'),
  prepareRoomCode: document.getElementById('prepareRoomCode'),
  prepareMe: document.getElementById('prepareMe'),
  prepareMeReady: document.getElementById('prepareMeReady'),
  prepareEnemy: document.getElementById('prepareEnemy'),
  prepareEnemyReady: document.getElementById('prepareEnemyReady'),

  battleStatus: document.getElementById('battleStatus'),
  turnBanner: document.getElementById('turnBanner'),
  guessInput: document.getElementById('guessInput'),
  guessBtn: document.getElementById('guessBtn'),
  historyList: document.getElementById('historyList'),
  battleMe: document.getElementById('battleMe'),
  battleEnemy: document.getElementById('battleEnemy'),

  chatList: document.getElementById('chatList'),
  chatInput: document.getElementById('chatInput'),
  sendChatBtn: document.getElementById('sendChatBtn'),

  resultBadge: document.getElementById('resultBadge'),
  resultTitle: document.getElementById('resultTitle'),
  resultText: document.getElementById('resultText'),
  resultHistoryList: document.getElementById('resultHistoryList'),
  rematchBtn: document.getElementById('rematchBtn'),
  rematchState: document.getElementById('rematchState'),

  leaveRoomBtnA: document.getElementById('leaveRoomBtnA'),
  leaveRoomBtnB: document.getElementById('leaveRoomBtnB'),
  leaveRoomBtnC: document.getElementById('leaveRoomBtnC')
};

let myId = null;
let roomCode = '';
let roomState = null;

function showStage(name) {
  [els.stageLobby, els.stagePrepare, els.stageBattle, els.stageResult].forEach((el) => {
    el.classList.remove('active');
  });

  if (name === 'lobby') els.stageLobby.classList.add('active');
  if (name === 'prepare') els.stagePrepare.classList.add('active');
  if (name === 'battle') els.stageBattle.classList.add('active');
  if (name === 'result') els.stageResult.classList.add('active');
}

function phaseLabel(phase) {
  if (phase === 'lobby') return 'лобі';
  if (phase === 'prepare') return 'підготовка';
  if (phase === 'battle') return 'дуель';
  if (phase === 'result') return 'результат';
  return '—';
}

function copyText(text) {
  navigator.clipboard.writeText(text)
    .then(() => alert('Скопійовано'))
    .catch(() => alert('Не вдалося скопіювати'));
}

function getMe(room) {
  return room.players.find((p) => p.id === myId);
}

function getEnemy(room) {
  return room.players.find((p) => p.id !== myId);
}

function renderLobby(room) {
  const me = getMe(room);
  const enemy = getEnemy(room);

  els.roomCodeView.textContent = room.code || '—';
  els.phaseView.textContent = phaseLabel(room.phase);
  els.playersCountView.textContent = `${room.players.length} / 2`;
  els.turnView.textContent = room.turnPlayerId
    ? room.turnPlayerId === myId ? 'твоя' : 'суперника'
    : '—';

  els.meName.textContent = me ? me.name : '—';
  els.meState.textContent = me
    ? me.ready ? 'готовий' : 'ще не готовий'
    : 'не в кімнаті';

  els.enemyName.textContent = enemy ? enemy.name : 'очікування...';
  els.enemyState.textContent = enemy
    ? enemy.ready ? 'готовий' : 'ще не готовий'
    : 'немає підключення';
}

function renderPrepare(room) {
  const me = getMe(room);
  const enemy = getEnemy(room);

  els.prepareRoomCode.textContent = room.code;
  els.prepareMe.textContent = me ? me.name : '—';
  els.prepareMeReady.textContent = me?.ready ? 'готовий' : 'не готовий';
  els.prepareEnemy.textContent = enemy ? enemy.name : 'очікування...';
  els.prepareEnemyReady.textContent = enemy
    ? enemy.ready ? 'готовий' : 'не готовий'
    : 'очікування';

  els.prepareStatus.textContent =
    room.players.length < 2 ? 'чекаємо другого гравця' :
    room.players.every((p) => p.ready) ? 'запуск матчу' :
    'очікування готовності';
}

function renderHistory(listEl, history) {
  listEl.innerHTML = '';
  if (!history.length) {
    const div = document.createElement('div');
    div.className = 'log-item';
    div.textContent = 'Ще немає ходів.';
    listEl.appendChild(div);
    return;
  }

  history.slice().reverse().forEach((item) => {
    const div = document.createElement('div');
    div.className = `log-item ${item.result || ''}`;
    div.innerHTML = `<strong>${item.playerName}</strong><span>${item.text}</span>`;
    listEl.appendChild(div);
  });
}

function renderChat(chat) {
  els.chatList.innerHTML = '';
  chat.forEach((msg) => {
    const div = document.createElement('div');
    div.className = 'chat-item' + (msg.system ? ' system' : '');
    if (msg.system) {
      div.textContent = msg.text;
    } else {
      div.innerHTML = `<strong>${msg.playerName}</strong><span>${msg.text}</span>`;
    }
    els.chatList.appendChild(div);
  });
  els.chatList.scrollTop = els.chatList.scrollHeight;
}

function renderBattle(room) {
  const me = getMe(room);
  const enemy = getEnemy(room);

  els.battleMe.textContent = me ? me.name : '—';
  els.battleEnemy.textContent = enemy ? enemy.name : '—';

  const myTurn = room.turnPlayerId === myId;
  els.turnBanner.textContent = myTurn ? 'Твій хід' : 'Хід суперника';
  els.battleStatus.textContent = myTurn ? 'атакуй' : 'очікуй';

  els.guessInput.disabled = !myTurn;
  els.guessBtn.disabled = !myTurn;

  renderHistory(els.historyList, room.history);
  renderChat(room.chat);
}

function renderResult(room) {
  const meWon = room.winnerId === myId;
  const me = getMe(room);

  els.resultBadge.textContent = meWon ? 'перемога' : 'поразка';
  els.resultTitle.textContent = meWon ? 'Ти переміг' : 'Ти програв';
  els.resultText.textContent = meWon
    ? 'Твоя дуель завершилась перемогою. Можна кликати рематч.'
    : 'Цього разу переміг суперник. Можна спробувати ще раз.';

  els.rematchState.textContent = me?.rematch ? 'рематч відправлено' : 'ще не вибрано';
  renderHistory(els.resultHistoryList, room.history);
}

function renderRoom(room) {
  roomState = room;
  roomCode = room.code;
  els.roomCodeInput.value = room.code;
  renderLobby(room);

  if (room.phase === 'lobby') showStage('lobby');
  if (room.phase === 'prepare') {
    renderPrepare(room);
    showStage('prepare');
  }
  if (room.phase === 'battle') {
    renderBattle(room);
    showStage('battle');
  }
  if (room.phase === 'result') {
    renderResult(room);
    showStage('result');
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

  socket.emit('player:setSecret', {
    roomCode,
    secretNumber: value
  });
}

function sendGuess() {
  if (!roomCode) return alert('Немає кімнати');
  const value = Number(els.guessInput.value);

  socket.emit('turn:guess', {
    roomCode,
    guess: value
  });

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
  roomState = null;
  els.roomCodeView.textContent = '—';
  els.phaseView.textContent = 'лобі';
  els.playersCountView.textContent = '0 / 2';
  els.turnView.textContent = '—';
  els.meName.textContent = '—';
  els.meState.textContent = 'не в кімнаті';
  els.enemyName.textContent = 'очікування...';
  els.enemyState.textContent = 'немає підключення';
  showStage('lobby');
}

socket.on('connected', ({ socketId }) => {
  myId = socketId;
  els.globalStatus.textContent = 'підключено';
});

socket.on('room:created', ({ roomCode: code }) => {
  roomCode = code;
  els.globalStatus.textContent = `кімната ${code}`;
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
  copyText(roomCode);
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

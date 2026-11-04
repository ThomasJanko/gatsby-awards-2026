import express from 'express';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../shared/types';
import {
  cleanupRooms,
  createRoom,
  endGame,
  getRoom,
  joinRoom,
  next,
  publicState,
  removePlayer,
  restart,
  reveal,
  rooms,
  setQuestionCount,
  startGame,
  vote,
  type Room,
} from './rooms';

const PORT = Number(process.env.PORT ?? 3000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../dist');

interface SocketData {
  code?: string;
  role?: 'screen' | 'player';
  playerId?: string;
  /** true seulement si le socket a présenté le hostToken de la salle */
  hostAuth?: boolean;
  /** code d'appairage d'un écran pas encore relié */
  screenCode?: string;
}

type IOSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

const app = express();
const http = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>(http, {
  cors: { origin: '*' },
  pingInterval: 10_000,
  pingTimeout: 8_000,
});

function lanIps(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i): i is os.NetworkInterfaceInfo => !!i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

// Permet à un écran ouvert en localhost d'afficher un QR code joignable depuis les téléphones
app.get('/api/info', (_req, res) => {
  res.json({ ips: lanIps() });
});

if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.use((_req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

// ---------- Écrans en attente d'appairage ----------

/** screenCode (4 chiffres) -> socketId */
const pendingScreens = new Map<string, string>();

function genScreenCode() {
  let c: string;
  do c = String(Math.floor(1000 + Math.random() * 9000));
  while (pendingScreens.has(c));
  return c;
}

// ---------- Diffusion de l'état ----------

function broadcast(room: Room) {
  const base = publicState(room);
  for (const sid of room.screens) io.to(sid).emit('state', base);
  for (const p of room.players.values()) {
    if (!p.socketId) continue;
    io.to(p.socketId).emit('state', {
      ...base,
      // Chaque joueur ne reçoit que SON propre vote
      me: { id: p.id, vote: room.votes.get(p.id) ?? null, isHost: p.isHost },
    });
  }
}

function contextOf(socket: IOSocket) {
  const { code, role, playerId } = socket.data;
  const room = code ? getRoom(code) : undefined;
  const player = room && playerId ? room.players.get(playerId) : undefined;
  return { room, role, player };
}

/** Seul l'organisateur authentifié (hostToken) peut piloter */
function hostRoom(socket: IOSocket) {
  const { room, role, player } = contextOf(socket);
  if (room && role === 'player' && player?.isHost && socket.data.hostAuth && player.socketId === socket.id) return room;
  return undefined;
}

function detach(socket: IOSocket) {
  if (socket.data.screenCode) pendingScreens.delete(socket.data.screenCode);
  const { room, role, player } = contextOf(socket);
  socket.data = {};
  if (!room) return;
  if (role === 'screen') room.screens.delete(socket.id);
  if (role === 'player' && player && player.socketId === socket.id) player.socketId = null;
  socket.leave(room.code);
  broadcast(room);
}

function attachScreen(socket: IOSocket, room: Room) {
  detach(socket);
  room.screens.add(socket.id);
  socket.data = { code: room.code, role: 'screen' };
  socket.join(room.code);
  socket.emit('screen:paired', { code: room.code });
  broadcast(room);
}

function closeRoom(room: Room) {
  io.to(room.code).emit('room:closed');
  for (const sid of [...room.screens, ...[...room.players.values()].map((p) => p.socketId)]) {
    const s = sid ? io.sockets.sockets.get(sid) : undefined;
    if (s) {
      s.leave(room.code);
      s.data = {};
    }
  }
  rooms.delete(room.code);
}

// ---------- Événements ----------

io.on('connection', (socket: IOSocket) => {
  // --- Écran TV ---
  socket.on('screen:hello', (cb) => {
    detach(socket);
    const screenCode = genScreenCode();
    pendingScreens.set(screenCode, socket.id);
    socket.data = { screenCode };
    cb({ ok: true, screenCode });
  });

  socket.on('screen:attach', ({ code }, cb) => {
    const room = getRoom(code ?? '');
    if (!room) return cb({ ok: false, error: 'Soirée introuvable' });
    attachScreen(socket, room);
    cb({ ok: true });
  });

  // --- Organisateur ---
  socket.on('host:create', ({ name }, cb) => {
    const room = createRoom();
    const res = joinRoom(room, name, undefined, true);
    if (!res.ok) {
      rooms.delete(room.code);
      return cb(res);
    }
    detach(socket);
    room.hostPlayerId = res.value.id;
    res.value.socketId = socket.id;
    socket.data = { code: room.code, role: 'player', playerId: res.value.id, hostAuth: true };
    socket.join(room.code);
    cb({ ok: true, code: room.code, playerId: res.value.id, hostToken: room.hostToken });
    broadcast(room);
  });

  socket.on('host:pairScreen', ({ screenCode }, cb) => {
    const room = hostRoom(socket);
    if (!room) return cb({ ok: false, error: 'Réservé à l\'organisateur' });
    const sid = pendingScreens.get(String(screenCode ?? '').trim());
    const screen = sid ? io.sockets.sockets.get(sid) : undefined;
    if (!screen) return cb({ ok: false, error: 'Code écran inconnu' });
    attachScreen(screen, room);
    cb({ ok: true });
  });

  const control = (action: (room: Room) => unknown) => () => {
    const room = hostRoom(socket);
    if (!room) return;
    action(room);
    broadcast(room);
  };

  socket.on('host:start', control(startGame));
  socket.on('host:reveal', control(reveal));
  socket.on('host:next', control(next));
  socket.on('host:end', control(endGame));
  socket.on('host:restart', control(restart));
  socket.on('host:showJoin', ({ show }) => control((r) => (r.showJoin = !!show))());
  socket.on('host:settings', ({ questions }) => control((r) => setQuestionCount(r, Number(questions)))());

  socket.on('host:kick', ({ playerId }) => {
    const room = hostRoom(socket);
    const target = room?.players.get(playerId);
    if (!room || !target || target.isHost) return;
    if (target.socketId) {
      io.to(target.socketId).emit('kicked');
      const s = io.sockets.sockets.get(target.socketId);
      if (s) {
        s.leave(room.code);
        s.data = {};
      }
    }
    removePlayer(room, playerId);
    broadcast(room);
  });

  socket.on('host:close', () => {
    const room = hostRoom(socket);
    if (room) closeRoom(room);
  });

  // --- Invités ---
  socket.on('player:join', ({ code, name, playerId, hostToken }, cb) => {
    const room = getRoom(code ?? '');
    if (!room) return cb({ ok: false, error: 'Code inconnu, vérifie l\'écran' });
    const asHost = !!hostToken && hostToken === room.hostToken;
    // Le token orga ne vaut que pour SON joueur
    if (asHost && playerId && playerId !== room.hostPlayerId) return cb({ ok: false, error: 'Session organisateur invalide' });
    // …et le joueur orga n'est récupérable qu'avec le token
    if (!asHost && playerId && playerId === room.hostPlayerId) return cb({ ok: false, error: 'Session organisateur invalide' });
    const res = joinRoom(room, name, asHost ? room.hostPlayerId ?? playerId : playerId, asHost);
    if (!res.ok) return cb(res);

    const player = res.value;
    if (socket.data.playerId !== player.id) detach(socket);
    player.socketId = socket.id; // bascule sur ce socket si le joueur était ailleurs
    socket.data = { code: room.code, role: 'player', playerId: player.id, hostAuth: asHost && player.isHost };
    socket.join(room.code);
    cb({ ok: true, playerId: player.id, code: room.code, isHost: player.isHost });
    broadcast(room);
  });

  socket.on('player:leave', () => {
    const { room, player } = contextOf(socket);
    if (!room || !player || player.isHost) return;
    removePlayer(room, player.id);
    socket.leave(room.code);
    socket.data = {};
    broadcast(room);
  });

  socket.on('player:vote', ({ targetId }) => {
    const { room, player } = contextOf(socket);
    if (room && player && vote(room, player.id, targetId)) broadcast(room);
  });

  socket.on('disconnect', () => detach(socket));
});

setInterval(cleanupRooms, 30 * 60 * 1000).unref();

http.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎩  Gatsby Awards — serveur sur le port ${PORT}`);
  for (const ip of lanIps()) {
    console.log(`   Organisateur : http://${ip}:${PORT}/orga`);
    console.log(`   Écran TV     : http://${ip}:${PORT}/tv`);
  }
  console.log('');
});

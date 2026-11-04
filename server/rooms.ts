import { randomUUID } from 'node:crypto';
import type { Award, Phase, Question, RoomState, TallyEntry } from '../shared/types';
import { QUESTIONS } from './questions';

export const QUESTIONS_PER_GAME = Number(process.env.QUESTIONS_PER_GAME ?? 15);
export const QUESTION_POOL = QUESTIONS.length;
const MAX_PLAYERS = 30;
const ROOM_TTL_MS = 12 * 60 * 60 * 1000;

// Avatars années folles
const AVATARS = ['🎩', '🥂', '🍸', '🎷', '🎺', '🪶', '💎', '🃏', '🎻', '🌹', '🕰️', '🎰', '👒', '🦚', '🐆', '🦢', '🍾', '🎲', '🪩', '🎹', '🎭', '💍', '🗝️', '🚂'];
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sans I/O pour éviter les confusions

export interface Player {
  id: string;
  name: string;
  avatar: string;
  socketId: string | null;
  isHost: boolean;
}

export interface Room {
  code: string;
  /** Secret de l'organisateur : seul détenteur des contrôles */
  hostToken: string;
  hostPlayerId: string | null;
  /** Sockets des écrans TV (lecture seule) */
  screens: Set<string>;
  showJoin: boolean;
  questionsPerGame: number;
  players: Map<string, Player>;
  phase: Phase;
  questions: Question[];
  index: number;
  /** voterId -> targetId. Ne quitte jamais le serveur. */
  votes: Map<string, string>;
  tally: TallyEntry[] | null;
  awards: Award[];
  updatedAt: number;
}

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export const rooms = new Map<string, Room>();

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pickQuestions = (n: number) => shuffle(QUESTIONS).slice(0, Math.max(1, Math.min(n, QUESTIONS.length)));

function genCode(): string {
  let code: string;
  do {
    code = Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

const touch = (room: Room) => {
  room.updatedAt = Date.now();
};

export function createRoom(): Room {
  const room: Room = {
    code: genCode(),
    hostToken: randomUUID(),
    hostPlayerId: null,
    screens: new Set(),
    showJoin: false,
    questionsPerGame: QUESTIONS_PER_GAME,
    players: new Map(),
    phase: 'lobby',
    questions: pickQuestions(QUESTIONS_PER_GAME),
    index: 0,
    votes: new Map(),
    tally: null,
    awards: [],
    updatedAt: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

export const getRoom = (code: string) => rooms.get(code.trim().toUpperCase());

const cleanName = (name: string) => name.replace(/\s+/g, ' ').trim().slice(0, 20);

export function joinRoom(room: Room, rawName: string, playerId?: string, asHost = false): Result<Player> {
  const name = cleanName(rawName ?? '');
  if (!name) return { ok: false, error: 'Choisis un pseudo' };

  const sameName = [...room.players.values()].find(
    (p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== playerId,
  );

  // Reconnexion avec un id connu
  if (playerId && room.players.has(playerId)) {
    const p = room.players.get(playerId)!;
    if (!sameName) p.name = name;
    touch(room);
    return { ok: true, value: p };
  }

  if (sameName) {
    // On ne peut jamais usurper l'organisateur via son pseudo
    if (sameName.isHost && !asHost) return { ok: false, error: 'Ce pseudo est déjà pris' };
    // Même pseudo mais déconnecté : on considère que c'est la même personne (nouveau tel, cache vidé…)
    if (!sameName.socketId) {
      touch(room);
      return { ok: true, value: sameName };
    }
    return { ok: false, error: 'Ce pseudo est déjà pris' };
  }

  if (room.players.size >= MAX_PLAYERS) return { ok: false, error: 'La soirée est complète' };

  const used = new Set([...room.players.values()].map((p) => p.avatar));
  const free = AVATARS.filter((a) => !used.has(a));
  const avatar = (free.length ? free : AVATARS)[Math.floor(Math.random() * (free.length || AVATARS.length))];

  const player: Player = {
    id: randomUUID(),
    name,
    avatar,
    socketId: null,
    isHost: asHost,
  };
  room.players.set(player.id, player);
  touch(room);
  return { ok: true, value: player };
}

export function removePlayer(room: Room, playerId: string) {
  const p = room.players.get(playerId);
  if (!p || p.isHost) return; // l'organisateur ne peut pas être retiré
  room.players.delete(playerId);
  room.votes.delete(playerId);
  for (const [voter, target] of room.votes) if (target === playerId) room.votes.delete(voter);
  touch(room);
}

export function vote(room: Room, voterId: string, targetId: string): boolean {
  if (room.phase !== 'question') return false;
  if (!room.players.has(voterId) || !room.players.has(targetId)) return false;
  room.votes.set(voterId, targetId); // peut changer d'avis jusqu'à la révélation
  touch(room);
  return true;
}

export function setQuestionCount(room: Room, n: number): boolean {
  if (room.phase !== 'lobby' || !Number.isFinite(n)) return false;
  room.questionsPerGame = Math.max(3, Math.min(Math.round(n), QUESTIONS.length));
  room.questions = pickQuestions(room.questionsPerGame);
  touch(room);
  return true;
}

export function startGame(room: Room): boolean {
  if (room.phase !== 'lobby' || room.players.size < 2) return false;
  room.phase = 'question';
  room.index = 0;
  room.votes.clear();
  room.tally = null;
  touch(room);
  return true;
}

export function reveal(room: Room): boolean {
  if (room.phase !== 'question') return false;

  const counts = new Map<string, number>();
  for (const target of room.votes.values()) {
    if (room.players.has(target)) counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  const tally: TallyEntry[] = [...counts]
    .map(([id, votes]) => {
      const p = room.players.get(id)!;
      return { playerId: id, name: p.name, avatar: p.avatar, votes };
    })
    .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));

  const topVotes = tally[0]?.votes ?? 0;
  room.awards.push({
    questionIndex: room.index,
    question: room.questions[room.index],
    winners: tally.filter((t) => topVotes > 0 && t.votes === topVotes).map((t) => ({ id: t.playerId, name: t.name, avatar: t.avatar })),
    topVotes,
    totalVotes: [...counts.values()].reduce((s, v) => s + v, 0),
  });

  room.tally = tally;
  room.phase = 'reveal';
  touch(room);
  return true;
}

export function next(room: Room): boolean {
  if (room.phase !== 'reveal') return false;
  room.votes.clear();
  room.tally = null;
  if (room.index + 1 >= room.questions.length) {
    room.phase = 'podium';
  } else {
    room.index += 1;
    room.phase = 'question';
  }
  touch(room);
  return true;
}

export function endGame(room: Room): boolean {
  if (room.phase === 'lobby' || room.phase === 'podium') return false;
  room.votes.clear();
  room.tally = null;
  room.phase = 'podium';
  touch(room);
  return true;
}

export function restart(room: Room) {
  room.phase = 'lobby';
  room.questions = pickQuestions(room.questionsPerGame);
  room.index = 0;
  room.votes.clear();
  room.tally = null;
  room.awards = [];
  touch(room);
}

export function publicState(room: Room): RoomState {
  const inGame = room.phase === 'question' || room.phase === 'reveal';
  return {
    code: room.code,
    phase: room.phase,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      connected: !!p.socketId,
      isHost: p.isHost,
      hasVoted: room.votes.has(p.id),
    })),
    questionIndex: room.index,
    totalQuestions: room.questions.length,
    question: inGame ? room.questions[room.index] : null,
    votesCount: room.votes.size,
    tally: room.phase === 'reveal' ? room.tally : null,
    awards: room.awards,
    screens: room.screens.size,
    showJoin: room.showJoin,
    questionPool: QUESTION_POOL,
  };
}

export function cleanupRooms() {
  const limit = Date.now() - ROOM_TTL_MS;
  for (const [code, room] of rooms) if (room.updatedAt < limit) rooms.delete(code);
}

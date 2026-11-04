// Types partagés client <-> serveur

export type Phase = 'lobby' | 'question' | 'reveal' | 'podium';

export interface Question {
  id: number;
  emoji: string;
  text: string;
}

export interface PublicPlayer {
  id: string;
  name: string;
  avatar: string;
  connected: boolean;
  isHost: boolean;
  /** A voté pour la question en cours (on n'expose JAMAIS pour qui). */
  hasVoted: boolean;
}

export interface TallyEntry {
  playerId: string;
  name: string;
  avatar: string;
  votes: number;
}

export interface AwardWinner {
  id: string;
  name: string;
  avatar: string;
}

export interface Award {
  questionIndex: number;
  question: Question;
  winners: AwardWinner[];
  topVotes: number;
  totalVotes: number;
}

export interface RoomState {
  code: string;
  phase: Phase;
  players: PublicPlayer[];
  /** Index 0-based de la question en cours */
  questionIndex: number;
  totalQuestions: number;
  question: Question | null;
  votesCount: number;
  /** Uniquement en phase "reveal" : décompte agrégé, sans lien votant -> cible */
  tally: TallyEntry[] | null;
  awards: Award[];
  /** Nombre d'écrans (TV) connectés à la salle */
  screens: number;
  /** L'organisateur affiche le code d'accès en surimpression sur la TV */
  showJoin: boolean;
  /** Nombre total de catégories disponibles (pour le réglage) */
  questionPool: number;
  /** Présent uniquement dans l'état envoyé à un joueur */
  me?: { id: string; vote: string | null; isHost: boolean };
}

export type AckResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };
export type Ack<T extends object = object> = (res: AckResult<T>) => void;

export interface ClientToServerEvents {
  // Écran TV (passif)
  'screen:hello': (cb: Ack<{ screenCode: string }>) => void;
  'screen:attach': (p: { code: string }, cb: Ack) => void;
  // Invités
  'player:join': (
    p: { code: string; name: string; playerId?: string; hostToken?: string },
    cb: Ack<{ playerId: string; code: string; isHost: boolean }>,
  ) => void;
  'player:leave': () => void;
  'player:vote': (p: { targetId: string }) => void;
  // Organisateur (authentifié par hostToken)
  'host:create': (p: { name: string }, cb: Ack<{ code: string; playerId: string; hostToken: string }>) => void;
  'host:pairScreen': (p: { screenCode: string }, cb: Ack) => void;
  'host:showJoin': (p: { show: boolean }) => void;
  'host:settings': (p: { questions: number }) => void;
  'host:start': () => void;
  'host:reveal': () => void;
  'host:next': () => void;
  'host:end': () => void;
  'host:restart': () => void;
  'host:kick': (p: { playerId: string }) => void;
  'host:close': () => void;
}

export interface ServerToClientEvents {
  state: (s: RoomState) => void;
  kicked: () => void;
  'room:closed': () => void;
  'screen:paired': (p: { code: string }) => void;
}

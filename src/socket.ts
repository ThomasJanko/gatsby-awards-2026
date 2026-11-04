import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Award, ClientToServerEvents, RoomState, ServerToClientEvents } from '../shared/types';

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
});

export function useConnected() {
  const [connected, setConnected] = useState(socket.connected);
  useEffect(() => {
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    socket.on('connect', on);
    socket.on('disconnect', off);
    // le socket a pu se connecter avant l'abonnement
    setConnected(socket.connected);
    return () => {
      socket.off('connect', on);
      socket.off('disconnect', off);
    };
  }, []);
  return connected;
}

export function useRoomState() {
  const [state, setState] = useState<RoomState | null>(null);
  useEffect(() => {
    socket.on('state', setState);
    return () => {
      socket.off('state', setState);
    };
  }, []);
  return [state, setState] as const;
}

/** URL que les téléphones doivent ouvrir. Si la page est en localhost, on la remplace par l'IP réseau du PC. */
export function useJoinBase() {
  const { protocol, hostname, port, origin } = window.location;
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  const [base, setBase] = useState(origin);
  useEffect(() => {
    if (!isLocal) return;
    fetch('/api/info')
      .then((r) => r.json())
      .then(({ ips }: { ips: string[] }) => {
        if (ips[0]) setBase(`${protocol}//${ips[0]}${port ? `:${port}` : ''}`);
      })
      .catch(() => {});
  }, [isLocal, protocol, port]);
  return base;
}

/** localStorage sans planter en navigation privée */
export const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
  del: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

/** Classement des joueurs par nombre d'awards gagnés */
export function leaderboard(awards: Award[]) {
  const map = new Map<string, { id: string; name: string; avatar: string; wins: number }>();
  for (const a of awards) {
    for (const w of a.winners) {
      const e = map.get(w.id) ?? { ...w, wins: 0 };
      e.wins += 1;
      map.set(w.id, e);
    }
  }
  return [...map.values()].sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name));
}

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { RoomState } from '../../shared/types';
import { leaderboard, socket, useConnected, useRoomState } from '../socket';
import { Avatar, Button, Card, ConnectionBanner, cx, DecoDivider, DecoFrame, Label, Logo } from '../ui';
import { HostBar, HostLobby, pairScreen } from './Host';

interface Session {
  code: string;
  name: string;
  playerId: string;
  /** Présent seulement sur le téléphone de l'organisateur */
  hostToken?: string;
}

const SESSION_KEY = 'awards-player';
const PENDING_SCREEN_KEY = 'awards-pending-screen';

function loadSession(urlCode: string | null): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Session | null;
    // Un QR code d'une autre salle = nouvelle soirée, on ignore l'ancienne session
    if (s && urlCode && urlCode !== s.code) return null;
    return s;
  } catch {
    return null;
  }
}
function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** Code écran reçu via le QR de la TV (/orga?screen=1234), appairé dès que l'orga est connecté */
function takePendingScreen() {
  try {
    const v = sessionStorage.getItem(PENDING_SCREEN_KEY);
    sessionStorage.removeItem(PENDING_SCREEN_KEY);
    return v;
  } catch {
    return null;
  }
}

export default function PlayerApp() {
  const connected = useConnected();
  const [state, setState] = useRoomState();
  const params = new URLSearchParams(window.location.search);
  const urlCode = params.get('code')?.toUpperCase() ?? null;
  const isOrgaPath = window.location.pathname.replace(/\/+$/, '') === '/orga';

  const sessionRef = useRef<Session | null>(loadSession(urlCode));
  const [mode, setMode] = useState<'join' | 'create'>(isOrgaPath && !sessionRef.current?.hostToken ? 'create' : 'join');
  const [code, setCode] = useState(urlCode ?? sessionRef.current?.code ?? '');
  const [name, setName] = useState(sessionRef.current?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Mémorise un éventuel code écran passé dans l'URL
  useEffect(() => {
    const screen = params.get('screen');
    if (screen) {
      try {
        sessionStorage.setItem(PENDING_SCREEN_KEY, screen);
      } catch {
        /* ignore */
      }
    }
    // on ne lit l'URL qu'au montage
  }, []);

  const onJoined = useCallback((s: Session) => {
    sessionRef.current = s;
    saveSession(s);
    setError(null);
    if (window.location.search || window.location.pathname !== '/') window.history.replaceState(null, '', '/');
    if (s.hostToken) {
      const screen = takePendingScreen();
      if (screen) pairScreen(screen).then((err) => setNotice(err ?? 'Écran TV associé ✓'));
    }
  }, []);

  const resetSession = useCallback(
    (msg: string | null) => {
      sessionRef.current = null;
      saveSession(null);
      setState(null);
      setError(msg);
    },
    [setState],
  );

  const join = useCallback(
    (c: string, n: string, playerId?: string, hostToken?: string) => {
      setJoining(true);
      socket.emit('player:join', { code: c, name: n, playerId, hostToken }, (res) => {
        setJoining(false);
        if (res.ok) onJoined({ code: res.code, name: n.trim(), playerId: res.playerId, hostToken: res.isHost ? hostToken : undefined });
        else if (playerId) resetSession(res.error); // la salle n'existe plus : on repart de zéro
        else setError(res.error);
      });
    },
    [onJoined, resetSession],
  );

  const create = (n: string) => {
    setJoining(true);
    socket.emit('host:create', { name: n }, (res) => {
      setJoining(false);
      if (res.ok) onJoined({ code: res.code, name: n.trim(), playerId: res.playerId, hostToken: res.hostToken });
      else setError(res.error);
    });
  };

  // Rejoint automatiquement à chaque (re)connexion du socket : écran verrouillé, 4G qui coupe…
  useEffect(() => {
    const rejoin = () => {
      const s = sessionRef.current;
      if (s) join(s.code, s.name, s.playerId, s.hostToken);
    };
    if (socket.connected) rejoin();
    socket.on('connect', rejoin);

    const onKicked = () => resetSession('Tu as été retiré de la partie');
    const onClosed = () => resetSession('La soirée est terminée. Merci d\'être venu ! 🥂');
    socket.on('kicked', onKicked);
    socket.on('room:closed', onClosed);
    return () => {
      socket.off('connect', rejoin);
      socket.off('kicked', onKicked);
      socket.off('room:closed', onClosed);
    };
  }, [join, resetSession]);

  const leave = () => {
    if (!confirm('Quitter la soirée ?')) return;
    socket.emit('player:leave');
    resetSession(null);
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === 'create') return create(name);
    const c = code.trim().toUpperCase();
    join(c, name, sessionRef.current?.code === c ? sessionRef.current.playerId : undefined);
  };

  const me = state?.me;
  const inRoom = !!state && !!me;
  const myPlayer = state?.players.find((p) => p.id === me?.id);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  return (
    <div className="sky relative mx-auto flex min-h-dvh max-w-md flex-col px-7 pt-8 pb-[max(1.75rem,env(safe-area-inset-bottom))]">
      <DecoFrame tight />
      <ConnectionBanner connected={connected} />
      {notice && (
        <div className="fixed inset-x-6 top-6 z-50 animate-rise border border-gold bg-night-2 px-4 py-3 text-center font-label text-xs font-semibold tracking-[0.2em] text-gold uppercase">
          {notice}
        </div>
      )}

      {!inRoom ? (
        <JoinForm
          mode={mode}
          setMode={(m) => {
            setMode(m);
            setError(null);
          }}
          code={code}
          name={name}
          setCode={setCode}
          setName={setName}
          onSubmit={onSubmit}
          error={error}
          busy={joining || !connected}
          resuming={!!sessionRef.current && !error}
        />
      ) : (
        <>
          <header className="relative z-10 mb-5 flex items-center justify-between">
            <Logo compact className="text-base" />
            <button
              onClick={me.isHost ? undefined : leave}
              className="flex items-center gap-2 rounded-full border border-gold/30 py-1 pr-3 pl-1"
              title={me.isHost ? 'Maître de cérémonie' : 'Quitter la soirée'}
            >
              <Avatar emoji={myPlayer?.avatar ?? '🙂'} size="sm" />
              <span className="max-w-28 truncate text-sm font-semibold">{myPlayer?.name}</span>
              {me.isHost && <span className="text-xs">🔑</span>}
            </button>
          </header>

          <div className="relative z-10 flex flex-1 flex-col">
            {state.phase === 'lobby' && (me.isHost ? <HostLobby state={state} onNotice={setNotice} /> : <PlayerLobby state={state} />)}
            {state.phase === 'question' && <PlayerVote key={state.questionIndex} state={state} />}
            {state.phase === 'reveal' && <PlayerReveal state={state} />}
            {state.phase === 'podium' && <PlayerPodium state={state} />}
          </div>

          {me.isHost && <HostBar state={state} onNotice={setNotice} />}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function JoinForm(props: {
  mode: 'join' | 'create';
  setMode: (m: 'join' | 'create') => void;
  code: string;
  name: string;
  setCode: (v: string) => void;
  setName: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
  error: string | null;
  busy: boolean;
  resuming: boolean;
}) {
  if (props.resuming) {
    return (
      <div className="grid flex-1 place-items-center text-center">
        <div className="animate-pulse-soft">
          <div className="text-5xl">🥂</div>
          <Label className="mt-4 text-cream/60">Retour au bal…</Label>
        </div>
      </div>
    );
  }

  const isCreate = props.mode === 'create';
  const canSubmit = !!props.name.trim() && (isCreate || props.code.length === 4);

  return (
    <form onSubmit={props.onSubmit} className="relative z-10 flex flex-1 animate-rise flex-col justify-center gap-6">
      <div className="text-center">
        <Label className="text-[10px] text-cream/70">{isCreate ? 'Espace organisateur' : 'Cap sur 2027'}</Label>
        <Logo className="mt-3 text-[3.6rem]" />
        <DecoDivider className="mt-5" />
      </div>

      {!isCreate && (
        <label className="block">
          <span className="mb-2 block font-label text-xs font-semibold tracking-[0.3em] text-gold uppercase">Code affiché sur la TV</span>
          <input
            value={props.code}
            onChange={(e) => props.setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            placeholder="ABCD"
            className="deco-card w-full bg-night-2 px-4 py-4 text-center font-display text-4xl font-semibold tracking-[0.4em] text-gold outline-none placeholder:text-cream/15 focus:border-gold"
          />
        </label>
      )}

      <label className="block">
        <span className="mb-2 block font-label text-xs font-semibold tracking-[0.3em] text-gold uppercase">
          {isCreate ? 'Ton nom, maître de cérémonie' : 'Ton nom au bal'}
        </span>
        <input
          value={props.name}
          onChange={(e) => props.setName(e.target.value.slice(0, 20))}
          autoComplete="nickname"
          placeholder="Ex : Thomas"
          className="deco-card w-full bg-night-2 px-4 py-4 text-xl font-semibold outline-none placeholder:text-cream/25 focus:border-gold"
        />
      </label>

      {props.error && <p className="border border-rose/40 bg-rose/10 px-4 py-3 text-center font-semibold text-rose">{props.error}</p>}

      <Button size="lg" type="submit" disabled={props.busy || !canSubmit}>
        {isCreate ? 'Créer la soirée' : 'Entrer au bal'}
      </Button>

      <button
        type="button"
        onClick={() => props.setMode(isCreate ? 'join' : 'create')}
        className="font-label text-[11px] font-semibold tracking-[0.25em] text-cream/45 uppercase underline-offset-4 hover:text-gold hover:underline"
      >
        {isCreate ? '← Je suis un invité' : 'J\'organise la soirée →'}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------

function PlayerLobby({ state }: { state: RoomState }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="animate-pop text-7xl">🥂</div>
      <h1 className="mt-5 font-display text-4xl font-semibold uppercase">Bienvenue au bal</h1>
      <DecoDivider className="mt-5" />
      <p className="mt-5 font-label text-sm leading-relaxed tracking-[0.12em] text-cream/65 uppercase">
        Les yeux sur l'écran, la cérémonie va commencer.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {state.players.map((p) => (
          <span key={p.id} className="flex items-center gap-1.5 rounded-full border border-gold/25 py-1 pr-3 pl-1 text-sm font-semibold tracking-wide">
            <Avatar emoji={p.avatar} size="sm" dim={!p.connected} />
            {p.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function PlayerVote({ state }: { state: RoomState }) {
  const q = state.question!;
  const myVote = state.me?.vote ?? null;
  const [pending, setPending] = useState<string | null>(null);
  const selected = pending ?? myVote;

  // le serveur confirme → on retire l'état optimiste
  useEffect(() => {
    if (pending && myVote === pending) setPending(null);
  }, [myVote, pending]);

  const voteFor = (id: string) => {
    setPending(id);
    navigator.vibrate?.(15);
    socket.emit('player:vote', { targetId: id });
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="text-center">
        <Label className="text-gold">
          Prix {state.questionIndex + 1} / {state.totalQuestions}
        </Label>
        <div className="mt-3 animate-pop text-6xl">{q.emoji}</div>
        <h1 className="mt-3 font-display text-2xl leading-tight font-semibold text-balance">{q.text}</h1>
      </div>

      <ul className="mt-6 grid grid-cols-2 gap-3">
        {state.players.map((p) => {
          const isSel = selected === p.id;
          return (
            <li key={p.id}>
              <button
                onClick={() => voteFor(p.id)}
                className={cx(
                  'flex w-full items-center gap-2 border px-3 py-3 text-left transition active:scale-[0.97]',
                  isSel ? 'border-gold bg-gold text-night' : 'border-gold/25 bg-night-2/80',
                )}
              >
                <Avatar emoji={p.avatar} size="sm" />
                <span className="truncate font-semibold">{p.name}</span>
                {p.id === state.me?.id && <span className={cx('ml-auto text-xs', isSel ? 'text-night/60' : 'text-cream/40')}>toi</span>}
              </button>
            </li>
          );
        })}
      </ul>

      <p className={cx('mt-5 text-center text-sm', selected ? 'text-gold' : 'text-cream/50')}>
        {selected
          ? 'Bulletin secret enregistré 🤫 Changement d\'avis possible jusqu\'à la révélation.'
          : 'Vote pour quelqu\'un. Même toi, on ne juge pas.'}
      </p>
      <Label className="mt-2 text-center text-[10px] text-cream/40">
        {state.votesCount} / {state.players.filter((p) => p.connected).length} bulletins
      </Label>
    </div>
  );
}

function PlayerReveal({ state }: { state: RoomState }) {
  const award = state.awards.find((a) => a.questionIndex === state.questionIndex);
  const winners = award?.winners ?? [];
  const iWon = winners.some((w) => w.id === state.me?.id);
  // Le serveur garde les votes jusqu'à "suivant" : chacun peut revoir SON vote, en privé
  const myVote = state.players.find((p) => p.id === state.me?.vote);

  return (
    <div className="flex flex-1 animate-rise flex-col items-center justify-center text-center">
      <p className="font-display text-sm text-cream/60 italic">
        {state.question?.emoji} {state.question?.text}
      </p>
      <Label className="mt-6 text-gold">{winners.length > 1 ? 'Les lauréats' : 'Le lauréat'}</Label>
      {winners.length ? (
        <>
          <div className="mt-6 flex flex-wrap justify-center gap-6">
            {winners.map((w) => (
              <div key={w.id}>
                <Avatar emoji={w.avatar} size="lg" />
                <div className="gold-text mt-3 font-display text-4xl font-bold uppercase">{w.name}</div>
              </div>
            ))}
          </div>
          {iWon && <p className="mt-4 font-display text-xl font-semibold text-rose">C'est vous. Assumez, très cher. 🥂</p>}
        </>
      ) : (
        <p className="mt-6 font-display text-2xl font-semibold">Personne n'a voté 🙈</p>
      )}
      {myVote && (
        <p className="mt-8 border border-gold/25 px-4 py-2 text-sm text-cream/65">
          🤫 Toi tu avais voté {myVote.avatar} <b className="text-cream">{myVote.name}</b> (ça reste entre nous)
        </p>
      )}
    </div>
  );
}

function PlayerPodium({ state }: { state: RoomState }) {
  const mine = state.awards.filter((a) => a.winners.some((w) => w.id === state.me?.id));
  const board = leaderboard(state.awards);
  const rank = board.findIndex((b) => b.id === state.me?.id);

  return (
    <div className="flex flex-1 animate-rise flex-col">
      <div className="text-center">
        <div className="text-6xl">{mine.length ? '🏆' : '🫠'}</div>
        <h1 className="mt-3 font-display text-2xl font-semibold">
          {mine.length ? `Vous repartez avec ${mine.length} prix` : 'Aucun prix… pour cette fois.'}
        </h1>
        {rank === 0 && <p className="mt-1 font-semibold text-gold">Le Gatsby de l'année 🎩</p>}
      </div>

      {mine.length > 0 && (
        <ul className="mt-6 space-y-2">
          {mine.map((a) => (
            <li key={a.questionIndex}>
              <Card className="flex items-center gap-3 p-3">
                <span className="text-3xl">{a.question.emoji}</span>
                <span className="font-display text-sm italic">{a.question.text}</span>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Label className="mt-6 text-center text-[10px] text-cream/50">Le palmarès complet est à l'écran</Label>
    </div>
  );
}

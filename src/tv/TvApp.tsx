import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { RoomState } from '../../shared/types';
import { leaderboard, socket, store, useConnected, useJoinBase, useRoomState } from '../socket';
import { Avatar, Button, Card, ConnectionBanner, cx, DecoDivider, DecoFan, DecoFrame, fireConfetti, Label, Logo } from '../ui';

/**
 * Écran TV : 100 % passif. Il s'appaire à une soirée (code écran saisi par l'organisateur
 * sur son téléphone, ou code de la soirée tapé au clavier du PC) puis affiche ce qui se passe.
 * Tous les contrôles sont sur le téléphone de l'organisateur.
 */

const TV_KEY = 'awards-tv-code';

export default function TvApp() {
  const connected = useConnected();
  const [state, setState] = useRoomState();
  const [screenCode, setScreenCode] = useState<string | null>(null);
  const joinBase = useJoinBase();

  useEffect(() => {
    const hello = () =>
      socket.emit('screen:hello', (res) => {
        if (res.ok) setScreenCode(res.screenCode);
      });

    // À chaque (re)connexion : on retourne dans la soirée connue, sinon on demande un code écran
    const boot = () => {
      const code = store.get(TV_KEY);
      if (!code) return hello();
      socket.emit('screen:attach', { code }, (res) => {
        if (!res.ok) {
          store.del(TV_KEY);
          setState(null);
          hello();
        }
      });
    };

    const onPaired = ({ code }: { code: string }) => {
      store.set(TV_KEY, code);
      setScreenCode(null);
    };
    const onClosed = () => {
      store.del(TV_KEY);
      setState(null);
      hello();
    };

    if (socket.connected) boot();
    socket.on('connect', boot);
    socket.on('screen:paired', onPaired);
    socket.on('room:closed', onClosed);
    return () => {
      socket.off('connect', boot);
      socket.off('screen:paired', onPaired);
      socket.off('room:closed', onClosed);
    };
  }, [setState]);

  // Seul raccourci : F pour le plein écran
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'f' && !(e.target instanceof HTMLInputElement)) toggleFullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="sky relative min-h-dvh overflow-hidden">
      <DecoFrame />
      <ConnectionBanner connected={connected} />

      <div className="relative z-10">
        {!state ? (
          <TvPairing screenCode={screenCode} joinBase={joinBase} />
        ) : state.phase === 'lobby' ? (
          <TvLobby state={state} joinBase={joinBase} />
        ) : state.phase === 'question' ? (
          <TvQuestion key={state.questionIndex} state={state} />
        ) : state.phase === 'reveal' ? (
          <TvReveal key={state.questionIndex} state={state} />
        ) : (
          <TvPodium state={state} />
        )}
      </div>

      {state?.showJoin && state.phase !== 'lobby' && <JoinOverlay state={state} joinBase={joinBase} />}

      <button
        onClick={toggleFullscreen}
        title="Plein écran (F)"
        className="fixed bottom-7 left-1/2 z-40 -translate-x-1/2 font-label text-[10px] tracking-[0.3em] text-gold uppercase opacity-20 transition hover:opacity-100 md:bottom-9"
      >
        ⛶ Plein écran
      </button>
    </div>
  );
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

/** Zone de contenu à l'intérieur du cadre */
const SCREEN = 'min-h-dvh px-[7vw] py-[6vh]';

function JoinQr({ url, size = 210 }: { url: string; size?: number }) {
  return (
    <div className="deco-card bg-cream p-4">
      <QRCodeSVG value={url} size={size} bgColor="#f3ead5" fgColor="#02041f" level="M" />
    </div>
  );
}

function CodeLetters({ code, size = 'lg' }: { code: string; size?: 'lg' | 'md' }) {
  return (
    <div className="flex gap-3">
      {code.split('').map((ch, i) => (
        <span
          key={i}
          className={cx(
            'deco-card grid place-items-center bg-night-2 font-display font-semibold text-gold',
            size === 'lg'
              ? 'h-[clamp(5rem,8.5vw,8rem)] w-[clamp(3.8rem,6vw,6rem)] text-[clamp(3rem,5.5vw,5.5rem)]'
              : 'h-20 w-16 text-5xl',
          )}
        >
          {ch}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

function TvPairing({ screenCode, joinBase }: { screenCode: string | null; joinBase: string }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const attach = (e: FormEvent) => {
    e.preventDefault();
    socket.emit('screen:attach', { code }, (res) => setError(res.ok ? null : res.error));
  };

  return (
    <main className={cx(SCREEN, 'grid place-items-center text-center')}>
      <div className="animate-rise">
        <DecoFan className="mx-auto w-[clamp(8rem,13vw,13rem)]" />
        <Logo className="mt-6 text-[clamp(4rem,9vw,9rem)]" />
        <DecoDivider className="mt-6" />

        <div className="mt-8 flex flex-wrap items-center justify-center gap-12">
          {screenCode && <JoinQr url={`${joinBase}/orga?screen=${screenCode}`} size={180} />}
          <div className="text-left">
            <Label className="text-gold">Associer cet écran</Label>
            <p className="mt-3 max-w-[34ch] font-label text-sm leading-relaxed tracking-[0.1em] text-cream/70 uppercase">
              Sur le téléphone de l'organisateur, scanne le QR code ou entre ce code dans « Écran TV »
            </p>
            <div className="mt-5">{screenCode ? <CodeLetters code={screenCode} size="md" /> : <div className="h-20" />}</div>
          </div>
        </div>

        <form onSubmit={attach} className="mt-10 flex items-center justify-center gap-3 opacity-70 transition focus-within:opacity-100 hover:opacity-100">
          <Label className="text-[10px] text-cream/60">ou code de la soirée</Label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
            placeholder="ABCD"
            className="w-28 border border-gold/30 bg-night-2 px-3 py-2 text-center font-display text-xl tracking-[0.3em] text-gold outline-none placeholder:text-cream/15 focus:border-gold"
          />
          <Button size="sm" variant="ghost" type="submit" disabled={code.length !== 4}>
            Afficher
          </Button>
        </form>
        {error && <Label className="mt-3 text-rose">{error}</Label>}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------

function TvLobby({ state, joinBase }: { state: RoomState; joinBase: string }) {
  const displayHost = joinBase.replace(/^https?:\/\//, '');

  return (
    <main className={cx(SCREEN, 'grid grid-cols-1 items-center gap-[5vw] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]')}>
      <section className="flex flex-col items-center text-center">
        <Logo className="text-[clamp(3.5rem,6.5vw,7rem)]" />
        <DecoDivider className="mt-6" />
        <Label className="mt-6 text-cream/75">Scannez l'invitation ou rendez-vous sur</Label>
        <p className="mt-2 font-display text-[clamp(1.3rem,2vw,2.2rem)] font-semibold tracking-wide text-gold">{displayHost}</p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-10">
          <JoinQr url={`${joinBase}/?code=${state.code}`} />
          <div>
            <Label className="mb-3 text-gold">Code de la soirée</Label>
            <CodeLetters code={state.code} />
          </div>
        </div>
      </section>

      <section className="flex min-h-0 flex-col self-stretch py-[2vh]">
        <h2 className="mb-5 font-display text-[clamp(1.8rem,2.6vw,2.8rem)] font-semibold tracking-wide uppercase">
          Les invités <span className="text-gold">{state.players.length}</span>
        </h2>

        <Card className="flex-1 p-6">
          <ul className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            {state.players.map((p) => (
              <li key={p.id} className="flex animate-pop items-center gap-3 border border-gold/15 bg-night/60 px-3 py-3">
                <Avatar emoji={p.avatar} dim={!p.connected} />
                <span className={cx('truncate text-xl font-semibold tracking-wide', !p.connected && 'text-cream/40')}>{p.name}</span>
                {p.isHost && (
                  <span className="ml-auto text-sm" title="Maître de cérémonie">
                    🔑
                  </span>
                )}
              </li>
            ))}
          </ul>
          {state.players.length <= 1 && (
            <Label className="mt-8 animate-pulse-soft text-center text-cream/50">Les portes sont ouvertes… on attend les invités</Label>
          )}
        </Card>

        <Label className="mt-8 animate-pulse-soft text-right text-cream/55">
          {state.totalQuestions} prix à décerner · le maître de cérémonie lancera le bal
        </Label>
      </section>
    </main>
  );
}

// ---------------------------------------------------------------------------

/** Rappel du code d'accès en cours de partie, à la demande de l'organisateur */
function JoinOverlay({ state, joinBase }: { state: RoomState; joinBase: string }) {
  return (
    <div className="fixed inset-0 z-30 grid animate-rise place-items-center bg-night/85 backdrop-blur-sm">
      <div className="text-center">
        <Label className="text-gold">Un retardataire ? Rejoignez le bal</Label>
        <div className="mt-6 flex items-center justify-center gap-10">
          <JoinQr url={`${joinBase}/?code=${state.code}`} size={240} />
          <CodeLetters code={state.code} />
        </div>
        <p className="mt-6 font-display text-2xl text-gold">{joinBase.replace(/^https?:\/\//, '')}</p>
      </div>
    </div>
  );
}

function TvHeader({ state, left }: { state: RoomState; left?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-6">
      {left ?? <Logo compact className="text-2xl" />}
      <ProgressPill index={state.questionIndex} total={state.totalQuestions} />
    </header>
  );
}

function ProgressPill({ index, total }: { index: number; total: number }) {
  return (
    <div className="flex items-center gap-4">
      <Label className="text-cream/70">
        Prix <span className="text-gold">{toRoman(index + 1)}</span> / {toRoman(total)}
      </Label>
      <div className="h-px w-40 bg-gold/20">
        <div className="h-[3px] -translate-y-px bg-gold transition-all" style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>
    </div>
  );
}

function toRoman(n: number) {
  const map: Array<[number, string]> = [[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) while (n >= v) { out += s; n -= v; }
  return out;
}

function TvQuestion({ state }: { state: RoomState }) {
  const q = state.question!;
  const connected = state.players.filter((p) => p.connected);
  const voters = state.players.filter((p) => p.connected || p.hasVoted);
  const allVoted = connected.length > 0 && connected.every((p) => p.hasVoted);

  return (
    <main className={cx(SCREEN, 'flex flex-col')}>
      <TvHeader state={state} />

      <section className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="animate-pop text-[clamp(4.5rem,10vw,9rem)] leading-none">{q.emoji}</div>
        <DecoDivider className="mt-6" />
        <Label className="mt-5 text-gold">Le prix est décerné à la personne…</Label>
        <h1 className="mt-5 max-w-[24ch] animate-rise font-display text-[clamp(2.2rem,4.6vw,5rem)] leading-[1.1] font-semibold text-balance">
          {q.text}
        </h1>
      </section>

      <footer className="flex flex-col items-center gap-5">
        <ul className="flex flex-wrap justify-center gap-3">
          {voters.map((p) => (
            <li
              key={p.id}
              className={cx(
                'flex items-center gap-2 rounded-full border py-1 pr-4 pl-1 transition',
                p.hasVoted ? 'border-gold/70 bg-gold/10' : 'border-gold/15',
              )}
            >
              <Avatar emoji={p.avatar} size="sm" dim={!p.connected} />
              <span className="font-semibold tracking-wide">{p.name}</span>
              <span className={cx('text-sm', p.hasVoted ? 'text-gold' : 'animate-pulse-soft text-cream/30')}>{p.hasVoted ? '◆' : '◇'}</span>
            </li>
          ))}
        </ul>
        <Label className={cx('text-base', allVoted ? 'animate-pulse-soft text-gold' : 'text-cream/65')}>
          {allVoted ? 'Tous les bulletins sont dans l\'urne' : `${state.votesCount} / ${connected.length} bulletins`}
        </Label>
      </footer>
    </main>
  );
}

// ---------------------------------------------------------------------------

const SUSPENSE_MS = 2600;

function TvReveal({ state }: { state: RoomState }) {
  const q = state.question!;
  const award = state.awards.find((a) => a.questionIndex === state.questionIndex);
  const tally = state.tally ?? [];
  const max = tally[0]?.votes ?? 1;
  const [stage, setStage] = useState<'drum' | 'result'>('drum');
  const [barsIn, setBarsIn] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => {
      setStage('result');
      if (award?.winners.length) fireConfetti(true);
    }, SUSPENSE_MS);
    const t2 = setTimeout(() => setBarsIn(true), SUSPENSE_MS + 150);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // on ne joue la séquence qu'une fois par prix (composant remonté via `key`)
  }, []);

  if (stage === 'drum') {
    return (
      <main className={cx(SCREEN, 'grid place-items-center text-center')}>
        <div>
          <div className="inline-block animate-drum text-[clamp(5rem,11vw,9rem)]">{q.emoji}</div>
          <p className="mx-auto mt-8 max-w-[36ch] font-display text-[clamp(1.2rem,1.9vw,2rem)] text-cream/60 italic">{q.text}</p>
          <DecoDivider className="mt-8" />
          <p className="gold-text mt-8 animate-pulse-soft font-display text-[clamp(2.4rem,5vw,5.2rem)] font-semibold">
            Et le prix est décerné à…
          </p>
        </div>
      </main>
    );
  }

  const winners = award?.winners ?? [];

  return (
    <main className={cx(SCREEN, 'flex flex-col')}>
      <TvHeader
        state={state}
        left={
          <p className="max-w-[60ch] truncate font-display text-xl text-cream/60 italic">
            {q.emoji} {q.text}
          </p>
        }
      />

      <section className="flex flex-1 flex-col items-center justify-center text-center">
        {winners.length === 0 ? (
          <div className="animate-pop">
            <div className="text-8xl">🙈</div>
            <p className="mt-6 font-display text-5xl font-semibold">Personne n'a voté.</p>
            <Label className="mt-4 text-cream/60">Quel manque de panache</Label>
          </div>
        ) : (
          <>
            <Label className="mb-6 text-gold">{winners.length > 1 ? 'Ex æquo · Les lauréats' : 'Le lauréat'}</Label>
            <div className="flex flex-wrap items-end justify-center gap-[5vw]">
              {winners.map((w, i) => (
                <div key={w.id} className="animate-pop" style={{ animationDelay: `${i * 150}ms` }}>
                  <Avatar emoji={w.avatar} size="xl" />
                  <div className="gold-text mt-6 font-display text-[clamp(3.5rem,8vw,8.5rem)] leading-none font-bold uppercase">
                    {w.name}
                  </div>
                </div>
              ))}
            </div>
            <DecoDivider className="mt-8" />
            <Label className="mt-5 text-cream/65">
              {award!.topVotes} voix sur {award!.totalVotes}
            </Label>
          </>
        )}
      </section>

      <footer className="flex justify-center">
        <ul className="w-full max-w-3xl space-y-2.5">
          {tally.slice(0, 6).map((t) => (
            <li key={t.playerId} className="flex items-center gap-3">
              <span className="w-8 text-center text-2xl">{t.avatar}</span>
              <span className="w-36 truncate font-semibold tracking-wide">{t.name}</span>
              <div className="h-4 flex-1 border border-gold/25 p-[2px]">
                <div
                  className="h-full bg-gradient-to-r from-[#b8913f] via-gold to-gold-2 transition-[width] duration-1000 ease-out"
                  style={{ width: barsIn ? `${(t.votes / max) * 100}%` : '0%' }}
                />
              </div>
              <span className="w-8 text-right font-display text-xl font-semibold text-gold">{t.votes}</span>
            </li>
          ))}
        </ul>
      </footer>
    </main>
  );
}

// ---------------------------------------------------------------------------

function TvPodium({ state }: { state: RoomState }) {
  const board = leaderboard(state.awards);
  const topWins = board[0]?.wins ?? 0;
  const champions = board.filter((b) => b.wins === topWins && topWins > 0);
  const awarded = state.awards.filter((a) => a.winners.length);

  useEffect(() => {
    const t = setTimeout(() => fireConfetti(true), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <main className={cx(SCREEN, 'flex flex-col')}>
      <header className="text-center">
        <Label className="text-cream/70">Le palmarès officiel</Label>
        <Logo compact className="mt-3 text-[clamp(2.5rem,4.5vw,4.5rem)]" />
        <DecoDivider className="mt-5" />
      </header>

      {champions.length > 0 && (
        <section className="mt-8 flex flex-col items-center text-center">
          <Label className="text-gold">{champions.length > 1 ? 'Les Gatsby de l\'année' : 'Le Gatsby de l\'année'}</Label>
          <div className="mt-6 flex flex-wrap justify-center gap-12">
            {champions.map((c) => (
              <div key={c.id} className="animate-pop">
                <Avatar emoji={c.avatar} size="xl" />
                <div className="gold-text mt-5 font-display text-6xl font-bold uppercase">{c.name}</div>
                <Label className="mt-2 text-cream/60">{c.wins} prix</Label>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-10 grid flex-1 auto-rows-min grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {awarded.map((a) => (
          <Card key={a.questionIndex} className="flex animate-rise items-center gap-4 p-4">
            <span className="text-4xl">{a.question.emoji}</span>
            <div className="min-w-0">
              <p className="line-clamp-2 font-display text-sm text-cream/65 italic">{a.question.text}</p>
              <p className="mt-1 truncate font-label font-semibold tracking-[0.15em] text-gold uppercase">
                {a.winners.map((w) => `${w.avatar} ${w.name}`).join(' · ')}
              </p>
            </div>
          </Card>
        ))}
      </section>
    </main>
  );
}

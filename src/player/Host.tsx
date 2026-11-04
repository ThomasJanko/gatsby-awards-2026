import { QRCodeSVG } from 'qrcode.react';
import { useState, type FormEvent, type ReactNode } from 'react';
import type { RoomState } from '../../shared/types';
import { socket, useJoinBase } from '../socket';
import { Avatar, Button, Card, cx, Label } from '../ui';

/**
 * Tout ce qui est réservé à l'organisateur (le téléphone qui a créé la soirée) :
 * appairage de la TV, réglages, gestion des invités, et pilotage du déroulé.
 */

type Notice = (msg: string) => void;

export function pairScreen(screenCode: string): Promise<string | null> {
  return new Promise((resolve) => socket.emit('host:pairScreen', { screenCode }, (res) => resolve(res.ok ? null : res.error)));
}

// ---------------------------------------------------------------------------

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Label className="text-gold">{title}</Label>
        {right}
      </div>
      {children}
    </Card>
  );
}

function ScreenSection({ state, onNotice }: { state: RoomState; onNotice: Notice }) {
  const base = useJoinBase().replace(/^https?:\/\//, '');
  const [screenCode, setScreenCode] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const err = await pairScreen(screenCode);
    setBusy(false);
    if (err) onNotice(err);
    else {
      setScreenCode('');
      onNotice('Écran TV associé ✓');
    }
  };

  return (
    <Section
      title="Écran TV"
      right={
        <span className={cx('flex items-center gap-2 font-label text-[11px] tracking-[0.15em] uppercase', state.screens ? 'text-gold' : 'text-cream/45')}>
          <span className={cx('size-2 rotate-45', state.screens ? 'bg-gold' : 'border border-cream/40')} />
          {state.screens ? `${state.screens} connecté${state.screens > 1 ? 's' : ''}` : 'aucun'}
        </span>
      }
    >
      <p className="mb-3 text-sm text-cream/65">
        Ouvre <b className="text-cream">{base}/tv</b> sur la TV, puis entre le code à 4 chiffres affiché.
      </p>
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={screenCode}
          onChange={(e) => setScreenCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          placeholder="1234"
          className="min-w-0 flex-1 border border-gold/30 bg-night px-3 py-2.5 text-center font-display text-2xl tracking-[0.35em] text-gold outline-none placeholder:text-cream/15 focus:border-gold"
        />
        <Button size="md" type="submit" disabled={busy || screenCode.length !== 4}>
          Associer
        </Button>
      </form>
    </Section>
  );
}

function GuestsSection({ state }: { state: RoomState }) {
  const kick = (id: string, name: string) => {
    if (confirm(`Retirer ${name} de la soirée ?`)) socket.emit('host:kick', { playerId: id });
  };
  return (
    <Section title={`Invités · ${state.players.length}`}>
      <ul className="space-y-1.5">
        {state.players.map((p) => (
          <li key={p.id} className="flex items-center gap-2.5 border border-gold/10 bg-night/50 py-1.5 pr-1.5 pl-1.5">
            <Avatar emoji={p.avatar} size="sm" dim={!p.connected} />
            <span className={cx('flex-1 truncate font-semibold', !p.connected && 'text-cream/40')}>
              {p.name}
              {!p.connected && <span className="ml-2 text-xs font-normal">(déconnecté)</span>}
            </span>
            {p.isHost ? (
              <span className="px-2 text-sm">🔑</span>
            ) : (
              <button
                onClick={() => kick(p.id, p.name)}
                className="grid size-8 place-items-center text-cream/40 transition hover:text-rose"
                aria-label={`Retirer ${p.name}`}
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

function PrizesSection({ state }: { state: RoomState }) {
  const n = state.totalQuestions;
  const set = (v: number) => socket.emit('host:settings', { questions: v });
  const presets = [10, 15, 20, state.questionPool].filter((v, i, a) => v <= state.questionPool && a.indexOf(v) === i);
  return (
    <Section title="Nombre de prix">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="ghost" onClick={() => set(n - 1)} disabled={n <= 3} aria-label="Moins">
          −
        </Button>
        <span className="w-12 text-center font-display text-3xl font-semibold text-gold">{n}</span>
        <Button size="sm" variant="ghost" onClick={() => set(n + 1)} disabled={n >= state.questionPool} aria-label="Plus">
          +
        </Button>
        <div className="ml-auto flex gap-1.5">
          {presets.map((v) => (
            <button
              key={v}
              onClick={() => set(v)}
              className={cx(
                'border px-2 py-1 font-label text-[11px] font-semibold tracking-[0.1em] uppercase',
                v === n ? 'border-gold bg-gold text-night' : 'border-gold/25 text-cream/60',
              )}
            >
              {v === state.questionPool ? 'Tous' : v}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-cream/45">Tirés au hasard parmi {state.questionPool} catégories. Compte ~1 min par prix.</p>
    </Section>
  );
}

// ---------------------------------------------------------------------------

/** Écran d'accueil de l'organisateur avant le lancement */
export function HostLobby({ state, onNotice }: { state: RoomState; onNotice: Notice }) {
  const joinBase = useJoinBase();
  const [showQr, setShowQr] = useState(false);

  return (
    <div className="flex animate-rise flex-col gap-4">
      <div className="text-center">
        <Label className="text-cream/60">Code de la soirée</Label>
        <div className="mt-2 flex justify-center gap-2">
          {state.code.split('').map((ch, i) => (
            <span key={i} className="deco-card grid h-16 w-13 place-items-center bg-night-2 font-display text-4xl font-semibold text-gold">
              {ch}
            </span>
          ))}
        </div>
        <button onClick={() => setShowQr((v) => !v)} className="mt-3 font-label text-[11px] tracking-[0.2em] text-cream/50 uppercase underline-offset-4 hover:underline">
          {showQr ? 'Masquer le QR' : 'Montrer le QR sur mon téléphone'}
        </button>
        {showQr && (
          <div className="mt-3 flex justify-center">
            <div className="deco-card bg-cream p-3">
              <QRCodeSVG value={`${joinBase}/?code=${state.code}`} size={170} bgColor="#f3ead5" fgColor="#02041f" />
            </div>
          </div>
        )}
      </div>

      <ScreenSection state={state} onNotice={onNotice} />
      <PrizesSection state={state} />
      <GuestsSection state={state} />
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Barre de pilotage collée en bas de l'écran de l'organisateur */
export function HostBar({ state, onNotice }: { state: RoomState; onNotice: Notice }) {
  const [open, setOpen] = useState(false);
  const isLast = state.questionIndex + 1 >= state.totalQuestions;
  const connected = state.players.filter((p) => p.connected).length;

  const action =
    state.phase === 'lobby'
      ? { label: state.players.length < 2 ? 'En attente des invités…' : 'Lancer les Awards', ev: 'host:start' as const, disabled: state.players.length < 2 }
      : state.phase === 'question'
        ? { label: `Révéler · ${state.votesCount}/${connected}`, ev: 'host:reveal' as const, disabled: false }
        : state.phase === 'reveal'
          ? { label: isLast ? 'Le palmarès' : 'Prix suivant', ev: 'host:next' as const, disabled: false }
          : { label: 'Rejouer', ev: 'host:restart' as const, disabled: false };

  const fire = () => {
    navigator.vibrate?.(20);
    socket.emit(action.ev);
  };

  return (
    <>
      <div className="sticky bottom-0 z-20 -mx-7 mt-6 border-t border-gold/30 bg-night/95 px-7 pt-3 pb-1 backdrop-blur">
        <div className="mb-2 flex items-center justify-between">
          <Label className="text-[10px] text-gold/80">🔑 Régie</Label>
          <div className="flex items-center gap-2">
            {state.phase !== 'lobby' && (
              <button
                onClick={() => socket.emit('host:showJoin', { show: !state.showJoin })}
                className={cx(
                  'border px-2 py-1 font-label text-[10px] font-semibold tracking-[0.15em] uppercase transition',
                  state.showJoin ? 'border-gold bg-gold text-night' : 'border-gold/30 text-cream/60',
                )}
              >
                {state.showJoin ? 'Code affiché' : 'Afficher le code'}
              </button>
            )}
            <button onClick={() => setOpen(true)} className="border border-gold/30 px-2 py-1 font-label text-[10px] font-semibold tracking-[0.15em] text-cream/70 uppercase">
              ⚙ Réglages
            </button>
          </div>
        </div>
        <Button size="lg" className="w-full" disabled={action.disabled} onClick={fire}>
          {action.label}
        </Button>
      </div>

      {open && <HostSheet state={state} onClose={() => setOpen(false)} onNotice={onNotice} />}
    </>
  );
}

function HostSheet({ state, onClose, onNotice }: { state: RoomState; onClose: () => void; onNotice: Notice }) {
  const inGame = state.phase === 'question' || state.phase === 'reveal';

  const end = () => {
    if (confirm('Terminer maintenant et afficher le palmarès ?')) {
      socket.emit('host:end');
      onClose();
    }
  };
  const restart = () => {
    if (confirm('Recommencer une partie avec les mêmes invités ?')) {
      socket.emit('host:restart');
      onClose();
    }
  };
  const close = () => {
    if (confirm('Fermer définitivement la soirée ? Tout le monde sera déconnecté.')) socket.emit('host:close');
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-night/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mx-auto max-h-[85dvh] w-full max-w-md animate-rise overflow-y-auto border-t border-gold/50 bg-night px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <p className="font-display text-2xl font-semibold uppercase">Réglages</p>
          <button onClick={onClose} className="grid size-9 place-items-center border border-gold/30 text-gold" aria-label="Fermer">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4">
          <Section title="Code d'accès à l'écran">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-cream/65">
                Pour un retardataire : affiche le QR et le code <b className="text-gold">{state.code}</b> par-dessus la partie.
              </p>
              <Button
                size="sm"
                variant={state.showJoin ? 'gold' : 'ghost'}
                onClick={() => socket.emit('host:showJoin', { show: !state.showJoin })}
                disabled={state.phase === 'lobby'}
              >
                {state.showJoin ? 'Masquer' : 'Afficher'}
              </Button>
            </div>
          </Section>

          <ScreenSection state={state} onNotice={onNotice} />
          <GuestsSection state={state} />

          <div className="flex flex-col gap-2">
            {inGame && (
              <Button variant="ghost" onClick={end}>
                Terminer et voir le palmarès
              </Button>
            )}
            {state.phase !== 'lobby' && (
              <Button variant="ghost" onClick={restart}>
                Rejouer avec les mêmes invités
              </Button>
            )}
            <Button variant="danger" onClick={close}>
              Fermer la soirée
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

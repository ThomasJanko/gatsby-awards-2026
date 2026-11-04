import confetti from 'canvas-confetti';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(' ');
}

export function Button({
  variant = 'gold',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'gold' | 'ghost' | 'danger'; size?: 'md' | 'lg' | 'sm' }) {
  return (
    <button
      {...props}
      className={cx(
        'deco-btn inline-flex items-center justify-center gap-2 font-label font-semibold tracking-[0.22em] uppercase transition',
        'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-35',
        size === 'lg' && 'px-9 py-4 text-base',
        size === 'md' && 'px-6 py-3 text-sm',
        size === 'sm' && 'px-3 py-2 text-[11px]',
        variant === 'gold' && 'bg-gold text-night hover:bg-gold-2 shadow-[0_0_40px_-10px_rgba(227,197,115,0.6)]',
        variant === 'ghost' && 'bg-night-2 text-gold ring-1 ring-gold/40 hover:bg-night-3',
        variant === 'danger' && 'bg-rose/10 text-rose ring-1 ring-rose/40 hover:bg-rose/20',
        className,
      )}
    />
  );
}

/** "GATSBY AWARDS" + millésime, façon carton d'invitation */
export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  if (compact) {
    return (
      <div className={cx('font-display leading-none font-semibold tracking-[0.08em] uppercase', className)}>
        <span className="gold-text">Gatsby Awards</span>
      </div>
    );
  }
  return (
    <div className={cx('text-center leading-none', className)}>
      <div className="font-label text-[0.12em] tracking-[0.55em] text-cream/80 uppercase">Gatsby Night · Réveillon</div>
      <div className="gold-text mt-[0.1em] font-display font-bold tracking-[0.04em] uppercase">Awards</div>
      <div className="mt-[0.15em] font-label text-[0.13em] tracking-[0.6em] text-gold uppercase">— MMXXVI —</div>
    </div>
  );
}

export function Avatar({ emoji, size = 'md', dim }: { emoji: string; size?: 'sm' | 'md' | 'lg' | 'xl'; dim?: boolean }) {
  return (
    <span
      className={cx(
        'inline-grid shrink-0 place-items-center rounded-full bg-night-3 ring-1 ring-gold/50 outline outline-1 outline-offset-2 outline-gold/20',
        size === 'sm' && 'size-8 text-lg outline-0',
        size === 'md' && 'size-11 text-2xl',
        size === 'lg' && 'size-16 text-4xl',
        size === 'xl' && 'size-32 text-7xl outline-offset-4',
        dim && 'opacity-40 grayscale',
      )}
    >
      {emoji}
    </span>
  );
}

export function ConnectionBanner({ connected }: { connected: boolean }) {
  if (connected) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-rose px-4 py-2 text-center font-label text-xs font-semibold tracking-[0.2em] text-night uppercase">
      Connexion perdue… on se reconnecte
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('deco-card bg-night-2/90', className)}>{children}</div>;
}

/** Petite étiquette en capitales espacées */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('font-label text-xs font-semibold tracking-[0.35em] uppercase', className)}>{children}</p>;
}

// ---------------------------------------------------------------------------
// Ornements Art déco
// ---------------------------------------------------------------------------

function Corner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 90 90" fill="none" stroke="currentColor" strokeWidth="1.4" className={className} aria-hidden>
      <path d="M4 52 V4 H52" />
      <path d="M12 40 V12 H40" />
      <path d="M12 12 L30 30" />
      <path d="M22 44 Q22 22 44 22" />
      <path d="M30 52 Q30 30 52 30" />
      <rect x="27" y="27" width="6" height="6" transform="rotate(45 30 30)" fill="currentColor" stroke="none" />
      <circle cx="4" cy="60" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="60" cy="4" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Double filet doré + coins ornementés, fixé autour de l'écran */
export function DecoFrame({ tight }: { tight?: boolean }) {
  const inset = tight ? 'inset-2' : 'inset-4 md:inset-6';
  const size = tight ? 'size-12' : 'size-16 md:size-24';
  return (
    <div className={cx('pointer-events-none fixed z-0 text-gold', inset)} aria-hidden>
      <div className="absolute inset-0 border border-gold/70" />
      <div className={cx('absolute border border-gold/35', tight ? 'inset-1' : 'inset-1.5 md:inset-2')} />
      <Corner className={cx('absolute -top-px -left-px', size)} />
      <Corner className={cx('absolute -top-px -right-px -scale-x-100', size)} />
      <Corner className={cx('absolute -bottom-px -left-px -scale-y-100', size)} />
      <Corner className={cx('absolute -right-px -bottom-px -scale-100', size)} />
    </div>
  );
}

/** Filet horizontal avec losange central */
export function DecoDivider({ className }: { className?: string }) {
  return (
    <div className={cx('flex items-center justify-center gap-3 text-gold', className)} aria-hidden>
      <span className="h-px w-16 bg-gradient-to-l from-gold to-transparent" />
      <span className="size-1.5 rotate-45 bg-gold/60" />
      <span className="size-2.5 rotate-45 border border-gold" />
      <span className="size-1.5 rotate-45 bg-gold/60" />
      <span className="h-px w-16 bg-gradient-to-r from-gold to-transparent" />
    </div>
  );
}

/** Éventail / soleil levant Art déco */
export function DecoFan({ className }: { className?: string }) {
  const rays = Array.from({ length: 13 }, (_, i) => -90 + (i * 180) / 12);
  return (
    <svg viewBox="0 0 200 104" fill="none" stroke="currentColor" className={cx('text-gold', className)} aria-hidden>
      {rays.map((deg) => {
        const r = (deg * Math.PI) / 180;
        return <line key={deg} x1="100" y1="100" x2={100 + Math.sin(r) * 92} y2={100 - Math.cos(r) * 92} strokeWidth="1" opacity="0.7" />;
      })}
      <path d="M12 100 A88 88 0 0 1 188 100" strokeWidth="1.4" />
      <path d="M40 100 A60 60 0 0 1 160 100" strokeWidth="1.4" />
      <path d="M68 100 A32 32 0 0 1 132 100" fill="#02041f" strokeWidth="1.4" />
      <line x1="4" y1="100" x2="196" y2="100" strokeWidth="1.4" />
    </svg>
  );
}

export function fireConfetti(big = false) {
  const colors = ['#e3c573', '#f3dfa2', '#b8913f', '#f3ead5'];
  const shoot = (x: number, angle: number) =>
    confetti({ particleCount: big ? 140 : 60, spread: big ? 80 : 60, angle, origin: { x, y: 0.75 }, colors, scalar: big ? 1.1 : 0.9 });
  shoot(0.1, 60);
  shoot(0.9, 120);
  if (big) setTimeout(() => confetti({ particleCount: 200, spread: 140, origin: { y: 0.45 }, colors, shapes: ['square', 'circle'] }), 350);
}

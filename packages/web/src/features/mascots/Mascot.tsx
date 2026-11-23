import type { ReactElement } from 'react';
import type { MascotKey } from '@pausa/shared';

/**
 * Original drawings of the room mascots (D-49). Decorative: always aria-hidden, the mascot's name
 * is shown as text next to it. Colours come only from the --mascot-* tokens in tokens.css.
 */
export function Mascot({
  mascot,
  size = 40,
  className,
}: {
  mascot: MascotKey;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={className}
      data-mascot={mascot}
    >
      {ART[mascot]}
    </svg>
  );
}

const c = (key: MascotKey, n: 1 | 2 | 3) => `var(--mascot-${key}-${n})`;
const INK = 'var(--mascot-ink)';
const SHINE = 'var(--mascot-shine)';
const CHEEK = 'var(--mascot-cheek)';
const BEAK = 'var(--mascot-beak)';

function Eyes({ y, left, right, r = 3 }: { y: number; left: number; right: number; r?: number }) {
  return (
    <>
      {[left, right].map((x) => (
        <g key={x}>
          <circle cx={x} cy={y} r={r} fill={INK} />
          <circle cx={x + r * 0.35} cy={y - r * 0.35} r={r * 0.33} fill={SHINE} />
        </g>
      ))}
    </>
  );
}

function Cheeks({ y, left, right }: { y: number; left: number; right: number }) {
  return (
    <>
      <circle cx={left} cy={y} r={2.4} fill={CHEEK} opacity={0.75} />
      <circle cx={right} cy={y} r={2.4} fill={CHEEK} opacity={0.75} />
    </>
  );
}

const line = {
  fill: 'none',
  stroke: INK,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const ART: Record<MascotKey, ReactElement> = {
  // Dona Lurdes: a pigeon in hair curlers, iridescent neck, always listening.
  lurdes: (
    <>
      <circle cx={23} cy={11} r={4} fill={c('lurdes', 2)} />
      <circle cx={32} cy={8.5} r={4.5} fill={c('lurdes', 2)} />
      <circle cx={41} cy={11} r={4} fill={c('lurdes', 2)} />
      <ellipse cx={12} cy={44} rx={5} ry={9} transform="rotate(20 12 44)" fill={c('lurdes', 1)} />
      <ellipse cx={52} cy={44} rx={5} ry={9} transform="rotate(-20 52 44)" fill={c('lurdes', 1)} />
      <ellipse cx={32} cy={44} rx={19} ry={16} fill={c('lurdes', 1)} />
      <ellipse cx={32} cy={48} rx={11} ry={9.5} fill={c('lurdes', 2)} />
      <ellipse cx={32} cy={33} rx={12.5} ry={5} fill={c('lurdes', 3)} />
      <circle cx={32} cy={22} r={13} fill={c('lurdes', 1)} />
      <Eyes y={20.5} left={26.5} right={37.5} />
      <Cheeks y={26} left={22.5} right={41.5} />
      <path d="M29 25.5 L35 25.5 L32 30.5 Z" fill={BEAK} />
      <ellipse cx={26} cy={60} rx={3.5} ry={1.6} fill={BEAK} />
      <ellipse cx={38} cy={60} rx={3.5} ry={1.6} fill={BEAK} />
    </>
  ),
  // Bolacha: a dachshund, long body, floppy ears, tongue out for snacks.
  bolacha: (
    <>
      <path d="M57 42 q6 -5 4 -12" {...line} stroke={c('bolacha', 1)} strokeWidth={3.5} />
      <rect x={5} y={37} width={54} height={18} rx={9} fill={c('bolacha', 1)} />
      {[14, 24, 42, 52].map((x) => (
        <ellipse key={x} cx={x} cy={56.5} rx={4} ry={2.6} fill={c('bolacha', 3)} />
      ))}
      <ellipse cx={17} cy={30} rx={6} ry={11} transform="rotate(18 17 30)" fill={c('bolacha', 3)} />
      <ellipse
        cx={47}
        cy={30}
        rx={6}
        ry={11}
        transform="rotate(-18 47 30)"
        fill={c('bolacha', 3)}
      />
      <circle cx={32} cy={26} r={14} fill={c('bolacha', 1)} />
      <ellipse cx={32} cy={33} rx={8} ry={6} fill={c('bolacha', 2)} />
      <ellipse cx={34} cy={38.5} rx={2.2} ry={2.6} fill={CHEEK} />
      <path d="M28 35 q4 3 8 0" {...line} strokeWidth={1.4} />
      <ellipse cx={32} cy={30.5} rx={3} ry={2.2} fill={INK} />
      <Eyes y={23} left={26} right={38} />
      <Cheeks y={29} left={22} right={42} />
    </>
  ),
  // Faísca: a squirrel with a huge tail and a coffee, permanently at full speed.
  faisca: (
    <>
      <path
        d="M42 56 C62 52 64 28 52 16 C45 10 37 15 41 23 C49 30 49 44 39 50 Z"
        fill={c('faisca', 1)}
      />
      <path d="M47 50 C57 44 57 29 50 22" {...line} stroke={c('faisca', 2)} strokeWidth={3} />
      <path d="M18 15 L20.5 4 L26.5 13 Z" fill={c('faisca', 1)} />
      <path d="M30 13 L35.5 4 L38 15 Z" fill={c('faisca', 1)} />
      <ellipse cx={28} cy={46} rx={13} ry={13} fill={c('faisca', 1)} />
      <ellipse cx={28} cy={49} rx={8} ry={9} fill={c('faisca', 2)} />
      <circle cx={28} cy={24} r={12} fill={c('faisca', 1)} />
      <ellipse cx={28} cy={28.5} rx={6} ry={4.5} fill={c('faisca', 2)} />
      <Eyes y={22} left={22.5} right={33.5} r={3.4} />
      <Cheeks y={28} left={18.5} right={37.5} />
      <ellipse cx={28} cy={27} rx={1.7} ry={1.2} fill={INK} />
      <rect x={26.6} y={29.5} width={2.8} height={2.6} rx={0.6} fill={SHINE} />
      <path
        d="M41 44 h2.5 a2.5 2.5 0 0 1 0 5 h-2.5"
        {...line}
        stroke={c('faisca', 3)}
        strokeWidth={1.6}
      />
      <rect x={32} y={41} width={9.5} height={10} rx={2} fill={c('faisca', 3)} />
      <path
        d="M34.5 38 q2 -2.5 0 -5 M38.5 38 q2 -2.5 0 -5"
        {...line}
        stroke={c('faisca', 3)}
        strokeWidth={1.4}
      />
      <circle cx={32} cy={47} r={2.6} fill={c('faisca', 1)} />
    </>
  ),
  // Sr. Ferreira: an old tortoise with round glasses, in no hurry at all.
  ferreira: (
    <>
      <ellipse cx={15} cy={55} rx={6} ry={4} fill={c('ferreira', 1)} />
      <ellipse cx={49} cy={55} rx={6} ry={4} fill={c('ferreira', 1)} />
      <rect x={27} y={26} width={10} height={10} rx={4} fill={c('ferreira', 1)} />
      <path d="M8 51 A24 22 0 0 1 56 51 Z" fill={c('ferreira', 3)} />
      <path
        d="M26 41 L32 37 L38 41 L38 47 L32 50 L26 47 Z M17 46 L22 42 M47 46 L42 42 M32 37 L32 31"
        {...line}
        stroke={c('ferreira', 2)}
        strokeWidth={1.8}
      />
      <rect x={6} y={49} width={52} height={5} rx={2.5} fill={c('ferreira', 2)} />
      <circle cx={32} cy={21} r={11} fill={c('ferreira', 1)} />
      <circle cx={27} cy={20.5} r={4.3} fill={SHINE} opacity={0.4} />
      <circle cx={37} cy={20.5} r={4.3} fill={SHINE} opacity={0.4} />
      <circle cx={27} cy={20.5} r={4.3} fill="none" stroke={INK} strokeWidth={1.4} />
      <circle cx={37} cy={20.5} r={4.3} fill="none" stroke={INK} strokeWidth={1.4} />
      <path d="M31.3 20.5 h1.4" {...line} strokeWidth={1.4} />
      <path d="M25.3 21.2 q1.7 1.3 3.4 0 M35.3 21.2 q1.7 1.3 3.4 0" {...line} strokeWidth={1.3} />
      <path d="M28.5 26.5 q3.5 2.2 7 0" {...line} strokeWidth={1.3} />
      <Cheeks y={25.5} left={23} right={41} />
    </>
  ),
  // Pixel: an octopus with a laptop and one raised, unimpressed eyebrow.
  pixel: (
    <>
      {[
        'M17 36 v14 q0 6 -5 6',
        'M26 38 v15 q0 4 4 4',
        'M38 38 v15 q0 4 -4 4',
        'M47 36 v14 q0 6 5 6',
      ].map((d) => (
        <path key={d} d={d} {...line} stroke={c('pixel', 1)} strokeWidth={7} />
      ))}
      <ellipse cx={32} cy={27} rx={18} ry={17} fill={c('pixel', 1)} />
      <circle cx={21} cy={17} r={2.2} fill={c('pixel', 2)} />
      <circle cx={44} cy={15} r={1.7} fill={c('pixel', 2)} />
      <circle cx={46} cy={30} r={1.4} fill={c('pixel', 2)} />
      <Eyes y={27} left={25} right={39} />
      <path d="M21 21.5 h7.5 M35.5 19 l7.5 2.5" {...line} strokeWidth={1.7} />
      <path d="M28 34.5 q4 2 8 -1.2" {...line} strokeWidth={1.4} />
      <Cheeks y={32} left={20} right={44} />
      <rect x={21} y={47} width={22} height={11} rx={2} fill={c('pixel', 3)} />
      <rect x={23.5} y={49} width={17} height={7} rx={1} fill={c('pixel', 2)} />
      <rect x={18} y={57.5} width={28} height={2.5} rx={1.2} fill={c('pixel', 3)} />
    </>
  ),
  // Nuvem: a fluffy cat, eyes closed, dreaming of the next nap.
  nuvem: (
    <>
      <path d="M50 52 C62 50 62 36 54 33" {...line} stroke={c('nuvem', 3)} strokeWidth={5} />
      <ellipse
        cx={32}
        cy={50}
        rx={22}
        ry={11}
        fill={c('nuvem', 1)}
        stroke={c('nuvem', 3)}
        strokeWidth={1.2}
      />
      <path
        d="M15 27 L16 11 L28 21 Z"
        fill={c('nuvem', 1)}
        stroke={c('nuvem', 3)}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      <path
        d="M49 27 L48 11 L36 21 Z"
        fill={c('nuvem', 1)}
        stroke={c('nuvem', 3)}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
      <ellipse
        cx={32}
        cy={34}
        rx={18}
        ry={15}
        fill={c('nuvem', 1)}
        stroke={c('nuvem', 3)}
        strokeWidth={1.2}
      />
      <path
        d="M18 23.5 L18.5 15.5 L24.5 20.5 Z M46 23.5 L45.5 15.5 L39.5 20.5 Z"
        fill={c('nuvem', 2)}
      />
      <path d="M29 21 v4 M32 20 v5 M35 21 v4" {...line} stroke={c('nuvem', 3)} strokeWidth={1.6} />
      <path d="M22 33.5 q3 3 6 0 M36 33.5 q3 3 6 0" {...line} strokeWidth={1.6} />
      <path d="M30.6 37.5 h2.8 l-1.4 1.7 Z" fill={c('nuvem', 2)} />
      <path d="M32 39.3 q-1.5 2 -3 1 M32 39.3 q1.5 2 3 1" {...line} strokeWidth={1.1} />
      <path
        d="M24 39 L12 37.5 M24 41.5 L12.5 43 M40 39 L52 37.5 M40 41.5 L51.5 43"
        {...line}
        stroke={c('nuvem', 3)}
        strokeWidth={1}
      />
      <Cheeks y={37.5} left={21} right={43} />
      <path
        d="M51 5 h6 l-6 7 h6 M44 14 h4 l-4 4.5 h4"
        {...line}
        stroke={c('nuvem', 3)}
        strokeWidth={1.6}
      />
    </>
  ),
};

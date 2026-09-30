import type { Controls } from '../gestures/controls';
import type { IconName } from '../ui/icons';

export interface TutorialStep {
  title: string;
  text: string;
  icon: IconName;
  /** How long the gesture must be held to count. */
  holdMs: number;
  done(c: Controls): boolean;
}

export const TUTORIAL: TutorialStep[] = [
  {
    title: 'Покажи обе ладони',
    text: 'Подними руки перед собой на уровне груди, ладонями к экрану — как будто держишь штурвал.',
    icon: 'steer',
    holdMs: 800,
    done: (c) => !!c.left && !!c.right && !c.issues.some((i) => i.goal === 'frame'),
  },
  {
    title: 'Штурвал влево',
    text: 'Левую руку опусти, правую подними — корабль полетит влево.',
    icon: 'steer',
    holdMs: 600,
    done: (c) => c.steer < -0.6,
  },
  {
    title: 'Штурвал вправо',
    text: 'Теперь наоборот: правую руку опусти, левую подними.',
    icon: 'steer',
    holdMs: 600,
    done: (c) => c.steer > 0.6,
  },
  {
    title: 'Сожми оба кулака',
    text: 'Кулаки — огонь. Пока обе руки сжаты, корабль стреляет лазерами.',
    icon: 'fire',
    holdMs: 700,
    done: (c) => c.fire,
  },
  {
    title: 'Сдвинь ладони вместе',
    text: 'Поставь ладони рядом, большими пальцами друг к другу — это щит. Он держит лазеры и снаряды, но тратит энергию.',
    icon: 'shield',
    holdMs: 700,
    done: (c) => c.shield,
  },
  {
    title: 'Подними указательные пальцы',
    text: 'Оба указательных вверх, остальные пальцы прижаты — ракета. Сносит броню босса одним ударом. Заряжается кристаллами.',
    icon: 'rocket',
    holdMs: 700,
    done: (c) => c.rocket,
  },
];

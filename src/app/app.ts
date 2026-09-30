import { startCamera } from '../core/camera';
import { HandEngine } from '../core/handEngine';
import type { HandsFrame } from '../core/types';
import { BOSS_HP, Game, MAX_LIVES, STAGES, type GameEvent } from '../game/game';
import { GameRenderer } from '../game/renderer';
import { readControls, type Controls } from '../gestures/controls';
import { CameraView } from '../ui/cameraView';
import { DwellController, HandCursor } from '../ui/handCursor';
import { ICONS } from '../ui/icons';
import { Sound } from './audio';
import { Coach } from './coach';
import { bestScore, markTutorialDone, saveRun, tutorialDone } from './storage';
import { TUTORIAL, type TutorialStep } from './tutorial';

type ScreenId = 'intro' | 'menu' | 'tutorial' | 'game' | 'pause' | 'results';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/** Camera darkness behind each screen (the game screen draws the game instead). */
const DIM: Record<ScreenId, number> = { intro: 0, menu: 0.35, tutorial: 0.1, game: 0, pause: 0.6, results: 0.85 };
/** Screens where the index finger drives a cursor. In flight the hands are busy piloting. */
const CURSOR_SCREENS: ScreenId[] = ['menu', 'tutorial', 'pause', 'results'];
const LOST_HANDS_MS = 1200;

const GESTURES = [
  { icon: ICONS.steer, title: 'Наклон рук', text: 'штурвал: влево / вправо' },
  { icon: ICONS.fire, title: 'Два кулака', text: 'огонь из лазеров' },
  { icon: ICONS.shield, title: 'Ладони рядом', text: 'щит от лазеров и снарядов' },
  { icon: ICONS.rocket, title: 'Пальцы вверх', text: 'ракета: сносит броню босса' },
];

export class App {
  private video = $<HTMLVideoElement>('video');
  private stage = $<HTMLCanvasElement>('stage');
  private cameraView = new CameraView(this.stage);
  private pip = new CameraView($<HTMLCanvasElement>('pip'));
  private gameView = new GameRenderer(this.stage.getContext('2d')!);
  private sound = new Sound();
  private cursor = new HandCursor();
  private dwell = new DwellController($('cursor'), () => this.sound.hover());
  private coach = new Coach({ root: $('feedback'), kind: $('fb-kind'), problem: $('fb-problem'), fix: $('fb-fix') });
  private engine: HandEngine | null = null;
  private screen: ScreenId = 'intro';
  private frame: HandsFrame | null = null;
  private controls: Controls = readControls(null);

  private game: Game | null = null;
  private lastT = 0;
  private startAt = 0; // game runs once the countdown finishes
  private lostSince: number | null = null;
  private endAt: number | null = null;

  private tutStep = 0;
  private tutHoldSince: number | null = null;
  private tutDoneAt: number | null = null;

  constructor() {
    document.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (el?.dataset.action) this.action(el.dataset.action);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' && e.key !== ' ') return;
      if (this.screen === 'game') this.pause('Пауза с клавиатуры');
      else if (this.screen === 'pause') this.resume();
    });
    const legend = GESTURES.map((g) => `<li>${g.icon}<div><b>${g.title}</b><span>${g.text}</span></div></li>`).join('');
    $('intro-gestures').innerHTML = legend;
    $('menu-gestures').innerHTML = legend;
    document.querySelectorAll<HTMLElement>('#gesture-panel [data-g]').forEach((li) => {
      li.querySelector('.gi')!.innerHTML = ICONS[li.dataset.g as 'steer' | 'fire' | 'shield' | 'rocket'];
    });
    this.updateSoundLabel();
    requestAnimationFrame(this.loop);
  }

  // ---------- Actions: mouse clicks and hand-cursor dwell both land here ----------

  private action(name: string) {
    if (name !== 'start') this.sound.select();
    switch (name) {
      case 'start': return void this.boot();
      case 'play': return tutorialDone() ? this.startGame() : this.startTutorial();
      case 'tutorial': return this.startTutorial();
      case 'skip-tutorial': markTutorialDone(); return this.startGame();
      case 'menu': return this.showMenu();
      case 'sound': return this.toggleSound();
      case 'pause': return this.pause('Пауза');
      case 'resume': return this.resume();
    }
  }

  private async boot() {
    const btn = $<HTMLButtonElement>('start-btn');
    const status = $('intro-status');
    btn.disabled = true;
    status.className = 'note loading';
    status.textContent = 'Включаем камеру и загружаем модель распознавания рук…';
    this.sound.unlock();
    try {
      const [, engine] = await Promise.all([startCamera(this.video), HandEngine.create()]);
      this.engine = engine;
      this.showMenu();
    } catch (err) {
      console.error(err);
      status.className = 'note error';
      status.textContent = (err as Error).message || 'Что-то пошло не так. Обнови страницу.';
      btn.disabled = false;
      btn.textContent = 'Попробовать снова';
    }
  }

  // ---------- Main loop ----------

  private loop = (t: number) => {
    const dt = this.lastT ? Math.min((t - this.lastT) / 1000, 0.05) : 0;
    this.lastT = t;
    this.frame = this.engine?.detect(this.video, t) ?? null;
    this.controls = readControls(this.frame);

    if (this.screen === 'game' && this.game) {
      this.updateGame(t, dt);
    } else {
      const highlight = this.screen === 'tutorial' ? this.coach.highlight : [];
      // In the tutorial show the whole camera frame — the user must see where their hands can go.
      const fit = this.screen === 'tutorial' ? 'contain' : 'cover';
      this.cameraView.draw(this.video, this.frame, this.controls, t, { dim: DIM[this.screen], highlight, fit });
    }
    if (this.screen === 'tutorial') this.updateTutorial(t);

    if (CURSOR_SCREENS.includes(this.screen)) {
      this.dwell.update(this.cursor.update(this.frame, window.innerWidth, window.innerHeight), t, $(`screen-${this.screen}`));
    } else {
      this.dwell.reset();
    }
    requestAnimationFrame(this.loop);
  };

  private show(screen: ScreenId) {
    document.querySelectorAll('.screen').forEach((el) => el.classList.toggle('active', el.id === `screen-${screen}`));
    document.body.classList.toggle('in-game', screen === 'game');
    document.body.classList.toggle('in-tutorial', screen === 'tutorial');
    if (screen !== 'game' && screen !== 'tutorial') this.coach.hide();
    this.screen = screen;
  }

  // ---------- Menu ----------

  private showMenu() {
    this.game = null;
    const best = bestScore();
    const card = (action: string, icon: string, title: string, text: string, meta: string, cls = '') => `
      <button class="card ${cls}" data-action="${action}">
        ${icon}
        <div><h3>${title}</h3><p>${text}</p></div>
        <div class="meta"><span>${meta}</span></div>
      </button>`;
    $('cards').innerHTML =
      card('play', ICONS.play, 'Играть', 'Три этапа: астероидное поле, лазерная засада и босс — крейсер «Тиран».', best ? `рекорд: ${best}` : 'рекорда пока нет', 'feature') +
      card('tutorial', ICONS.tutorial, 'Обучение', 'Все жесты за минуту — с подсказками, если что-то не так.', tutorialDone() ? 'пройдено' : 'рекомендуем начать отсюда');
    this.show('menu');
  }

  private toggleSound() {
    const muted = this.sound.toggleMute();
    this.updateSoundLabel();
    this.toast(muted ? 'Звук выключен' : 'Звук включён');
  }

  private updateSoundLabel() {
    $('sound-btn').textContent = this.sound.muted ? 'Звук: выкл' : 'Звук: вкл';
  }

  // ---------- Tutorial: learn each gesture, with error hints ----------

  private startTutorial() {
    this.tutStep = 0;
    this.tutHoldSince = this.tutDoneAt = null;
    this.show('tutorial');
    this.coach.reset();
    this.renderTutorial();
  }

  private renderTutorial() {
    const step: TutorialStep | undefined = TUTORIAL[this.tutStep];
    $('tut-steps').innerHTML = TUTORIAL.map((s, i) => `<li class="${i < this.tutStep ? 'done' : i === this.tutStep ? 'current' : ''}" title="${s.title}"></li>`).join('');
    $('tut-card').classList.toggle('done', !step);
    $('tut-icon').innerHTML = step ? ICONS[step.icon] : ICONS.play;
    $('tut-count').textContent = step ? `Жест ${this.tutStep + 1} из ${TUTORIAL.length}` : 'Готово';
    $('tut-title').textContent = step ? step.title : 'Все жесты освоены!';
    $('tut-text').textContent = step ? step.text : 'Сейчас начнётся миссия…';
    $('tut-hold').style.setProperty('--p', step ? '0' : '1');
  }

  private updateTutorial(t: number) {
    this.coach.update(this.controls, t);
    const step = TUTORIAL[this.tutStep];
    if (!step) {
      if (this.tutDoneAt !== null && t - this.tutDoneAt > 2200) {
        markTutorialDone();
        this.startGame();
      }
      return;
    }
    if (!step.done(this.controls)) {
      this.tutHoldSince = null;
      $('tut-hold').style.setProperty('--p', '0');
      return;
    }
    this.tutHoldSince ??= t;
    const p = Math.min((t - this.tutHoldSince) / step.holdMs, 1);
    $('tut-hold').style.setProperty('--p', p.toFixed(3));
    if (p < 1) return;
    this.sound.charged();
    this.tutStep++;
    this.tutHoldSince = null;
    if (this.tutStep >= TUTORIAL.length) this.tutDoneAt = t;
    this.renderTutorial();
  }

  // ---------- Game ----------

  private startGame() {
    this.game = new Game(window.innerWidth, window.innerHeight);
    // `?stage=3` starts straight at the boss — handy for a quick demo.
    const skip = Number(new URLSearchParams(location.search).get('stage')) || 1;
    for (let i = 1; i < Math.min(skip, STAGES.length); i++) this.game.nextStage();
    this.coach.reset();
    this.lostSince = this.endAt = null;
    this.renderLives();
    this.show('game');
    this.countdown();
    setTimeout(() => this.game && this.screen === 'game' && this.banner(this.game.stage), 3000);
  }

  /** Big "Stage N: name — goal" title card. */
  private banner(index: number) {
    const stage = STAGES[index];
    $('banner-step').textContent = `Этап ${index + 1} из ${STAGES.length}`;
    $('banner-name').textContent = stage.name;
    $('banner-goal').textContent = stage.goal;
    const el = $('stage-banner');
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  /** 3-2-1 before the ship starts moving (at start and after a pause). */
  private countdown() {
    this.startAt = performance.now() + 3000;
    const el = $('countdown');
    let n = 3;
    const tick = () => {
      if (this.screen !== 'game') return void (el.textContent = '');
      el.textContent = n > 0 ? String(n) : 'Старт!';
      el.classList.remove('tick');
      void el.offsetWidth;
      el.classList.add('tick');
      if (n > 0) this.sound.countdown();
      else this.sound.go();
      if (n-- > 0) setTimeout(tick, 1000);
      else setTimeout(() => (el.textContent = ''), 700);
    };
    tick();
  }

  private updateGame(t: number, dt: number) {
    const game = this.game!;
    if (game.w !== window.innerWidth || game.h !== window.innerHeight) game.resize(window.innerWidth, window.innerHeight);
    const c = this.controls;
    const running = t >= this.startAt && !game.over;

    if (running) {
      // Both hands gone for a moment → the pilot let go of the wheel: pause instead of crashing.
      if (!c.left && !c.right) {
        this.lostSince ??= t;
        if (t - this.lostSince > LOST_HANDS_MS) return this.pause('Руки пропали из кадра. Покажи их и продолжай полёт.');
      } else {
        this.lostSince = null;
      }
      const events = game.update(dt, c);
      this.gameView.effects(events, game);
      this.onEvents(events, t);
    }
    this.coach.update(c, t);

    // Fit the canvas and draw the world.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (this.stage.width !== Math.round(w * dpr) || this.stage.height !== Math.round(h * dpr)) {
      this.stage.width = Math.round(w * dpr);
      this.stage.height = Math.round(h * dpr);
    }
    this.stage.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0);
    const started = t >= this.startAt;
    this.gameView.draw(game, started ? dt : 0, !started);
    this.pip.draw(this.video, this.frame, c, t, { dim: 0, highlight: this.coach.highlight, fit: 'contain' });
    this.renderHud(game, c);

    if (game.over && this.endAt !== null && t - this.endAt > 1500) this.finish();
  }

  private onEvents(events: GameEvent[], t: number) {
    const game = this.game!;
    for (const e of events) {
      switch (e.type) {
        case 'shoot': this.sound.shoot(); break;
        case 'kill': this.sound.explode(); break;
        case 'damage':
          this.sound.damage();
          this.renderLives();
          if (e.cause === 'beam') this.coach.info('beam.hit', 'Лазер попал в корабль', 'От узкого луча уходи в сторону, от широкого — ставь щит заранее', t);
          if (e.cause === 'shot') this.coach.info('shot.hit', 'Попадание плазмы', 'Снаряды летят веером — уходи в сторону или держи щит', t);
          break;
        case 'block': this.sound.block(); break;
        case 'heal':
          this.sound.heal();
          this.renderLives();
          break;
        case 'crystal':
          if (e.charged) {
            this.sound.charged();
            this.coach.info('rocket.ready', 'Ракета заряжена!', 'Подними оба указательных пальца вверх, чтобы запустить её', t);
          } else this.sound.crystal();
          break;
        case 'rocket': this.sound.rocket(); break;
        case 'boom': this.sound.explode(true); break;
        case 'rocketDenied': {
          const need = Math.ceil((1 - game.rocketCharge) / 0.34 - 1e-6);
          this.sound.denied();
          this.coach.info('rocket.denied', 'Ракета ещё не заряжена', `Собери ещё ${need} ${need === 1 ? 'кристалл' : 'кристалла'} — бирюзовые ромбы`, t);
          break;
        }
        case 'stage':
          this.banner(e.index);
          this.sound.charged();
          break;
        case 'split': this.sound.explode(); break;
        case 'armorHit': this.sound.hover(); break;
        case 'beamWarn':
          this.sound.warn();
          if (e.full && !game.shieldOn)
            this.coach.info('beam.full', 'Луч на весь экран!', 'Его не обойти — поставь ладони рядом, чтобы включить щит', t);
          break;
        case 'armorBroken':
          this.sound.explode(true);
          this.coach.info('boss.open', 'Броня пробита!', 'Теперь каждый выстрел бьёт по ядру. Ракета по ядру снимает сразу 10 HP', t);
          break;
        case 'bossDown':
          this.sound.explode(true);
          break;
        case 'shieldEmpty':
          this.coach.info('shield.empty', 'Щит разряжен', 'Разведи руки и подожди, пока полоска энергии восстановится', t);
          break;
        case 'end':
          this.endAt = t;
          if (e.won) this.sound.win();
          else this.sound.lose();
          break;
      }
    }
  }

  private renderHud(game: Game, c: Controls) {
    $('hud-score').textContent = String(game.score);
    $('hud-mult').textContent = game.multiplier > 1 ? `×${game.multiplier}` : '';
    $('hud-stage').textContent = `Этап ${game.stage + 1}/${STAGES.length}`;
    $('hud-time').textContent = game.boss ? (game.boss.armor > 0 ? `броня ${game.boss.armor}` : `${game.boss.hp}/${BOSS_HP}`) : `${Math.max(0, Math.ceil(STAGES[game.stage].duration - game.stageT))} с`;
    $('hud-timer').style.setProperty('--p', (game.boss ? game.boss.hp / BOSS_HP : game.stageProgress).toFixed(4));
    document.querySelector('.hud')!.classList.toggle('boss', !!game.boss);
    $('steer-needle').style.setProperty('--s', c.steer.toFixed(3));
    $('shield-bar').style.setProperty('--p', game.shieldEnergy.toFixed(3));
    $('rocket-bar').style.setProperty('--p', game.rocketCharge.toFixed(3));
    const panel = $('gesture-panel');
    const set = (g: string, on: boolean, ready = false) => {
      const li = panel.querySelector<HTMLElement>(`[data-g="${g}"]`)!;
      li.classList.toggle('on', on);
      li.classList.toggle('ready', ready && !on);
    };
    set('steer', Math.abs(c.steer) > 0.05);
    set('fire', c.fire);
    set('shield', game.shieldOn);
    set('rocket', c.rocket, game.rocketCharge >= 1);
  }

  private renderLives() {
    const lives = this.game?.lives ?? MAX_LIVES;
    $('hud-lives').innerHTML = Array.from({ length: MAX_LIVES }, (_, i) => `<i class="${i < lives ? '' : 'lost'}"></i>`).join('');
  }

  private pause(reason: string) {
    if (this.screen !== 'game' || !this.game || this.game.over) return;
    $('pause-reason').textContent = reason;
    this.show('pause');
  }

  private resume() {
    if (!this.game) return this.showMenu();
    this.lostSince = null;
    this.show('game');
    this.countdown();
  }

  // ---------- Results ----------

  private finish() {
    const game = this.game!;
    const accuracy = game.stats.shots ? Math.round((game.stats.hits / (game.stats.shots * 2)) * 100) : 0;
    const saved = saveRun({
      score: game.score,
      won: game.won,
      destroyed: game.stats.destroyed,
      accuracy,
      crystals: game.stats.crystals,
      durationSec: Math.round(game.t),
      stage: game.stage + 1,
      hintsShown: this.coach.shown,
      hintsCorrected: this.coach.corrected,
    });

    $('res-title').textContent = game.won ? 'Крейсер «Тиран» уничтожен!' : `Корабль уничтожен на этапе «${STAGES[game.stage].name}»`;
    $('res-score').textContent = String(game.score);
    $('res-record').hidden = !saved.isRecord;
    const s = game.stats;
    $('res-tiles').innerHTML = [
      [s.destroyed, 'астероидов сбито'],
      [`${accuracy}%`, 'точность стрельбы'],
      [s.crystals, 'кристаллов собрано'],
      [s.blocks, 'ударов принял щит'],
      [s.rockets, 'ракет запущено'],
      [game.bestCombo, 'лучшая серия'],
      [`${game.stage + 1}/${STAGES.length}`, game.won ? 'босс побеждён' : 'этап достигнут'],
      [saved.best, 'лучший счёт'],
    ].map(([v, l]) => `<div class="tile"><b>${v}</b><span>${l}</span></div>`).join('');

    const pct = this.coach.shown ? Math.round((this.coach.corrected / this.coach.shown) * 100) : 100;
    $('res-gestures').innerHTML = `
      <div class="ex-row"><span class="name">Подсказок по жестам</span><span class="val">${this.coach.shown}</span></div>
      <div class="ex-row"><span class="name">Исправлено после подсказки</span><span class="val">${this.coach.corrected} · ${pct}%</span>
        <div class="bar"><i style="width:${pct}%"></i></div></div>
      <div class="ex-row"><span class="name">Время полёта</span><span class="val">${Math.floor(game.t / 60)}:${String(Math.round(game.t) % 60).padStart(2, '0')}</span></div>`;

    const hints = [...this.coach.hints.values()].sort((a, b) => b.count - a.count).slice(0, 4);
    $('res-hints').innerHTML = hints.length
      ? hints.map((h) => `<div class="fault-item"><div class="fi-top">${h.issue.problem}<span>×${h.count}</span></div><p>${h.issue.fix}</p></div>`).join('')
      : '<div class="fault-item clean-badge"><div class="fi-top">Ни одной ошибки в жестах</div><p>Все жесты распознаны с первого раза — отличное управление!</p></div>';

    this.show('results');
  }

  private toast(text: string) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(Number(el.dataset.timer));
    el.dataset.timer = String(setTimeout(() => el.classList.remove('show'), 1800));
  }
}

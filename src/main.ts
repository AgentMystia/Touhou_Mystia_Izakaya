/**
 * Boot: wire the canvas, renderer, input and scene stack together and start
 * the loop.
 */

import { GameLoop } from './core/loop';
import { Input } from './core/input';
import { SceneManager, type SceneContext } from './core/scene';
import { Renderer } from './gfx/renderer';
import { loadFonts } from './gfx/text';
import { loadTextures } from './gfx/textures';
import { GalleryScene } from './scenes/gallery';
import { ResultsScene } from './scenes/results';
import { ServiceScene } from './scenes/service';
import { TitleScene } from './scenes/title';
import { NightService } from './sim/night';
import { loadGame, newGame, saveGame, type GameState } from './sim/state';

const params = new URLSearchParams(location.search);
/** `?e2e=1` makes the render deterministic for screenshot tests. */
const E2E = params.get('e2e') === '1';

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  if (!canvas) throw new Error('#game canvas is missing');

  await Promise.all([loadFonts(), loadTextures()]);

  const renderer = new Renderer(canvas, { deterministic: E2E });
  const input = new Input(canvas, renderer.toWorld);

  let time = 0;
  const manager: SceneManager = new SceneManager(
    (): SceneContext => ({ renderer, input, time, manager }),
  );

  let state: GameState = loadGame() ?? newGame(E2E ? 1337 : undefined);

  const startNight = (): void => {
    const night = new NightService(state);
    manager.replace(
      new ServiceScene(night, () => {
        manager.replace(
          new ResultsScene(night, state, () => {
            state.day++;
            saveGame(state);
            manager.replace(makeTitle());
          }),
        );
      }),
    );
  };

  const makeTitle = (): TitleScene =>
    new TitleScene((action) => {
      switch (action) {
        case 'new':
          state = newGame(E2E ? 1337 : undefined);
          startNight();
          break;
        case 'continue':
          state = loadGame() ?? state;
          startNight();
          break;
        default:
          // The album and settings arrive with the later milestones.
          console.info(`[title] ${action}`);
      }
    });

  const scene = params.get('scene');
  manager.boot(
    scene === 'gallery'
      ? new GalleryScene('all', params.get('big') === '1')
      : scene === 'service'
        ? new ServiceScene(new NightService(state), () => manager.replace(makeTitle()))
        : scene === 'results'
          ? (() => {
              // A short scripted night, so the ledger has something in it.
              const night = new NightService(state);
              night.timeLeft = 0;
              return new ResultsScene(night, state, () => manager.replace(makeTitle()));
            })()
          : makeTitle(),
  );

  const loop = new GameLoop(
    (dt) => {
      time += dt;
      manager.update(dt);
      input.endFrame();
    },
    (alpha) => {
      renderer.begin();
      manager.render(alpha);
      renderer.present();
    },
  );
  loop.start();

  document.querySelector('#boot')?.classList.add('gone');

  if (E2E) {
    // Minimal harness: advance a fixed number of simulation steps, then report
    // that the frame has settled so a screenshot is reproducible.
    Object.assign(window, {
      __mystia: {
        step(frames: number) {
          for (let i = 0; i < frames; i++) {
            time += 1 / 60;
            manager.update(1 / 60);
            input.endFrame();
          }
          renderer.begin();
          manager.render(0);
          renderer.present();
        },
        scene: () => manager.current?.name ?? null,
        /** The live night simulation, when the service scene is on top. */
        night: () => {
          const current = manager.current;
          return current instanceof ServiceScene ? current.simulation : null;
        },
        state: () => state,
        ready: true,
      },
    });
  }
}

boot().catch((error: unknown) => {
  console.error(error);
  const boot = document.querySelector('#boot');
  if (boot) {
    boot.innerHTML = `<h1>Could not open tonight</h1><p>${String(error)}</p>`;
  }
});

/**
 * Boot: wire the canvas, renderer, input and scene stack together and start
 * the loop.
 */

import { GameLoop } from './core/loop';
import { Input } from './core/input';
import { SceneManager, type SceneContext } from './core/scene';
import { Renderer } from './gfx/renderer';
import { loadFonts } from './gfx/text';
import { GalleryScene } from './scenes/gallery';
import { TitleScene } from './scenes/title';

const params = new URLSearchParams(location.search);
/** `?e2e=1` makes the render deterministic for screenshot tests. */
const E2E = params.get('e2e') === '1';

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  if (!canvas) throw new Error('#game canvas is missing');

  await loadFonts();

  const renderer = new Renderer(canvas, { deterministic: E2E });
  const input = new Input(canvas, renderer.toWorld);

  let time = 0;
  const manager: SceneManager = new SceneManager(
    (): SceneContext => ({ renderer, input, time, manager }),
  );

  // `?scene=gallery` renders the whole cast for art review.
  manager.boot(
    params.get('scene') === 'gallery'
      ? new GalleryScene('all')
      : new TitleScene((action) => {
          // Later milestones route these into the day map and album.
          console.info(`[title] ${action}`);
        }),
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

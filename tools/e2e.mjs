/**
 * Boots the built game in the pre-installed Chromium, walks it through a few
 * states and writes screenshots to artifacts/.
 *
 * The browser at /opt/pw-browsers is used directly via `executablePath`, so
 * `playwright install` is never needed and the Playwright package version does
 * not have to match the browser build.
 */

import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'artifacts');
const PORT = Number(process.env.PORT ?? 4173);
const BASE = `http://127.0.0.1:${PORT}/`;

/** Finds the Chromium shipped with the image, if there is one. */
function findChromium() {
  if (process.env.PW_CHROMIUM_PATH) return process.env.PW_CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  if (!existsSync(root)) return undefined;
  const candidates = readdirSync(root)
    .filter((d) => d.startsWith('chromium'))
    .sort()
    .reverse();
  for (const dir of candidates) {
    for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
      const full = path.join(root, dir, rel);
      if (existsSync(full)) return full;
    }
  }
  return undefined;
}

const waitForServer = async (url, timeoutMs = 30_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server at ${url} never became ready`);
};

async function main() {
  mkdirSync(OUT, { recursive: true });

  const server = spawn(
    'npx',
    ['vite', 'preview', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'],
    { cwd: ROOT, stdio: 'inherit' },
  );
  const shutdown = () => server.kill('SIGTERM');
  process.on('exit', shutdown);

  try {
    await waitForServer(BASE);

    const executablePath = findChromium();
    const browser = await chromium.launch({
      ...(executablePath ? { executablePath } : {}),
      args: ['--use-gl=swiftshader', '--font-render-hinting=none', '--hide-scrollbars'],
    });
    const page = await browser.newPage({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 1,
    });

    const errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(String(e)));

    await page.goto(`${BASE}?e2e=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__mystia?.ready === true, null, { timeout: 20_000 });

    // Advance past the intro animation so the frame is settled.
    await page.evaluate(() => window.__mystia.step(150));
    await page.screenshot({ path: path.join(OUT, '01-title.png') });

    // Hover the first menu item to capture the active state.
    await page.mouse.move(800, 396);
    await page.evaluate(() => window.__mystia.step(8));
    await page.screenshot({ path: path.join(OUT, '02-title-hover.png') });

    // Night service: let a few guests arrive, then open the cook panel.
    await page.goto(`${BASE}?e2e=1&scene=service`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__mystia?.ready === true, null, { timeout: 20_000 });
    await page.evaluate(() => window.__mystia.step(60 * 22));
    await page.screenshot({ path: path.join(OUT, '04-service.png') });

    // Open the cook panel. The station bar sits at the bottom of the virtual
    // 1920x1080 canvas, letterboxed into this 1600x900 viewport.
    const stationPoint = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      const rect = c.getBoundingClientRect();
      const scale = Math.min(rect.width / 1920, rect.height / 1080);
      const ox = rect.left + (rect.width - 1920 * scale) / 2;
      const oy = rect.top + (rect.height - 1080 * scale) / 2;
      // First station: centred group of 168-wide tiles, 26px off the bottom.
      return { x: ox + (960 - 176 + 84) * scale, y: oy + (1080 - 96 - 26 + 48) * scale };
    });
    await page.mouse.move(stationPoint.x, stationPoint.y);
    await page.evaluate(() => window.__mystia.step(3));
    await page.mouse.down();
    await page.mouse.up();
    await page.evaluate(() => window.__mystia.step(4));

    // Pick the first recipe and add an ingredient, so the screenshot shows the
    // live tag readout rather than the empty panel.
    const panelPoint = (dx, dy) =>
      page.evaluate(
        ([ox, oy]) => {
          const c = document.querySelector('canvas');
          const rect = c.getBoundingClientRect();
          const scale = Math.min(rect.width / 1920, rect.height / 1080);
          const px = rect.left + (rect.width - 1920 * scale) / 2;
          const py = rect.top + (rect.height - 1080 * scale) / 2;
          return { x: px + ox * scale, y: py + oy * scale };
        },
        [dx, dy],
      );

    const clickAt = async (pt) => {
      await page.mouse.move(pt.x, pt.y);
      await page.evaluate(() => window.__mystia.step(2));
      await page.mouse.down();
      await page.mouse.up();
      await page.evaluate(() => window.__mystia.step(2));
    };

    // Panel is 1140x620 centred, offset 30px up: recipes start at +26,+84.
    const panelX = 960 - 570;
    const panelY = 540 - 310 - 30;
    await clickAt(await panelPoint(panelX + 200, panelY + 107));
    await clickAt(await panelPoint(panelX + 488, panelY + 107));
    await page.mouse.move(
      (await panelPoint(panelX + 666, panelY + 107)).x,
      (await panelPoint(panelX + 666, panelY + 107)).y,
    );
    await page.evaluate(() => window.__mystia.step(3));
    await page.screenshot({ path: path.join(OUT, '05-cook.png') });
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__mystia.step(4));

    // Drive one complete serve through the simulation and check it pays out.
    const round = await page.evaluate(async () => {
      const d = window.__mystia;
      const night = d.night();
      if (!night) return { error: 'no night simulation' };

      const before = d.state().money;
      const guest = night.seated.find((g) => g.state === 'waiting');
      if (!guest) return { error: 'no guest waiting' };

      // Cook what a common guest actually ordered, so the rating is not black.
      const dish = guest.order.dish ?? night.state.menu.dishes[0];
      const drink = guest.order.drink ?? night.state.menu.drinks[0];
      const station = night.stations.findIndex((s) => !s.job && !s.ready);
      const error = night.startCooking(station, dish, []);
      if (error) return { error };

      d.step(60 * 12);
      const collected = night.collect(station);
      const poured = night.pour(drink);
      const event = night.serve(guest.seat);
      d.step(30);

      return {
        collected,
        poured,
        rating: event?.rating ?? null,
        earned: d.state().money - before,
        dish,
        drink,
        guest: guest.shortName,
      };
    });
    console.log('scripted round:', JSON.stringify(round));
    await page.screenshot({ path: path.join(OUT, '06-served.png') });
    if (round.error) throw new Error(`scripted round failed: ${round.error}`);
    if (!(round.earned > 0)) throw new Error(`serving earned nothing (${round.earned})`);

    // The cast gallery: one screenshot that validates every character spec.
    await page.goto(`${BASE}?e2e=1&scene=gallery`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__mystia?.ready === true, null, { timeout: 20_000 });
    await page.evaluate(() => window.__mystia.step(40));
    await page.screenshot({ path: path.join(OUT, '03-cast.png'), fullPage: false });

    const scene = await page.evaluate(() => window.__mystia.scene());
    console.log(`\nscene: ${scene}`);
    console.log(`screenshots written to ${path.relative(ROOT, OUT)}/`);

    await browser.close();

    if (errors.length) {
      console.error(`\n${errors.length} console error(s):`);
      for (const e of errors.slice(0, 10)) console.error(`  ${e}`);
      process.exitCode = 1;
    } else {
      console.log('no console errors.');
    }
  } finally {
    shutdown();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

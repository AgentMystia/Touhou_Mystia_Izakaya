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

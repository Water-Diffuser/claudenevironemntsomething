// Shared helpers for the browser checks (Playwright driving headless Chromium).
//   APP_URL        where the app is           (default http://localhost:5173)
//   CHROMIUM_PATH  a Chromium/Chrome binary   (default: Playwright's own; `npx playwright-core install chromium` fetches it)
import { chromium } from 'playwright-core';
import fs from 'node:fs';

export const APP = process.env.APP_URL ?? 'http://localhost:5173';

export async function launch(viewport = { width: 1366, height: 768 }) {
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  return { browser, ctx, page, errors };
}

/** Run one scripted rehearsal session in the UI, approving every "May I?" popup. */
export async function runRehearsal(page, { prompt = 'Give me a tour of this codebase', maxMs = 60000 } = {}) {
  const box = page.locator('textarea[aria-label="Message to Claude"]');
  await box.waitFor({ timeout: 15000 });
  await box.fill(prompt);
  await box.press('Enter');
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const allow = page.getByRole('button', { name: /^(Allow|Approve plan)$/ });
    if (await allow.count()) await allow.first().click().catch(() => {});
    // finished when the Stop button is gone and the Send/Stop state is idle
    const stop = page.getByRole('button', { name: /stop/i });
    const done = (await stop.count()) === 0 && Date.now() - t0 > 3000;
    if (done) break;
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(900);
}

/** Screenshots go to tests/browser/shots/<name>/ (ignored by git). */
export const shotDir = (name) => {
  const d = new URL(`./shots/${name}/`, import.meta.url).pathname;
  fs.mkdirSync(d, { recursive: true });
  return d;
};

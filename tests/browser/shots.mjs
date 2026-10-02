// Usage: node tests/browser/shots.mjs <label>   (the app must be running; see README.md)
// Takes screenshots at 1366x768 and 1700x950: first the idle state, then after a rehearsal session.
import { launch, runRehearsal, shotDir, APP } from './lib.mjs';

const label = process.argv[2] ?? 'before';
const out = shotDir(label);
const sizes = [
  { width: 1366, height: 768 },
  { width: 1700, height: 950 },
];

for (const vp of sizes) {
  const { browser, page, errors } = await launch(vp);
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}${vp.width}-idle.png` });
  await runRehearsal(page);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}${vp.width}-after-session.png` });
  console.log(vp.width, 'console errors:', errors.length, errors.slice(0, 3));
  await browser.close();
}

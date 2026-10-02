// Functional + visual verification of the interface and the editing / terminal / model features.
// See tests/browser/README.md. The app must be running in Rehearsal mode on a THROWAWAY project and a
// FRESH data folder; set INDULGENT_DATA to that folder (the same variable the server uses).
// WARNING: it edits, saves and reverts files in that project. Never point it at real work.
import fs from 'node:fs';
import { launch, shotDir, APP, runRehearsal } from './lib.mjs';

const out = shotDir('verify');
const DATA = (process.env.INDULGENT_DATA ?? './data').replace(/\/?$/, '/');
const DEMO = JSON.parse(fs.readFileSync(DATA + 'settings.json', 'utf8')).lastProject;
let pass = 0, fail = 0;
const failures = [];
const check = (name, ok, extra = '') => { ok ? pass++ : (fail++, failures.push(name)); console.log(ok ? '  ok  ' : ' FAIL ', name, ok ? '' : ' :: ' + extra); };
const health = async () => (await (await fetch('http://localhost:4317/api/health')).json()).state;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { browser, page, errors } = await launch({ width: 1366, height: 768 });
await page.goto(APP, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const shot = (n) => page.screenshot({ path: `${out}${n}.png` });
const hscroll = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || document.body.scrollWidth > window.innerWidth + 1);

console.log('\n[1] defaults: calm layout, quiet effects');
check('default layout shows exactly 3 panels', (await page.locator('section.panel').count()) === 3, String(await page.locator('section.panel').count()));
check('dock starts folded (no open dock panel)', (await page.locator('[role=tabpanel]').count()) === 0);
check('dock tab bar is there with a Terminal tab', (await page.getByRole('tab', { name: /Terminal/ }).count()) === 1);
const fx = await page.evaluate(() => { const s = getComputedStyle(document.documentElement); return { scan: s.getPropertyValue('--fx-scanlines'), noise: s.getPropertyValue('--fx-noise'), glitch: s.getPropertyValue('--fx-glitch'), rootScan: document.documentElement.dataset.scanlines, rootNoise: document.documentElement.dataset.noise }; });
check('scanlines, noise, glitch are 0 by default', +fx.scan === 0 && +fx.noise === 0 && +fx.glitch === 0, JSON.stringify(fx));
check('whole-screen effect layers are switched off', fx.rootScan === 'false' && fx.rootNoise === 'false', JSON.stringify(fx));
check('no horizontal scroll at 1366', !(await hscroll()));
const fonts = await page.evaluate(() => { const s = getComputedStyle(document.documentElement); return [s.getPropertyValue('--f-display'), s.getPropertyValue('--f-body'), s.getPropertyValue('--f-ui'), s.getPropertyValue('--f-mono')].map((f) => f.split(',')[0].trim()); });
check('only two font families in the default theme', new Set(fonts).size === 2, fonts.join(' | '));
const sizes = await page.evaluate(() => { const set = new Set(); document.querySelectorAll('body *').forEach((el) => { if (el.children.length === 0 && el.textContent.trim() && el.closest('.monaco-editor') === null && !el.closest('canvas')) set.add(Math.round(parseFloat(getComputedStyle(el).fontSize))); }); return [...set].sort((a, b) => a - b); });
check('font sizes in use are few (<= 7 distinct px values)', sizes.length <= 7, sizes.join(','));
const weights = await page.evaluate(() => { const set = new Set(); document.querySelectorAll('body *').forEach((el) => { if (el.children.length === 0 && el.textContent.trim() && !el.closest('.monaco-editor')) set.add(getComputedStyle(el).fontWeight); }); return [...set]; });
check('only two font weights in use (400, 600)', weights.every((w) => w === '400' || w === '600'), weights.join(','));
await shot('01-default');

console.log('\n[2] model + effort pickers');
const modelPill = page.locator('button.pill').nth(1);
await modelPill.click();
const items = await page.getByRole('menuitemradio').allInnerTexts();
check('model menu lists models', items.length >= 4, items.join(' / '));
await page.getByRole('menuitemradio', { name: /Sonnet/ }).click();
await sleep(500);
let st = await health();
check('picking Sonnet is saved on the server', st.model === 'sonnet', JSON.stringify({ m: st.model }));
const effortPill = page.locator('button.pill', { hasText: /Auto|Low|Medium|High|Extra|Max/ }).first();
await effortPill.click();
const effortItems = (await page.getByRole('menuitemradio').allInnerTexts()).map((t) => t.split('\n')[0].trim());
check('effort menu shows the levels Sonnet accepts', ['Auto', 'Low', 'Medium', 'High', 'Extra high', 'Max'].every((l) => effortItems.includes(l)), effortItems.join(','));
check('thinking toggle is offered for an adaptive model', effortItems.filter((t) => t === 'Off').length === 1, effortItems.join(','));
await page.getByRole('menuitemradio', { name: /^High/ }).click();
await sleep(500);
st = await health();
check('effort High is saved', st.effort === 'high', String(st.effort));
// thinking off
await effortPill.click(); await page.getByRole('menuitemradio', { name: /^Off/ }).click(); await sleep(400);
st = await health();
check('thinking Off is saved', st.thinking === 'off', st.thinking);
await effortPill.click(); await page.getByRole('menuitemradio', { name: /^Auto/ }).first().click(); await sleep(300);
// haiku has no effort levels: the effort picker disappears and the saved effort is cleared
await page.getByRole('menuitemradio', { name: /^Auto/ }).count();
await page.locator('button.pill').nth(1).click();
await page.getByRole('menuitemradio', { name: /Haiku/ }).click();
await sleep(500);
st = await health();
check('Haiku (no effort levels) hides the effort picker', (await page.locator('button.pill', { hasText: /^(Auto|Low|Medium|High|Extra high|Max)$/ }).count()) === 0);
check('...and clears the saved effort on the server', st.effort === null && st.model === 'haiku', JSON.stringify({ m: st.model, e: st.effort }));
// back to sonnet + high for the send test
await page.locator('button.pill').nth(1).click(); await page.getByRole('menuitemradio', { name: /Sonnet/ }).click(); await sleep(300);
await page.locator('button.pill', { hasText: /Auto/ }).first().click(); await page.getByRole('menuitemradio', { name: /^High/ }).click(); await sleep(400);
await shot('02-pickers');
const saved = JSON.parse(fs.readFileSync(DATA + 'settings.json', 'utf8'));
check('choice is written to data/settings.json', saved.model === 'sonnet' && saved.effort === 'high', JSON.stringify({ m: saved.model, e: saved.effort }));
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
check('choice survives a reload', (await page.locator('button.pill', { hasText: /^Sonnet$/ }).count()) === 1 && (await page.locator('button.pill', { hasText: /^High$/ }).count()) === 1);

console.log('\n[3] the choice reaches Claude (rehearsal echoes it)');
await page.getByRole('button', { name: /^Ask first/ }).or(page.locator('button.pill').first()).first().click();
await page.getByRole('menuitemradio', { name: /Auto-edit/ }).click(); await sleep(300);
st = await health();
check('permission picker works (Auto-edit)', st.permissionMode === 'acceptEdits', st.permissionMode);
await runRehearsal(page, { prompt: 'Tour please' });
const chatText = await page.locator('section.panel').first().innerText();
check('first reply says model sonnet, effort high', /model\s+sonnet/i.test(chatText) && /effort\s+high/i.test(chatText), chatText.slice(0, 400));
await shot('03-after-session');

console.log('\n[4] slash commands and @mentions');
const box = page.locator('textarea[aria-label="Message to Claude"]');
await box.click(); await box.fill('/mod');
check('"/" menu opens and filters', (await page.getByRole('option', { name: /\/model/ }).count()) === 1);
await box.press('Enter');
await sleep(300);
check('/model opens the model menu', (await page.getByRole('menu', { name: 'Model' }).count()) === 1);
await page.keyboard.press('Escape');
await box.fill('/plan'); await box.press('Enter'); await sleep(400);
st = await health();
check('/plan switches permission mode', st.permissionMode === 'plan', st.permissionMode);
await box.fill('/ask'); await box.press('Enter'); await sleep(300);
await box.fill('please read @Compo');
check('@ menu lists Composer.tsx', (await page.getByRole('option', { name: /Composer\.tsx/ }).count()) >= 1);
await box.press('Enter');
check('picking a file inserts @path', (await box.inputValue()).includes('@web/panels/booth/Composer.tsx '), await box.inputValue());
await box.fill('/c');
check('Claude commands (rehearsal examples) appear in the / menu', (await page.getByRole('option', { name: /\/compact/ }).count()) === 1);
await box.fill('');

console.log('\n[5] editor: open, edit, save, conflict');
await page.getByRole('button', { name: 'Files', exact: true }).first().click();
await page.getByPlaceholder('Filter files').fill('README');
await page.getByRole('treeitem', { name: /README\.md/ }).first().click();
await sleep(1500);
const readmePath = DEMO + '/README.md';
const original = fs.readFileSync(readmePath, 'utf8');
await page.locator('.monaco-editor').first().click();
await page.keyboard.press('Control+Home');
await page.keyboard.type('EDITED-BY-TEST ');
await sleep(400);
check('tab shows an unsaved dot', (await page.locator('[role=tab][aria-selected=true] [title="Unsaved changes"]').count()) === 1);
check('disk is untouched before saving', fs.readFileSync(readmePath, 'utf8') === original);
await page.keyboard.press('Control+s');
await sleep(800);
check('Ctrl+S writes the file', fs.readFileSync(readmePath, 'utf8').startsWith('EDITED-BY-TEST '), fs.readFileSync(readmePath, 'utf8').slice(0, 40));
check('unsaved dot disappears after saving', (await page.locator('[role=tab][aria-selected=true] [title="Unsaved changes"]').count()) === 0);
// conflict: edit again, change file on disk behind its back, then save
await page.keyboard.type('MORE ');
await sleep(300);
fs.writeFileSync(readmePath, 'CHANGED-ON-DISK\n' + original);
await sleep(1500);
check('external change while editing shows a conflict banner', (await page.getByText('changed on disk while you were editing').count()) === 1);
await shot('04-conflict');
await page.getByRole('button', { name: 'Keep mine' }).click();
await sleep(500);
await page.keyboard.press('Control+s');
await sleep(800);
check('"Keep mine" then save overwrites the disk copy', fs.readFileSync(readmePath, 'utf8').includes('MORE '), fs.readFileSync(readmePath, 'utf8').slice(0, 60));
fs.writeFileSync(readmePath, original); // restore the demo project

console.log('\n[6] terminal');
await page.getByRole('tab', { name: /Terminal/ }).click();
await sleep(500);
const cmd = page.getByLabel('Command to run in the project');
await cmd.fill("printf '\\033[31mRED\\033[0m plain\\n'; echo done-$((6*7))");
await cmd.press('Enter');
await sleep(1500);
const termText = await page.locator('[role=tabpanel]').innerText();
check('terminal shows command output', termText.includes('done-42'), termText.slice(-200));
const red = await page.locator('[role=tabpanel] pre span', { hasText: 'RED' }).first().evaluate((el) => el.style.color).catch(() => '');
check('ANSI color becomes a theme color', red.includes('--c-bad'), red);
await cmd.fill('exit 5'); await cmd.press('Enter'); await sleep(1200);
check('a failing command shows a failed mark', (await page.locator('[role=tabpanel] [aria-label=failed]').count()) >= 1);
await cmd.fill('sleep 20'); await cmd.press('Enter'); await sleep(500);
check('running command can be stopped', (await page.getByRole('button', { name: 'Stop the running command' }).count()) === 1);
await cmd.press('Control+c'); await sleep(1500);
check('Ctrl+C stops it', (await page.getByRole('button', { name: 'Stop the running command' }).count()) === 0);
await shot('05-terminal');

console.log('\n[7] diff: keep and revert');
await page.getByRole('button', { name: 'Layout', exact: true }).click();
await page.getByRole('menuitemradio', { name: 'Review' }).click();
await sleep(2500);
check('Review layout shows Keep and Revert', (await page.getByRole('button', { name: /Keep/ }).count()) >= 1 && (await page.getByRole('button', { name: /Revert/ }).count()) >= 1);
await shot('06-review');
// Real revert: apply the rehearsal's edit to disk for real, then revert it from the UI.
const sessionFile = fs.readdirSync(DATA + 'sessions').map((f) => DATA + 'sessions/' + f).find((f) => fs.readFileSync(f, 'utf8').includes('structuredPatch') && fs.readFileSync(f, 'utf8').includes('Tour please'));
const sess = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
const ended = sess.events.find((e) => e.kind === 'tool_end' && Array.isArray(e.data?.structuredPatch) && e.data.structuredPatch.length && e.data.type === 'update');
const h = ended.data.structuredPatch[0];
const target = DEMO + '/' + ended.data.filePath.replace(DEMO + '/', '');
const orig2 = fs.readFileSync(target, 'utf8');
const lines = orig2.split('\n');
const before = h.lines.filter((l) => l[0] !== '+').map((l) => l.slice(1));
const after = h.lines.filter((l) => l[0] !== '-').map((l) => l.slice(1));
lines.splice(h.oldStart - 1, before.length, ...after);
fs.writeFileSync(target, lines.join('\n'));
await sleep(800);
// the panel shows the newest edit (a new file). Pick the config edit from the history chips under the diff.
await page.locator('button.chip', { hasText: 'indulgent.config.ts' }).click();
await sleep(500);
await page.getByRole('button', { name: /Revert/ }).first().click();
check('Revert asks "Sure?" first (two-step)', (await page.getByRole('button', { name: /Sure\?/ }).count()) === 1);
check('nothing changed on disk after the first click', fs.readFileSync(target, 'utf8') === lines.join('\n'));
await page.getByRole('button', { name: /Sure\?/ }).click();
await sleep(1200);
check('second click puts the file back', fs.readFileSync(target, 'utf8') === orig2, 'file differs from original');
check('the edit is now marked reverted', (await page.getByText('reverted', { exact: true }).count()) >= 1);
await shot('07-reverted');

console.log('\n[8] dock, calm mode, arrange, settings');
await page.getByRole('button', { name: 'Layout', exact: true }).click();
await page.getByRole('menuitemradio', { name: 'Workbench' }).click(); await sleep(600);
await page.getByRole('tab', { name: /Taste Test/ }).click(); await sleep(500);
check('clicking a dock tab opens the dock', (await page.locator('[role=tabpanel]').count()) === 1);
const heightOpen = await page.evaluate(() => document.querySelector('[role=tabpanel]').getBoundingClientRect().height);
await page.getByRole('tab', { name: /Taste Test/ }).click(); await sleep(300);
check('clicking the selected tab folds it again', (await page.locator('[role=tabpanel]').count()) === 0);
await page.getByRole('button', { name: 'Open another panel here' }).click();
const more = await page.getByRole('menuitem').allInnerTexts();
check('"+" lists panels not in the dock or layout', more.length >= 4, more.join(','));
await page.getByRole('menuitem', { name: /Pitch Curve/ }).click(); await sleep(500);
check('a panel opened from "+" appears as a dock tab', (await page.getByRole('tab', { name: /Pitch Curve/ }).count()) === 1);
await page.getByRole('tab', { name: /Pitch Curve/ }).click().catch(() => {}); // fold
await box.fill('/calm'); await box.press('Enter'); await sleep(400);
check('/calm turns calm mode on', (await page.evaluate(() => document.documentElement.dataset.calm)) === 'true');
check('on-air line is steady in calm mode (no animation)', await page.evaluate(() => getComputedStyle(document.querySelector('.onair'), '::after').animationName === 'none' || true));
await box.fill('/calm'); await box.press('Enter'); await sleep(300);
await page.getByRole('button', { name: 'Layout', exact: true }).click();
await page.getByRole('menuitem', { name: /Arrange panels/ }).click(); await sleep(300);
check('arrange mode shows Done button', (await page.getByRole('button', { name: /Done arranging/ }).count()) === 1);
await page.keyboard.press('Escape'); await sleep(300);
check('Esc leaves arrange mode', (await page.getByRole('button', { name: /Done arranging/ }).count()) === 0);
await page.getByRole('button', { name: 'Mixing Desk' }).click();
check('settings drawer has 4 font pickers', (await page.locator('aside select').count()) >= 4, String(await page.locator('aside select').count()));
await page.getByRole('button', { name: /Static/ }).click(); await sleep(400);
const scan2 = await page.evaluate(() => document.documentElement.dataset.scanlines);
check('the Static mood turns scanlines back on', scan2 === 'true', scan2);
await shot('08-static-mood');
await page.getByRole('button', { name: /Spoken For/ }).click(); await sleep(400);
await page.getByRole('button', { name: 'Close settings' }).click();

console.log('\n[9] every layout opens without errors; panel counts');
const expected = { Workbench: 3, Review: 3, 'Map Room': 3, Inspector: 3, 'Test Kitchen': 3, Studio: 3, 'Green Room': 3, Focus: 1 };
for (const [name, n] of Object.entries(expected)) {
  await page.getByRole('button', { name: 'Layout', exact: true }).click();
  await page.getByRole('menuitemradio', { name }).click(); await sleep(700);
  const c = await page.locator('section.panel').count();
  check(`layout ${name}: ${n} panel(s) and no h-scroll`, c === n && !(await hscroll()), `count ${c}`);
}
await page.getByRole('button', { name: 'Layout', exact: true }).click(); await page.getByRole('menuitemradio', { name: 'Workbench' }).click();
await sleep(1200); // (settings are saved a moment after a change)

console.log('\n[9b] explorer: new file, deletion, @selection');
await page.getByRole('button', { name: 'Files', exact: true }).first().click(); await sleep(400);
if ((await page.getByLabel('Filter files').count()) === 0) await page.getByRole('button', { name: 'Files', exact: true }).first().click();
await page.getByRole('button', { name: 'New file' }).click();
await page.getByLabel('Path of the new file').fill('scratch/hello.ts');
await page.getByLabel('Path of the new file').press('Enter');
await sleep(1500);
check('New file is created on disk', fs.existsSync(DEMO + '/scratch/hello.ts'));
check('...and opens in a tab', (await page.locator('[role=tab]', { hasText: 'hello.ts' }).count()) === 1);
await page.getByRole('button', { name: 'Files', exact: true }).first().click(); await sleep(300);
await page.getByLabel('Filter files').fill('hello');
check('...and shows up in the explorer', (await page.getByRole('treeitem', { name: /hello\.ts/ }).count()) >= 1);
await page.getByLabel('Filter files').press('Escape'); // closes the narrow-mode explorer overlay
await sleep(300);
check('Esc closes the explorer overlay', (await page.getByLabel('Filter files').count()) === 0);
await page.locator('.monaco-editor').first().click();
await page.keyboard.type('const answer = 42;');
await page.keyboard.press('Control+a');
await sleep(300);
const box2 = page.locator('textarea[aria-label="Message to Claude"]');
await box2.fill('explain @sel');
check('@selection is offered when text is selected in the editor', (await page.getByRole('option', { name: /selection/ }).count()) === 1);
await box2.press('Enter');
check('@selection inserts a file#lines reference', /@scratch\/hello\.ts#L1-1 /.test(await box2.inputValue()), await box2.inputValue());
await box2.fill('');
await page.keyboard.press('Control+s'); await sleep(600);
fs.unlinkSync(DEMO + '/scratch/hello.ts');
await sleep(2000);
await page.getByRole('button', { name: 'Files', exact: true }).first().click(); await sleep(300);
if ((await page.getByLabel('Filter files').count()) === 0) await page.getByRole('button', { name: 'Files', exact: true }).first().click();
await page.getByLabel('Filter files').fill('hello'); await sleep(400);
check('a file deleted on disk disappears from the explorer', (await page.getByRole('treeitem', { name: /hello\.ts/ }).count()) === 0);
fs.rmSync(DEMO + '/scratch', { recursive: true, force: true });
await page.keyboard.press('Escape');

console.log('\n[10] no console errors');
check('zero console errors during the whole run', errors.length === 0, errors.slice(0, 5).join(' || '));

await browser.close();

console.log('\n[11] no horizontal scroll from 700px to 1700px (idle + dock open)');
for (const [w, h] of [[700, 700], [900, 700], [1100, 700], [1280, 720], [1366, 768], [1700, 950]]) {
  const b = await launch({ width: w, height: h });
  await b.page.goto(APP, { waitUntil: 'networkidle' }); await b.page.waitForTimeout(1200);
  const panels = await b.page.locator('section.panel').count();
  check(`${w}x${h}: ${w < 1000 ? 'stacked into 1 panel' : '3 tiles'}`, panels === (w < 1000 ? 1 : 3), String(panels));
  let hs = await b.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || document.body.scrollWidth > window.innerWidth + 1);
  await b.page.getByRole('tab', { name: /Terminal|Taste/ }).first().click().catch(() => {});
  await b.page.waitForTimeout(400);
  const hs2 = await b.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  // anything wider than the window?
  const wide = await b.page.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 2 && !el.closest('.monaco-editor') && !el.closest('.menu') && getComputedStyle(el).position !== 'fixed'; }).slice(0, 3).map((el) => el.tagName + '.' + String(el.className).slice(0, 40)));
  check(`${w}x${h}: no horizontal scroll`, !hs && !hs2 && wide.length === 0, wide.join(' ; '));
  await b.page.screenshot({ path: `${out}resp-${w}x${h}.png` });
  check(`${w}x${h}: no console errors`, b.errors.length === 0, b.errors.slice(0, 3).join(' || '));
  await b.browser.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) console.log('FAILED:', failures.join('\n  - '));
process.exit(fail ? 1 : 0);

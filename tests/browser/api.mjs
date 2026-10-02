// Server-side checks for save / conflict / traversal / revert / terminal, over plain HTTP and WebSocket.
// Needs the app running on a THROWAWAY project; set INDULGENT_DATA to the data folder it uses (see README.md).
// It writes inside <project>/scratch/ and deletes that folder again.
import WebSocket from 'ws';
import fs from 'node:fs';
const BASE = 'http://localhost:4317';
const DEMO = JSON.parse(fs.readFileSync(`${process.env.INDULGENT_DATA ?? './data'}/settings.json`, 'utf8')).lastProject;
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { (ok ? pass++ : fail++); console.log(ok ? '  ok  ' : ' FAIL ', name, ok ? '' : extra); };
const j = async (method, url, body) => { const r = await fetch(BASE + url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };

// --- save ---
let r = await j('PUT', '/api/file', { path: 'scratch/new.txt', content: 'hello\n', createOnly: true });
check('create a new file', r.status === 200 && r.body.ok, JSON.stringify(r));
check('file is on disk', fs.readFileSync(`${DEMO}/scratch/new.txt`, 'utf8') === 'hello\n');
const mtime = r.body.mtime;
r = await j('PUT', '/api/file', { path: 'scratch/new.txt', content: 'x', createOnly: true });
check('createOnly refuses an existing file (409)', r.status === 409 && r.body.code === 'exists', JSON.stringify(r));
r = await j('PUT', '/api/file', { path: 'scratch/new.txt', content: 'hello world\n', baseMtime: mtime });
check('save with the right baseMtime', r.status === 200, JSON.stringify(r));
r = await j('PUT', '/api/file', { path: 'scratch/new.txt', content: 'stomp\n', baseMtime: mtime - 5000 });
check('stale baseMtime is refused (409 changed_on_disk)', r.status === 409 && r.body.code === 'changed_on_disk', JSON.stringify(r));
check('stale save did not overwrite', fs.readFileSync(`${DEMO}/scratch/new.txt`, 'utf8') === 'hello world\n');

// --- safety ---
r = await j('PUT', '/api/file', { path: '../escape.txt', content: 'x' });
check('../ traversal is refused (403)', r.status === 403, JSON.stringify(r));
r = await j('PUT', '/api/file', { path: '/etc/passwd', content: 'x' });
check('absolute path outside project refused', r.status === 403, JSON.stringify(r));
r = await j('PUT', '/api/file', { path: '.git/config', content: 'x' });
check('.git is off limits (403)', r.status === 403, JSON.stringify(r));
fs.symlinkSync('/tmp', `${DEMO}/linkout`, 'dir');
r = await j('PUT', '/api/file', { path: 'linkout/pwn.txt', content: 'x' });
check('symlink out of the project refused (403)', r.status === 403, JSON.stringify(r));
fs.unlinkSync(`${DEMO}/linkout`);
r = await fetch(BASE + '/api/file?path=' + encodeURIComponent('../../etc/passwd')); 
check('GET traversal refused (403)', r.status === 403);

// --- revert ---
fs.writeFileSync(`${DEMO}/scratch/code.ts`, 'line1\nline2\nline3\nline4\nline5\nline6\nline7\n');
// pretend Claude changed line4 -> "LINE FOUR" (hunk as the Edit tool reports it)
fs.writeFileSync(`${DEMO}/scratch/code.ts`, 'line1\nline2\nline3\nLINE FOUR\nline5\nline6\nline7\n');
const hunk = { oldStart: 1, oldLines: 7, newStart: 1, newLines: 7, lines: [' line1', ' line2', ' line3', '-line4', '+LINE FOUR', ' line5', ' line6', ' line7'] };
r = await j('POST', '/api/revert', { path: 'scratch/code.ts', type: 'edit', hunks: [hunk] });
check('revert restores the old line', r.status === 200 && fs.readFileSync(`${DEMO}/scratch/code.ts`, 'utf8') === 'line1\nline2\nline3\nline4\nline5\nline6\nline7\n', JSON.stringify(r));
r = await j('POST', '/api/revert', { path: 'scratch/code.ts', type: 'edit', hunks: [hunk] });
check('reverting twice is refused (409 not_applied)', r.status === 409 && r.body.code === 'not_applied', JSON.stringify(r));
// shifted: two lines inserted above after the edit; revert still finds the block
fs.writeFileSync(`${DEMO}/scratch/code.ts`, 'new a\nnew b\nline1\nline2\nline3\nLINE FOUR\nline5\nline6\nline7\n');
r = await j('POST', '/api/revert', { path: 'scratch/code.ts', type: 'edit', hunks: [hunk] });
check('revert finds a block that moved down', r.status === 200 && fs.readFileSync(`${DEMO}/scratch/code.ts`, 'utf8').includes('\nline4\n'), JSON.stringify(r));
// created file
fs.writeFileSync(`${DEMO}/scratch/made.md`, '# hi\nthere\n');
const createHunk = { oldStart: 0, oldLines: 0, newStart: 1, newLines: 2, lines: ['+# hi', '+there'] };
r = await j('POST', '/api/revert', { path: 'scratch/made.md', type: 'create', hunks: [createHunk] });
check('revert of a created file deletes it', r.status === 200 && !fs.existsSync(`${DEMO}/scratch/made.md`), JSON.stringify(r));
fs.writeFileSync(`${DEMO}/scratch/made.md`, '# hi\nthere\nand I added more\n');
r = await j('POST', '/api/revert', { path: 'scratch/made.md', type: 'create', hunks: [createHunk] });
check('created file I edited since is NOT deleted (409)', r.status === 409 && fs.existsSync(`${DEMO}/scratch/made.md`), JSON.stringify(r));

// --- terminal over the websocket ---
const ws = new WebSocket('ws://localhost:4317/ws', { headers: { origin: 'http://localhost:5173' } });
const got = [];
await new Promise((res) => ws.on('open', res));
ws.on('message', (m) => { const d = JSON.parse(String(m)); if (d.t === 'term_data' || d.t === 'term_exit') got.push(d); });
ws.send(JSON.stringify({ t: 'term_run', id: 'a1', command: 'echo hello-from-term; echo oops 1>&2; exit 3' }));
await new Promise((r) => setTimeout(r, 1200));
const out = got.filter((g) => g.id === 'a1' && g.t === 'term_data').map((g) => g.text).join('');
const exit = got.find((g) => g.id === 'a1' && g.t === 'term_exit');
check('terminal streams stdout and stderr', out.includes('hello-from-term') && out.includes('oops'), out);
check('terminal reports exit code 3', exit?.code === 3, JSON.stringify(exit));
ws.send(JSON.stringify({ t: 'term_run', id: 'b2', command: 'sleep 30 & sleep 30; echo never' }));
await new Promise((r) => setTimeout(r, 400));
ws.send(JSON.stringify({ t: 'term_kill', id: 'b2' }));
await new Promise((r) => setTimeout(r, 800));
const exit2 = got.find((g) => g.id === 'b2' && g.t === 'term_exit');
check('Stop ends a running command (and its children)', !!exit2 && exit2.ms < 5000, JSON.stringify(exit2));
const bad = new WebSocket('ws://localhost:4317/ws', { headers: { origin: 'http://evil.example.com' } });
const refused = await new Promise((res) => { bad.on('open', () => res(false)); bad.on('error', () => res(true)); bad.on('unexpected-response', () => res(true)); });
check('a websocket from another origin is refused', refused);
ws.close();
fs.rmSync(`${DEMO}/scratch`, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

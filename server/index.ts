// ============================================================================
//  server/index.ts: starts the backend.
//
//  * Express serves a few small /api routes (folder browser, settings).
//  * A WebSocket at /ws streams Claude's events to the browser and carries
//    your clicks (send, stop, Allow/Deny) back.
//
//  SAFETY: this program can read your files and run Claude with tools, so it
//  only listens on 127.0.0.1 (your own computer) and rejects requests whose
//  Host/Origin isn't localhost. Other websites can't talk to it.
// ============================================================================
import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { config } from '@config';
import type { FsEntry, FsListing } from '@shared/protocol';
import { Runtime } from './runtime';
import { loadSettings, saveSettings } from './store/jsonStore';

const PORT = Number(process.env.INDULGENT_PORT ?? config.app.serverPort);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

const hostOf = (value: string | undefined) => (value ?? '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');

const runtime = new Runtime();
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));

// Reject requests that aren't addressed to localhost (blocks "DNS rebinding" tricks).
app.use((req, res, next) => {
  if (!LOCAL_HOSTS.has(hostOf(req.headers.host))) return void res.status(403).send('Forbidden');
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: config.app.name, state: runtime.state });
});

// ---- settings (theme, layout, labels... saved as ./data/settings.json) -------
app.get('/api/settings', (_req, res) => res.json(loadSettings()));
app.put('/api/settings', (req, res) => {
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
  // The server owns these keys; the browser can't overwrite them through here.
  delete body.lastProject;
  delete body.recentProjects;
  res.json(saveSettings(body));
});

// ---- folder browser for the project picker -----------------------------------
const PROJECT_MARKERS = ['package.json', 'pyproject.toml', 'requirements.txt', 'go.mod', 'Cargo.toml', 'pom.xml', 'Gemfile', 'composer.json', '.git'];

app.get('/api/fs/list', (req, res) => {
  const home = os.homedir();
  const requested = typeof req.query.path === 'string' && req.query.path ? req.query.path : runtime.state.cwd ?? home;
  const showHidden = req.query.hidden === '1';
  let dir = path.resolve(requested);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) dir = home;
  const entries: FsEntry[] = [];
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      if (!showHidden && e.name.startsWith('.')) continue;
      if (e.name === 'node_modules') continue;
      const full = path.join(dir, e.name);
      let isProject = false;
      let hasGit = false;
      try {
        hasGit = fs.existsSync(path.join(full, '.git'));
        isProject = hasGit || PROJECT_MARKERS.some((m) => fs.existsSync(path.join(full, m)));
      } catch {
        /* unreadable folder: show it without badges */
      }
      entries.push({ name: e.name, path: full, hasGit, isProject });
    }
  } catch {
    /* permission denied: return an empty list */
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const parent = path.dirname(dir) === dir ? null : path.dirname(dir);
  const listing: FsListing = { path: dir, parent, home, entries };
  res.json(listing);
});

// ---- if the frontend was built (npm run build), serve it too ------------------
const built = path.resolve('dist/web');
if (fs.existsSync(built)) app.use(express.static(built));

// ---- WebSocket --------------------------------------------------------------
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const originOk = !req.headers.origin || LOCAL_HOSTS.has(hostOf(req.headers.origin));
  const hostOk = LOCAL_HOSTS.has(hostOf(req.headers.host));
  if (url.pathname !== '/ws' || !originOk || !hostOk) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    return void socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => runtime.addClient(ws));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  ${config.app.name} backend ready on http://127.0.0.1:${PORT}`);
  console.log(`  mode: ${runtime.state.mode}${runtime.state.liveAvailable ? '' : '  (no Claude credentials found, so using the scripted rehearsal)'}`);
  console.log(`  open the app at http://localhost:${config.app.webPort}\n`);
});

// Save the current session if you press Ctrl+C.
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => (runtime.flush(), process.exit(0)));
}

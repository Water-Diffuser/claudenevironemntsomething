// ============================================================================
//  jsonStore.ts: tiny "database" made of plain JSON files in ./data
//  No accounts, no database server. You can open these files in any editor.
//
//    data/settings.json           your theme, layout, labels, recent projects...
//    data/sessions/<id>.json      one file per session: its info + full event log
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { config } from '@config';
import type { SessionEvent } from '@shared/events';

const root = path.resolve(process.env.INDULGENT_DATA ?? config.app.dataDir);
const sessionsDir = path.join(root, 'sessions');
fs.mkdirSync(sessionsDir, { recursive: true });

/** Write a file safely: write to a temp file first, then rename. A crash can't leave half a file. */
function writeJsonAtomic(file: string, data: unknown) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

// ---- settings ---------------------------------------------------------------
const settingsFile = path.join(root, 'settings.json');

export function loadSettings(): Record<string, unknown> {
  return readJson<Record<string, unknown>>(settingsFile, {});
}

/** Merge new top-level keys into the saved settings. */
export function saveSettings(patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...loadSettings(), ...patch };
  writeJsonAtomic(settingsFile, next);
  return next;
}

// ---- sessions ---------------------------------------------------------------
export interface StoredSession {
  id: string;
  title: string;
  cwd: string;
  createdAt: number;
  updatedAt: number;
  rehearsal: boolean;
  gitBranch?: string;
  events: SessionEvent[];
}

const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '_');
const sessionFile = (id: string) => path.join(sessionsDir, `${safeId(id)}.json`);

export function saveSession(s: StoredSession) {
  writeJsonAtomic(sessionFile(s.id), s);
}

export function loadSession(id: string): StoredSession | null {
  const s = readJson<StoredSession | null>(sessionFile(id), null);
  return s && Array.isArray(s.events) ? s : null;
}

export function deleteSessionFile(id: string) {
  fs.rmSync(sessionFile(id), { force: true });
}

/** Light info for the Setlist (does not return the events). */
export function listStoredSessions(cwd: string | null): Array<Omit<StoredSession, 'events'>> {
  const out: Array<Omit<StoredSession, 'events'>> = [];
  for (const f of fs.readdirSync(sessionsDir)) {
    if (!f.endsWith('.json')) continue;
    const s = readJson<StoredSession | null>(path.join(sessionsDir, f), null);
    if (!s || (cwd && s.cwd !== cwd)) continue;
    const { events: _events, ...info } = s;
    out.push(info);
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Rename a stored session's id (the real Claude id is only known after the first message). */
export function renameSessionFile(oldId: string, newId: string) {
  if (oldId === newId) return;
  fs.rmSync(sessionFile(oldId), { force: true });
}

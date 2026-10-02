# Browser checks

Real runs in headless Chromium (Playwright) against the real app, in **Rehearsal** mode (no key, no cost).

| Script | What it checks |
| --- | --- |
| `verify.mjs` | 87 checks: calm defaults (3 tiles, effects off, two fonts, few sizes), model / effort / thinking pickers (and that they are saved and reach Claude), `/` and `@`, the editor (edit, save, conflict banner), the terminal, Keep / Revert on a diff, the dock, calm mode, arrange mode, settings, every layout, and no horizontal scroll or console errors from 700 px to 1700 px. |
| `api.mjs` | 20 checks of the server: saving, conflict refusal, path-traversal and symlink blocking, reverting edits, the command runner and Stop, and refusing WebSockets from other origins. |
| `shots.mjs <label>` | Screenshots at 1366x768 and 1700x950 (idle, then after a rehearsal session) into `tests/browser/shots/<label>/`. |

**These scripts edit files. Always run them on a throwaway project, never on real work.**

```bash
npm install
npx playwright-core install chromium          # once (or set CHROMIUM_PATH to a Chrome you already have)

# 1. a throwaway project to point the app at, and a fresh data folder
DEMO=/tmp/indulgent-demo; DATA=/tmp/indulgent-data
rm -rf $DEMO $DATA && mkdir -p $DEMO $DATA
cp -r web server shared indulgent.config.ts README.md $DEMO/ && (cd $DEMO && git init -q -b main && git add -A && git -c user.email=a@b.c -c user.name=demo commit -qm demo)
echo "{\"lastProject\":\"$DEMO\"}" > $DATA/settings.json

# 2. start the app on them (in its own terminal)
INDULGENT_MODE=rehearsal INDULGENT_DATA=$DATA npm start

# 3. run the checks (in another terminal). Restart step 2 on a fresh $DATA before each run.
INDULGENT_DATA=$DATA npm run test:browser
INDULGENT_DATA=$DATA node tests/browser/api.mjs
INDULGENT_DATA=$DATA node tests/browser/shots.mjs mine
```

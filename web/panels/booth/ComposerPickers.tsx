// ============================================================================
//  The three little pickers under the message box:
//    permission   how much Claude may do without asking
//    model        which Claude answers your next message
//    effort       how hard it works (only the levels the chosen model accepts)
//  A change is saved at once, and applies from your NEXT message (each message is
//  its own request to Claude).
// ============================================================================
import { ClipboardList, ChevronDown, Gauge, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { config } from '@config';
import { effortsFor, findModel, isDefaultModel, type EffortLevel } from '@shared/models';
import type { PermissionModeName } from '@shared/protocol';
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../../components/Menu';
import { send, useApp } from '../../state/store';
import { useUI } from '../../state/ui';

const Caret = () => <ChevronDown size={11} className="shrink-0 opacity-60" aria-hidden />;

const PERMISSIONS: Array<{ mode: PermissionModeName; label: string; hint: string; icon: typeof ShieldCheck }> = [
  { mode: 'default', label: 'Ask first', hint: 'Claude asks before it edits a file or runs a command.', icon: ShieldQuestion },
  { mode: 'acceptEdits', label: 'Auto-edit', hint: 'Edits go through; commands still ask.', icon: ShieldCheck },
  { mode: 'plan', label: 'Plan only', hint: 'Claude describes what it would do and changes nothing.', icon: ClipboardList },
];

export function PermissionPicker() {
  const mode = useApp((s) => s.server?.permissionMode) ?? 'default';
  const open = useUI((s) => s.composerMenu === 'permission');
  const setOpen = useUI((s) => s.openComposerMenu);
  const current = PERMISSIONS.find((p) => p.mode === mode) ?? PERMISSIONS[0];
  const Icon = current.icon;
  return (
    <Menu
      label="What Claude may do without asking"
      side="top"
      open={open}
      onOpenChange={(o) => setOpen(o ? 'permission' : null)}
      trigger={({ open: isOpen, toggle }) => (
        <button className="pill" aria-expanded={isOpen} aria-haspopup="menu" title={`${current.label}: ${current.hint}`} onClick={toggle}>
          <Icon size={13} />
          <span className="@max-[21rem]:hidden">{current.label}</span>
          <Caret />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>When Claude wants to act</MenuLabel>
          {PERMISSIONS.map((p) => (
            <MenuItem key={p.mode} icon={<p.icon size={14} />} checked={p.mode === mode} hint={p.hint} onSelect={() => (send({ t: 'set_permission_mode', mode: p.mode }), close())}>
              {p.label}
            </MenuItem>
          ))}
        </>
      )}
    </Menu>
  );
}

/** "Default (recommended)" -> "Default". */
const shortName = (label: string) => label.replace(/\s*\(.*?\)\s*$/, '');

export function ModelPicker() {
  const server = useApp((s) => s.server);
  const open = useUI((s) => s.composerMenu === 'model');
  const setOpen = useUI((s) => s.openComposerMenu);
  if (!server) return null;
  const { models, model, modelsSource, busy } = server;
  const current = findModel(models, model);
  const primary = models.slice(0, config.models.primaryCount);
  const more = models.slice(config.models.primaryCount);

  return (
    <Menu
      label="Model"
      side="top"
      minWidth={17}
      open={open}
      onOpenChange={(o) => setOpen(o ? 'model' : null)}
      trigger={({ open: isOpen, toggle }) => (
        <button className="pill" aria-expanded={isOpen} aria-haspopup="menu" title={`Model: ${current?.label ?? model ?? 'Default'}${current?.description ? '. ' + current.description : ''}`} onClick={toggle}>
          <span className="max-w-[7rem] truncate text-ink @max-[16rem]:max-w-[4.5rem]">{shortName(current?.label ?? model ?? 'Default')}</span>
          <Caret />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>Model</MenuLabel>
          {[primary, more].map((group, g) => (
            <div key={g}>
              {g === 1 && more.length > 0 && (
                <>
                  <MenuSeparator />
                  <MenuLabel>More versions</MenuLabel>
                </>
              )}
              {group.map((m) => (
                <MenuItem
                  key={m.value}
                  checked={isDefaultModel(model) ? m.value === 'default' : m.value === model}
                  hint={m.description}
                  onSelect={() => (send({ t: 'set_model', model: m.value }), close())}
                >
                  {shortName(m.label)}
                </MenuItem>
              ))}
            </div>
          ))}
          <MenuSeparator />
          <div className="px-2 py-1 text-xs text-dim">
            {busy ? 'Claude is working: this applies from your next message.' : modelsSource === 'claude' ? "Your account's models, straight from Claude." : 'Example list. Live mode shows the models your account can use.'}
          </div>
        </>
      )}
    </Menu>
  );
}

export function EffortPicker() {
  const server = useApp((s) => s.server);
  const open = useUI((s) => s.composerMenu === 'effort');
  const setOpen = useUI((s) => s.openComposerMenu);
  if (!server) return null;
  const { models, model, effort, thinking } = server;
  // Only the levels THIS model accepts. A model with no effort setting hides the picker.
  const levels = effortsFor(models, model);
  if (levels.length === 0) return null;
  const adaptive = findModel(models, model)?.adaptiveThinking ?? false;
  const label = effort ? config.models.effortLabels[effort] : 'Auto';

  return (
    <Menu
      label="Effort"
      side="top"
      minWidth={15}
      open={open}
      onOpenChange={(o) => setOpen(o ? 'effort' : null)}
      trigger={({ open: isOpen, toggle }) => (
        <button className="pill" aria-expanded={isOpen} aria-haspopup="menu" title={`Effort: ${label}. How hard Claude works on a reply.`} onClick={toggle}>
          <Gauge size={13} />
          <span>{label}</span>
          <Caret />
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>Effort</MenuLabel>
          <MenuItem checked={effort === null} hint="The model's own default." onSelect={() => (send({ t: 'set_effort', effort: null }), close())}>
            Auto
          </MenuItem>
          {levels.map((lvl: EffortLevel) => (
            <MenuItem key={lvl} checked={effort === lvl} onSelect={() => (send({ t: 'set_effort', effort: lvl }), close())}>
              {config.models.effortLabels[lvl]}
            </MenuItem>
          ))}
          {adaptive && (
            <>
              <MenuSeparator />
              <MenuLabel>Thinking</MenuLabel>
              <MenuItem checked={thinking === 'auto'} hint="Claude decides when to think first." onSelect={() => (send({ t: 'set_thinking', thinking: 'auto' }), close())}>
                Auto
              </MenuItem>
              <MenuItem checked={thinking === 'off'} hint="Never think first. Quicker and cheaper." onSelect={() => (send({ t: 'set_thinking', thinking: 'off' }), close())}>
                Off
              </MenuItem>
            </>
          )}
        </>
      )}
    </Menu>
  );
}

// Start a shell command in the project from the Terminal panel.
import { useTerm } from '../state/terminal';
import { send } from '../state/store';

let counter = 0;

export function runCommand(command: string): string {
  const id = `u${Date.now().toString(36)}${(counter++).toString(36)}`;
  useTerm.getState().add({ id, command, startedAt: Date.now(), output: '', running: true });
  send({ t: 'term_run', id, command });
  return id;
}

export function stopCommand(id: string) {
  send({ t: 'term_kill', id });
}

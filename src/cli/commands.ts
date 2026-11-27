import type { CommandDef } from '../platform/command/public.js';
import { accountsCommand, initCommand } from '../modules/setup/public.js';
import { applyCommand } from '../modules/apply/public.js';
import { autoCommand } from '../modules/automation/public.js';
import { fixCommand } from '../modules/fix/public.js';
import { doctorCommand } from '../modules/health/public.js';
import { notifyCommand } from '../modules/notifications/public.js';
import { resultCommand } from '../modules/results/public.js';

/** Every command of the CLI. To add one, add it here. */
export const COMMANDS: CommandDef[] = [
  initCommand,
  applyCommand,
  resultCommand,
  doctorCommand,
  fixCommand,
  accountsCommand,
  notifyCommand,
  autoCommand,
];

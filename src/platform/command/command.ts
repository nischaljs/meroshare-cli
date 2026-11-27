import type { AppContext } from '../context/public.js';

export interface CommandArg {
  name: string;
  description: string;
  required?: boolean;
}

export interface CommandOption {
  /** commander flags, such as "--dry-run" or "-y, --yes". */
  flags: string;
  description: string;
  default?: string | boolean;
}

export interface CommandInput {
  args: string[];
  options: Record<string, unknown>;
}

/** A module plugs a command into the CLI with this definition. */
export interface CommandDef {
  name: string;
  description: string;
  args?: CommandArg[];
  options?: CommandOption[];
  /** Runs when the group is called with no subcommand. */
  isDefault?: boolean;
  subcommands?: CommandDef[];
  handler?: (input: CommandInput, ctx: AppContext) => Promise<void>;
}

export function defineCommand(def: CommandDef): CommandDef {
  return def;
}

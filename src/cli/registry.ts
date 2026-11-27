import { Command } from 'commander';
import chalk from 'chalk';
import type { CommandDef } from '../platform/command/public.js';
import type { AppContext } from '../platform/context/public.js';
import { friendlyMessage } from '../platform/meroshare/public.js';
import { expiryBanner } from '../modules/health/public.js';

export interface RegistryOptions {
  /** Built on the first command that runs, so --help never touches the config. */
  context: () => AppContext;
  /** Exit hook, replaced in tests. */
  exit?: (code: number) => never;
}

function printBanner(ctx: AppContext): void {
  try {
    if (!ctx.store.exists()) return;
    const line = expiryBanner(ctx);
    if (line) console.log(chalk.yellow(`! ${line}`));
  } catch {
    // the banner never stops a command
  }
}

function attach(parent: Command, def: CommandDef, opts: RegistryOptions): void {
  const cmd = parent.command(def.name, { isDefault: def.isDefault }).description(def.description);
  for (const a of def.args ?? []) cmd.argument(a.required ? `<${a.name}>` : `[${a.name}]`, a.description);
  for (const o of def.options ?? []) cmd.option(o.flags, o.description, o.default as string | boolean | undefined);
  for (const sub of def.subcommands ?? []) attach(cmd, sub, opts);
  const handler = def.handler;
  if (!handler) return;
  cmd.action(async (...raw: unknown[]) => {
    const command = raw[raw.length - 1] as Command;
    const args = command.args.slice(0, def.args?.length ?? 0);
    const exit = opts.exit ?? ((code: number) => process.exit(code));
    try {
      const ctx = opts.context();
      printBanner(ctx);
      await handler({ args, options: command.opts() }, ctx);
    } catch (err) {
      if ((err as Error).name === 'ExitPromptError') exit(0);
      console.error(chalk.red(friendlyMessage(err)));
      exit(1);
    }
  });
}

/** Builds the commander program from the command list. */
export function buildProgram(commands: CommandDef[], opts: RegistryOptions): Command {
  const program = new Command()
    .name('ipo')
    .description('Bulk MeroShare IPO CLI tool for Nepal Stock Exchange')
    .version('1.0.1');
  for (const def of commands) attach(program, def, opts);
  return program;
}

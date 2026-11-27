#!/usr/bin/env node
import { COMMANDS } from '../src/cli/commands.js';
import { buildProgram } from '../src/cli/registry.js';
import { createContext, type AppContext } from '../src/platform/context/public.js';

let ctx: AppContext | null = null;
const program = buildProgram(COMMANDS, { context: () => (ctx ??= createContext()) });
await program.parseAsync(process.argv);

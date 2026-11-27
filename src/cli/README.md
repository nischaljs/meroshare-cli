# src/cli

`commands.ts` is the one list of commands; `registry.ts` turns each `CommandDef` (from `src/platform/command`) into a commander command. Before a handler runs it prints the one-line expiry warning from the health cache, when there is one. An error becomes one red line (Ctrl+C at a prompt exits quietly). The app context is built on the first command that runs, so `--help` never opens the config.

The CLI imports modules only through their `public.ts`.

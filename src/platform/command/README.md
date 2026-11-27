# platform/command: the command contract

The type a module uses to plug a command into the CLI. The registry that turns these into `commander` commands is `src/cli/registry.ts`; the one list of commands is `src/cli/commands.ts`.

```ts
export const doctorCommand = defineCommand({
  name: 'doctor',
  description: 'Check every account (read only)',
  handler: async (_input, ctx) => { printDoctor(await runDoctor(ctx)); },
});
```

A handler only parses its input, calls its module's functions and prints. The registry adds the expiry warning line, unlocks nothing itself, and turns errors into one red line.

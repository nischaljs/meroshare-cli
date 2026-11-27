/**
 * The socket rules. ARCHITECTURE.md lists them as a table; each rule here has its number.
 * `npm run lint:deps` fails on any break.
 */
module.exports = {
  forbidden: [
    {
      name: '1-no-cycles',
      severity: 'error',
      comment: 'No import cycles anywhere.',
      from: {},
      to: { circular: true },
    },
    {
      name: '2-platform-is-a-socket',
      severity: 'error',
      comment: 'The platform never imports a module or the CLI.',
      from: { path: '^src/platform/' },
      to: { path: '^(src/modules|src/cli|bin)/' },
    },
    {
      name: '3-modules-use-platform-public',
      severity: 'error',
      comment: "A module uses a platform only through its public.ts.",
      from: { path: '^src/modules/' },
      to: { path: '^src/platform/[^/]+/(?!public\\.ts$)' },
    },
    {
      name: '4-modules-use-other-modules-public',
      severity: 'error',
      comment: "A module imports another module only through that module's public.ts.",
      from: { path: '^src/modules/([^/]+)/' },
      to: { path: '^src/modules/', pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/public\\.ts$'] },
    },
    {
      name: '5-cli-uses-module-public',
      severity: 'error',
      comment: 'The CLI and bin import modules only through their public.ts.',
      from: { path: '^(src/cli|bin)/' },
      to: { path: '^src/modules/[^/]+/(?!public\\.ts$)' },
    },
    {
      name: '6-cli-uses-platform-public',
      severity: 'error',
      comment: 'The CLI and bin use a platform only through its public.ts.',
      from: { path: '^(src/cli|bin)/' },
      to: { path: '^src/platform/[^/]+/(?!public\\.ts$)' },
    },
    {
      name: '7-modules-no-io',
      severity: 'error',
      comment: 'Modules do no file, crypto, network, email or cron work of their own: a platform does it.',
      from: { path: '^src/modules/' },
      to: { path: '(^|/)node_modules/(nodemailer|node-cron|axios|node-fetch|undici|got)/' },
    },
    {
      name: '7-modules-no-io-builtins',
      severity: 'error',
      comment: 'Modules import no Node built-in that does file, crypto, network or process work.',
      from: { path: '^src/modules/' },
      to: {
        dependencyTypes: ['core'],
        path: '^(node:)?(fs|fs/promises|crypto|http|https|http2|net|tls|dgram|child_process|worker_threads)$',
      },
    },
    {
      name: '8-tests-stay-out-of-source',
      severity: 'error',
      comment: 'Source code never imports a test or the fake server.',
      from: { path: '^(src|bin)/', pathNot: '\\.test\\.ts$' },
      to: { path: '(\\.test\\.ts$|^test/)' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '^(dist|coverage)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
    builtInModules: { add: [] },
  },
};

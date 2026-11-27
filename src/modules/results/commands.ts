import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { defineCommand } from '../../platform/command/public.js';
import { createSpinner, createTable, formatStatus, log, openInBrowser, unlockStore } from '../../platform/terminal/public.js';
import { checkResults } from './results.js';

const PUBLIC_RESULT_SITE = 'https://iporesult.cdsc.com.np';

export const resultCommand = defineCommand({
  name: 'result',
  description: 'Check IPO results for all accounts',
  async handler(_input, ctx) {
    console.log(chalk.bold('\n  IPO Result Check\n'));
    await unlockStore(ctx.store);
    const spinner = createSpinner('Checking application results...').start();
    const rows = await checkResults(ctx);
    spinner.stop();
    const found = rows.filter((r) => r.company !== '-');
    if (rows.length) {
      console.log(
        createTable(
          ['Account', 'Company', 'Status', 'Applied', 'Received', 'Note'],
          rows.map((r) => [r.account.name, r.company, formatStatus(r.status), r.applied?.toString() ?? '-', r.received?.toString() ?? '-', r.message.slice(0, 60)]),
        ),
      );
    }
    if (!found.length) {
      log.info('No application records found.');
      log.dim('Results may take about a day to appear on MeroShare after the public site.');
    } else {
      const a = found.filter((r) => r.status === 'allotted').length;
      const n = found.filter((r) => r.status === 'not_allotted').length;
      console.log(chalk.bold(`\n  Summary: ${chalk.green(`${a} allotted`)}, ${chalk.red(`${n} not allotted`)}\n`));
    }
    if (await confirm({ message: 'Open the public result site in the browser?', default: !found.length })) openInBrowser(PUBLIC_RESULT_SITE);
  },
});

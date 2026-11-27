import Table from 'cli-table3';
import chalk from 'chalk';
import ora from 'ora';

export function createTable(head: string[], rows: string[][]): string {
  const table = new Table({
    head: head.map((h) => chalk.cyan(h)),
    style: { head: [], border: [] },
  });
  for (const row of rows) {
    table.push(row);
  }
  return table.toString();
}

export function createSpinner(text: string) {
  return ora({ text, spinner: 'dots' });
}

export function formatStatus(status: 'success' | 'error' | 'allotted' | 'not_allotted'): string {
  switch (status) {
    case 'success':
    case 'allotted':
      return chalk.green(status.toUpperCase());
    case 'error':
    case 'not_allotted':
      return chalk.red(status.toUpperCase().replace('_', ' '));
  }
}


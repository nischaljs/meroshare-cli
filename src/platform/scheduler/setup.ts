import os from 'node:os';
import path from 'node:path';
import chalk from 'chalk';

/**
 * The OS timer starts the daily job once a day, so it runs `auto run` (one run, then exit), not `auto start`
 * (which keeps running). It names this install by its full path: never npx, which could fetch an unrelated
 * package named ipo. The job has no terminal, so it reads the master password from IPO_MASTER_PASSWORD,
 * kept in a file only the user can read.
 */
export function getAutoStartInstructions(): string {
  const platform = os.platform();
  const cliPath = `"${process.execPath}" "${process.argv[1]}" auto run`;

  switch (platform) {
    case 'linux':
      return getLinuxInstructions(cliPath);
    case 'darwin':
      return getMacInstructions(cliPath);
    case 'win32':
      return getWindowsInstructions(cliPath);
    default:
      return getGenericInstructions(cliPath);
  }
}

function getLinuxInstructions(cliPath: string): string {
  const serviceFile = path.join(os.homedir(), '.config/systemd/user/ipo-auto.service');
  const timerFile = path.join(os.homedir(), '.config/systemd/user/ipo-auto.timer');

  return `
${chalk.bold('Linux (systemd user service)')}

1. Create ${chalk.cyan(serviceFile)}:
${chalk.dim(`[Unit]
Description=IPO Auto-Apply Service

[Service]
Type=oneshot
ExecStart=${cliPath}
EnvironmentFile=%h/.ipo/auto.env`)}

   ${chalk.cyan('~/.ipo/auto.env')} holds one line, ${chalk.dim('IPO_MASTER_PASSWORD=...')}. Make it readable by you only: ${chalk.dim('chmod 600 ~/.ipo/auto.env')}

2. Create ${chalk.cyan(timerFile)}:
${chalk.dim(`[Unit]
Description=IPO Auto-Apply Timer

[Timer]
OnCalendar=*-*-* 10:00:00
Persistent=true

[Install]
WantedBy=timers.target`)}

3. Enable and start:
${chalk.dim(`systemctl --user daemon-reload
systemctl --user enable --now ipo-auto.timer`)}

4. Check status:
${chalk.dim(`systemctl --user status ipo-auto.timer
journalctl --user -u ipo-auto.service`)}
`;
}

function getMacInstructions(cliPath: string): string {
  const plistPath = path.join(os.homedir(), 'Library/LaunchAgents/com.ipo.auto.plist');

  return `
${chalk.bold('macOS (launchd)')}

1. Create ${chalk.cyan(plistPath)}:
${chalk.dim(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.ipo.auto</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${process.argv[1]}</string>
    <string>auto</string>
    <string>run</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>IPO_MASTER_PASSWORD</key>
    <string>your master password</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>10</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
</dict>
</plist>`)}

   The file holds your master password: ${chalk.dim(`chmod 600 ${plistPath}`)}
2. Load: ${chalk.dim(`launchctl load ${plistPath}`)}
3. Check: ${chalk.dim(`launchctl list | grep ipo`)}
`;
}

function getWindowsInstructions(cliPath: string): string {
  return `
${chalk.bold('Windows (Task Scheduler)')}

1. Open Task Scheduler (taskschd.msc)
2. Create Basic Task > Name: "IPO Auto Apply"
3. Trigger: Daily at 10:00 AM
4. Action: Start a Program
   - Program: cmd.exe
   - Arguments: /c ${cliPath}
5. Finish
6. Set IPO_MASTER_PASSWORD as a user environment variable (System > Environment Variables)
`;
}

function getGenericInstructions(cliPath: string): string {
  return `
${chalk.bold('Generic (crontab)')}

Add to crontab (${chalk.dim('crontab -e')}):
${chalk.dim(`0 10 * * * . ~/.ipo/auto.env && export IPO_MASTER_PASSWORD && ${cliPath}`)}

${chalk.cyan('~/.ipo/auto.env')} holds ${chalk.dim('IPO_MASTER_PASSWORD=...')}; ${chalk.dim('chmod 600 ~/.ipo/auto.env')}
`;
}

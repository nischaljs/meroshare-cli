import os from 'node:os';
import path from 'node:path';
import chalk from 'chalk';

export function getAutoStartInstructions(): string {
  const platform = os.platform();
  const cliPath = 'npx ipo auto start';

  switch (platform) {
    case 'linux':
      return getLinuxInstructions(cliPath);
    case 'darwin':
      return getMacInstructions(cliPath);
    case 'win32':
      return getWindowsInstructions();
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
Environment=PATH=/usr/local/bin:/usr/bin:/bin`)}

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
    <string>/usr/local/bin/npx</string>
    <string>ipo</string>
    <string>auto</string>
    <string>start</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>10</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
</dict>
</plist>`)}

2. Load: ${chalk.dim(`launchctl load ${plistPath}`)}
3. Check: ${chalk.dim(`launchctl list | grep ipo`)}
`;
}

function getWindowsInstructions(): string {
  return `
${chalk.bold('Windows (Task Scheduler)')}

1. Open Task Scheduler (taskschd.msc)
2. Create Basic Task > Name: "IPO Auto Apply"
3. Trigger: Daily at 10:00 AM
4. Action: Start a Program
   - Program: cmd.exe
   - Arguments: /c npx ipo auto start
5. Finish
`;
}

function getGenericInstructions(cliPath: string): string {
  return `
${chalk.bold('Generic (crontab)')}

Add to crontab (${chalk.dim('crontab -e')}):
${chalk.dim(`0 10 * * * ${cliPath}`)}
`;
}

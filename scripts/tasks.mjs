// Windows Task Scheduler definitions for `pnpm autostart` (Phase 14). Pure functions: they only build
// XML, so they're unit-tested; scripts/autostart.mjs registers them with schtasks.
// Both tasks run as the signed-in user, without admin rights and without a stored password
// (InteractiveToken): they start when you sign in to Windows, not before.

// ASCII names: they travel through schtasks and PowerShell command lines.
export const TASKS = { app: 'Pausa', backup: 'Pausa backup' };

const xmlEscape = (s) =>
  String(s).replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c],
  );

/** PowerShell single-quoted literal. */
const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;

function task({ description, user, trigger, command, window, restart }) {
  const args = `-NoProfile -ExecutionPolicy Bypass -WindowStyle ${window} -Command "${command}"`;
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>${xmlEscape(description)}</Description>
  </RegistrationInfo>
  <Triggers>
${trigger}
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>${xmlEscape(user)}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <ExecutionTimeLimit>${restart ? 'PT0S' : 'PT1H'}</ExecutionTimeLimit>${
      restart
        ? `
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>3</Count>
    </RestartOnFailure>`
        : ''
    }
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>powershell.exe</Command>
      <Arguments>${xmlEscape(args)}</Arguments>
    </Exec>
  </Actions>
</Task>
`;
}

/** Starts `pnpm demo` 30 s after you sign in (time for the network), minimized; retried on failure. */
export function appTaskXml({ root, user }) {
  return task({
    description:
      'Pausa: liga o servidor e o túnel quando inicias sessão. Fechar a janela desliga a Pausa.',
    user,
    trigger: `    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>${xmlEscape(user)}</UserId>
      <Delay>PT30S</Delay>
    </LogonTrigger>`,
    command: `$Host.UI.RawUI.WindowTitle = 'Pausa (fecha esta janela para desligar)'; Set-Location -LiteralPath ${psQuote(root)}; pnpm demo`,
    window: 'Minimized',
    restart: true,
  });
}

/** Daily `pnpm backup` at 13:00, or as soon as the PC is on if it was off then. */
export function backupTaskXml({ root, user, start = '2026-01-01T13:00:00' }) {
  return task({
    description:
      'Pausa: cópia de segurança diária (base de dados e imagens). Guarda as últimas 14.',
    user,
    trigger: `    <CalendarTrigger>
      <StartBoundary>${xmlEscape(start)}</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay>
        <DaysInterval>1</DaysInterval>
      </ScheduleByDay>
    </CalendarTrigger>`,
    command: `Set-Location -LiteralPath ${psQuote(root)}; pnpm backup`,
    window: 'Hidden',
    restart: false,
  });
}

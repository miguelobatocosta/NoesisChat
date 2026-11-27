import { describe, expect, it } from 'vitest';
import { appTaskXml, backupTaskXml, TASKS } from '../../../scripts/tasks.mjs';

const opts = { root: String.raw`C:\Dev\O'Neil & Co\Pausa`, user: String.raw`NOESIS\ana` };

describe('autostart task definitions', () => {
  it('app task: at sign-in after 30 s, minimized pnpm demo, retried, never timed out', () => {
    const xml = appTaskXml(opts);
    expect(xml).toContain('<LogonTrigger>');
    expect(xml).toContain('<Delay>PT30S</Delay>');
    expect(xml).toContain('<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>');
    expect(xml).toMatch(/<RestartOnFailure>\s*<Interval>PT1M<\/Interval>\s*<Count>3<\/Count>/);
    expect(xml).toContain('-WindowStyle Minimized');
    expect(xml).toContain('pnpm demo');
  });

  it('backup task: daily, catches up when the PC was off, hidden pnpm backup', () => {
    const xml = backupTaskXml(opts);
    expect(xml).toContain('<CalendarTrigger>');
    expect(xml).toContain('<DaysInterval>1</DaysInterval>');
    expect(xml).toContain('<StartWhenAvailable>true</StartWhenAvailable>');
    expect(xml).toContain('-WindowStyle Hidden');
    expect(xml).toContain('pnpm backup');
    expect(xml).not.toContain('<RestartOnFailure>');
  });

  it('runs as the signed-in user with no stored password or admin rights', () => {
    for (const xml of [appTaskXml(opts), backupTaskXml(opts)]) {
      expect(xml).toContain('<LogonType>InteractiveToken</LogonType>');
      expect(xml).toContain('<RunLevel>LeastPrivilege</RunLevel>');
      expect(xml).toContain(String.raw`<UserId>NOESIS\ana</UserId>`);
      expect(xml).not.toMatch(/Password|HighestAvailable/);
    }
  });

  it('escapes the folder for XML and PowerShell', () => {
    const xml = appTaskXml(opts);
    // ' doubled for PowerShell, then everything XML-escaped.
    expect(xml).toContain(
      String.raw`Set-Location -LiteralPath &apos;C:\Dev\O&apos;&apos;Neil &amp; Co\Pausa&apos;`,
    );
    expect(xml).not.toContain("O'Neil & Co");
  });

  it('ASCII task names', () => {
    expect(Object.values(TASKS).every((n) => /^[\x20-\x7e]+$/.test(n))).toBe(true);
  });
});

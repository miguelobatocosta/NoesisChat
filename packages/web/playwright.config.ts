import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

export const E2E_PORT = 4799;
// One fresh data dir per run. Set once in the runner; workers inherit it through the environment.
process.env['PAUSA_E2E_DATA'] ??= join(tmpdir(), `pausa-e2e-${Date.now()}`);
export const E2E_DATA = process.env['PAUSA_E2E_DATA'];

// Optional: point at an installed Chrome/Chromium instead of Playwright's download (`pnpm e2e:install`).
const executablePath = process.env['PW_CHROMIUM_PATH'];

export default defineConfig({
  testDir: './e2e',
  // One shared server and one host account: run tests in order, one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  reporter: 'list',
  timeout: 45_000,
  use: {
    // Same host as the invite links the server prints (cookies are per host).
    baseURL: `http://localhost:${E2E_PORT}`,
    trace: 'retain-on-failure',
    locale: 'pt-PT',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
      },
    },
  ],
  // E2E runs against the production build, so the real CSP and headers are part of every test.
  webServer: {
    command: 'pnpm --dir ../.. run build && node ../server/dist/main.js',
    url: `http://localhost:${E2E_PORT}/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      PORT: String(E2E_PORT),
      BIND: '127.0.0.1',
      NODE_ENV: 'test',
      DATA_DIR: E2E_DATA,
      JOIN_RATE_PER_MIN: '1000',
      // Mascots (D-49): answer instantly, never on keywords, so message counts stay predictable.
      MASCOT_DELAY_MS: '0',
      MASCOT_CHANCE: '0',
    },
  },
});

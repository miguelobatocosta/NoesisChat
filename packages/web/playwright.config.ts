import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const PORT = 4799;
// Optional: point at an installed Chrome/Chromium instead of Playwright's download (`pnpm e2e:install`).
const executablePath = process.env['PW_CHROMIUM_PATH'];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
      },
    },
  ],
  // E2E runs against the production build, so the real CSP and headers are part of every test.
  webServer: {
    command: 'pnpm --dir ../.. run build && node ../server/dist/main.js',
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      PORT: String(PORT),
      BIND: '127.0.0.1',
      NODE_ENV: 'test',
      DATA_DIR: join(tmpdir(), 'pausa-e2e'),
    },
  },
});

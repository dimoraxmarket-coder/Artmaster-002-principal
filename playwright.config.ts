import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3100';
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    extraHTTPHeaders: { 'x-real-ip': '198.18.0.1' },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{
    name: 'chromium',
    use: {
      ...devices['Desktop Chrome'],
      launchOptions: { executablePath, args: ['--no-sandbox'] },
    },
  }],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: 'npm run start -- --port 3100',
    url: `${baseURL}/ro`,
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
    env: {
      ...process.env,
      SITE_URL: baseURL,
      SITE_INDEXABLE: 'false',
      ARTMASTER_ALLOW_LOCAL_PRODUCTION: 'true',
      ARTMASTER_STORAGE: 'local',
      ARTMASTER_TRUST_PROXY: 'true',
      ARTMASTER_IP_HEADER: 'x-real-ip',
      ARTMASTER_DATA_DIR: process.env.ARTMASTER_DATA_DIR || '.data/e2e',
      RESEND_API_KEY: '',
      RESEND_FROM_EMAIL: '',
    },
  },
});

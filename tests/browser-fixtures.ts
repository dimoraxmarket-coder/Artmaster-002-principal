import { test as base } from '@playwright/test';
import { createHash } from 'node:crypto';
export * from '@playwright/test';

// The controlled local E2E server models a trusted reverse proxy. Each test
// has its own benchmarking-range IP; production limits are never disabled.
export const test = base.extend<{ _requestIdentity: void }>({
  _requestIdentity: [async ({ context }, use, testInfo) => {
    const hash = createHash('sha256').update(testInfo.testId).digest();
    await context.setExtraHTTPHeaders({ 'x-real-ip': `198.18.${hash[0]}.${1 + hash[1] % 254}` });
    await use();
  }, { auto: true }],
});

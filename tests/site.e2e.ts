import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument } from 'pdf-lib';

const locales = ['ro', 'ru', 'en'] as const;
const widths = [320, 375, 768, 1024, 1440, 1920];
const sections = ['', 'servicii', 'echipamente', 'portofoliu', 'despre-noi', 'contact', 'solicita-oferta', 'intrebari-frecvente', 'blog', 'confidentialitate', 'termeni', 'cookies'];

async function checkPage(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: 'domcontentloaded' });
  expect(response?.status(), path).toBe(200);
  await expect(page.locator('main h1'), path).toHaveCount(1);
  await expect(page.locator('main h1'), path).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `horizontal overflow at ${path}`).toBeLessThanOrEqual(1);
  await expect(page.locator('a[href="#"], a[href=""]'), `empty links at ${path}`).toHaveCount(0);
}

for (const locale of locales) {
  for (const width of widths) {
    test(`${locale}: pages at ${width}px have headings and no overflow`, async ({ page }) => {
      test.setTimeout(150_000);
      await page.setViewportSize({ width, height: 900 });
      for (const section of sections) await checkPage(page, `/${locale}${section ? '/' + section : ''}`);
      for (const group of ['servicii', 'echipamente', 'portofoliu', 'blog']) {
        await page.goto(`/${locale}/${group}`);
        const detail = await page.locator(`main a[href^="/${locale}/${group}/"]`).first().getAttribute('href').catch(() => null);
        if (detail) await checkPage(page, detail);
        else expect(['portofoliu', 'blog']).toContain(group); // No invented projects or editorial publications.
      }
    });
  }
}

test('root defaults to Romanian, and equivalent language pages stay selected', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/ro\/?$/);
  await page.goto('/ro/servicii');
  const detail = await page.locator('main a[href^="/ro/servicii/"]').first().getAttribute('href');
  expect(detail).toBeTruthy();
  await page.goto(detail!);
  const suffix = new URL(page.url()).pathname.replace(/^\/ro/, '');
  for (const locale of locales) {
    const link = page.locator(`header a[href="/${locale}${suffix}"]`).first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(new RegExp(`/${locale}${suffix}/?$`));
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
  }
});

test('mobile navigation and contact actions work', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/ro');
  const menu = page.locator('header button[aria-controls="mobile-navigation"]');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#mobile-navigation a[href="/ro/contact"]').click();
  await expect(page).toHaveURL(/\/ro\/contact\/?$/);
  await expect(page.locator('main a[href="tel:+37360010400"]').first()).toBeVisible();
  await expect(page.locator('main a[href="mailto:office@artmaster.md"]').first()).toBeVisible();
  await expect(page.locator('main')).toContainText('69');
  await expect(page.locator('main')).toContainText('Durlești');
});

test('page metadata, hreflang and structured data match public pages', async ({ page, request }) => {
  for (const locale of locales) {
    for (const section of ['', 'servicii', 'contact']) {
      const path = `/${locale}${section ? '/' + section : ''}`;
      await page.goto(path);
      await expect(page).toHaveTitle(/ARTMASTER/);
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
      expect(new URL(canonical!).pathname.replace(/\/$/, '')).toBe(path);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.{20,}/);
      for (const alternative of [...locales, 'x-default']) {
        const href = await page.locator(`link[rel="alternate"][hreflang="${alternative}"]`).getAttribute('href');
        expect(new URL(href!).pathname.replace(/\/$/, '')).toBe(`/${alternative === 'x-default' ? 'ro' : alternative}${section ? '/' + section : ''}`);
      }
      const data = await page.locator('script[type="application/ld+json"]').allTextContents();
      expect(data.length).toBeGreaterThan(0);
      for (const encoded of data) expect(() => JSON.parse(encoded)).not.toThrow();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    }
  }
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).toContain('<urlset');
  for (const locale of locales) expect(xml).toContain(`/${locale}/servicii`);
  expect(xml).not.toContain('/admin');
  expect(xml).not.toContain('/api/');
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toMatch(/Disallow: \/(?:\s|$)/);
});

test('security headers, nonexistent pages and private endpoints fail safely', async ({ request }) => {
  const response = await request.get('/ro');
  const headers = response.headers();
  expect(headers['content-security-policy']).toMatch(/script-src[^;]*'nonce-/);
  expect(headers['content-security-policy']).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-robots-tag']).toContain('noindex');
  expect((await request.get('/ro/servicii/serviciu-inexistent')).status()).toBe(404);
  expect((await request.get('/ro/pagina-inexistenta')).status()).toBe(404);
  for (const path of ['/api/admin/quotes', '/api/admin/content']) {
    const privateResponse = await request.get(path);
    expect([401, 403]).toContain(privateResponse.status());
    expect(await privateResponse.text()).not.toContain('office@artmaster.md');
    expect(privateResponse.headers()['cache-control']).toContain('no-store');
  }
});

test('quote validates fields, accepts a private PDF and returns a real receipt', async ({ page }) => {
  await page.goto('/ro/solicita-oferta');
  const form = page.locator('main form');
  await form.locator('button[type="submit"]').click();
  await expect(form.locator('[role="alert"]')).toContainText('Verifică');
  await form.locator('[name="name"]').fill('Verificare automată ARTMASTER');
  await form.locator('[name="phone"]').fill('+37360010400');
  await form.locator('[name="email"]').fill('e2e@example.com');
  await form.locator('[name="service"]').selectOption({ index: 1 });
  await form.locator('[name="company"]').fill('Verificare E2E');
  await form.locator('[name="dimensions"]').fill('500 × 300 mm');
  await form.locator('[name="quantity"]').fill('2');
  await form.locator('[name="deadline"]').fill(`${new Date().getUTCFullYear() + 1}-01-15`);
  await form.locator('[name="message"]').fill('Test local automat: imprimare pentru o machetă de producție. Nu este o cerere comercială.');
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 200]);
  await form.locator('[name="files"]').setInputFiles({ name: 'cerere-test.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) });
  await form.locator('[name="consent"]').check();
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/quotes') && response.request().method() === 'POST');
  await form.locator('button[type="submit"]').click();
  const response = await responsePromise;
  expect([200, 201]).toContain(response.status());
  const receipt = await response.json();
  expect(receipt.id).toMatch(/\S{8,}/);
  expect(['pending', 'sent', 'not_configured']).toContain(receipt.notification);
  await expect(form.locator('[role="status"]')).toContainText('Cererea a fost înregistrată.');
  await expect(form.locator('[role="status"]')).toContainText(receipt.id);
  await expect(form.locator('button[type="submit"]')).toHaveCount(0);
});

test('quote rejects disallowed and oversized attachments in the browser', async ({ page }) => {
  await page.goto('/ro/solicita-oferta');
  const input = page.locator('main form [name="files"]');
  await input.setInputFiles({ name: 'aplicatie.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ test') });
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('main form .field-error')).toContainText('PDF, PNG și JPG');
  await input.setInputFiles({ name: 'imagine.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) });
  await expect(page.locator('main form .field-error')).toContainText('5 MB');
});

test('quote server rejects another origin, spoofed files and oversized uploads', async ({ page, request }) => {
  await page.goto('/ro/solicita-oferta');
  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
  const origin = new URL(canonical!).origin;
  const service = await page.locator('main form select[name="service"] option').nth(1).getAttribute('value');
  const tokenResponse = await request.get('/api/quote-token');
  expect(tokenResponse.status()).toBe(200);
  const issued = await tokenResponse.json();
  const fields = {
    locale: 'ro', service: service!, name: 'Test server automat', email: 'e2e@example.com',
    phone: '+37360010400', message: 'Verificare automată de respingere; nu este solicitare comercială.',
    consent: 'true', website: '', token: issued.token, idempotencyKey: issued.idempotencyKey,
  };
  const crossOrigin = await request.post('/api/quotes', { headers: { Origin: 'https://untrusted.example' }, multipart: fields });
  expect(crossOrigin.status()).toBe(403);
  await page.waitForTimeout(1250); // The signed form token has a deliberate anti-bot minimum age.
  for (const file of [
    { name: 'executabil.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ rejected') },
    { name: 'imagine.png', mimeType: 'image/png', buffer: Buffer.from('MZ disguised executable') },
  ]) {
    const rejected = await request.post('/api/quotes', { headers: { Origin: origin }, multipart: { ...fields, files: file } });
    expect(rejected.status()).toBe(400);
    expect(await rejected.json()).toMatchObject({ code: 'invalid_file' });
  }
  const oversized = await request.post('/api/quotes', {
    headers: { Origin: origin },
    multipart: { ...fields, files: { name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 1) } },
  });
  expect(oversized.status()).toBe(413);
});

test('Romanian homepage and quote page have no serious WCAG A/AA violations', async ({ page }) => {
  for (const path of ['/ro', '/ro/solicita-oferta']) {
    await page.goto(path);
    const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(report.violations.filter(v => v.impact === 'serious' || v.impact === 'critical'), path).toEqual([]);
  }
});

test('reduced motion and page hydration preserve working controls', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /content security policy|hydration|refused to execute/i.test(message.text())) errors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/ro');
  await expect(page.locator('header a[href="/ro/solicita-oferta"]').first()).toBeVisible();
  await page.locator('header a[href="/ro/solicita-oferta"]').first().click();
  await expect(page).toHaveURL(/\/ro\/solicita-oferta\/?$/);
  await expect(page.locator('main form')).toBeVisible();
  expect(errors).toEqual([]);
});

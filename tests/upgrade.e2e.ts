import { test, expect } from './browser-fixtures';
import AxeBuilder from '@axe-core/playwright';
const locales = ['ro', 'ru', 'en'] as const;
const newSlugs = ['colantare-auto', 'stickere-personalizate', 'print-bannere', 'branding-design', 'standuri-expozitionale'];
const copy = { ro: { preview: 'Parteneri — previzualizare', pause: 'Oprește animația', resume: 'Pornește animația', saved: 'Cererea a fost înregistrată.' }, ru: { preview: 'Партнёры — предварительный просмотр', pause: 'Остановить анимацию', resume: 'Запустить анимацию', saved: 'Заявка зарегистрирована.' }, en: { preview: 'Partners — preview', pause: 'Pause animation', resume: 'Resume animation', saved: 'Your request has been registered.' } };

for (const locale of locales) {
  test(`${locale}: official branding and example partner marquee remain responsive`, async ({ page }) => {
    test.setTimeout(100_000);
    for (const width of [320, 375, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 }); await page.goto(`/${locale}`);
      const logo = page.locator('header .brand-symbol'); await expect(logo).toHaveAttribute('src', /\/_next\/image\?url=%2Fbranding%2Fartmaster-symbol\.webp/);
      await expect(page.locator('header .brand-caption')).toHaveText('ADVERTISING GROUP');
      await expect(page.locator('header')).not.toContainText('CREATIVE SOLUTIONS');
      const box = (await logo.boundingBox())!, header = (await page.locator('header').boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(header.y); expect(box.y + box.height).toBeLessThanOrEqual(header.y + header.height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await expect(page.getByRole('heading', { name: copy[locale].preview })).toBeVisible();
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    const section = page.locator('[data-partners-example]');
    const track = section.locator('ul').first().locator('..');
    await page.mouse.move(0, 0);
    const before = await track.evaluate(element => getComputedStyle(element).transform); await page.waitForTimeout(200);
    expect(await track.evaluate(element => getComputedStyle(element).transform)).not.toBe(before);
    const widths = await section.locator('ul').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().width));
    expect(widths[0]).toBeGreaterThanOrEqual(1280); expect(Math.abs(widths[0] - widths[1])).toBeLessThanOrEqual(1);
    const pause = section.getByRole('button'); await expect(pause).toHaveAccessibleName(copy[locale].pause); await pause.click();
    await expect(pause).toHaveAttribute('aria-pressed', 'true'); await expect(pause).toHaveAccessibleName(copy[locale].resume);
    expect(await track.evaluate(element => getComputedStyle(element).animationPlayState)).toBe('paused');
    await section.getByRole('button', { name: copy[locale].resume }).click();
    await section.locator('[id$="-logos"]').hover(); expect(await track.evaluate(element => getComputedStyle(element).animationPlayState)).toBe('paused');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await track.evaluate(element => getComputedStyle(element).animationName)).toBe('none');
    await expect(section.locator('ul').last()).not.toBeVisible();
  });

  test(`${locale}: newly confirmed services have SEO, related links and working quote preselection`, async ({ page }) => {
    test.setTimeout(120_000);
    const titles = new Set<string>();
    for (const slug of newSlugs) {
      const response = await page.goto(`/${locale}/servicii/${slug}`); expect(response?.status()).toBe(200);
      await expect(page.locator('main h1')).toHaveCount(1); const title = await page.title(); expect(titles.has(title)).toBe(false); titles.add(title);
      await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
      await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', new RegExp(`/branding/share-${locale}\\.jpg$`));
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href'); expect(new URL(canonical!).pathname).toBe(`/${locale}/servicii/${slug}`);
      const quote = page.locator(`main a[href="/${locale}/solicita-oferta?serviciu=${slug}"]`).first(); await quote.click();
      await expect(page.locator('main select[name="service"]')).toHaveValue(slug);
      const alternative = locale === 'ro' ? 'ru' : 'ro';
      await page.locator(`header a[hreflang="${alternative}"]`).click();
      await expect(page).toHaveURL(new RegExp(`/${alternative}/solicita-oferta\\?serviciu=${slug}$`));
      await expect(page.locator('main select[name="service"]')).toHaveValue(slug);
    }
  });
}

test('brand icons, manifest and sitemap expose valid assets and complete canonical routes', async ({ request, page }) => {
  test.setTimeout(150_000);
  for (const path of ['/favicon.ico', '/branding/apple-touch-icon.png', '/branding/icon-192.png', '/branding/icon-512.png', '/branding/share-ro.jpg', '/branding/share-ru.jpg', '/branding/share-en.jpg']) {
    const response = await request.get(path); expect(response.status(), path).toBe(200); expect(response.headers()['content-type']).toMatch(/image/);
  }
  const manifest = await (await request.get('/manifest.webmanifest')).json(); expect(manifest.icons).toHaveLength(2); expect(manifest.start_url).toBe('/ro');
  const xml = await (await request.get('/sitemap.xml')).text();
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => new URL(match[1]).pathname);
  expect(paths).toHaveLength(90); // 12 sections, 11 services, 5 machines and 2 guides × 3 languages.
  for (const path of paths) {
    const response = await request.get(path); expect(response.status(), path).toBe(200);
    const html = await response.text(); expect(html).toMatch(/rel="canonical"/); expect(html).not.toContain('CREATIVE SOLUTIONS');
  }
  await page.goto('/ro');
  const graph = (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap(value => JSON.parse(value)['@graph'] || [JSON.parse(value)]);
  expect(graph.filter(value => Array.isArray(value['@type']) && value['@type'].includes('Organization') && value['@type'].includes('LocalBusiness'))).toHaveLength(1);
  expect(graph.filter(value => value['@type'] === 'WebSite')).toHaveLength(1);
  expect(JSON.stringify(graph)).not.toContain('reviewRating');
});

test('quote failure keeps entered data and never displays a successful registration', async ({ page }) => {
  await page.goto('/ro/solicita-oferta?serviciu=colantare-auto'); const form = page.locator('main form');
  await form.locator('[name="name"]').fill('Verificare eroare ofertă'); await form.locator('[name="email"]').fill('failure@example.invalid'); await form.locator('[name="phone"]').fill('+37360010400');
  await form.locator('[name="message"]').fill('Cerere de verificare a unei erori simulate.'); await form.locator('[name="consent"]').check();
  await page.route('**/api/quotes', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"code":"unavailable"}' }));
  await form.locator('button[type="submit"]').click(); await expect(form.locator('[role="alert"]')).toContainText('temporar indisponibil');
  await expect(form.locator('[role="status"]')).toHaveCount(0); await expect(form.locator('[name="name"]')).toHaveValue('Verificare eroare ofertă');
  await expect(form.locator('button[type="submit"]')).toBeEnabled();
});

test('processing disables the quote action and accepts only one registration', async ({ page }) => {
  await page.goto('/en/solicita-oferta?serviciu=stickere-personalizate'); const form = page.locator('main form'); let posts = 0;
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/quotes')) posts++; });
  await form.locator('[name="name"]').fill('English request test'); await form.locator('[name="email"]').fill('registration@example.invalid'); await form.locator('[name="phone"]').fill('+37360010400');
  await form.locator('[name="message"]').fill('Local test of actual acceptance and duplicate prevention.'); await form.locator('[name="consent"]').check();
  await page.route('**/api/quotes', async route => { await new Promise(resolve => setTimeout(resolve, 600)); await route.continue(); });
  await form.locator('button[type="submit"]').click(); await expect(form.locator('button[type="submit"]')).toBeDisabled();
  await expect(form.locator('[role="status"]')).toContainText(copy.en.saved); expect(posts).toBe(1);
});

test('new homepage section and custom upload controls meet serious/critical WCAG checks in all languages', async ({ page }) => {
  test.setTimeout(120_000);
  for (const locale of locales) {
    await page.goto(`/${locale}`);
    const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(report.violations.filter(value => value.impact === 'serious' || value.impact === 'critical')).toEqual([]);
  }
});

test('token throttling gives a clear error without submitting or claiming success', async ({ page }) => {
  let posts = 0; page.on('request', request => { if (request.url().endsWith('/api/quotes') && request.method() === 'POST') posts++; });
  await page.route('**/api/quote-token', route => route.fulfill({ status: 429, contentType: 'application/json', body: '{"code":"rate_limited"}' }));
  await page.goto('/ro/solicita-oferta?serviciu=print-uv'); const form = page.locator('main form');
  await form.locator('[name="name"]').fill('Verificare limitare'); await form.locator('[name="phone"]').fill('+37360010400'); await form.locator('[name="email"]').fill('throttle@example.invalid'); await form.locator('[name="message"]').fill('Verificare de interfață pentru limitarea cererilor.'); await form.locator('[name="consent"]').check();
  await form.locator('button[type="submit"]').click(); await expect(form.locator('[role="alert"]')).toContainText('prea multe cereri');
  await expect(form.locator('[role="status"]')).toHaveCount(0); await expect(form.locator('button[type="submit"]')).toBeEnabled(); expect(posts).toBe(0);
});

import { test, expect } from './browser-fixtures';
import AxeBuilder from '@axe-core/playwright';

const copy = {
  ro: { top: 'Înapoi sus', contact: 'Contact rapid', close: 'Închide contactul rapid', quote: 'Solicită o ofertă', load: 'Încarcă harta interactivă', hide: 'Ascunde harta', map: 'ARTMASTER — locația oficiului în Google Maps', title: 'Unde ne găsești' },
  ru: { top: 'Наверх', contact: 'Быстрая связь', close: 'Закрыть панель связи', quote: 'Запросить предложение', load: 'Загрузить интерактивную карту', hide: 'Скрыть карту', map: 'ARTMASTER — расположение офиса в Google Maps', title: 'Где нас найти' },
  en: { top: 'Back to top', contact: 'Quick contact', close: 'Close quick contact', quote: 'Request a quote', load: 'Load interactive map', hide: 'Hide map', map: 'ARTMASTER — office location in Google Maps', title: 'Where to find us' },
};
for (const locale of ['ro', 'ru', 'en'] as const) {
  test(`${locale}: floating actions scroll correctly, manage focus and never overlap`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto(`/${locale}`);
    const top = page.getByRole('button', { name: copy[locale].top, exact: true }); await expect(top).not.toBeVisible();
    await page.evaluate(() => window.scrollTo({ top: 800, behavior: 'instant' })); await expect(top).toBeVisible();
    const quick = page.getByRole('button', { name: copy[locale].contact, exact: true }); const a = (await top.boundingBox())!, b = (await quick.boundingBox())!;
    expect(a.y + a.height).toBeLessThanOrEqual(b.y - 10);
    await top.click(); await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5);
    await page.evaluate(() => window.scrollTo({ top: 900, behavior: 'instant' }));
    await page.locator('header .brand-link').click(); await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5); await expect(page).toHaveURL(new RegExp(`/${locale}/?$`));
    await quick.click(); const dialog = page.getByRole('dialog', { name: 'ARTMASTER', exact: true }); await expect(dialog).toBeVisible();
    const close = dialog.getByRole('button', { name: copy[locale].close }); await expect(close).toBeFocused();
    await expect(dialog.locator('a[href="tel:+37360010400"]')).toBeVisible(); await expect(dialog.locator('a[href="mailto:office@artmaster.md"]')).toBeVisible();
    await expect(dialog.locator('a[href^="https://wa.me/"], a[href^="viber:"]')).toHaveCount(0);
    await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible(); await expect(quick).toBeFocused();
    await quick.click(); await page.locator('main h1').click(); await expect(dialog).not.toBeVisible();
    await quick.click(); await dialog.getByRole('link', { name: copy[locale].quote, exact: true }).click(); await expect(page).toHaveURL(new RegExp(`/${locale}/solicita-oferta$`)); await expect(dialog).not.toBeVisible();
    await page.goto(`/${locale}/contact`); await page.locator('header .brand-link').click(); await expect(page).toHaveURL(new RegExp(`/${locale}/?$`));
  });

  test(`${locale}: contact map requires a deliberate load and uses the published address`, async ({ page }) => {
    let mapRequests = 0;
    await page.route('https://www.google.com/maps?**', async route => { mapRequests++; await route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><title>Map test fixture</title><body>Simulated map provider response</body></html>' }); });
    await page.goto(`/${locale}/contact`); await expect(page.getByRole('heading', { name: copy[locale].title, exact: true })).toBeVisible();
    await expect(page.locator('iframe')).toHaveCount(0); expect(mapRequests).toBe(0);
    const direction = page.locator('main a[href^="https://www.google.com/maps/dir/"]'); const url = new URL((await direction.getAttribute('href'))!);
    expect(url.searchParams.get('api')).toBe('1'); expect(url.searchParams.get('destination')).toContain('69'); expect(url.searchParams.get('destination')).toContain('MD-2003');
    await page.getByRole('button', { name: copy[locale].load, exact: true }).click();
    const iframe = page.locator(`iframe[title="${copy[locale].map}"]`); await expect(iframe).toBeVisible(); await expect.poll(() => mapRequests).toBe(1);
    const embed = new URL((await iframe.getAttribute('src'))!); expect(embed.searchParams.get('q')).toBe(url.searchParams.get('destination')); expect(embed.searchParams.get('output')).toBe('embed');
    await expect(iframe).toHaveAttribute('loading', 'lazy');
    await page.getByRole('button', { name: copy[locale].contact, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'ARTMASTER', exact: true }); await expect(dialog).toBeVisible();
    await page.frameLocator('iframe').locator('body').click(); await expect(dialog).not.toBeVisible();
    await page.getByRole('button', { name: copy[locale].hide, exact: true }).click(); await expect(iframe).toHaveCount(0);
  });
}

test('contact widget and location section fit all seven requested widths without blocking each other', async ({ page }) => {
  test.setTimeout(90_000); await page.goto('/ro/contact');
  for (const width of [320, 375, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 }); const trigger = page.getByRole('button', { name: copy.ro.contact, exact: true }); await trigger.click();
    const panel = page.getByRole('dialog', { name: 'ARTMASTER', exact: true }); const box = (await panel.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(900);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.keyboard.press('Escape');
  }
});

test('floating actions move above a consent banner and close their panel safely', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 }); await page.goto('/ro');
  await page.evaluate(() => {
    if (document.querySelector('.consent-banner')) return;
    const banner = document.createElement('aside'); banner.className = 'consent-banner'; banner.textContent = 'Consent overlap test fixture'; banner.style.minHeight = '180px'; document.body.append(banner);
  });
  const trigger = page.getByRole('button', { name: copy.ro.contact, exact: true });
  await expect.poll(async () => { const button = (await trigger.boundingBox())!, banner = (await page.locator('.consent-banner').boundingBox())!; return banner.y - (button.y + button.height); }).toBeGreaterThanOrEqual(10);
  await page.locator('.consent-banner').evaluate(element => { element.style.minHeight = `${element.getBoundingClientRect().height + 24}px`; });
  await expect.poll(async () => { const button = (await trigger.boundingBox())!, banner = (await page.locator('.consent-banner').boundingBox())!; return banner.y - (button.y + button.height); }).toBeGreaterThanOrEqual(10);
  await trigger.click(); const dialog = page.getByRole('dialog', { name: 'ARTMASTER', exact: true });
  await expect(dialog).toBeVisible(); await expect(dialog.getByRole('button', { name: copy.ro.close })).toBeFocused(); await page.keyboard.press('Escape');
});

test('open quick-contact and contact location controls have no serious or critical WCAG violations', async ({ page }) => {
  for (const locale of ['ro', 'ru', 'en'] as const) {
    await page.goto(`/${locale}/contact`); await page.getByRole('button', { name: copy[locale].contact, exact: true }).click();
    const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(report.violations.filter(value => value.impact === 'serious' || value.impact === 'critical')).toEqual([]);
  }
});

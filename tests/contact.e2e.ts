import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument } from 'pdf-lib';
import { DatabaseSync } from 'node:sqlite';
import { readFile, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Quote } from '../src/lib/server/types';

const locales = ['ro', 'ru', 'en'] as const;
const widths = [320, 375, 390, 768, 1024, 1440, 1920];
const labels = {
  ro: { home: 'Acasă', contact: 'Contact' },
  ru: { home: 'Главная', contact: 'Контакты' },
  en: { home: 'Home', contact: 'Contact' },
};
const directory = resolve(process.env.ARTMASTER_DATA_DIR || '.data/e2e');

type BreadcrumbList = {
  '@type': 'BreadcrumbList';
  itemListElement: { position: number; name: string; item: string }[];
};

async function checkBreadcrumb(page: Page, path: string) {
  const nav = page.getByRole('navigation', { name: 'Breadcrumb', exact: true });
  await expect(nav).toHaveCount(1);
  await expect(nav).toBeVisible();
  const list = nav.locator('ol, ul');
  await expect(list).toHaveCount(1);
  const current = nav.locator('[aria-current="page"]');
  await expect(current).toHaveCount(1);
  await expect(current).toBeVisible();
  await expect(page.locator('main h1')).toHaveCount(1);

  const visible = await nav.locator('li').evaluateAll(items => items.map(item => {
    const label = item.querySelector('a, [aria-current="page"]');
    return {
      name: label?.textContent?.trim(),
      href: label?.getAttribute('href'),
      marker: getComputedStyle(item).listStyleType,
      top: item.getBoundingClientRect().top,
    };
  }));
  expect(visible.length).toBeGreaterThanOrEqual(2);
  for (const item of visible) expect(item.marker).toBe('none');
  if (page.viewportSize()!.width >= 768) {
    expect(Math.max(...visible.map(item => item.top)) - Math.min(...visible.map(item => item.top))).toBeLessThanOrEqual(2);
  }

  const encoded = await page.locator('script[type="application/ld+json"]').allTextContents();
  const schemas = encoded.flatMap(value => {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : parsed['@graph'] || [parsed];
  });
  const breadcrumbs = schemas.filter(value => value['@type'] === 'BreadcrumbList') as BreadcrumbList[];
  expect(breadcrumbs, `one structured breadcrumb at ${path}`).toHaveLength(1);
  const structured = breadcrumbs[0].itemListElement;
  expect(structured).toHaveLength(visible.length);
  for (let index = 0; index < structured.length; index++) {
    expect(structured[index].position).toBe(index + 1);
    expect(structured[index].name).toBe(visible[index].name);
    expect(new URL(structured[index].item).pathname.replace(/\/$/, '')).toBe(visible[index].href || path);
  }
  const positions = await page.evaluate(() => {
    const header = document.querySelector('header')!.getBoundingClientRect();
    const breadcrumb = document.querySelector('nav[aria-label="Breadcrumb"]')!.getBoundingClientRect();
    const heading = document.querySelector('main h1')!.getBoundingClientRect();
    return { headerBottom: header.bottom, breadcrumbTop: breadcrumb.top, breadcrumbBottom: breadcrumb.bottom, headingTop: heading.top };
  });
  expect(positions.breadcrumbTop).toBeGreaterThanOrEqual(positions.headerBottom - 1);
  expect(positions.breadcrumbBottom).toBeLessThanOrEqual(positions.headingTop + 1);
}

for (const locale of locales) {
  test(`${locale}: contact layout, actions and breadcrumb at all seven requested widths`, async ({ page }) => {
    test.setTimeout(120_000);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      const response = await page.goto(`/${locale}/contact`);
      expect(response?.status()).toBe(200);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await checkBreadcrumb(page, `/${locale}/contact`);
      const nav = page.getByRole('navigation', { name: 'Breadcrumb', exact: true });
      await expect(nav.locator('[aria-current="page"]')).toHaveText(labels[locale].contact);
      await expect(nav.getByRole('link', { name: labels[locale].home, exact: true })).toHaveAttribute('href', `/${locale}`);

      const details = page.locator('main .contact-details');
      const panel = page.locator('main .contact-form-panel');
      await expect(details.locator('h1')).toBeVisible();
      await expect(panel.locator('h2')).toBeVisible();
      await expect(panel.locator('.contact-form-intro')).toBeVisible();
      if (locale === 'ro') {
        await expect(details.locator('.eyebrow')).toHaveText('CONTACT ARTMASTER');
        await expect(details.locator('h1')).toHaveText('Hai să discutăm proiectul tău.');
        await expect(details.locator('.contact-intro')).toHaveText('Spune-ne ce dorești să realizezi, iar echipa noastră te va ajuta să găsești soluția potrivită.');
        await expect(panel.locator('h2')).toHaveText('Solicită o ofertă');
      }
      expect(await panel.locator('h2').innerText()).not.toBe(await details.locator('h1').innerText());
      await expect(details.locator('a[href="tel:+37360010400"]')).toBeVisible();
      await expect(details.locator('a[href="mailto:office@artmaster.md"]')).toBeVisible();
      await expect(details).toContainText('69');
      const map = details.locator('a[href^="https://www.google.com/maps/search/"]');
      await expect(map).toBeVisible();
      const mapUrl = new URL((await map.getAttribute('href'))!);
      expect(mapUrl.searchParams.get('api')).toBe('1');
      expect(mapUrl.searchParams.get('query')).toContain('69');
      await expect(map).toHaveAttribute('rel', /noopener/);

      const left = (await details.boundingBox())!;
      const right = (await panel.boundingBox())!;
      if (width < 768) {
        expect(right.y, 'contact details precede the form on mobile').toBeGreaterThanOrEqual(left.y + left.height);
        expect(Math.abs(left.x - right.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(left.width - right.width)).toBeLessThanOrEqual(1);
      } else {
        expect(Math.abs(left.y - right.y), 'columns align at their top edge').toBeLessThanOrEqual(1);
        expect(right.x).toBeGreaterThan(left.x + left.width);
        const share = left.width / (left.width + right.width);
        expect(share, 'information column takes approximately 40%').toBeGreaterThanOrEqual(0.35);
        expect(share).toBeLessThanOrEqual(0.45);
      }
      const container = (await page.locator('main .contact-grid').boundingBox())!;
      expect(container.width).toBeLessThanOrEqual(1280);
      expect(Math.abs(container.x - (width - container.width) / 2)).toBeLessThanOrEqual(1);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(overflow, `${locale} contact at ${width}px`).toBeLessThanOrEqual(1);
      const form = panel.locator('form');
      const submit = (await form.locator('button[type="submit"]').boundingBox())!;
      expect(submit.height, 'the primary action is easy to tap').toBeGreaterThanOrEqual(44);
      for (const pair of [['name', 'phone'], ['email', 'service']]) {
        const first = (await form.locator(`[name="${pair[0]}"]`).boundingBox())!;
        const second = (await form.locator(`[name="${pair[1]}"]`).boundingBox())!;
        if (Math.abs(first.y - second.y) <= 1) expect(Math.abs(first.height - second.height)).toBeLessThanOrEqual(1);
      }
    }
  });

  test(`${locale}: shared breadcrumbs follow real section and detail routes`, async ({ page, request }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const group of ['servicii', 'echipamente', 'portofoliu', 'blog']) {
      const parent = `/${locale}/${group}`;
      await page.goto(parent);
      await checkBreadcrumb(page, parent);
      const detail = await page.locator(`main a[href^="${parent}/"]`).first().getAttribute('href');
      expect(detail, `a real detail route in ${group}`).toBeTruthy();
      await page.goto(detail!);
      await checkBreadcrumb(page, detail!);
      const nav = page.getByRole('navigation', { name: 'Breadcrumb', exact: true });
      await expect(nav.locator('li')).toHaveCount(3);
      const current = await nav.locator('[aria-current="page"]').innerText();
      expect(current).toBe(await page.locator('main h1').innerText());
      const parentLink = nav.locator(`a[href="${parent}"]`);
      await expect(parentLink).toBeVisible();
      expect((await request.get(parent)).status()).toBe(200);
      await parentLink.click();
      await expect(page).toHaveURL(new RegExp(`${parent}/?$`));
    }
  });
}

test('contact form retains expanded values, validates and registers a real private upload locally', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ro/contact');
  const form = page.locator('main form');
  const details = form.locator('details');
  await expect(details).not.toHaveAttribute('open');
  await form.locator('button[type="submit"]').click();
  await expect(form.locator('[role="alert"]')).toContainText('Verifică');
  for (const name of ['name', 'phone', 'email', 'service', 'message', 'consent']) {
    await expect(form.locator(`[name="${name}"]`)).toHaveAttribute('aria-invalid', 'true');
  }
  await form.locator('[name="name"]').fill('Test UX contact ARTMASTER');
  await form.locator('[name="phone"]').fill('+37360010400');
  await form.locator('[name="email"]').fill('contact-ux@example.invalid');
  await form.locator('[name="service"]').selectOption({ index: 1 });
  await form.locator('[name="message"]').fill('Verificare locală UX și upload; această cerere nu este comercială.');
  await form.locator('[name="consent"]').check();
  await details.locator('summary').click();
  await form.locator('[name="company"]').fill('Verificare contact E2E');
  await form.locator('[name="dimensions"]').fill('120 × 80 cm');
  await form.locator('[name="quantity"]').fill('0');
  const deadline = `${new Date().getUTCFullYear() + 1}-01-15`;
  await form.locator('[name="deadline"]').fill(deadline);
  await details.locator('summary').click();
  await form.locator('button[type="submit"]').click();
  await expect(details).toHaveAttribute('open', '');
  await expect(form.locator('[name="quantity"]')).toBeFocused();
  await expect(form.locator('[name="quantity"]')).toHaveAttribute('aria-invalid', 'true');
  await form.locator('[name="quantity"]').fill('2');
  await details.locator('summary').click();
  await expect(form.locator('[name="company"]')).toHaveValue('Verificare contact E2E');
  await expect(form.locator('[name="dimensions"]')).toHaveValue('120 × 80 cm');
  const input = form.locator('[name="files"]');
  await input.setInputFiles({ name: 'program.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ rejected') });
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await expect(form.locator('.field-error').filter({ hasText: 'PDF, PNG și JPG' })).toBeVisible();
  const pdf = await PDFDocument.create();
  pdf.addPage([120, 80]);
  const bytes = Buffer.from(await pdf.save());
  await input.setInputFiles({ name: 'contact-ux.pdf', mimeType: 'application/pdf', buffer: bytes });
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/quotes') && response.request().method() === 'POST');
  await form.locator('button[type="submit"]').click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  const receipt = await response.json();
  expect(receipt.notification, 'local tests never send external email').toBe('not_configured');
  await expect(form.locator('[role="status"]')).toContainText(receipt.id);
  await expect(form.locator('button[type="submit"]')).toHaveCount(0);
  const db = new DatabaseSync(join(directory, 'artmaster.sqlite'));
  let saved: Quote | undefined;
  try {
    const row = db.prepare('SELECT data FROM quotes WHERE id=?').get(receipt.id) as { data: string };
    expect(row).toBeTruthy();
    saved = JSON.parse(row.data) as Quote;
    expect(saved).toMatchObject({ company: 'Verificare contact E2E', dimensions: '120 × 80 cm', quantity: '2', deadline, locale: 'ro' });
    expect(saved.files).toHaveLength(1);
    expect(saved.files[0]).toMatchObject({ name: 'contact-ux.pdf', mime: 'application/pdf', size: bytes.length });
    expect(await readFile(join(directory, 'uploads', saved.files[0].path))).toEqual(bytes);
  } finally {
    db.prepare('DELETE FROM quotes WHERE id=?').run(receipt.id);
    db.close();
    for (const file of saved?.files || []) await unlink(join(directory, 'uploads', file.path));
  }
});

test('contact and its expandable form have no serious or critical WCAG A/AA findings in any language', async ({ page }) => {
  test.setTimeout(120_000);
  for (const locale of locales) {
    await page.setViewportSize({ width: 375, height: 900 });
    await page.goto(`/${locale}/contact`);
    await page.locator('main form details summary').click();
    const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    expect(report.violations.filter(item => item.impact === 'serious' || item.impact === 'critical'), `${locale} contact accessibility`).toEqual([]);
  }
});

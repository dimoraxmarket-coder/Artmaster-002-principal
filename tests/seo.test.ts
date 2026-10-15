import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultContent } from '../src/lib/content/defaults';
import { contentSchema, quoteSchema } from '../src/lib/server/schema';
import { localizedSeoCopy, serviceSearchTerms } from '../src/lib/seo-content';
import { resolveSiteUrl } from '../src/lib/site';
import { safePartnerWebsite } from '../src/lib/partners';
import { randomUUID } from 'node:crypto';

test('confirmed services have complete translations, valid references and a non-duplicated semantic map', () => {
  assert.equal(contentSchema.safeParse(defaultContent).success, true); assert.equal(defaultContent.services.length, 11);
  for (const locale of ['ro', 'ru', 'en'] as const) {
    const titles = new Set<string>();
    for (const service of defaultContent.services) {
      assert.ok(service.description[locale].length > 150); assert.ok(serviceSearchTerms[service.slug][locale]);
      const copy = localizedSeoCopy(locale, `servicii/${service.slug}`, service.title[locale], service.summary[locale]);
      assert.ok(!titles.has(copy.title)); titles.add(copy.title);
    }
    const descriptions = ['confidentialitate', 'termeni', 'cookies'].map(path => localizedSeoCopy(locale, path, path, 'fallback').description);
    assert.equal(new Set(descriptions).size, 3);
  }
});

test('production metadata rejects localhost, insecure origins, credentials and arbitrary paths', () => {
  const previous = process.env.NODE_ENV, allow = process.env.ARTMASTER_ALLOW_LOCAL_PRODUCTION;
  Object.assign(process.env, { NODE_ENV: 'production' }); delete process.env.ARTMASTER_ALLOW_LOCAL_PRODUCTION;
  try {
    assert.equal(resolveSiteUrl('https://artmaster.md/'), 'https://artmaster.md');
    for (const origin of ['http://localhost:3000', 'https://localhost', 'http://artmaster.md', 'https://user:password@artmaster.md', 'https://artmaster.md/private', 'https://artmaster.md/?secret=1']) assert.throws(() => resolveSiteUrl(origin));
    process.env.ARTMASTER_ALLOW_LOCAL_PRODUCTION = 'true'; assert.equal(resolveSiteUrl('http://127.0.0.1:3200'), 'http://127.0.0.1:3200');
  } finally { if (previous === undefined) Reflect.deleteProperty(process.env, 'NODE_ENV'); else Object.assign(process.env, { NODE_ENV: previous }); if (allow === undefined) delete process.env.ARTMASTER_ALLOW_LOCAL_PRODUCTION; else process.env.ARTMASTER_ALLOW_LOCAL_PRODUCTION = allow; }
});

test('new source-page validation remains compatible with older clients and rejects arbitrary origins', () => {
  const form = { locale: 'ro', service: 'print-uv', name: 'User', email: 'user@example.com', phone: '+37360010400', message: 'Request', consent: 'true', website: '', token: 'long-form-token-placeholder', idempotencyKey: randomUUID() };
  assert.equal(quoteSchema.safeParse(form).success, true); assert.equal(quoteSchema.safeParse({ ...form, sourcePath: '/ro/contact' }).success, true);
  for (const sourcePath of ['//attacker.invalid', '/admin', '/ro/contact?private=1']) assert.equal(quoteSchema.safeParse({ ...form, sourcePath }).success, false);
});

test('partner links permit only safe HTTPS company URLs', () => {
  assert.equal(safePartnerWebsite('https://partner.example/about'), 'https://partner.example/about');
  for (const value of ['javascript:alert(1)', 'http://partner.example', 'https://user:secret@partner.example', '/contact']) assert.equal(safePartnerWebsite(value), undefined);
});

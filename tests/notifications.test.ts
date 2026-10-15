import { after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { LocalStorage } from '../src/lib/server/local';
import { contactRecipientEmail, emailConfigured, notifyQuote, quoteSourceUrl } from '../src/lib/server/notifications';
import type { Quote } from '../src/lib/server/types';

const directory = mkdtempSync(join(tmpdir(), 'artmaster-mail-'));
const originalFetch = globalThis.fetch;
const names = ['RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'CONTACT_RECIPIENT_EMAIL', 'QUOTE_NOTIFICATION_EMAIL', 'CONTACT_SEND_CONFIRMATION', 'ARTMASTER_DATA_DIR', 'ARTMASTER_STORAGE', 'SITE_URL'] as const;
const original = Object.fromEntries(names.map(name => [name, process.env[name]]));
const store = new LocalStorage();
function configure() {
  process.env.ARTMASTER_DATA_DIR = directory; process.env.ARTMASTER_STORAGE = 'local'; process.env.SITE_URL = 'https://artmaster.md';
  process.env.RESEND_API_KEY = 'test-only-provider-key'; process.env.RESEND_FROM_EMAIL = 'ARTMASTER <sender@example.invalid>';
  process.env.CONTACT_RECIPIENT_EMAIL = 'recipient@example.invalid';
  delete process.env.CONTACT_SEND_CONFIRMATION;
}
afterEach(() => { globalThis.fetch = originalFetch; for (const name of names) { if (original[name] === undefined) delete process.env[name]; else process.env[name] = original[name]; } });
after(async () => { await rm(directory, { recursive: true, force: true }); });
async function savedQuote(locale = 'ro'): Promise<Quote> {
  const quote: Quote = { id: randomUUID(), idempotencyKey: randomUUID(), payloadHash: 'mail-fixture', locale, service: 'colantare-auto', name: 'Ion Șerban Язык <script>', email: 'customer@example.invalid', phone: '+37360010400', message: 'Vitrină & autocolant\nРусский English', company: 'Companie', dimensions: '120 × 80 cm', quantity: '2', deadline: '2027-01-15', sourcePath: `/${locale}/contact`, createdAt: '2026-10-14T10:00:00.000Z', status: 'new', files: [], notification: 'pending' };
  await store.createQuote(quote, []); return quote;
}

test('recipient configuration supports the new name, the old alias and rejects header injection', () => {
  configure(); process.env.QUOTE_NOTIFICATION_EMAIL = 'legacy@example.invalid';
  assert.equal(contactRecipientEmail(), 'recipient@example.invalid'); delete process.env.CONTACT_RECIPIENT_EMAIL;
  assert.equal(contactRecipientEmail(), 'legacy@example.invalid');
  process.env.CONTACT_RECIPIENT_EMAIL = 'victim@example.invalid\r\nBcc: attacker@example.invalid';
  assert.equal(emailConfigured(), false);
});

test('accepted company mail contains UTF-8 details, time, safe source URL, Reply-To and distinct idempotency keys', async () => {
  configure(); const quote = await savedQuote(); const calls: { body: Record<string, unknown>; key: string | null }[] = [];
  globalThis.fetch = async (_url, init) => { calls.push({ body: JSON.parse(String(init?.body)), key: new Headers(init?.headers).get('Idempotency-Key') }); return Response.json({ id: 'mock-provider-accepted' }); };
  assert.equal(await notifyQuote(quote), 'sent'); assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].body.to, ['recipient@example.invalid']); assert.equal(calls[0].body.reply_to, quote.email);
  assert.equal(calls[0].body.from, 'ARTMASTER <sender@example.invalid>');
  for (const text of [quote.phone, quote.createdAt, '120 × 80 cm', 'Русский English', 'https://artmaster.md/ro/contact', 'Colantare auto']) assert.ok(String(calls[0].body.text).includes(text));
  assert.ok(String(calls[0].body.html).includes('&lt;script&gt;')); assert.ok(!String(calls[0].body.html).includes('<script>'));
  assert.deepEqual(calls[1].body.to, [quote.email]); assert.equal(calls[1].body.reply_to, 'recipient@example.invalid');
  assert.notEqual(calls[0].key, calls[1].key); assert.equal((await store.getQuote(quote.id))?.notification, 'sent');
});

test('provider rejection keeps a persisted pending request and does not send customer confirmation', async () => {
  configure(); const quote = await savedQuote('ru'); let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ error: 'mock-rejection' }, { status: 503 }); };
  assert.equal(await notifyQuote(quote), 'pending'); assert.equal(calls, 1);
  assert.equal((await store.getQuote(quote.id))?.notification, 'pending');
});

test('network failure and rejected confirmation remain pending rather than reporting email acceptance', async () => {
  configure(); const quote = await savedQuote('en');
  globalThis.fetch = async () => { throw new Error('mock-network-failure'); };
  assert.equal(await notifyQuote(quote), 'pending');
  let calls = 0; globalThis.fetch = async () => Response.json({}, { status: ++calls === 1 ? 200 : 429 });
  assert.equal(await notifyQuote(quote), 'pending'); assert.equal(calls, 2);
});

test('optional confirmation can be disabled; missing provider does not make any network request', async () => {
  configure(); const quote = await savedQuote(); process.env.CONTACT_SEND_CONFIRMATION = 'false'; let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ id: 'mock' }); };
  assert.equal(await notifyQuote(quote), 'sent'); assert.equal(calls, 1);
  delete process.env.RESEND_API_KEY;
  assert.equal(await notifyQuote({ ...quote, notification: 'not_configured' }), 'not_configured'); assert.equal(calls, 1);
});

test('old persisted requests receive a safe fallback page; external or private source paths cannot be used', () => {
  configure(); assert.equal(quoteSourceUrl({ locale: 'ru' }), 'https://artmaster.md/ru/solicita-oferta');
  for (const sourcePath of ['https://attacker.invalid/', '//attacker.invalid', '/admin', '/ro/contact?private=secret']) assert.equal(quoteSourceUrl({ locale: 'en', sourcePath }), 'https://artmaster.md/en/solicita-oferta');
});

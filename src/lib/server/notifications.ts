import { z } from 'zod';
import { defaultContent } from '../content/defaults';
import { getStorage } from './storage';
import { publicOrigin } from './config';
import type { Quote } from './types';

export function contactRecipientEmail() {
  const value = (process.env.CONTACT_RECIPIENT_EMAIL || process.env.QUOTE_NOTIFICATION_EMAIL || 'office@artmaster.md').trim();
  return z.email().max(254).safeParse(value).success ? value : undefined;
}
export function emailConfigured() { return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL && contactRecipientEmail()); }
function escape(value: string) { return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!)); }

export function quoteSourceUrl(quote: Pick<Quote, 'locale' | 'sourcePath'>) {
  const fallback = `/${['ro', 'ru', 'en'].includes(quote.locale) ? quote.locale : 'ro'}/solicita-oferta`;
  const valid = quote.sourcePath && /^\/(ro|ru|en)(?:\/(?:contact|solicita-oferta))?\/?$/.test(quote.sourcePath);
  return publicOrigin() + (valid ? quote.sourcePath : fallback);
}

export async function notifyQuote(quote: Quote): Promise<Quote['notification']> {
  if (!emailConfigured()) return quote.notification;
  const storage = getStorage();
  const recipient = contactRecipientEmail()!;
  const send = (body: Record<string, unknown>, key: string) => fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
    signal: AbortSignal.timeout(10000), body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL, ...body }),
  });
  try {
    const content = (await storage.content()).published || defaultContent;
    const service = content.services.find(item => item.slug === quote.service)?.title.ro || quote.service;
    const fields = [
      ['Serviciu', service], ['Nume', quote.name], ['E-mail', quote.email], ['Telefon', quote.phone],
      ['Companie', quote.company || '—'], ['Dimensiuni', quote.dimensions || '—'], ['Cantitate', quote.quantity || '—'], ['Termen dorit', quote.deadline || '—'],
      ['Data înregistrării (UTC)', quote.createdAt], ['Limba', quote.locale.toUpperCase()], ['Pagina de origine', quoteSourceUrl(quote)],
    ];
    const text = [`Cerere de ofertă ${quote.id}`, ...fields.map(([label, value]) => `${label}: ${value}`), '', quote.message, '', `${quote.files.length} fișiere private. Consultă cererea în panoul administrativ.`].join('\n');
    const html = `<h1>Cerere de ofertă ${escape(quote.id)}</h1><dl>${fields.map(([label, value]) => `<dt>${escape(label)}</dt><dd>${escape(value)}</dd>`).join('')}</dl><p>${escape(quote.message).replace(/\n/g, '<br>')}</p><p>${quote.files.length} fișiere private. Consultă cererea în panoul administrativ.</p>`;
    const response = await send({ to: [recipient], reply_to: quote.email, subject: `ARTMASTER — cerere ${quote.id}`, html, text }, `artmaster-quote-${quote.id}`);
    if (!response.ok) { await storage.markNotification(quote.id, false, `http_${response.status}`); return 'pending'; }
    if (process.env.CONTACT_SEND_CONFIRMATION !== 'false') {
      const messages = {
        ro: { subject: 'Am înregistrat cererea ta de ofertă — ARTMASTER', greeting: 'Am înregistrat cererea ta. Echipa ARTMASTER va analiza detaliile și te va contacta.', reference: 'Referința cererii', contact: `Pentru completări, răspunde la acest mesaj sau sună la ${content.contact.phone}.` },
        ru: { subject: 'Ваша заявка зарегистрирована — ARTMASTER', greeting: 'Ваша заявка зарегистрирована. Команда ARTMASTER рассмотрит детали и свяжется с вами.', reference: 'Номер заявки', contact: `Чтобы дополнить заявку, ответьте на это письмо или позвоните ${content.contact.phone}.` },
        en: { subject: 'Your quote request has been registered — ARTMASTER', greeting: 'Your request has been registered. The ARTMASTER team will review the details and contact you.', reference: 'Request reference', contact: `To add details, reply to this email or call ${content.contact.phone}.` },
      };
      const copy = messages[quote.locale as keyof typeof messages] || messages.ro;
      const confirmation = await send({ to: [quote.email], reply_to: recipient, subject: copy.subject, html: `<p>${escape(copy.greeting)}</p><p>${escape(copy.reference)}: <strong>${escape(quote.id)}</strong></p><p>${escape(copy.contact)}</p>`, text: `${copy.greeting}\n${copy.reference}: ${quote.id}\n${copy.contact}` }, `artmaster-confirmation-${quote.id}`);
      if (!confirmation.ok) { await storage.markNotification(quote.id, false, `confirmation_http_${confirmation.status}`); return 'pending'; }
    }
    await storage.markNotification(quote.id, true);
    // "sent" means accepted by the provider; inbox delivery is not verified here.
    return 'sent';
  } catch { await storage.markNotification(quote.id, false, 'provider_unavailable').catch(() => {}); return 'pending'; }
}
export async function retryNotifications() {
  if (!emailConfigured()) return { checked: 0, sent: 0, configured: false };
  const pending = await getStorage().pendingNotifications();
  let sent = 0;
  for (const quote of pending) if (await notifyQuote(quote) === 'sent') sent++;
  return { checked: pending.length, sent, configured: true };
}

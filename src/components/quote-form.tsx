'use client';
import { usePublicPreview } from './public-runtime';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { Contact, Locale, Service } from '@/lib/content/types';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_TOTAL_SIZE = 10 * 1024 * 1024;
const MIN_TOKEN_AGE = 1250;
const TOKEN_LIFETIME = 2 * 60 * 60 * 1000;
const acceptedTypes = new Set(['application/pdf', 'image/png', 'image/jpeg']);
type Field = 'service' | 'name' | 'email' | 'phone' | 'message' | 'consent' | 'files' | 'company' | 'dimensions' | 'quantity' | 'deadline';
type FieldErrors = Partial<Record<Field, string>>;
type FormToken = { token: string; idempotencyKey: string; receivedAt: number };
type Receipt = { id: string; notification: 'pending' | 'sent' | 'not_configured'; duplicate?: boolean };

const copy = {
  ro: {
    service: 'Serviciu', choose: 'Alege serviciul', name: 'Nume', email: 'E-mail', phone: 'Telefon',
    details: 'Detalii suplimentare despre proiect (opțional)', company: 'Companie', dimensions: 'Dimensiuni', quantity: 'Cantitate', deadline: 'Termen dorit',
    dimensionsPlaceholder: 'De exemplu, 120 × 80 cm',
    message: 'Descrie proiectul', messagePlaceholder: 'Ce dorești să realizăm? Include dimensiunile, cantitatea și termenul dorit.',
    files: 'Atașează fișiere', chooseFiles: 'Alege fișiere', noFiles: 'Nu ai selectat fișiere.', fileHint: 'Până la 3 fișiere PDF, PNG sau JPG. Maximum 5 MB per fișier și 10 MB în total. PDF: maximum 200 pagini; imagini statice: maximum 30 MP și 10.000 px/latură.',
    consent: 'Sunt de acord cu prelucrarea datelor pentru a primi o ofertă, conform', privacy: 'politicii de confidențialitate',
    submit: 'Solicită o ofertă', sending: 'Se trimite…', success: 'Cererea a fost înregistrată.', reference: 'Referință',
    required: 'Completează acest câmp.', invalidEmail: 'Introdu o adresă de e-mail validă.', invalidPhone: 'Introdu un număr de telefon valid.',
    invalidName: 'Introdu numele tău (maximum 100 de caractere).', invalidMessage: 'Descrie proiectul în cel mult 5.000 de caractere.',
    invalidCompany: 'Numele companiei poate avea cel mult 150 de caractere.', invalidDimensions: 'Descrie dimensiunile în cel mult 200 de caractere.',
    invalidQuantity: 'Introdu o cantitate între 1 și 9.999.999, fără zecimale.', invalidDeadline: 'Alege o dată validă.',
    invalidService: 'Alege un serviciu din listă.', invalidConsent: 'Acordul pentru prelucrarea datelor este necesar pentru trimitere.',
    tooManyFiles: 'Poți atașa cel mult 3 fișiere.', invalidFile: 'Sunt acceptate doar fișiere PDF, PNG și JPG.',
    largeFile: 'Fiecare fișier trebuie să aibă cel mult 5 MB.', largeTotal: 'Fișierele atașate trebuie să aibă în total cel mult 10 MB.',
    generic: 'Cererea nu a putut fi înregistrată. Verifică datele și încearcă din nou.',
    unavailable: 'Formularul este temporar indisponibil. Contactează-ne prin e-mail sau telefon.',
    network: 'Conexiunea a fost întreruptă. Verifică internetul și încearcă din nou.',
    rateLimited: 'Ai trimis prea multe cereri într-un timp scurt. Așteaptă câteva minute și încearcă din nou.',
    expired: 'Sesiunea formularului a expirat. Încearcă din nou; datele completate sunt păstrate.',
    reviewFields: 'Verifică câmpurile marcate înainte de trimitere.',
  },
  ru: {
    service: 'Услуга', choose: 'Выберите услугу', name: 'Имя', email: 'Электронная почта', phone: 'Телефон',
    details: 'Дополнительные сведения о проекте (необязательно)', company: 'Компания', dimensions: 'Размеры', quantity: 'Количество', deadline: 'Желаемый срок',
    dimensionsPlaceholder: 'Например, 120 × 80 см',
    message: 'Расскажите о проекте', messagePlaceholder: 'Что вы хотите изготовить? Укажите размеры, количество и желаемый срок.',
    files: 'Прикрепите файлы', chooseFiles: 'Выбрать файлы', noFiles: 'Файлы не выбраны.', fileHint: 'До 3 файлов PDF, PNG или JPG. Не более 5 МБ на файл и 10 МБ суммарно. PDF: до 200 страниц; статичные изображения: до 30 Мп и 10 000 пикселей по стороне.',
    consent: 'Я согласен на обработку данных для получения предложения в соответствии с', privacy: 'политикой конфиденциальности',
    submit: 'Запросить предложение', sending: 'Отправка…', success: 'Заявка зарегистрирована.', reference: 'Номер заявки',
    required: 'Заполните это поле.', invalidEmail: 'Введите корректный адрес электронной почты.', invalidPhone: 'Введите корректный номер телефона.',
    invalidName: 'Введите имя (не более 100 символов).', invalidMessage: 'Опишите проект: не более 5 000 символов.',
    invalidCompany: 'Название компании не должно превышать 150 символов.', invalidDimensions: 'Опишите размеры: не более 200 символов.',
    invalidQuantity: 'Введите целое число от 1 до 9 999 999.', invalidDeadline: 'Выберите корректную дату.',
    invalidService: 'Выберите услугу из списка.', invalidConsent: 'Для отправки необходимо согласие на обработку данных.',
    tooManyFiles: 'Можно прикрепить не более 3 файлов.', invalidFile: 'Допускаются только файлы PDF, PNG и JPG.',
    largeFile: 'Размер каждого файла не должен превышать 5 МБ.', largeTotal: 'Общий размер файлов не должен превышать 10 МБ.',
    generic: 'Не удалось зарегистрировать заявку. Проверьте данные и попробуйте снова.',
    unavailable: 'Форма временно недоступна. Свяжитесь с нами по электронной почте или телефону.',
    network: 'Соединение прервано. Проверьте подключение к интернету и попробуйте снова.',
    rateLimited: 'За короткое время отправлено слишком много запросов. Подождите несколько минут и попробуйте снова.',
    expired: 'Сессия формы истекла. Попробуйте снова; введённые данные сохранены.',
    reviewFields: 'Проверьте отмеченные поля перед отправкой.',
  },
  en: {
    service: 'Service', choose: 'Choose a service', name: 'Name', email: 'Email', phone: 'Phone',
    details: 'Additional project details (optional)', company: 'Company', dimensions: 'Dimensions', quantity: 'Quantity', deadline: 'Preferred deadline',
    dimensionsPlaceholder: 'For example, 120 × 80 cm',
    message: 'Tell us about your project', messagePlaceholder: 'What would you like us to create? Include dimensions, quantity and your preferred deadline.',
    files: 'Attach files', chooseFiles: 'Choose files', noFiles: 'No files selected.', fileHint: 'Up to 3 PDF, PNG or JPG files. Maximum 5 MB per file and 10 MB in total. PDF: up to 200 pages; static images: up to 30 MP and 10,000 px per side.',
    consent: 'I agree to the processing of my data to receive a quote, under the', privacy: 'privacy policy',
    submit: 'Request a quote', sending: 'Sending…', success: 'Your request has been registered.', reference: 'Reference',
    required: 'Complete this field.', invalidEmail: 'Enter a valid email address.', invalidPhone: 'Enter a valid phone number.',
    invalidName: 'Enter your name (up to 100 characters).', invalidMessage: 'Describe your project in up to 5,000 characters.',
    invalidCompany: 'The company name must be no longer than 150 characters.', invalidDimensions: 'Describe dimensions in up to 200 characters.',
    invalidQuantity: 'Enter a whole number between 1 and 9,999,999.', invalidDeadline: 'Choose a valid date.',
    invalidService: 'Choose a service from the list.', invalidConsent: 'Consent to data processing is required to submit your request.',
    tooManyFiles: 'You can attach up to 3 files.', invalidFile: 'Only PDF, PNG and JPG files are accepted.',
    largeFile: 'Each file must be no larger than 5 MB.', largeTotal: 'Attached files must total no more than 10 MB.',
    generic: 'Your request could not be registered. Check your details and try again.',
    unavailable: 'The form is temporarily unavailable. Please contact us by email or phone.',
    network: 'The connection was interrupted. Check your internet connection and try again.',
    rateLimited: 'Too many requests have been sent in a short time. Wait a few minutes and try again.',
    expired: 'Your form session has expired. Try again; your details have been kept.',
    reviewFields: 'Check the highlighted fields before submitting.',
  },
} as const;

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
    signal.addEventListener('abort', abort, { once: true });
  });
}

function LiveQuoteForm({ locale, services, contact, compact = false, initialService = '' }: { locale: Locale; services: Service[]; contact: Pick<Contact, 'phone' | 'email'>; compact?: boolean; initialService?: string }) {
  const t = copy[locale];
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const tokenRef = useRef<FormToken | null>(null);
  const tokenRequestRef = useRef<Promise<FormToken> | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const submittingRef = useRef(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  async function getToken(signal: AbortSignal): Promise<FormToken> {
    if (tokenRef.current && Date.now() - tokenRef.current.receivedAt < TOKEN_LIFETIME - 30_000) return tokenRef.current;
    if (tokenRequestRef.current) return tokenRequestRef.current;
    const promise = (async () => {
      const response = await fetch('/api/quote-token', { method: 'GET', cache: 'no-store', credentials: 'same-origin', signal });
      if (response.status === 429) throw new Error('token_rate_limited');
      if (!response.ok) throw new Error('token_unavailable');
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== 'object' || !('token' in payload) || !('idempotencyKey' in payload)
        || typeof payload.token !== 'string' || typeof payload.idempotencyKey !== 'string') throw new Error('token_unavailable');
      const issued = { token: payload.token, idempotencyKey: payload.idempotencyKey, receivedAt: Date.now() };
      tokenRef.current = issued;
      return issued;
    })();
    tokenRequestRef.current = promise;
    try { return await promise; }
    finally { if (tokenRequestRef.current === promise) tokenRequestRef.current = null; }
  }

  useEffect(() => {
    const controller = new AbortController();
    void getToken(controller.signal).catch(() => { /* Retry when the visitor submits. */ });
    return () => { controller.abort(); requestRef.current?.abort(); };
  }, []);

  function fileError(files: File[]) {
    if (files.length > 3) return t.tooManyFiles;
    if (files.some(file => !acceptedTypes.has(file.type) || !/\.(pdf|png|jpe?g)$/i.test(file.name))) return t.invalidFile;
    if (files.some(file => file.size > MAX_FILE_SIZE)) return t.largeFile;
    if (files.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_SIZE) return t.largeTotal;
    return undefined;
  }

  function validate(data: FormData): FieldErrors {
    const issues: FieldErrors = {};
    const value = (key: Field) => String(data.get(key) ?? '').trim();
    if (!services.some(service => service.slug === value('service'))) issues.service = t.invalidService;
    if (value('name').length < 1 || value('name').length > 100) issues.name = t.invalidName;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value('email')) || value('email').length > 254) issues.email = t.invalidEmail;
    if (!/^[+0-9 ()-]{6,30}$/.test(value('phone'))) issues.phone = t.invalidPhone;
    if (value('message').length < 1 || value('message').length > 5000) issues.message = t.invalidMessage;
    if (value('company').length > 150) issues.company = t.invalidCompany;
    if (value('dimensions').length > 200) issues.dimensions = t.invalidDimensions;
    const quantity = value('quantity');
    if (quantity && (!/^\d+$/.test(quantity) || Number(quantity) < 1 || Number(quantity) > 9_999_999)) issues.quantity = t.invalidQuantity;
    const deadline = value('deadline');
    if (deadline) {
      const date = new Date(`${deadline}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== deadline) issues.deadline = t.invalidDeadline;
    }
    if (data.get('consent') !== 'true') issues.consent = t.invalidConsent;
    const files = data.getAll('files').filter((entry): entry is File => entry instanceof File && entry.size > 0);
    const attachmentError = fileError(files);
    if (attachmentError) issues.files = attachmentError;
    return issues;
  }

  function translatedFieldError(field: Field, code?: unknown): string {
    const messages: Record<Field, string> = {
      service: t.invalidService, name: t.invalidName, email: t.invalidEmail, phone: t.invalidPhone,
      message: t.invalidMessage, consent: t.invalidConsent, files: t.invalidFile,
      company: t.invalidCompany, dimensions: t.invalidDimensions, quantity: t.invalidQuantity, deadline: t.invalidDeadline,
    };
    const value = typeof code === 'string' ? code.toLowerCase() : '';
    if (field === 'files') {
      if (/count|many/.test(value)) return t.tooManyFiles;
      if (/total/.test(value)) return t.largeTotal;
      if (/size|large/.test(value)) return t.largeFile;
    }
    return messages[field];
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || receipt) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const issues = validate(data);
    setErrors(issues);
    setUnavailable(false);
    if (Object.keys(issues).length) {
      setStatus(t.reviewFields);
      const firstField = Object.keys(issues)[0];
      const firstInput = form.querySelector<HTMLElement>(`[name="${firstField}"]`);
      const detailGroup = firstInput?.closest('details');
      if (detailGroup) detailGroup.open = true;
      firstInput?.focus();
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setStatus('');
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const issued = await getToken(controller.signal);
      const age = Date.now() - issued.receivedAt;
      if (age < MIN_TOKEN_AGE) await delay(MIN_TOKEN_AGE - age, controller.signal);
      data.set('token', issued.token);
      data.set('idempotencyKey', issued.idempotencyKey);
      data.set('locale', locale);
      data.set('sourcePath', window.location.pathname);
      for (const [field, value] of [...data.entries()]) {
        if (value instanceof File && value.size === 0 && !value.name) data.delete(field);
      }
      const response = await fetch('/api/quotes', {
        method: 'POST', body: data, credentials: 'same-origin', signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      const result = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
      if (response.ok && typeof result.id === 'string' && result.id
        && ['pending', 'sent', 'not_configured'].includes(String(result.notification))) {
        setReceipt({ id: result.id, notification: result.notification as Receipt['notification'], duplicate: result.duplicate === true });
        window.dispatchEvent(new Event('artmaster:quote-saved'));
        setStatus(t.success);
        tokenRef.current = null;
        requestAnimationFrame(() => statusRef.current?.focus());
        return;
      }
      const code = typeof result.code === 'string' ? result.code.toLowerCase() : '';
      if (result.fieldErrors && typeof result.fieldErrors === 'object') {
        const translated: FieldErrors = {};
        for (const field of ['service', 'name', 'email', 'phone', 'message', 'consent', 'files', 'company', 'dimensions', 'quantity', 'deadline'] as const) {
          const detail = (result.fieldErrors as Record<string, unknown>)[field];
          if (detail) translated[field] = translatedFieldError(field, Array.isArray(detail) ? detail[0] : detail);
        }
        setErrors(translated);
      }
      if (response.status === 503 || response.status >= 500) {
        setUnavailable(true); setStatus(t.unavailable);
      } else if (response.status === 429) setStatus(t.rateLimited);
      else if (response.status === 413) { setErrors({ files: t.largeTotal }); setStatus(t.largeTotal); }
      else if (/token|expired|session|idempotency_conflict|too_fast/.test(code)) {
        tokenRef.current = null;
        setStatus(t.expired);
      } else setStatus(t.generic);
      requestAnimationFrame(() => statusRef.current?.focus());
    } catch (error) {
      if (error instanceof Error && error.message === 'token_rate_limited') {
        setStatus(t.rateLimited);
      } else if (error instanceof Error && error.message === 'token_unavailable') {
        setUnavailable(true); setStatus(t.unavailable);
      } else setStatus(t.network);
      requestAnimationFrame(() => statusRef.current?.focus());
    } finally {
      clearTimeout(timeout);
      submittingRef.current = false;
      setSubmitting(false);
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  const fieldError = (field: Field) => errors[field]
    ? <span className="field-error" id={`${id}-${field}-error`}>{errors[field]}</span> : null;
  const description = (field: Field) => errors[field] ? `${id}-${field}-error` : undefined;

  return (
    <form ref={formRef} className={`quote-form${compact ? ' quote-form-compact' : ''}`} onSubmit={onSubmit} noValidate aria-busy={submitting}>
      {receipt ? (
        <div className="form-status form-status-success" role="status" tabIndex={-1} ref={statusRef}>
          <p>{t.success}</p>
          <p>{t.reference}: <strong>{receipt.id}</strong></p>
        </div>
      ) : (
        <>
          <input type="hidden" name="locale" value={locale} />
          <div aria-hidden="true" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>
            <label htmlFor={`${id}-website`}>Website</label>
            <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor={`${id}-name`}>{t.name} <span aria-hidden="true">*</span></label>
              <input id={`${id}-name`} name="name" required maxLength={100} autoComplete="name" disabled={submitting} aria-invalid={!!errors.name} aria-describedby={description('name')} />
              {fieldError('name')}
            </div>
            <div className="field">
              <label htmlFor={`${id}-phone`}>{t.phone} <span aria-hidden="true">*</span></label>
              <input id={`${id}-phone`} name="phone" type="tel" required maxLength={30} autoComplete="tel" disabled={submitting} aria-invalid={!!errors.phone} aria-describedby={description('phone')} />
              {fieldError('phone')}
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor={`${id}-email`}>{t.email} <span aria-hidden="true">*</span></label>
              <input id={`${id}-email`} name="email" type="email" required maxLength={254} autoComplete="email" disabled={submitting} aria-invalid={!!errors.email} aria-describedby={description('email')} />
              {fieldError('email')}
            </div>
            <div className="field">
              <label htmlFor={`${id}-service`}>{t.service} <span aria-hidden="true">*</span></label>
              <select id={`${id}-service`} name="service" required defaultValue={services.some(service => service.slug === initialService) ? initialService : ''} disabled={submitting} aria-invalid={!!errors.service} aria-describedby={description('service')}>
                <option value="" disabled>{t.choose}</option>
                {services.map(service => <option key={service.slug} value={service.slug}>{service.title[locale]}</option>)}
              </select>
              {fieldError('service')}
            </div>
          </div>
          <details className="quote-details" open={!compact}>
            <summary>{t.details}</summary>
            <div className="form-grid">
              <div className="field">
                <label htmlFor={`${id}-company`}>{t.company}</label>
                <input id={`${id}-company`} name="company" maxLength={150} autoComplete="organization" disabled={submitting} aria-invalid={!!errors.company} aria-describedby={description('company')} />
                {fieldError('company')}
              </div>
              <div className="field">
                <label htmlFor={`${id}-dimensions`}>{t.dimensions}</label>
                <input id={`${id}-dimensions`} name="dimensions" maxLength={200} placeholder={t.dimensionsPlaceholder} disabled={submitting} aria-invalid={!!errors.dimensions} aria-describedby={description('dimensions')} />
                {fieldError('dimensions')}
              </div>
              <div className="field">
                <label htmlFor={`${id}-quantity`}>{t.quantity}</label>
                <input id={`${id}-quantity`} name="quantity" type="number" min={1} max={9999999} step={1} inputMode="numeric" disabled={submitting} aria-invalid={!!errors.quantity} aria-describedby={description('quantity')} />
                {fieldError('quantity')}
              </div>
              <div className="field">
                <label htmlFor={`${id}-deadline`}>{t.deadline}</label>
                <input id={`${id}-deadline`} name="deadline" type="date" disabled={submitting} aria-invalid={!!errors.deadline} aria-describedby={description('deadline')} />
                {fieldError('deadline')}
              </div>
            </div>
          </details>
          <div className="field">
            <label htmlFor={`${id}-message`}>{t.message} <span aria-hidden="true">*</span></label>
            <textarea id={`${id}-message`} name="message" required maxLength={5000} rows={compact ? 3 : 5} placeholder={t.messagePlaceholder} disabled={submitting} aria-invalid={!!errors.message} aria-describedby={description('message')} />
            {fieldError('message')}
          </div>
          <div className="field">
            <label id={`${id}-files-label`} htmlFor={`${id}-files`}>{t.files}</label>
            <div className="file-upload">
            <input id={`${id}-files`} className="file-upload-input" aria-labelledby={`${id}-files-label`} name="files" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" disabled={submitting} aria-invalid={!!errors.files} aria-describedby={`${id}-files-hint${errors.files ? ` ${id}-files-error` : ''}`} onChange={event => {
              const selected = Array.from(event.currentTarget.files ?? []);
              setFileNames(selected.map(file => file.name));
              const error = fileError(selected);
              setErrors(previous => ({ ...previous, files: error }));
            }} />
              <label className="file-upload-action" htmlFor={`${id}-files`}>{t.chooseFiles}</label>
              <span className="file-upload-names" aria-live="polite">{fileNames.length ? fileNames.join(', ') : t.noFiles}</span>
            </div>
            <small id={`${id}-files-hint`}>{t.fileHint}</small>
            {fieldError('files')}
          </div>
          <div className="field consent-field">
            <label htmlFor={`${id}-consent`}>
              <input id={`${id}-consent`} name="consent" type="checkbox" value="true" required disabled={submitting} aria-invalid={!!errors.consent} aria-describedby={description('consent')} />
              <span>{t.consent} <a href={`/${locale}/confidentialitate`}>{t.privacy}</a>.</span>
            </label>
            {fieldError('consent')}
          </div>
          {status && <div className="form-status form-status-error" role="alert" tabIndex={-1} ref={statusRef}>
            <p>{status}</p>
            {unavailable && <p><a href={'mailto:'+contact.email}>{contact.email}</a> · <a href={'tel:'+contact.phone}>{contact.phone}</a></p>}
          </div>}
          <button className="button button-primary" type="submit" disabled={submitting}>{submitting ? t.sending : t.submit}</button>
        </>
      )}
    </form>
  );
}

export function QuoteForm(props: Parameters<typeof LiveQuoteForm>[0]) {
 const preview=usePublicPreview();
 return preview?<div className="empty-state" role="note">Previzualizare protejată · formularul de ofertă este dezactivat. / Preview · enquiries are disabled.</div>:<LiveQuoteForm {...props}/>;
}

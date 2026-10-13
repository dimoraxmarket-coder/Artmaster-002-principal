import { getStorage } from './storage';
import type { Quote } from './types';
export function emailConfigured(){return Boolean(process.env.RESEND_API_KEY&&process.env.RESEND_FROM_EMAIL);}
function escape(value:string){return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
export async function notifyQuote(quote:Quote):Promise<Quote['notification']>{
  if(!emailConfigured())return quote.notification;
  const storage=getStorage();
  try {
    const response=await fetch('https://api.resend.com/emails',{
      method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`artmaster-quote-${quote.id}`},
      signal:AbortSignal.timeout(10000),body:JSON.stringify({
        from:process.env.RESEND_FROM_EMAIL,to:[process.env.QUOTE_NOTIFICATION_EMAIL||'office@artmaster.md'],reply_to:quote.email,
        subject:`ARTMASTER — cerere ${quote.id}`,
        html:`<h1>Cerere de ofertă ${escape(quote.id)}</h1><p>Serviciu: ${escape(quote.service)}</p><p>Nume: ${escape(quote.name)}</p><p>Email: ${escape(quote.email)}</p><p>Telefon: ${escape(quote.phone)}</p><p>${escape(quote.message).replace(/\n/g,'<br>')}</p><p>${quote.files.length} fișiere private. Deschide panoul administrativ pentru consultare.</p>`,
      }),
    });
    if(!response.ok){await storage.markNotification(quote.id,false,`http_${response.status}`);return 'pending';}
    const messages={ro:{subject:'Am înregistrat cererea ta de ofertă — ARTMASTER',greeting:'Am înregistrat cererea ta. Echipa ARTMASTER va analiza detaliile și te va contacta.',reference:'Referința cererii',contact:'Pentru completări, răspunde la acest mesaj sau sună la +373 600 10 400.'},ru:{subject:'Ваша заявка зарегистрирована — ARTMASTER',greeting:'Ваша заявка зарегистрирована. Команда ARTMASTER рассмотрит детали и свяжется с вами.',reference:'Номер заявки',contact:'Чтобы дополнить заявку, ответьте на это письмо или позвоните +373 600 10 400.'},en:{subject:'Your quote request has been registered — ARTMASTER',greeting:'Your request has been registered. The ARTMASTER team will review the details and contact you.',reference:'Request reference',contact:'To add details, reply to this email or call +373 600 10 400.'}};
    const copy=messages[quote.locale as keyof typeof messages]||messages.ro;
    const confirmation=await fetch('https://api.resend.com/emails',{
      method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`artmaster-confirmation-${quote.id}`},signal:AbortSignal.timeout(10000),
      body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL,to:[quote.email],reply_to:process.env.QUOTE_NOTIFICATION_EMAIL||'office@artmaster.md',subject:copy.subject,html:`<p>${copy.greeting}</p><p>${copy.reference}: <strong>${escape(quote.id)}</strong></p><p>${copy.contact}</p>`}),
    });
    if(!confirmation.ok){await storage.markNotification(quote.id,false,`confirmation_http_${confirmation.status}`);return 'pending';}
    await storage.markNotification(quote.id,true);return 'sent';
  }catch{await storage.markNotification(quote.id,false,'provider_unavailable').catch(()=>{});return 'pending';}
}
export async function retryNotifications(){if(!emailConfigured())return {checked:0,sent:0,configured:false};const pending=await getStorage().pendingNotifications();let sent=0;for(const quote of pending)if(await notifyQuote(quote)==='sent')sent++;return {checked:pending.length,sent,configured:true};}

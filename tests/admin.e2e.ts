import { test,expect,request as playwrightRequest,type APIRequestContext,type BrowserContext,type Page } from './browser-fixtures';
import { randomUUID,randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { resolve,join } from 'node:path';
import { unlink,mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument } from 'pdf-lib';
import type { SiteContent } from '../src/lib/content/types';

const baseURL=process.env.PLAYWRIGHT_BASE_URL||'http://127.0.0.1:3100';
const directory=resolve(process.env.ARTMASTER_DATA_DIR||'.data/e2e');
const nonce=randomUUID().slice(0,8);
const accounts=(['admin','editor','viewer'] as const).map(role=>({role,email:`e2e-${role}-${nonce}@example.invalid`,password:randomBytes(24).toString('base64url'),cookie:''}));
type State={published:SiteContent;draft:SiteContent|null;version:number};
let administrator:APIRequestContext;
let original:State;
let originalRow:{published:string|null;draft:string|null};
const uploaded:string[]=[];
let ownQuote:{id:string;status:string;files:{id:string;path:string;size:number}[]}|undefined;

function database(){const db=new DatabaseSync(join(directory,'artmaster.sqlite'));db.exec('PRAGMA foreign_keys=ON;');return db;}
async function login(role:'admin'|'editor'|'viewer'){
  const account=accounts.find(account=>account.role===role)!;
  const api=await playwrightRequest.newContext({baseURL,extraHTTPHeaders:{Origin:baseURL}});
  const response=await api.post('/api/admin/login',{data:{email:account.email,password:account.password}});
  expect(response.status()).toBe(200);
  const header=response.headers()['set-cookie'];
  expect(header).toMatch(/HttpOnly/i);expect(header).toMatch(/SameSite=Strict/i);expect(header).toMatch(/(?:^|;)\s*Secure(?:;|$)/i);
  const value=header.match(/^artmaster_admin=([^;]+)/)?.[1];expect(value).toBeTruthy();account.cookie=value!;
  await api.dispose();
  return playwrightRequest.newContext({baseURL,extraHTTPHeaders:{Origin:baseURL,Cookie:`artmaster_admin=${account.cookie}`}});
}
async function browserSession(context:BrowserContext){
  // The application retains Secure cookies. HTTP-loopback staging needs this
  // explicit transport fixture; server Set-Cookie flags are asserted above.
  await context.addCookies([{name:'artmaster_admin',value:accounts[0].cookie,domain:new URL(baseURL).hostname,path:'/',httpOnly:true,sameSite:'Strict',secure:false}]);
}
async function saveUI(page:Page,action:'draft'|'publish'){
  const responsePromise=page.waitForResponse(response=>response.url().endsWith('/api/admin/content')&&response.request().method()==='PUT');
  if(action==='publish')page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:action==='draft'?'Salvează ciorna':'Publică această versiune',exact:true}).click();
  expect((await responsePromise).status()).toBe(200);
  await expect(page.locator('.admin-cms')).toContainText(action==='draft'?'Ciorna a fost salvată.':'Versiunea a fost publicată.');
}

test.describe.serial('real local production administration',()=>{
  test.beforeAll(async()=>{
    const readiness=await playwrightRequest.newContext({baseURL});
    try{expect((await readiness.get('/api/quote-token')).status(),'local backend readiness').toBe(200);}finally{await readiness.dispose();}
    const db=database();originalRow=db.prepare('SELECT published,draft FROM content WHERE id=1').get() as typeof originalRow;db.close();
    for(const account of accounts){
      const env={...process.env,ARTMASTER_STORAGE:'local',ARTMASTER_ALLOW_LOCAL_PRODUCTION:'true',ARTMASTER_DATA_DIR:directory,ADMIN_EMAIL:account.email,ADMIN_ROLE:account.role,ADMIN_PASSWORD:''};
      const result=spawnSync(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/create-admin.ts'],{cwd:process.cwd(),env,input:account.password+'\n',encoding:'utf8'});
      expect(result.status,'ephemeral administrator bootstrap').toBe(0);
    }
    administrator=await login('admin');
    const response=await administrator.get('/api/admin/content');expect(response.status()).toBe(200);original=await response.json();
    // Create the attachment through the actual signed public workflow. This
    // suite does not depend on another test having submitted a request first.
    const publicApi=await playwrightRequest.newContext({baseURL,extraHTTPHeaders:{Origin:baseURL}});
    try{
      const tokenResponse=await publicApi.get('/api/quote-token');expect(tokenResponse.status()).toBe(200);const token=await tokenResponse.json();
      const pdf=await PDFDocument.create();pdf.addPage([100,100]);const bytes=Buffer.from(await pdf.save());
      await new Promise(resolve=>setTimeout(resolve,1250));
      const receipt=await publicApi.post('/api/quotes',{multipart:{locale:'ro',service:original.published.services[0].slug,name:'Administration verification',email:`e2e-quote-${nonce}@example.invalid`,phone:'+37360010400',message:'Temporary secure workflow verification',consent:'true',website:'',token:token.token,idempotencyKey:token.idempotencyKey,files:{name:'private-fixture.pdf',mimeType:'application/pdf',buffer:bytes}}});
      expect(receipt.status()).toBe(201);const saved=await receipt.json();expect(saved.id).toMatch(/^[a-f0-9-]{36}$/);
      const quotes=await administrator.get('/api/admin/quotes');expect(quotes.status()).toBe(200);ownQuote=(await quotes.json()).quotes.find((quote:{id:string})=>quote.id===saved.id);expect(ownQuote).toBeTruthy();expect(ownQuote!.files).toHaveLength(1);
    }finally{await publicApi.dispose();}
  });
  test.afterAll(async()=>{
    try{
      if(!original)return;
      await administrator?.dispose();administrator=await login('admin');
      const stateResponse=await administrator.get('/api/admin/content');expect(stateResponse.status()).toBe(200);
      const current:State=await stateResponse.json();
      const restored=await administrator.put('/api/admin/content',{data:{content:original.published,action:'publish',version:current.version}});expect(restored.status()).toBe(200);
      // Restore the original null/draft semantics as well as visible content.
      const db=database();db.prepare('UPDATE content SET published=?,draft=? WHERE id=1').run(originalRow.published,originalRow.draft);db.close();
    }finally{
      const db=database();
      if(ownQuote)db.prepare('DELETE FROM quotes WHERE id=?').run(ownQuote.id);
      for(const account of accounts){const row=db.prepare('SELECT id FROM admins WHERE email=?').get(account.email) as {id:string}|undefined;if(row){db.prepare('DELETE FROM audit WHERE actor=?').run(row.id);db.prepare('DELETE FROM admins WHERE id=?').run(row.id);}}
      db.close();await administrator?.dispose();
      for(const name of uploaded)await unlink(join(directory,'media',name)).catch(()=>{});
      for(const file of ownQuote?.files||[])await unlink(join(directory,'uploads',file.path)).catch(()=>{});
    }
  });

  test('browser contact editor distinguishes draft and publication; stale versions cannot overwrite',async({page,request})=>{
    await browserSession(page.context());await page.goto('/admin#settings');
    await expect(page.getByLabel('Telefon public',{exact:true})).toBeVisible();
    const changedPhone=original.published.contact.phone==='+37360010401'?'+37360010402':'+37360010401';
    await page.getByLabel('Telefon public',{exact:true}).fill(changedPhone);await saveUI(page,'draft');
    const publicDraft=await request.get('/ro/contact');expect(publicDraft.status()).toBe(200);expect(await publicDraft.text()).toContain(`tel:${original.published.contact.phone}`);expect(await publicDraft.text()).not.toContain(`tel:${changedPhone}`);
    await saveUI(page,'publish');const published=await request.get('/ro/contact');expect(await published.text()).toContain(`tel:${changedPhone}`);
    await page.route('**/api/quote-token',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'unavailable'})}));
    await page.goto('/ro/solicita-oferta');
    const form=page.locator('main form');
    await form.locator('[name="name"]').fill('Verificare automatizată indisponibilitate');
    await form.locator('[name="phone"]').fill('+37360010400');
    await form.locator('[name="email"]').fill('e2e@example.invalid');
    await form.locator('[name="service"]').selectOption({index:1});
    await form.locator('[name="message"]').fill('Verificare formular indisponibil; fără cerere comercială.');
    await form.locator('[name="consent"]').check();
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('main form a[href="tel:'+changedPhone+'"]')).toBeVisible();
    await expect(page.locator('main form a[href="mailto:'+original.published.contact.email+'"]')).toBeVisible();
    const state:State=await (await administrator.get('/api/admin/content')).json();
    const first=await administrator.put('/api/admin/content',{data:{content:state.published,action:'save-draft',version:state.version}});expect(first.status()).toBe(200);
    const stale=await administrator.put('/api/admin/content',{data:{content:original.published,action:'publish',version:state.version}});expect(stale.status()).toBe(409);expect(await stale.json()).toMatchObject({code:'version_conflict'});
    const after:State=await (await administrator.get('/api/admin/content')).json();expect(after.published.contact.phone).toBe(changedPhone);
  });

  test('browser gallery uploads sanitized WebP and publishes complete multilingual project',async({page,request})=>{
    await browserSession(page.context());await page.goto('/admin#portfolio');await expect(page.getByLabel('Tipul proiectului',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Adaugă proiect',exact:true}).click();
    await page.getByLabel('Tipul proiectului',{exact:true}).selectOption('concept');
    const title=`Verificare galerie ${nonce}`;
    for(const [locale,label] of [['ro','Română'],['ru','Rusă'],['en','Engleză']] as const){
      await page.getByRole('button',{name:`${locale.toUpperCase()} · ${label}`,exact:true}).click();
      await page.getByLabel(`Titlu — ${label}`,{exact:true}).fill(title);
      await page.getByLabel(`Rezumat — ${label}`,{exact:true}).fill('Concept utilizat temporar pentru verificarea editorului.');
      await page.getByLabel(`Descriere — ${label}`,{exact:true}).fill('Verificare reală a încărcării imaginii, ciornei și publicării.');
    }
    const png=await sharp({create:{width:32,height:24,channels:3,background:'#fbc328'}}).withMetadata().png().toBuffer();
    const uploadPromise=page.waitForResponse(response=>response.url().endsWith('/api/admin/media')&&response.request().method()==='POST');
    await page.getByLabel('Încarcă fotografie PNG / JPEG, maximum 5 MB',{exact:true}).setInputFiles({name:'owned-test.png',mimeType:'image/png',buffer:png});
    const response=await uploadPromise;expect(response.status()).toBe(201);const image:{url:string;width:number;height:number}=await response.json();expect(image).toMatchObject({width:32,height:24});expect(image.url).toMatch(/^\/api\/media\/[a-f0-9-]{36}\.webp$/);uploaded.push(image.url.split('/').pop()!);
    expect((await request.get(image.url)).status()).toBe(404);
    expect((await request.get(`/_next/image?url=${encodeURIComponent(image.url)}&w=640&q=75`)).status()).not.toBe(200);
    expect((await request.get(image.url.replace('/api/media/','/api/admin/media/'))).status()).toBe(401);
    const media=await administrator.get(image.url.replace('/api/media/','/api/admin/media/'));expect(media.status()).toBe(200);expect(media.headers()['content-type']).toBe('image/webp');const metadata=await sharp(await media.body()).metadata();expect(metadata.format).toBe('webp');expect(metadata.exif).toBeUndefined();expect(metadata.icc).toBeUndefined();
    await page.getByLabel('Afișează în portofoliu după publicarea versiunii',{exact:true}).check();await saveUI(page,'draft');
    expect(await (await request.get('/ro/portofoliu')).text()).not.toContain(title);
    await saveUI(page,'publish');
    expect((await request.get(image.url)).status()).toBe(200);
    for(const locale of ['ro','ru','en']){await page.goto(`/${locale}/portofoliu`);await expect(page.locator('main')).toContainText(title);const photo=page.locator(`a[href*="/portofoliu/"]`).filter({hasText:title}).locator('img');await expect(photo).toBeVisible();await expect.poll(()=>photo.evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);}
    const state:State=await (await administrator.get('/api/admin/content')).json(),project=state.published.projects.find(project=>project.title.ro===title)!;expect(project.image).toBe(image.url);expect(project.published).toBe(true);expect(project.kind).toBe('concept');
  });

  test('premium cabinet shows real metrics, filters requests and preserves private detail actions',async({page})=>{
    await browserSession(page.context());await page.setViewportSize({width:1440,height:1000});await page.goto('/admin');
    await expect(page.getByRole('heading',{name:'O zi bună începe cu perspectivă.'})).toBeVisible();
    const response=await administrator.get('/api/admin/quotes');const {quotes}=await response.json();
    await expect(page.getByRole('article').filter({hasText:'Solicitări încărcate'})).toContainText(String(quotes.length).padStart(2,'0'));
    const report=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
    expect(report.violations.filter(value=>value.impact==='serious'||value.impact==='critical')).toEqual([]);
    if(process.env.ARTMASTER_ADMIN_SCREENSHOTS==='1'){await mkdir('docs/screenshots/admin-phase3',{recursive:true});await page.screenshot({path:'docs/screenshots/admin-phase3/dashboard-desktop.png',fullPage:true,animations:'disabled'});}
    await page.getByRole('link',{name:'Mesaje clienți'}).click();
    await page.getByLabel('Caută solicitări').fill(`e2e-quote-${nonce}`);
    await expect(page.getByRole('button',{name:'Deschide solicitarea de la Administration verification'})).toBeVisible();
    if(process.env.ARTMASTER_ADMIN_SCREENSHOTS==='1')await page.screenshot({path:'docs/screenshots/admin-phase3/inbox-desktop.png',fullPage:true,animations:'disabled'});
    await page.getByRole('button',{name:'Deschide solicitarea de la Administration verification'}).click();
    const dialog=page.getByRole('dialog',{name:'Administration verification'});await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('link',{name:'Descarcă private-fixture.pdf'})).toHaveAttribute('href',`/api/admin/quotes/${ownQuote!.id}/files/${ownQuote!.files[0].id}`);
    const changed=page.waitForResponse(response=>response.request().method()==='PATCH'&&response.url().includes(`/api/admin/quotes/${ownQuote!.id}`));
    await dialog.getByLabel('Starea solicitării').selectOption('in_progress');expect((await changed).status()).toBe(200);await expect(dialog).toContainText('În lucru');
    if(process.env.ARTMASTER_ADMIN_SCREENSHOTS==='1')await page.screenshot({path:'docs/screenshots/admin-phase3/request-detail.png',fullPage:true,animations:'disabled'});
    await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('button',{name:'Deschide solicitarea de la Administration verification'})).toBeFocused();
    await page.getByLabel('Caută solicitări').fill('no-synthetic-record-matches-this');await expect(page.getByRole('heading',{name:'Nicio solicitare găsită'})).toBeVisible();
    await administrator.patch(`/api/admin/quotes/${ownQuote!.id}`,{data:{status:ownQuote!.status}});
  });

  test('studio drafts survive module switches; mobile navigation and Security Center stay accessible',async({page})=>{
    await browserSession(page.context());await page.setViewportSize({width:1440,height:1000});await page.goto('/admin#settings');
    const originalPhone=await page.getByLabel('Telefon public',{exact:true}).inputValue();
    await page.getByLabel('Telefon public',{exact:true}).fill('+37360010403');
    await page.getByRole('link',{name:'Conținut',exact:true}).click();await expect(page.getByRole('heading',{name:'Conținut Studio',exact:true})).toBeVisible();
    await page.getByRole('link',{name:'Setări website',exact:true}).click();await expect(page.getByLabel('Telefon public',{exact:true})).toHaveValue('+37360010403');
    await page.getByLabel('Telefon public',{exact:true}).fill(originalPhone);
    if(process.env.ARTMASTER_ADMIN_SCREENSHOTS==='1')await page.screenshot({path:'docs/screenshots/admin-phase3/website-settings-desktop.png',fullPage:true,animations:'disabled'});
    await page.getByRole('link',{name:'Bibliotecă media',exact:true}).click();await expect(page.getByRole('article').first().getByRole('img')).toBeVisible();
    if(process.env.ARTMASTER_ADMIN_SCREENSHOTS==='1')await page.screenshot({path:'docs/screenshots/admin-phase3/media-library-desktop.png',fullPage:true,animations:'disabled'});
    const libraryPNG=await sharp({create:{width:32,height:24,channels:3,background:'#f5cc27'}}).png().toBuffer();
    const libraryResponse=page.waitForResponse(response=>response.url().endsWith('/api/admin/media')&&response.request().method()==='POST');
    await page.getByLabel('Încarcă imagine în bibliotecă').setInputFiles({name:'temporary-library.png',mimeType:'image/png',buffer:libraryPNG});
    const libraryUpload=await libraryResponse;expect(libraryUpload.status()).toBe(201);const libraryAsset=await libraryUpload.json();uploaded.push(libraryAsset.url.split('/').pop());
    const anonymousMedia=await playwrightRequest.newContext({baseURL});try{expect((await anonymousMedia.get(libraryAsset.url)).status()).toBe(404);}finally{await anonymousMedia.dispose();}
    await page.getByLabel('Caută imagini').fill('temporary-library.png');await expect(page.getByRole('article')).toHaveCount(1);
    await page.getByRole('link',{name:'Securitate',exact:true}).click();await expect(page.getByRole('heading',{name:'Autentificare locală de dezvoltare.'})).toBeVisible();
    await expect(page.getByRole('button',{name:'În dezvoltare'})).toHaveCount(3);for(const button of await page.getByRole('button',{name:'În dezvoltare'}).all())await expect(button).toBeDisabled();
    if(process.env.ARTMASTER_ADMIN_SCREENSHOTS==='1')await page.screenshot({path:'docs/screenshots/admin-phase3/security-desktop.png',fullPage:true,animations:'disabled'});
    for(const width of [320,390,768]){
      await page.setViewportSize({width,height:900});
      await page.getByRole('button',{name:'Deschide meniul',exact:true}).click();
      const menu=page.getByRole('dialog',{name:'Meniul cabinetului'});await expect(menu).toBeVisible();
      await menu.getByRole('link',{name:'Prezentare',exact:true}).click();await expect(menu).not.toBeVisible();
      await expect(page.getByRole('heading',{name:'O zi bună începe cu perspectivă.'})).toBeFocused();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      if(width===390&&process.env.ARTMASTER_ADMIN_SCREENSHOTS==='1')await page.screenshot({path:'docs/screenshots/admin-phase3/dashboard-mobile.png',fullPage:true,animations:'disabled'});
    }
    await page.getByRole('button',{name:'Deschide meniul',exact:true}).click();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Deschide meniul',exact:true})).toBeFocused();
    const report=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();expect(report.violations.filter(value=>value.impact==='serious'||value.impact==='critical')).toEqual([]);
  });

  test('admin loading, failure, viewer and unauthenticated states never imply access or invented data',async({page})=>{
    await page.goto('/admin#security');await expect(page.getByRole('heading',{name:'Bine ai revenit.'})).toBeVisible();await expect(page.getByRole('navigation',{name:'Navigare administrare'})).toHaveCount(0);
    if(process.env.ARTMASTER_ADMIN_SCREENSHOTS==='1')await page.screenshot({path:'docs/screenshots/admin-phase3/sign-in.png',fullPage:true,animations:'disabled'});
    await browserSession(page.context());
    let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});
    await page.route('**/api/admin/quotes',async route=>{await pending;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'unavailable'})});});
    await page.goto('/admin');await expect(page.getByRole('status',{name:'Se încarcă datele'}).first()).toBeVisible();
    release();await expect(page.getByRole('heading',{name:'Datele nu au putut fi încărcate'})).toBeVisible();await expect(page.getByRole('article').filter({hasText:'Solicitări încărcate'})).toContainText('—');
    await page.unroute('**/api/admin/quotes');await page.getByRole('button',{name:'Reîncearcă',exact:true}).click();await expect(page.getByRole('heading',{name:'Datele nu au putut fi încărcate'})).not.toBeVisible();
    await page.route('**/api/admin/quotes',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({quotes:[]})}));await page.getByRole('button',{name:'Deschide mesajele'}).click();await page.getByRole('button',{name:'Actualizează',exact:true}).click();await expect(page.getByRole('heading',{name:'Următorul proiect începe aici.'})).toBeVisible();await page.unroute('**/api/admin/quotes');
    const viewerApi=await login('viewer');await viewerApi.dispose();
    await page.context().addCookies([{name:'artmaster_admin',value:accounts.find(a=>a.role==='viewer')!.cookie,domain:new URL(baseURL).hostname,path:'/',httpOnly:true,sameSite:'Strict',secure:false}]);
    await page.reload();await page.getByLabel('Caută solicitări').fill(`e2e-quote-${nonce}`);await page.getByRole('button',{name:'Deschide solicitarea de la Administration verification'}).click();await expect(page.getByLabel('Starea solicitării')).toBeDisabled();
    await page.keyboard.press('Escape');await page.goto('/admin#portfolio');await expect(page.getByText('Contul tău poate consulta conținutul.',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'Salvează ciorna',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Publică această versiune',exact:true})).toHaveCount(0);
  });

  test('roles guard writes and private file access; logout revokes even replayed session',async({request})=>{
    const viewer=await login('viewer'),editor=await login('editor');
    try{
      const state:State=await (await administrator.get('/api/admin/content')).json();
      const deniedDraft=await viewer.put('/api/admin/content',{data:{content:state.published,action:'save-draft',version:state.version}});expect(deniedDraft.status()).toBe(403);
      const deniedPublish=await editor.put('/api/admin/content',{data:{content:state.published,action:'publish',version:state.version}});expect(deniedPublish.status()).toBe(403);
      const allowedDraft=await editor.put('/api/admin/content',{data:{content:state.published,action:'save-draft',version:state.version}});expect(allowedDraft.status()).toBe(200);
      const quote=ownQuote!;expect(quote,'own genuinely recorded quote with attachment must exist').toBeTruthy();
      const path=`/api/admin/quotes/${quote.id}/files/${quote.files[0].id}`;
      expect((await request.get(path)).status()).toBe(401);
      const file=await viewer.get(path);expect(file.status()).toBe(200);expect(file.headers()['content-disposition']).toMatch(/^attachment;/);expect(file.headers()['cache-control']).toContain('no-store');expect(file.headers()['x-content-type-options']).toBe('nosniff');expect((await file.body()).length).toBe(quote.files[0].size);
      expect((await viewer.patch(`/api/admin/quotes/${quote.id}`,{data:{status:'in_progress'}})).status()).toBe(403);
      expect((await editor.patch(`/api/admin/quotes/${quote.id}`,{data:{status:'in_progress'}})).status()).toBe(200);
      expect((await administrator.patch(`/api/admin/quotes/${quote.id}`,{data:{status:quote.status}})).status()).toBe(200);
      const forged=await administrator.put('/api/admin/content',{headers:{Origin:'https://untrusted.invalid'},data:{content:state.published,action:'publish',version:state.version}});expect(forged.status()).toBe(403);
      expect((await administrator.post('/api/admin/logout',{data:{}})).status()).toBe(200);
      const replay=await request.get('/api/admin/content',{headers:{Cookie:`artmaster_admin=${accounts[0].cookie}`}});expect(replay.status()).toBe(401);
    }finally{await viewer.dispose();await editor.dispose();}
  });
});


test('premium authentication preserves the MFA gate and never grants data access from client responses',async({page})=>{
  await page.goto('/admin');
  let challenge=false;
  await page.route('**/api/admin/login',route=>{if(!challenge){challenge=true;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({mfaRequired:true})});}return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({code:'unauthorized'})});});
  await page.getByLabel('E-mail',{exact:true}).fill('synthetic@example.invalid');await page.getByLabel('Parolă',{exact:true}).fill('synthetic-password-only-for-ui');await page.getByRole('button',{name:'Intră în cabinet'}).click();
  await expect(page.getByRole('heading',{name:'Confirmă că ești tu'})).toBeVisible();await expect(page.getByRole('navigation',{name:'Navigare administrare'})).toHaveCount(0);
  await page.getByLabel('Cod de autentificare').fill('123456');await page.getByRole('button',{name:'Confirmă autentificarea'}).click();await expect(page.getByRole('alert').filter({hasText:'Codul nu este valid'})).toBeVisible();await expect(page.getByRole('navigation',{name:'Navigare administrare'})).toHaveCount(0);
  await page.unroute('**/api/admin/login');
  const report=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();expect(report.violations.filter(value=>value.impact==='serious'||value.impact==='critical')).toEqual([]);
});

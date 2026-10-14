import { test,expect,request as playwrightRequest,type APIRequestContext,type BrowserContext,type Page } from './browser-fixtures';
import { randomUUID,randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { resolve,join } from 'node:path';
import { unlink } from 'node:fs/promises';
import sharp from 'sharp';
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
    await browserSession(page.context());await page.goto('/admin');
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
    await browserSession(page.context());await page.goto('/admin');await expect(page.getByLabel('Telefon public',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Galerie și proiecte',exact:true}).click();await page.getByRole('button',{name:'Adaugă proiect',exact:true}).click();
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
    const media=await request.get(image.url);expect(media.status()).toBe(200);expect(media.headers()['content-type']).toBe('image/webp');const metadata=await sharp(await media.body()).metadata();expect(metadata.format).toBe('webp');expect(metadata.exif).toBeUndefined();expect(metadata.icc).toBeUndefined();
    await page.getByLabel('Afișează în portofoliu după publicarea versiunii',{exact:true}).check();await saveUI(page,'draft');
    expect(await (await request.get('/ro/portofoliu')).text()).not.toContain(title);
    await saveUI(page,'publish');
    for(const locale of ['ro','ru','en']){await page.goto(`/${locale}/portofoliu`);await expect(page.locator('main')).toContainText(title);}
    const state:State=await (await administrator.get('/api/admin/content')).json(),project=state.published.projects.find(project=>project.title.ro===title)!;expect(project.image).toBe(image.url);expect(project.published).toBe(true);expect(project.kind).toBe('concept');
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

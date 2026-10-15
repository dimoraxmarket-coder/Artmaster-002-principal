import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm, stat, symlink, writeFile, cp, rename } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LocalStorage, localDatabase } from '../src/lib/server/local';
import { createLocalAdmin, loginAdmin, actorForSession } from '../src/lib/server/auth';
import { backupLocalData, restoreLocalBackup } from '../src/lib/server/backup';
import { readPublishedMedia } from '../src/lib/server/media';
import { changeQuote } from '../src/lib/server/crm';
import { registerMedia } from '../src/lib/server/media-inventory';
import { defaultContent } from '../src/lib/content/defaults';
import type { Actor, Quote } from '../src/lib/server/types';

const root = mkdtempSync(join(tmpdir(), 'artmaster-restore-'));
const source = join(root, 'source');
process.env.ARTMASTER_STORAGE = 'local';
process.env.ARTMASTER_DATA_DIR = source;
process.env.SITE_URL = 'http://localhost:3000';
after(() => rm(root, { recursive: true, force: true }));

test('backup and restore preserve synthetic data and files, revoke copied sessions and never overwrite', async () => {
  const store = new LocalStorage(), attachment = randomUUID(), image = `${randomUUID()}.webp`;
  const bytes = Buffer.from('synthetic private fixture; no customer data');
  const quote: Quote = { id: randomUUID(), idempotencyKey: randomUUID(), payloadHash: 'synthetic', locale: 'ro', service: defaultContent.services[0].slug, name: 'Synthetic fixture', email: 'fixture@example.invalid', phone: '+37360010400', message: 'Synthetic restoration check', createdAt: new Date().toISOString(), status: 'new', notification: 'not_configured', files: [{ id: randomUUID(), path: attachment, name: 'fixture.pdf', mime: 'application/pdf', size: bytes.length }] };
  await store.createQuote(quote, [{ name: 'fixture.pdf', mime: 'application/pdf', bytes }]);
  await mkdir(join(source, 'media'));
  await writeFile(join(source, 'media', image), bytes, { mode: 0o600 });
  const actor: Actor = { id: createLocalAdmin('fixture@example.invalid', 'Synthetic-only passphrase'), email: 'fixture@example.invalid', role: 'admin', aal: 'aal1' };
  const published=structuredClone(defaultContent);published.services[0].image=`/api/media/${image}`;
  await store.saveContent(published, true, actor, 0);
  await changeQuote(quote.id,{note:'Synthetic backup note',assignedTo:actor.id,expectedVersion:0},actor);
  await registerMedia({url:`/api/media/${image}`,name:'Synthetic backup image',bytes:bytes.length,width:1,height:1,createdAt:new Date().toISOString()},actor);
  const login = await loginAdmin(actor.email, 'Synthetic-only passphrase');
  const secret = await store.secret('ARTMASTER_SESSION_SECRET');
  const backup = join(root, 'backup'), restored = join(root, 'restored');
  await backupLocalData(source, backup);
  assert.ok(await actorForSession(login.cookie), 'source sessions remain unchanged');
  await restoreLocalBackup(backup, restored);
  const db = new DatabaseSync(join(restored, 'artmaster.sqlite'), { readOnly: true });
  try {
    assert.deepEqual(JSON.parse((db.prepare('SELECT data FROM quotes').get() as { data: string }).data), quote);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM quote_events').get() as {n:number}).n,2);
    assert.equal((db.prepare('SELECT assigned_to FROM quotes').get() as {assigned_to:string}).assigned_to,actor.id);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM media_assets').get() as {n:number}).n,1);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM sessions').get() as { n: number }).n, 0);
    assert.equal((db.prepare('SELECT COUNT(*) AS n FROM admins').get() as { n: number }).n, 1);
    assert.equal((db.prepare('SELECT value FROM meta WHERE key=?').get('secret:ARTMASTER_SESSION_SECRET') as { value: string }).value, secret);
    assert.deepEqual(JSON.parse((db.prepare('SELECT published FROM content').get() as { published: string }).published), published);
  } finally { db.close(); }
  assert.deepEqual(await readFile(join(restored, 'uploads', attachment)), bytes);
  assert.deepEqual(await readFile(join(restored, 'media', image)), bytes);
  process.env.ARTMASTER_DATA_DIR=restored;
  try{assert.deepEqual(await readPublishedMedia(image),bytes);assert.equal(await actorForSession(login.cookie),null);}
  finally{process.env.ARTMASTER_DATA_DIR=source;}
  assert.equal((await stat(restored)).mode & 0o777, 0o700);
  assert.equal((await stat(join(restored, 'artmaster.sqlite'))).mode & 0o777, 0o600);
  assert.equal((await stat(join(restored, 'uploads', attachment))).mode & 0o777, 0o600);
  await assert.rejects(() => restoreLocalBackup(backup, source), /EEXIST/);
  await assert.rejects(() => backupLocalData(source, join(source, 'nested')), /separate/);
  assert.ok(await actorForSession(login.cookie));
  // Real CLI is exercised against only the synthetic source in this temp cwd.
  const tsx = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url));
  const script = fileURLToPath(new URL('../scripts/backup.ts', import.meta.url));
  const stopped = spawnSync(process.execPath, [tsx, script], { cwd: root, env: { ...process.env, ARTMASTER_WRITES_PAUSED: 'false' }, encoding: 'utf8' });
  assert.equal(stopped.status, 1);
  const result = spawnSync(process.execPath, [tsx, script], { cwd: root, env: { ...process.env, ARTMASTER_WRITES_PAUSED: 'true' }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const restore = spawnSync(process.execPath, [tsx, fileURLToPath(new URL('../scripts/restore.ts', import.meta.url))], { cwd: root, env: { ...process.env, ARTMASTER_BACKUP_DIR: backup, ARTMASTER_RESTORE_DIR: join(root, 'cli-restored') }, encoding: 'utf8' });
  assert.equal(restore.status, 0, restore.stderr);
  // No source changes were made by either command.
  assert.equal((localDatabase().prepare('SELECT COUNT(*) AS n FROM quotes').get() as { n: number }).n, 1);
});

test('corrupt, incomplete and symlinked backups are refused without creating a restoration', async () => {
  const backup = join(root, 'tamper-backup');
  await backupLocalData(source, backup);
  const manifest = JSON.parse(await readFile(join(backup, 'manifest.json'), 'utf8'));
  const file = manifest.files.find((entry: { path: string }) => entry.path.startsWith('uploads/')).path;
  await writeFile(join(backup, file), 'tampered fixture');
  await assert.rejects(() => restoreLocalBackup(backup, join(root, 'tampered-restore')), /checksum/);
  await assert.rejects(() => stat(join(root, 'tampered-restore')), { code: 'ENOENT' });
  await symlink(join(source, 'artmaster.sqlite'), join(source, 'uploads', 'unsafe-link'));
  await assert.rejects(() => backupLocalData(source, join(root, 'unsafe-backup')), /symlinks/);
  await assert.rejects(() => restoreLocalBackup(join(root, 'unsafe-backup'), join(root, 'incomplete-restore')), { code: 'ENOENT' });
});

test('restoration refuses a symlinked parent before reading manifest-selected files',async()=>{
  const copied=join(root,'parent-link-backup');await cp(join(root,'backup'),copied,{recursive:true});
  await rename(join(copied,'uploads'),join(root,'elsewhere-uploads'));
  await symlink(join(root,'elsewhere-uploads'),join(copied,'uploads'));
  await assert.rejects(()=>restoreLocalBackup(copied,join(root,'parent-link-restored')),/symlinks/);
  await assert.rejects(()=>stat(join(root,'parent-link-restored')),{code:'ENOENT'});
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite, type Transaction } from '@electric-sql/pglite';

// Real PostgreSQL executes the checked-in migration. Only Supabase-provided
// auth/storage prerequisites are stubbed; application policies are unmodified.
// PGlite has one connection: these tests cover SQL permissions, RLS and atomic
// stale-write rejection, not PostgREST, Storage HTTP, JWT verification or load.
const ids = {
  unassigned: '00000000-0000-4000-8000-000000000001',
  viewer: '00000000-0000-4000-8000-000000000002',
  editor: '00000000-0000-4000-8000-000000000003',
  admin: '00000000-0000-4000-8000-000000000004',
};
type ClientRole = 'anon' | 'authenticated' | 'service_role';
const sqlError = (code: string) => (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === code;

async function asRole<T>(db: PGlite, role: ClientRole, user: string | null, run: (tx: Transaction) => Promise<T>, aal: string | null = 'aal2', authSession: string | null = user): Promise<T> {
  return db.transaction(async tx => {
    // Role comes only from the closed test union, never from request input.
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [user ?? '']);
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(aal ? {aal,session_id:authSession} : {})]);
    const identity = await tx.query<{ name: string; superuser: boolean; bypass: boolean }>(
      'select current_user as name, rolsuper as superuser, rolbypassrls as bypass from pg_roles where rolname=current_user',
    );
    assert.equal(identity.rows[0].name, role);
    assert.equal(identity.rows[0].superuser, false);
    assert.equal(identity.rows[0].bypass, role === 'service_role');
    return run(tx);
  });
}

async function snapshot(db: PGlite) {
  const content = await db.query<{ draft: unknown; published: unknown; version: number }>('select draft, published, version from public.site_content where id=1');
  const audit = await db.query<{ actor_id: string; action: string; target: string }>('select actor_id, action, target from public.audit_log order by id');
  return { content: content.rows[0], audit: audit.rows };
}

test('PostgreSQL migration enforces client RLS, restricted RPCs and atomic CMS changes', async suite => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create function auth.jwt() returns jsonb language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
      $$;
      grant usage on schema auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
      create schema storage;
      create table storage.objects (id uuid primary key, bucket_id text not null);
      alter table storage.objects enable row level security;
      grant usage on schema storage to anon,authenticated;
      grant select on storage.objects to anon,authenticated;
      create policy test_team_read on storage.objects for select to authenticated using (true);
      create policy test_anon_read on storage.objects for select to anon using (bucket_id in ('portfolio','portfolio-private'));
      create table storage.buckets (
        id text primary key, name text not null, public boolean not null default false,
        file_size_limit bigint, allowed_mime_types text[]
      );
    `);
    const migration = await readFile(new URL('../supabase/migrations/202610130001_artmaster.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(await readFile(new URL('../supabase/migrations/202610150001_admin_mfa.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../supabase/migrations/202610150002_admin_validation.sql', import.meta.url), 'utf8'));
    for (const id of Object.values(ids)) await db.query('insert into auth.users(id) values($1)', [id]);
    for (const [id, role] of [[ids.viewer, 'viewer'], [ids.editor, 'editor'], [ids.admin, 'admin']]) {
      await db.query('insert into public.admin_roles(user_id,role) values($1,$2)', [id, role]);
      await db.query("insert into public.admin_sessions(session_hash,user_id,auth_session_id,expires_at) values($1,$2,$2,now()+interval '1 hour')", [`fixture-${id}`,id]);
    }
    await db.exec(`
      insert into public.quotes(id,idempotency_key,payload_hash,data,notification) values
        ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','a','{"name":"Private first enquiry"}','pending'),
        ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','b','{"name":"Private second enquiry"}','not_configured');
    `);

    await suite.test('migration applies with RLS on every personal/control table and private quote bucket', async () => {
      const tables = await db.query<{ name: string; rls: boolean }>(
        "select relname as name, relrowsecurity as rls from pg_class join pg_namespace on pg_namespace.oid=relnamespace where nspname='public' and relname in ('admin_roles','admin_sessions','quotes','site_content','rate_events','audit_log') order by relname",
      );
      assert.equal(tables.rows.length, 6);
      assert.equal(tables.rows.every(row => row.rls), true);
      const bucket = await db.query<{ public: boolean; file_size_limit: number; allowed_mime_types: string[] }>("select public,file_size_limit,allowed_mime_types from storage.buckets where id='quote-files'");
      assert.equal(bucket.rows[0].public, false);
      assert.equal(Number(bucket.rows[0].file_size_limit), 5 * 1024 * 1024);
      assert.deepEqual(bucket.rows[0].allowed_mime_types, ['application/pdf', 'image/jpeg', 'image/png']);
      assert.equal((await db.query<{ version: number }>('select version from public.site_content')).rows[0].version, 0);
    });

    await suite.test('anonymous cannot read quotes, assigned roles, CMS or audit even when rows exist', async () => {
      for (const table of ['quotes', 'admin_roles', 'admin_sessions', 'site_content', 'audit_log', 'rate_events']) {
        await assert.rejects(() => asRole(db, 'anon', null, tx => tx.query(`select * from public.${table}`)), sqlError('42501'));
      }
      assert.equal((await db.query<{ count: number }>('select count(*)::integer as count from public.quotes')).rows[0].count, 2);
    });

    await suite.test('unassigned authenticated user sees no role, quotes, CMS or audit', async () => {
      for (const table of ['admin_roles', 'quotes', 'site_content', 'audit_log']) {
        const rows = await asRole(db, 'authenticated', ids.unassigned, tx => tx.query(`select * from public.${table}`));
        assert.equal(rows.rows.length, 0, table);
      }
    });

    await suite.test('AAL1, missing and invalid MFA claims cannot read any protected administrative rows', async () => {
      // Seed an audit row so zero rows cannot be a false positive.
      await db.query("insert into public.audit_log(actor_id,action,target) values($1,'fixture','synthetic')", [ids.admin]);
      for (const user of [ids.viewer, ids.editor, ids.admin]) for (const aal of ['aal1', null, 'invalid']) {
        for (const table of ['admin_roles', 'quotes', 'site_content', 'audit_log']) {
          const rows = await asRole(db, 'authenticated', user, tx => tx.query(`select * from public.${table}`), aal);
          assert.equal(rows.rows.length, 0, `${user} ${aal} ${table}`);
        }
      }
      assert.equal((await asRole(db, 'authenticated', ids.admin, tx => tx.query('select * from public.audit_log'))).rows.length, 1);
      await db.exec('delete from public.audit_log');
    });

    await suite.test('private object MFA restriction survives a permissive storage read policy; public portfolio stays available', async () => {
      await db.exec("insert into storage.objects(id,bucket_id) values ('30000000-0000-4000-8000-000000000001','quote-files'),('30000000-0000-4000-8000-000000000002','portfolio'),('30000000-0000-4000-8000-000000000003','portfolio-private')");
      for (const aal of ['aal1', null]) {
        const rows = await asRole(db, 'authenticated', ids.viewer, tx => tx.query<{bucket_id:string}>('select bucket_id from storage.objects'), aal);
        assert.deepEqual(rows.rows, [{bucket_id:'portfolio'}]);
      }
      assert.equal((await asRole(db, 'authenticated', ids.viewer, tx => tx.query('select * from storage.objects'))).rows.length, 2);
      assert.deepEqual((await asRole(db,'anon',null,tx=>tx.query<{bucket_id:string}>('select bucket_id from storage.objects'))).rows,[{bucket_id:'portfolio'}]);
      assert.equal((await db.query<{public:boolean}>("select public from storage.buckets where id='portfolio-private'")).rows[0].public,false);
    });

    await suite.test('AAL2 direct reads require the matching live app session; idle, absolute, pending and revoked sessions cannot read', async () => {
      for(const user of [ids.viewer,ids.editor,ids.admin]){
        for(const authSession of [null,'not-a-session',ids.unassigned]){
          assert.equal((await asRole(db,'authenticated',user,tx=>tx.query('select * from public.quotes'),'aal2',authSession)).rows.length,0);
        }
        for(const state of ['idle','absolute','token-expired','pending','unbound','revoked','role-revoked']){
          if(state==='idle')await db.query("update public.admin_sessions set last_seen_at=now()-interval '16 minutes' where user_id=$1",[user]);
          if(state==='absolute')await db.query("update public.admin_sessions set created_at=now()-interval '9 hours' where user_id=$1",[user]);
          if(state==='token-expired')await db.query("update public.admin_sessions set expires_at=now()-interval '1 second' where user_id=$1",[user]);
          if(state==='pending')await db.query("update public.admin_sessions set purpose='mfa' where user_id=$1",[user]);
          if(state==='unbound')await db.query("update public.admin_sessions set auth_session_id=null where user_id=$1",[user]);
          if(state==='revoked')await db.query('delete from public.admin_sessions where user_id=$1',[user]);
          if(state==='role-revoked')await db.query('delete from public.admin_roles where user_id=$1',[user]);
          for(const table of ['admin_roles','quotes','site_content','audit_log']){
            assert.equal((await asRole(db,'authenticated',user,tx=>tx.query(`select * from public.${table}`))).rows.length,0,`${state}: ${table}`);
          }
          assert.equal((await asRole(db,'authenticated',user,tx=>tx.query("select * from storage.objects where bucket_id='quote-files'"))).rows.length,0,`${state}: private objects`);
          if(state==='role-revoked')await db.query('insert into public.admin_roles(user_id,role) values($1,$2)',[user,Object.entries(ids).find(([,id])=>id===user)![0]]);
          await db.query("delete from public.admin_sessions where user_id=$1",[user]);
          await db.query("insert into public.admin_sessions(session_hash,user_id,auth_session_id,expires_at) values($1,$2,$2,now()+interval '1 hour')",[`fixture-${user}`,user]);
        }
      }
    });

    await suite.test('only the server may touch active sessions; idle/absolute expiry and revocation cannot be renewed', async () => {
      const args=[`fixture-${ids.admin}`,ids.admin,ids.admin];
      const sql='select public.touch_admin_session($1,$2,$3) as active';
      for(const role of ['anon','authenticated'] as const)await assert.rejects(()=>asRole(db,role,ids.admin,tx=>tx.query(sql,args)),sqlError('42501'));
      assert.equal((await asRole(db,'service_role',null,tx=>tx.query<{active:boolean}>(sql,args))).rows[0].active,true);
      assert.equal((await asRole(db,'service_role',null,tx=>tx.query<{active:boolean}>(sql,[args[0],ids.viewer,ids.admin]))).rows[0].active,false);
      for(const state of ['idle','absolute']){
        await db.query(state==='idle'?"update public.admin_sessions set last_seen_at=now()-interval '16 minutes' where user_id=$1":"update public.admin_sessions set created_at=now()-interval '9 hours' where user_id=$1",[ids.admin]);
        assert.equal((await asRole(db,'service_role',null,tx=>tx.query<{active:boolean}>(sql,args))).rows[0].active,false);
        await db.query('update public.admin_sessions set created_at=now(),last_seen_at=now() where user_id=$1',[ids.admin]);
      }
      assert.equal((await asRole(db,'service_role',null,tx=>tx.query<{active:boolean}>(sql,['revoked-hash',ids.admin,ids.admin]))).rows[0].active,false);
    });

    await suite.test('viewer sees their own role and team-authorized enquiries, without mutation or escalation', async () => {
      const ownRole = await asRole(db, 'authenticated', ids.viewer, tx => tx.query<{ user_id: string; role: string }>('select user_id,role from public.admin_roles'));
      assert.deepEqual(ownRole.rows, [{ user_id: ids.viewer, role: 'viewer' }]);
      // Enquiries are team-visible in this schema; there is no per-user tenant policy.
      const quotes = await asRole(db, 'authenticated', ids.viewer, tx => tx.query('select id,data from public.quotes'));
      assert.equal(quotes.rows.length, 2);
      assert.equal((await asRole(db, 'authenticated', ids.viewer, tx => tx.query('select * from public.site_content'))).rows.length, 1);
      assert.equal((await asRole(db, 'authenticated', ids.viewer, tx => tx.query('select * from public.audit_log'))).rows.length, 0);
      const forbidden = [
        ["update public.admin_roles set role='admin' where user_id=$1", [ids.viewer]],
        ["insert into public.admin_roles(user_id,role) values($1,'admin')", [ids.unassigned]],
        ['delete from public.quotes', []],
        ["update public.site_content set published='{}'::jsonb", []],
        ["insert into public.audit_log(actor_id,action,target) values($1,'forged','site')", [ids.viewer]],
      ] as const;
      for (const [sql, params] of forbidden) {
        await assert.rejects(() => asRole(db, 'authenticated', ids.viewer, tx => tx.query(sql, [...params])), sqlError('42501'));
      }
      assert.equal((await db.query<{ role: string }>('select role from public.admin_roles where user_id=$1', [ids.viewer])).rows[0].role, 'viewer');
    });

    await suite.test('session hashes stay private and service role can persist and revoke sessions', async () => {
      await asRole(db, 'service_role', null, tx => tx.query(
        "insert into public.admin_sessions(session_hash,user_id,expires_at) values('hashed-session-test',$1,now()+interval '1 hour')", [ids.admin],
      ));
      for (const user of Object.values(ids)) {
        await assert.rejects(() => asRole(db, 'authenticated', user, tx => tx.query('select * from public.admin_sessions')), sqlError('42501'));
        await assert.rejects(() => asRole(db, 'authenticated', user, tx => tx.query('delete from public.admin_sessions')), sqlError('42501'));
      }
      await assert.rejects(() => asRole(db, 'anon', null, tx => tx.query('select * from public.admin_sessions')), sqlError('42501'));
      const stored = await asRole(db, 'service_role', null, tx => tx.query<{ user_id: string }>("select user_id from public.admin_sessions where session_hash='hashed-session-test'"));
      assert.deepEqual(stored.rows, [{ user_id: ids.admin }]);
      await asRole(db, 'service_role', null, tx => tx.query("delete from public.admin_sessions where session_hash='hashed-session-test'"));
      assert.equal((await db.query("select * from public.admin_sessions where session_hash='hashed-session-test'")).rows.length, 0);
    });

    await suite.test('only service_role clients may execute mutating/rate-limit RPCs', async () => {
      const calls = [
        ['select public.consume_rate($1,$2,$3)', ['rpc-privilege', 2, 1000]],
        ['select public.save_site_content($1,$2,$3,$4)', ['{}', false, ids.admin, 0]],
        ['select public.mark_quote_notification($1,$2,$3)', ['10000000-0000-4000-8000-000000000001', true, null]],
      ] as const;
      for (const role of ['anon', 'authenticated'] as const) {
        for (const [sql, params] of calls) {
          // Even passing a real administrator actor cannot bypass EXECUTE permissions.
          await assert.rejects(() => asRole(db, role, ids.admin, tx => tx.query(sql, [...params])), sqlError('42501'));
        }
      }
      const grants = await db.query<{ allowed: boolean }>(
        "select has_function_privilege('service_role', oid, 'EXECUTE') as allowed from pg_proc where pronamespace='public'::regnamespace and proname in ('consume_rate','save_site_content','mark_quote_notification')",
      );
      assert.equal(grants.rows.length, 3);
      assert.equal(grants.rows.every(row => row.allowed), true);
      assert.deepEqual((await snapshot(db)).audit, []);
    });

    await suite.test('database rate limit accepts two, rejects third, and isolates/prunes buckets', async () => {
      async function consume(bucket: string) {
        return asRole(db, 'service_role', null, async tx =>
          (await tx.query<{ allowed: boolean }>('select public.consume_rate($1,2,60000) as allowed', [bucket])).rows[0].allowed);
      }
      assert.equal(await consume('quote-rate'), true);
      assert.equal(await consume('quote-rate'), true);
      assert.equal(await consume('quote-rate'), false);
      assert.equal(await consume('independent-rate'), true);
      assert.equal((await db.query<{ count: number }>("select count(*)::integer as count from public.rate_events where bucket='quote-rate'")).rows[0].count, 2);
      await db.exec("update public.rate_events set time=now()-interval '2 minutes' where bucket='quote-rate'");
      assert.equal(await consume('quote-rate'), true);
      assert.equal((await db.query<{ count: number }>("select count(*)::integer as count from public.rate_events where bucket='independent-rate'")).rows[0].count, 1);
      for (const [limit, window] of [[0, 1000], [2, 0]]) {
        await assert.rejects(() => asRole(db, 'service_role', null, tx => tx.query('select public.consume_rate($1,$2,$3)', ['invalid-rate', limit, window])), sqlError('P0001'));
      }
    });

    await suite.test('role checks protect draft/publish and stale versions leave content and audit unchanged', async () => {
      async function save(actor: string, publish: boolean, expected: number, content: unknown) {
        return asRole(db, 'service_role', null, async tx =>
          (await tx.query<{ version: number }>('select public.save_site_content($1,$2,$3,$4) as version', [JSON.stringify(content), publish, actor, expected])).rows[0].version);
      }
      const initial = await snapshot(db);
      assert.deepEqual(initial.content, { draft: null, published: null, version: 0 });
      for (const actor of [ids.viewer, ids.unassigned]) {
        await assert.rejects(() => save(actor, false, 0, { page: 'unauthorized' }), sqlError('42501'));
      }
      assert.deepEqual(await snapshot(db), initial);
      assert.equal(await save(ids.editor, false, 0, { page: 'editor draft' }), 1);
      const draft = await snapshot(db);
      assert.deepEqual(draft.content, { draft: { page: 'editor draft' }, published: null, version: 1 });
      assert.deepEqual(draft.audit, [{ actor_id: ids.editor, action: 'content.draft', target: 'site' }]);
      await assert.rejects(() => save(ids.editor, true, 1, { page: 'editor published' }), sqlError('42501'));
      await assert.rejects(() => save(ids.admin, true, 0, { page: 'stale overwrite' }), sqlError('40001'));
      assert.deepEqual(await snapshot(db), draft);
      assert.equal(await save(ids.admin, true, 1, { page: 'admin published' }), 2);
      const published = await snapshot(db);
      assert.deepEqual(published.content, { draft: { page: 'admin published' }, published: { page: 'admin published' }, version: 2 });
      assert.deepEqual(published.audit[1], { actor_id: ids.admin, action: 'content.publish', target: 'site' });

      // Two writers carry the same previously-read version. Single-connection
      // PGlite serialises the SQL; only one may commit that expected version.
      const writes = await Promise.allSettled([
        save(ids.editor, false, 2, { page: 'writer one' }),
        save(ids.editor, false, 2, { page: 'writer two' }),
      ]);
      assert.equal(writes.filter(result => result.status === 'fulfilled').length, 1);
      const rejection = writes.find(result => result.status === 'rejected');
      assert.ok(rejection?.status === 'rejected');
      assert.equal(sqlError('40001')(rejection.reason), true);
      const afterWrites = await snapshot(db);
      assert.equal(afterWrites.content.version, 3);
      assert.deepEqual(afterWrites.content.published, { page: 'admin published' });
      assert.equal(afterWrites.audit.length, 3);

      // A subsequent transaction failure must roll back both the content and
      // its audit row, demonstrating their actual PostgreSQL atomicity.
      await assert.rejects(() => asRole(db, 'service_role', null, async tx => {
        await tx.query('select public.save_site_content($1,true,$2,3)', ['{"page":"rolled back"}', ids.admin]);
        await tx.query('select 1/0');
      }), sqlError('22012'));
      assert.deepEqual(await snapshot(db), afterWrites);
      assert.equal((await asRole(db, 'authenticated', ids.viewer, tx => tx.query('select * from public.audit_log'))).rows.length, 0);
      assert.equal((await asRole(db, 'authenticated', ids.admin, tx => tx.query('select * from public.audit_log'))).rows.length, 3);
    });

    await suite.test('notification RPC tracks failures without exposing mutation to a viewer', async () => {
      const quote = '10000000-0000-4000-8000-000000000001';
      await asRole(db, 'service_role', null, tx => tx.query('select public.mark_quote_notification($1,false,$2)', [quote, 'x'.repeat(150)]));
      const failed = await db.query<{ attempts: number; notification: string; last_error: string }>('select attempts,notification,last_error from public.quotes where id=$1', [quote]);
      assert.equal(failed.rows[0].attempts, 1);
      assert.equal(failed.rows[0].notification, 'pending');
      assert.equal(failed.rows[0].last_error.length, 100);
      await asRole(db, 'service_role', null, tx => tx.query('select public.mark_quote_notification($1,true,null)', [quote]));
      const sent = await db.query<{ notification: string; last_error: string | null }>('select notification,last_error from public.quotes where id=$1', [quote]);
      assert.deepEqual(sent.rows[0], { notification: 'sent', last_error: null });
    });
  } finally {
    await db.close();
  }
});

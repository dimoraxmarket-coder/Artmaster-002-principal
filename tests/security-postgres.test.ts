import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite, type Transaction } from "@electric-sql/pglite";
const ids = {
  admin: "a0000000-0000-4000-8000-000000000001",
  editor: "a0000000-0000-4000-8000-000000000002",
  viewer: "a0000000-0000-4000-8000-000000000003",
  other: "a0000000-0000-4000-8000-000000000004",
};
const errorCode = (code: string) => (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === code;
async function service<T>(db: PGlite, run: (tx: Transaction) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.exec("set local role service_role");
    return run(tx);
  });
}
async function authenticated(db: PGlite, id: string, aal = "aal2") {
  return db.transaction(async (tx) => {
    await tx.exec("set local role authenticated");
    await tx.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: id, aal, session_id: id }),
    ]);
    return (await tx.query("select * from public.quotes")).rows;
  });
}
test("complete PostgreSQL security-center migration enforces session, role, audit and revocation boundaries", async (suite) => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
   create schema auth;create table auth.users(id uuid primary key,email text);
  `);
    // Explicit UUID cast matches the Supabase auth.uid() contract.
    await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
   create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
   grant usage on schema auth to anon,authenticated,service_role;
   grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;
   create schema storage;create table storage.objects(id uuid primary key,bucket_id text not null,name text,metadata jsonb,created_at timestamptz default now());
   alter table storage.objects enable row level security;grant usage on schema storage to anon,authenticated;grant select on storage.objects to anon,authenticated;
   create policy broad_fixture on storage.objects for select to authenticated using(true);
   create table storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);`);
    const directory = new URL("../supabase/migrations/", import.meta.url);
    for (const file of (await readdir(directory))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await db.exec(await readFile(new URL(file, directory), "utf8"));
    for (const [name, id] of Object.entries(ids))
      await db.query("insert into auth.users(id,email) values($1,$2)", [
        id,
        `${name}@example.invalid`,
      ]);
    for (const role of ["admin", "editor", "viewer"] as const)
      await db.query(
        "insert into public.admin_roles(user_id,role) values($1,$2)",
        [ids[role], role],
      );
    async function session(
      person: string,
      hash: string,
      purpose = "admin",
      generation = 0,
    ) {
      return service(db, (tx) =>
        tx.query(
          "insert into public.admin_sessions(session_hash,user_id,auth_session_id,purpose,role_version,verified_at,expires_at) values($1,$2,$2,$3,$4,case when $3='admin' then now() else null end,now()+interval '1 hour')",
          [hash, person, purpose, generation],
        ),
      );
    }
    for (const name of ["admin", "editor", "viewer"] as const)
      await session(ids[name], `private-${name}`);
    const context = (name: "admin" | "editor" | "viewer") => [
      `private-${name}`,
      ids[name],
      ids[name],
    ];
    const mutate = (
      actor: "admin" | "editor" | "viewer",
      target: string,
      role: string,
      enabled: boolean,
      version: number,
    ) =>
      service(db, (tx) =>
        tx.query(
          "select public.security_change_account($1,$2,$3,$4,$5,$6,$7)",
          [...context(actor), target, role, enabled, version],
        ),
      );
    await db.query(
      "insert into public.quotes(id,idempotency_key,payload_hash,data,notification) values('b0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002','synthetic','{\"name\":\"Synthetic private request\"}','not_configured')",
    );
    await suite.test('content history RPCs retain snapshots, deny clients and restore only into a new draft',async()=>{
      for(const role of ['anon','authenticated']) {
        for(const sql of ["select * from public.content_versions", "select public.content_history_usage()", `select public.save_site_content('{}',false,'${ids.editor}',0)`, `select public.write_site_content('{}',false,'${ids.editor}',0,null)`])
          await assert.rejects(()=>db.transaction(async tx=>{await tx.exec(`set local role ${role}`);await tx.query(sql);}),errorCode('42501'));
      }
      const first={services:[{image:'/media/hero-wide.webp',title:'Synthetic original'}]};
      const second={services:[{image:'/media/hero-wide.webp',title:'Synthetic draft'}]};
      const write=(content:object,publish:boolean,actor:string,version:number,source:number|null=null)=>service(db,tx=>tx.query('select public.write_site_content($1,$2,$3,$4,$5)',[JSON.stringify(content),publish,actor,version,source]));
      await assert.rejects(()=>write(first,false,ids.viewer,0),errorCode('42501'));
      await assert.rejects(()=>write(first,true,ids.editor,0),errorCode('42501'));
      await write(first,true,ids.admin,0);
      await service(db,tx=>tx.query('select public.save_site_content($1,false,$2,1)',[JSON.stringify(second),ids.editor]));
      const snapshots=(await db.query<{id:number;content:object}>('select id,content from public.content_versions order by id')).rows;
      assert.equal(snapshots.length,2);assert.deepEqual(snapshots[0].content,first);
      await assert.rejects(()=>write(first,false,ids.editor,1,Number(snapshots[0].id)),errorCode('40001'));
      await assert.rejects(()=>write(second,false,ids.editor,2,Number(snapshots[0].id)),errorCode('22023'));
      await assert.rejects(()=>write(first,true,ids.admin,2,Number(snapshots[0].id)),errorCode('22023'));
      await write(first,false,ids.editor,2,Number(snapshots[0].id));
      assert.deepEqual((await db.query<{published:object;draft:object;version:number}>('select published,draft,version from public.site_content')).rows[0],{published:first,draft:first,version:3});
      assert.deepEqual((await db.query('select action,source_id from public.content_versions order by id desc limit 1')).rows[0],{action:'restore',source_id:snapshots[0].id});
      for(const sql of ["update public.content_versions set content='{}'",'delete from public.content_versions','truncate public.content_versions'])
        await assert.rejects(()=>service(db,tx=>tx.exec(sql)),errorCode('42501'));
      await assert.rejects(()=>db.exec('delete from public.content_versions'),errorCode('42501'));
      const url='/api/media/11111111-1111-4111-8111-111111111111.webp',privateContent={services:[{image:url}]};
      await write(privateContent,false,ids.editor,3);
      const privateId=Number((await db.query<{id:number}>('select id from public.content_versions order by id desc limit 1')).rows[0].id);
      await assert.rejects(()=>write(privateContent,false,ids.editor,4,privateId),errorCode('23514'));
      await db.query("insert into public.media_assets(url,name,bytes,width,height,created_by) values($1,'synthetic',10,1,1,$2)",[url,ids.editor]);
      await db.query("insert into storage.objects(id,bucket_id,name) values('11111111-1111-4111-8111-111111111111','portfolio-private','11111111-1111-4111-8111-111111111111.webp')");
      await write(privateContent,false,ids.editor,4,privateId);
      await db.query('update public.media_assets set archived_at=now() where url=$1',[url]);
      await assert.rejects(()=>write(privateContent,false,ids.editor,5,privateId),errorCode('23514'));
      assert.equal((await db.query<{n:number}>('select count(*)::int n from public.content_versions')).rows[0].n,5);
      await db.query("insert into public.content_versions(version,action,bytes,content) values(5,'baseline-draft',536870912,'{}')");
      await assert.rejects(()=>write(first,false,ids.editor,5),errorCode('P0450'));
      assert.equal((await db.query<{version:number}>('select version from public.site_content')).rows[0].version,5);
      assert.ok(Number((await service(db,tx=>tx.query<{bytes:number}>('select public.content_history_usage() bytes'))).rows[0].bytes)>=536870912);
    });
    await suite.test(
      "all new RPCs deny direct clients and helper denies the service role",
      async () => {
        const calls = [
          "public.security_sessions('private-admin','" +
            ids.admin +
            "','" +
            ids.admin +
            "','" +
            ids.admin +
            "',1,10)",
          "public.security_revoke('private-admin','" +
            ids.admin +
            "','" +
            ids.admin +
            "',null,null,true)",
          "public.security_accounts('private-admin','" +
            ids.admin +
            "','" +
            ids.admin +
            "','{}')",
          "public.security_change_account('private-admin','" +
            ids.admin +
            "','" +
            ids.admin +
            "','" +
            ids.viewer +
            "','admin',true,0)",
          "public.security_audit('private-admin','" +
            ids.admin +
            "','" +
            ids.admin +
            "','{}')",
          "public.complete_admin_mfa('pending','hash','" +
            ids.admin +
            "','" +
            ids.admin +
            "',0,now()+interval '1 hour')",
          "public.security_logout('private-admin','" + ids.admin + "')",
        ];
        for (const role of ["anon", "authenticated"])
          for (const call of calls)
            await assert.rejects(
              () =>
                db.transaction(async (tx) => {
                  await tx.exec(`set local role ${role}`);
                  await tx.query(`select ${call}`);
                }),
              errorCode("42501"),
            );
        await assert.rejects(
          () =>
            service(db, (tx) =>
              tx.query(
                "select public.security_require($1,$2,$3,true,true)",
                context("admin"),
              ),
            ),
          errorCode("42501"),
        );
        for (const sql of [
          "update public.audit_log set target='tampered'",
          "delete from public.audit_log",
          "truncate public.audit_log",
          "update public.admin_roles set role='admin'",
          "delete from public.admin_roles",
        ]) {
          await assert.rejects(
            () => service(db, (tx) => tx.exec(sql)),
            errorCode("42501"),
          );
        }
      },
    );
    await suite.test(
      "AAL2 and enabled matching sessions remain necessary for direct data reads",
      async () => {
        assert.equal((await authenticated(db, ids.admin, "aal1")).length, 0);
        assert.equal((await authenticated(db, ids.admin)).length, 1);
        await db.query(
          "update public.admin_roles set enabled=false where user_id=$1",
          [ids.viewer],
        );
        assert.equal((await authenticated(db, ids.viewer)).length, 0);
        const touch = await service(db, (tx) =>
          tx.query<{ ok: boolean }>(
            "select public.touch_admin_session($1,$2,$3) ok",
            context("viewer"),
          ),
        );
        assert.equal(touch.rows[0].ok, false);
        await db.query(
          "update public.admin_roles set enabled=true where user_id=$1",
          [ids.viewer],
        );
        await db.query(
          "update public.admin_roles set version=1 where user_id=$1",
          [ids.viewer],
        );
        assert.equal((await authenticated(db, ids.viewer)).length, 0);
        await db.query(
          "update public.admin_roles set version=0 where user_id=$1",
          [ids.viewer],
        );
      },
    );
    await suite.test(
      "session list exposes only management references and real timestamps",
      async () => {
        const result = await service(db, (tx) =>
          tx.query<{
            value: { sessions: Record<string, unknown>[]; total: number };
          }>(
            "select public.security_sessions($1,$2,$3,$2,1,10) value",
            context("admin"),
          ),
        );
        assert.equal(result.rows[0].value.total, 1);
        const item = result.rows[0].value.sessions[0];
        assert.deepEqual(Object.keys(item).sort(), [
          "absoluteExpiresAt",
          "createdAt",
          "current",
          "expiresAt",
          "lastActivityAt",
          "reference",
        ]);
        assert.equal(item.current, true);
        assert.equal(JSON.stringify(item).includes("private-admin"), false);
        await assert.rejects(
          () =>
            service(db, (tx) =>
              tx.query("select public.security_sessions($1,$2,$3,$4,1,10)", [
                ...context("viewer"),
                ids.admin,
              ]),
            ),
          errorCode("P0403"),
        );
        await assert.rejects(
          () =>
            service(db, (tx) =>
              tx.query("select public.security_audit($1,$2,$3,$4)", [
                ...context("viewer"),
                JSON.stringify({ action: "all", page: 1, pageSize: 10 }),
              ]),
            ),
          errorCode("P0403"),
        );
      },
    );
    await suite.test(
      "fresh login is enforced inside sensitive routines and cannot be set by clients",
      async () => {
        await db.query(
          "update public.admin_sessions set verified_at=now()-interval '6 minutes' where session_hash='private-admin'",
        );
        await assert.rejects(
          () => mutate("admin", ids.editor, "viewer", true, 0),
          errorCode("P0428"),
        );
        await assert.rejects(
          () =>
            service(db, (tx) =>
              tx.query(
                "select public.security_revoke($1,$2,$3,null,null,true)",
                context("admin"),
              ),
            ),
          errorCode("P0428"),
        );
        await db.query(
          "update public.admin_sessions set verified_at=now() where session_hash='private-admin'",
        );
      },
    );
    await suite.test(
      "last-admin, self-change, invalid roles and stale changes fail atomically",
      async () => {
        const count = (
          await db.query<{ n: number }>(
            "select count(*)::int n from public.audit_log",
          )
        ).rows[0].n;
        await assert.rejects(
          () => mutate("viewer", ids.viewer, "admin", true, 0),
          errorCode("P0403"),
        );
        await assert.rejects(
          () => mutate("admin", ids.admin, "viewer", true, 0),
          errorCode("P0409"),
        );
        await assert.rejects(
          () => mutate("admin", ids.admin, "admin", false, 0),
          errorCode("P0409"),
        );
        await assert.rejects(
          () => mutate("admin", ids.editor, "owner", true, 0),
          errorCode("22023"),
        );
        await assert.rejects(
          () => mutate("admin", ids.editor, "viewer", true, 99),
          errorCode("40001"),
        );
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::int n from public.audit_log",
            )
          ).rows[0].n,
          count,
        );
        await mutate("admin", ids.editor, "admin", true, 0);
        assert.equal(
          (
            await db.query(
              "select * from public.admin_sessions where user_id=$1",
              [ids.editor],
            )
          ).rows.length,
          0,
        );
        await assert.rejects(
          () => mutate("admin", ids.admin, "viewer", true, 0),
          errorCode("P0412"),
        );
      },
    );
    await suite.test(
      "pending/full sessions are revoked; stale in-flight logins cannot recreate them",
      async () => {
        await session(ids.editor, "new-editor", "admin", 1);
        await session(ids.editor, "pending-editor", "mfa", 1);
        await mutate("admin", ids.editor, "editor", false, 1);
        assert.equal(
          (
            await db.query(
              "select * from public.admin_sessions where user_id=$1",
              [ids.editor],
            )
          ).rows.length,
          0,
        );
        await assert.rejects(
          () => session(ids.editor, "stale-editor", "admin", 1),
          errorCode("P0401"),
        );
        await mutate("admin", ids.editor, "editor", true, 2);
        await assert.rejects(
          () => session(ids.editor, "replayed-editor", "admin", 1),
          errorCode("P0401"),
        );
        await session(ids.editor, "fresh-editor", "admin", 3);
      },
    );
    await suite.test(
      "transaction failures roll back role, generation, sessions and audit together",
      async () => {
        const before = (
          await db.query("select * from public.admin_roles where user_id=$1", [
            ids.editor,
          ])
        ).rows;
        await assert.rejects(
          () =>
            service(db, async (tx) => {
              await tx.query(
                "select public.security_change_account($1,$2,$3,$4,$5,false,3)",
                [...context("admin"), ids.editor, "editor"],
              );
              await tx.query("select 1/0");
            }),
          errorCode("22012"),
        );
        assert.deepEqual(
          (
            await db.query(
              "select * from public.admin_roles where user_id=$1",
              [ids.editor],
            )
          ).rows,
          before,
        );
        assert.equal(
          (
            await db.query(
              "select * from public.admin_sessions where session_hash='fresh-editor'",
            )
          ).rows.length,
          1,
        );
      },
    );
    await suite.test(
      "session revocation respects ownership, protects current session and invalidates direct RLS access",
      async () => {
        const reference = (
          await db.query<{ reference: string }>(
            "select reference from public.admin_sessions where session_hash='fresh-editor'",
          )
        ).rows[0].reference;
        await assert.rejects(
          () =>
            service(db, (tx) =>
              tx.query(
                "select public.security_revoke($1,$2,$3,$4,null,false)",
                [...context("viewer"), reference],
              ),
            ),
          errorCode("P0403"),
        );
        const own = (
          await db.query<{ reference: string }>(
            "select reference from public.admin_sessions where session_hash='private-admin'",
          )
        ).rows[0].reference;
        await assert.rejects(
          () =>
            service(db, (tx) =>
              tx.query(
                "select public.security_revoke($1,$2,$3,$4,null,false)",
                [...context("admin"), own],
              ),
            ),
          errorCode("P0413"),
        );
        await service(db, (tx) =>
          tx.query("select public.security_revoke($1,$2,$3,$4,null,false)", [
            ...context("admin"),
            reference,
          ]),
        );
        assert.equal((await authenticated(db, ids.editor)).length, 0);
      },
    );
    await suite.test(
      "MFA promotion is atomic with revocation and bound-session logout",
      async () => {
        await db.query(
          "insert into public.admin_roles(user_id,role) values($1,'viewer')",
          [ids.other],
        );
        const complete = (pending: string, hash: string) =>
          service(db, (tx) =>
            tx.query(
              "select public.complete_admin_mfa($1,$2,$3,$3,0,now()+interval '1 hour')",
              [pending, hash, ids.other],
            ),
          );
        await session(ids.other, "pending-before-revoke", "mfa");
        await service(db, (tx) =>
          tx.query("select public.security_revoke($1,$2,$3,null,$4,true)", [
            ...context("admin"),
            ids.other,
          ]),
        );
        await assert.rejects(
          () => complete("pending-before-revoke", "denied-after-revoke"),
          errorCode("P0401"),
        );
        await session(ids.other, "pending-before-promotion", "mfa");
        await assert.rejects(
          () => complete("pending-before-promotion", "private-admin"),
          errorCode("23505"),
        );
        assert.equal(
          (
            await db.query(
              "select * from public.admin_sessions where session_hash='pending-before-promotion'",
            )
          ).rows.length,
          1,
          "failed promotion rolls back pending consumption",
        );
        await complete("pending-before-promotion", "promoted-other");
        await assert.rejects(
          () => complete("pending-before-promotion", "replayed-pending"),
          errorCode("P0401"),
        );
        assert.equal((await authenticated(db, ids.other)).length, 1);
        await service(db, (tx) =>
          tx.query("select public.security_logout($1,$2)", [
            "pending-before-promotion",
            ids.other,
          ]),
        );
        assert.equal(
          (await authenticated(db, ids.other)).length,
          0,
          "logout using the consumed pending cookie also revokes its promoted successor",
        );
      },
    );
    await suite.test(
      "a concurrently demoted administrator cannot execute a previously authorized team change",
      async () => {
        await mutate("admin", ids.editor, "admin", true, 3);
        await session(ids.editor, "private-editor", "admin", 4);
        await mutate("admin", ids.editor, "viewer", true, 4);
        await assert.rejects(
          () => mutate("editor", ids.admin, "viewer", true, 0),
          errorCode("P0401"),
        );
        assert.equal(
          (
            await db.query<{ n: number }>(
              "select count(*)::integer n from public.admin_roles where enabled and role='admin'",
            )
          ).rows[0].n,
          1,
        );
      },
    );
    await suite.test(
      "audit has real actor/time, filtered pagination and safe context projection",
      async () => {
        await db.query(
          'insert into public.audit_log(actor_id,action,target,context) values($1,\'admin.login\',\'secret-session-hash\',\'{"password":"secret-password","scope":"secret-token","role":"admin","revoked":2}\')',
          [ids.admin],
        );
        const result = await service(db, (tx) =>
          tx.query<{
            value: {
              events: { target: string; context: object; actor: string }[];
            };
          }>("select public.security_audit($1,$2,$3,$4) value", [
            ...context("admin"),
            JSON.stringify({ page: 1, pageSize: 2, action: "admin.login" }),
          ]),
        );
        const value = result.rows[0].value;
        assert.equal(value.events.length, 2);
        assert.equal(value.events[0].actor, ids.admin);
        assert.equal(value.events[0].target, "session");
        assert.deepEqual(value.events[0].context, {
          role: "admin",
          revoked: 2,
        });
        assert.equal(JSON.stringify(value).includes("secret-"), false);
      },
    );
  } finally {
    await db.close();
  }
});

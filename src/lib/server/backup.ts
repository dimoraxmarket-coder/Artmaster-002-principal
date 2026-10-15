import { backup, DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { chmod, copyFile, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

type Manifest = { format: 1; files: { path: string; sha256: string }[] };
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function contains(parent: string, child: string) {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}
async function regularFile(path: string) {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Expected a regular private file; symlinks are refused.');
}
async function filesUnder(root: string): Promise<string[]> {
  const result: string[] = [];
  for (const name of await readdir(root)) {
    const path = join(root, name), stat = await lstat(path);
    if (stat.isSymbolicLink()) throw new Error('Backup and restore refuse symlinks.');
    if (stat.isDirectory()) for (const file of await filesUnder(path)) result.push(join(name, file));
    else if (stat.isFile()) result.push(name);
    else throw new Error('Unsupported file in private storage.');
  }
  return result;
}
async function exclusiveTarget(source: string, target: string) {
  const origin = await realpath(source), destination = resolve(target);
  // Resolve existing parents so symlinks cannot disguise overlapping directories.
  const parent = await realpath(dirname(destination)), actual = join(parent, relative(dirname(destination), destination));
  if (contains(origin, actual) || contains(actual, origin)) throw new Error('Source and destination must be separate.');
  await mkdir(actual, { mode: 0o700 }); // EEXIST is intentional: never overwrite.
  await chmod(actual, 0o700);
  return { origin, destination: actual };
}
function checkDatabase(path: string) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    const check = db.prepare('PRAGMA quick_check').all();
    if (check.length !== 1 || Object.values(check[0])[0] !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Database integrity check failed.');
    // Require the application schema; opening arbitrary SQLite is not restoration.
    for (const table of ['quotes', 'admins', 'sessions', 'content', 'meta', 'audit']) db.prepare(`SELECT COUNT(*) FROM ${table}`).get();
    return (db.prepare('SELECT data FROM quotes').all() as { data: string }[]).flatMap(row => {
      const quote = JSON.parse(row.data) as { files: { path: string }[] };
      return quote.files.map(file => {
        if (!/^[a-f0-9-]{36}$/.test(file.path)) throw new Error('Unsafe attachment reference.');
        return `uploads/${file.path}`;
      });
    });
  } finally { db.close(); }
}
async function privateCopy(source: string, target: string) {
  await regularFile(source);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await copyFile(source, target, constants.COPYFILE_EXCL);
  await chmod(target, 0o600);
}

// Call only with writers paused: SQLite backup is consistent, but DB + files
// require a shared quiescent point. This helper never changes the source.
export async function backupLocalData(source: string, target: string) {
  const { origin, destination } = await exclusiveTarget(source, target);
  const database = join(origin, 'artmaster.sqlite');
  await regularFile(database);
  const db = new DatabaseSync(database, { readOnly: true });
  try { await backup(db, join(destination, 'artmaster.sqlite')); }
  finally { db.close(); }
  await chmod(join(destination, 'artmaster.sqlite'), 0o600);
  const snapshot = new DatabaseSync(join(destination, 'artmaster.sqlite'));
  try { snapshot.exec('PRAGMA secure_delete=ON; DELETE FROM sessions; VACUUM; PRAGMA journal_mode=DELETE;'); }
  finally { snapshot.close(); }
  for (const directory of ['uploads', 'media']) {
    const root = join(origin, directory);
    try {
      const stat = await lstat(root);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe storage directory.');
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw error; }
    for (const file of await filesUnder(root)) await privateCopy(join(root, file), join(destination, directory, file));
  }
  const paths = await filesUnder(destination);
  for (const file of checkDatabase(join(destination, 'artmaster.sqlite'))) if (!paths.includes(file)) throw new Error('Backup is missing a referenced attachment.');
  const manifest: Manifest = { format: 1, files: [] };
  for (const path of paths.sort()) manifest.files.push({ path, sha256: digest(await readFile(join(destination, path))) });
  // Written last. A failed/incomplete backup is never considered restorable.
  await writeFile(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return destination;
}

export async function restoreLocalBackup(source: string, target: string) {
  const origin = await realpath(source);
  await regularFile(join(origin, 'manifest.json'));
  const manifest: Manifest = JSON.parse(await readFile(join(origin, 'manifest.json'), 'utf8'));
  if (manifest.format !== 1 || !Array.isArray(manifest.files)) throw new Error('Unsupported backup manifest.');
  // Reject symlinked parent directories before touching any manifest paths.
  const actual = (await filesUnder(origin)).filter(path => path !== 'manifest.json');
  const seen = new Set<string>();
  for (const file of manifest.files) {
    if (typeof file.path !== 'string' || !/^(artmaster\.sqlite|(?:uploads|media)\/[a-zA-Z0-9._/-]+)$/.test(file.path) || file.path.split('/').some(part => part === '..' || part === '.') || seen.has(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Unsafe backup manifest.');
    seen.add(file.path);
    await regularFile(join(origin, file.path));
    if (digest(await readFile(join(origin, file.path))) !== file.sha256) throw new Error('Backup checksum mismatch.');
  }
  if (!seen.has('artmaster.sqlite') || actual.length !== seen.size || actual.some(path => !seen.has(path))) throw new Error('Incomplete backup manifest.');
  for (const file of checkDatabase(join(origin, 'artmaster.sqlite'))) if (!seen.has(file)) throw new Error('Backup is missing a referenced attachment.');
  const { destination } = await exclusiveTarget(origin, target);
  for (const path of seen) await privateCopy(join(origin, path), join(destination, path));
  // Restored sessions must remain revoked, including manually prepared backups.
  const db = new DatabaseSync(join(destination, 'artmaster.sqlite'));
  try { db.exec('PRAGMA secure_delete=ON; DELETE FROM sessions; VACUUM; PRAGMA journal_mode=DELETE;'); }
  finally { db.close(); }
  checkDatabase(join(destination, 'artmaster.sqlite'));
  return destination;
}

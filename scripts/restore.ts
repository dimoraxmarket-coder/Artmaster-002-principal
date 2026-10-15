import './environment';
import { resolve, relative, isAbsolute, dirname, basename } from 'node:path';
import { realpath } from 'node:fs/promises';
import { dataDirectory, storageMode } from '../src/lib/server/config';
import { restoreLocalBackup } from '../src/lib/server/backup';

async function main() {
  if (storageMode() !== 'local') throw new Error('Local restoration only.');
  const source = process.env.ARTMASTER_BACKUP_DIR, target = process.env.ARTMASTER_RESTORE_DIR;
  if (!source || !target) throw new Error('Set explicit backup and new restoration directories.');
  const destination = resolve(await realpath(dirname(resolve(target))), basename(target)), active = await realpath(dataDirectory());
  for (const path of [relative(active, destination), relative(destination, active)]) {
    if (!path || (!path.startsWith('..') && !isAbsolute(path))) throw new Error('Never restore over or inside active storage.');
  }
  const restored = await restoreLocalBackup(source, destination);
  console.log(`Restored into a new private directory: ${restored}. Active storage was not changed. Verify before any manual cutover.`);
}
main().catch(() => { console.error('Restore failed. Use a complete verified backup and a new, separate directory. Existing storage is never overwritten.'); process.exitCode = 1; });

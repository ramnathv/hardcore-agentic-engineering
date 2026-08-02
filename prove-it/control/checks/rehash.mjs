// Host-owned tool: regenerate checks/manifest.json after a DELIBERATE check
// change (e.g. strengthening the check after a seeded fault survives it).
// Usage: node control/checks/rehash.mjs [new-version]
// This is a host action. A worker that runs it to unpin a tampered test is the
// exact move the tamper table exists to catch — the receipt still changes.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// One root for BOTH the reads and the write. With PROVE_IT_ROOT set, the
// manifest that gets rewritten is the one in that root — never the manifest
// sitting next to this script in a different tree.
const CHECKS = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.PROVE_IT_ROOT || join(CHECKS, '..', '..');
const manifestPath = join(ROOT, 'control', 'checks', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

if (process.argv[2]) manifest.version = process.argv[2];
for (const f of Object.keys(manifest.protected)) {
  manifest.protected[f] = createHash('sha256')
    .update(readFileSync(join(ROOT, f)))
    .digest('hex');
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`manifest ${manifest.version}: rehashed ${Object.keys(manifest.protected).length} protected target(s)`);

#!/usr/bin/env node
// Short SHA-256 of a content file's body (YAML front matter excluded), so an approval can be
// tied to the exact text that was approved. Front-matter edits (recording approvals, IDs)
// do not change the hash; any change to slides, script, caption or alt text does.
// Usage: node tools/content-hash.mjs <file.md> [...more]
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node tools/content-hash.mjs <file.md> [...more]');
  process.exit(2);
}
for (const file of files) {
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const body = text.startsWith('---\n') ? text.slice(text.indexOf('\n---', 4) + 4) : text;
  // The change log is bookkeeping, not approved content.
  const content = body.split(/\n## Change log\b/)[0].trim();
  console.log(`${createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 12)}  ${file}`);
}

#!/usr/bin/env node
// Persian copy linter for Instagram Studio drafts (mechanical half of brand/voice-and-tone.md).
// Usage: node tools/voice-lint.mjs <file.md> [...more]
// Skips YAML front matter, fenced code, inline `code`, URLs, and anything between
// <!-- lint:off --> and <!-- lint:on -->. Caption checks run on the "## Caption" section.
// Exit code 1 when any error is found.
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync(new URL('./voice-lint.config.json', import.meta.url), 'utf8'));
// Persian/Arabic-script letters only (no punctuation «، ؛ ؟», digits, diacritics or kashida).
const FA = '\\u0621-\\u063A\\u0641-\\u064A\\u066E-\\u06D3\\u06FA-\\u06FC';
const RULES = [
  { id: 'arabic-yeh', level: 'error', re: /ي+/g, msg: 'Arabic yeh «ي»: use Persian «ی».' },
  { id: 'arabic-kaf', level: 'error', re: /ك+/g, msg: 'Arabic kaf «ك»: use Persian «ک».' },
  { id: 'tatweel', level: 'error', re: /[^\s]*ـ[^\s]*/g, msg: 'Kashida/tatweel «ـ» stretches this word: never stretch or justify Persian text (Canva: align right).' },
  { id: 'guillemet-space', level: 'warning', re: new RegExp(`»[${FA}]|[${FA}]«`, 'g'), msg: 'Missing space around «گیومه».' },
  { id: 'arabic-digits', level: 'error', re: /[٠-٩]/g, msg: 'Arabic-Indic digits: use Persian digits ۰-۹.' },
  { id: 'zwnj-mi', level: 'warning', re: new RegExp(`(^|[\\s«(])(ن?می) (?=[${FA}])`, 'g'), msg: 'Missing half-space: «می‌» / «نمی‌» take a ZWNJ, not a space.' },
  { id: 'zwnj-suffix', level: 'warning', re: new RegExp(`[${FA}] (ها|های|هایی|هایم|هایت|هایش|هایمان|هایتان|ترین|تر)(?=[\\s.،؛:!؟)»]|$)`, 'g'), msg: 'Missing half-space before «ها / تر / ترین».' },
  { id: 'latin-question', level: 'warning', re: new RegExp(`[${FA}]\\s*\\?`, 'g'), msg: 'Use the Persian question mark «؟».' },
  { id: 'latin-comma', level: 'warning', re: new RegExp(`[${FA}]\\s*,`, 'g'), msg: 'Use the Persian comma «،».' },
  { id: 'latin-semicolon', level: 'warning', re: new RegExp(`[${FA}]\\s*;`, 'g'), msg: 'Use the Persian semicolon «؛».' },
  { id: 'straight-quotes', level: 'warning', re: new RegExp(`"[^"\\n]*[${FA}][^"\\n]*"`, 'g'), msg: 'Use «گیومه» around Persian text, not straight quotes.' },
  { id: 'space-before-punct', level: 'warning', re: /\s[،؛؟]/g, msg: 'No space before Persian punctuation.' },
  { id: 'latin-digit-in-persian', level: 'warning', re: new RegExp(`[${FA}]\\s?\\d|\\d\\s?[${FA}]`, 'g'), msg: 'Latin digit inside Persian text: use Persian digits (Latin digits only in code, URLs, versions, mono labels).' },
];
const EMOJI = /\p{Extended_Pictographic}/gu;

function mask(line) {
  // Hide inline code, URLs, markdown link targets and studio IDs (IG-004, IG-S01, G2, R3,
  // T-EDU-01, L-007, C1/D1/M1) so they are not linted.
  return line
    .replace(/`[^`]*`/g, (m) => ' '.repeat(m.length))
    .replace(/https?:\/\/\S+/g, (m) => ' '.repeat(m.length))
    .replace(/\]\([^)]*\)/g, (m) => ' '.repeat(m.length))
    .replace(/\b(?:IG-S?\d{2,3}|G[1-4]|R\d{1,3}|[CDM]\d{1,3}|T-[A-Z]{2,4}-\d{2}|L-\d{3})\b/g, (m) => ' '.repeat(m.length));
}

function lintFile(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  const findings = [];
  let inFront = lines[0] === '---';
  let inFence = false;
  let off = false;
  let section = '';
  const caption = [];

  lines.forEach((raw, i) => {
    const n = i + 1;
    if (inFront) { if (i > 0 && raw === '---') inFront = false; return; }
    if (/^\s*```/.test(raw)) { inFence = !inFence; return; }
    if (inFence) return;
    if (/<!--\s*lint:off\b/.test(raw)) { off = true; return; }
    if (/<!--\s*lint:on\b/.test(raw)) { off = false; return; }
    if (off) return;
    const heading = /^#{1,6}\s+(.*)$/.exec(raw);
    if (heading) { section = heading[1].toLowerCase(); }
    else if (/^(caption|کپشن)/.test(section)) caption.push({ n, text: raw });

    const line = mask(raw);
    for (const rule of RULES) {
      for (const m of line.matchAll(rule.re)) findings.push({ n, col: m.index + 1, level: rule.level, id: rule.id, msg: rule.msg });
    }
    const lower = line.toLowerCase();
    for (const b of cfg.banned) {
      const idx = lower.indexOf(b.phrase.toLowerCase());
      if (idx >= 0) findings.push({ n, col: idx + 1, level: b.severity, id: 'banned-phrase', msg: `«${b.phrase}»: ${b.suggest}` });
    }
  });

  if (caption.length) {
    const c = cfg.caption;
    const text = caption.map((l) => l.text).join('\n').trim();
    const at = caption[0].n;
    const tags = text.match(/#[^\s#]+/g) || [];
    const emojis = text.match(EMOJI) || [];
    const bangs = (text.match(/[!！]/g) || []).length;
    const firstLine = text.split('\n').find((l) => l.trim()) || '';
    if (tags.length > c.maxHashtags) findings.push({ n: at, col: 1, level: 'warning', id: 'hashtags', msg: `${tags.length} hashtags (max ${c.maxHashtags}).` });
    if (tags.length < c.minHashtags) findings.push({ n: at, col: 1, level: 'warning', id: 'hashtags', msg: `${tags.length} hashtags (aim for ${c.minHashtags}-${c.maxHashtags}).` });
    for (const t of tags) if (t.includes('‌')) findings.push({ n: at, col: 1, level: 'error', id: 'hashtag-zwnj', msg: `Hashtag ${t} contains a half-space, which breaks it. Use «_».` });
    if (emojis.length > c.maxEmojis) findings.push({ n: at, col: 1, level: 'warning', id: 'emoji', msg: `${emojis.length} emojis in caption (max ${c.maxEmojis}).` });
    if (bangs > c.maxExclamations) findings.push({ n: at, col: 1, level: 'warning', id: 'exclamation', msg: `${bangs} exclamation marks (max ${c.maxExclamations}).` });
    if ([...text].length > c.maxChars) findings.push({ n: at, col: 1, level: 'error', id: 'caption-length', msg: `Caption is ${[...text].length} characters (Instagram max ${c.maxChars}).` });
    if ([...firstLine].length > c.hookMaxChars) findings.push({ n: at, col: 1, level: 'warning', id: 'hook-length', msg: `First line is ${[...firstLine].length} characters; the feed shows about ${c.hookMaxChars} before "more".` });
  }
  return findings;
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node tools/voice-lint.mjs <file.md> [...more]');
  process.exit(2);
}
let errors = 0;
let warnings = 0;
for (const file of files) {
  const findings = lintFile(file).sort((a, b) => a.n - b.n || a.col - b.col);
  for (const f of findings) {
    if (f.level === 'error') errors += 1; else warnings += 1;
    console.log(`${file}:${f.n}:${f.col}  ${f.level.padEnd(7)} ${f.id.padEnd(22)} ${f.msg}`);
  }
}
console.log(`\n${errors} error(s), ${warnings} warning(s) in ${files.length} file(s).`);
process.exit(errors ? 1 : 0);

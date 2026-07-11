#!/usr/bin/env node
/**
 * check-client-display-whitelist.mjs
 *
 * Scans client-facing rendering paths for direct access to internal
 * transaction fields. These fields must only be read via clientDisplayText()
 * in src/lib/report/clientDisplay.ts.
 *
 * Caught patterns (per line):
 *   dot access          row.description   or  row?.description
 *   bracket single      row['description']
 *   bracket double      row["description"]
 *   destructuring       const { description } = row
 *                       const { description: label } = row
 *                       const { notes, memo } = tx
 *
 * Known gap: multi-line destructuring deferred to M1 ESLint rule.
 *
 * Scope:
 *   src/app/client-report-rc3   — client UI (RC3)
 *   src/lib/pdf                 — PDF generation
 *
 * NOT in scope: accounting engine, classification, ingestion, tests.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';

const SCAN_DIRS = [
  'src/app/client-report-rc3',
  'src/lib/pdf',
];

const FORBIDDEN_FIELDS = [
  'description',
  'notes',
  'k_note',
  'memo',
  'internal_notes',
  'supplier_notes',
  'staff_notes',
];

const FIELD_UNION = FORBIDDEN_FIELDS.join('|');

const PATTERNS = [
  // Dot access: .fieldName  or  ?.fieldName
  { name: 'dot/optional-chain', re: new RegExp('\\.' + '(?:' + FIELD_UNION + ')' + '\\b') },
  // Bracket single-quoted: ['fieldName']
  { name: 'bracket-single', re: new RegExp("\\['" + '(?:' + FIELD_UNION + ')' + "'\\]") },
  // Bracket double-quoted: ["fieldName"]
  // eslint-disable-next-line no-useless-escape
  { name: 'bracket-double', re: new RegExp('\\["' + '(?:' + FIELD_UNION + ')' + '"\\]') },
  // Destructuring: const/let/var { fieldName } = ...
  { name: 'destructuring', re: new RegExp('(?:const|let|var)\\s+\\{[^}]*\\b(?:' + FIELD_UNION + ')\\b') },
];

function collectFiles(dir) {
  if (!existsSync(dir)) return [];
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...collectFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

let violations = 0;
let filesScanned = 0;

for (const dir of SCAN_DIRS) {
  for (const file of collectFiles(dir)) {
    filesScanned++;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
      for (const { name, re } of PATTERNS) {
        if (re.test(line)) {
          const rel = relative(process.cwd(), file);
          console.error('WHITELIST VIOLATION  ' + rel + ':' + (i + 1) + '  [' + name + ']');
          console.error('  → use clientDisplayText() from src/lib/report/clientDisplay.ts');
          console.error('  > ' + line.trim());
          violations++;
          break;
        }
      }
    });
  }
}

if (violations > 0) {
  console.error('\n\u2718 ' + violations + ' violation(s) found across ' + filesScanned + ' file(s).');
  process.exit(1);
} else {
  const dirs = SCAN_DIRS.filter(d => existsSync(d));
  console.log('\u2714 Whitelist clean \u2014 ' + filesScanned + ' file(s) in [' + dirs.join(', ') + ']');
  if (dirs.length < SCAN_DIRS.length) {
    const missing = SCAN_DIRS.filter(d => !existsSync(d));
    console.log('  (skipped \u2014 not yet created: ' + missing.join(', ') + ')');
  }
}

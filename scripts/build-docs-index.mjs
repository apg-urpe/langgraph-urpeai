#!/usr/bin/env node

/**
 * Build-time script: Indexa los docs/ en un JSON consumible por el API route.
 * Se ejecuta antes de `next build` para que el JSON esté disponible en runtime.
 *
 * Output: lib/docs-index.json
 */

import { readFileSync, readdirSync, writeFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const DOCS_DIR = join(ROOT, 'docs');
const OUTPUT = join(ROOT, 'lib', 'docs-index.json');

function walkDir(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    if (entry.isDirectory()) {
      results.push(...walkDir(full));
    } else if (entry.name.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

function extractTitle(content) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function extractHeaders(content) {
  const headers = [];
  for (const match of content.matchAll(/^(#{2,3})\s+(.+)$/gm)) {
    headers.push({ level: match[1].length, text: match[2].trim() });
  }
  return headers;
}

const files = walkDir(DOCS_DIR);
const index = [];

for (const file of files) {
  const rel = relative(DOCS_DIR, file).split(sep).join('/');
  const content = readFileSync(file, 'utf-8');
  const section = rel.includes('/') ? rel.split('/')[0] : 'root';
  const title = extractTitle(content) || rel.replace(/\.md$/, '').split('/').pop();
  const headers = extractHeaders(content);

  index.push({
    path: rel,
    section,
    title,
    headers: headers.map(h => h.text),
    content, // full content for search
    size: content.length,
  });
}

writeFileSync(OUTPUT, JSON.stringify(index, null, 0), 'utf-8');

console.log(`[build-docs-index] Indexed ${index.length} docs → ${OUTPUT} (${(statSync(OUTPUT).size / 1024).toFixed(1)} KB)`);

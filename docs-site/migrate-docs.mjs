import { readdir, readFile, writeFile, mkdir, stat } from 'fs/promises';
import { join, basename, extname, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = join(__dirname, '..', 'docs');
const DEST_ROOT = join(__dirname, 'docs');

const DIRECTORIES = [
  'getting-started',
  'architecture',
  'core',
  'api',
  'integrations',
  'technical',
  'mobile',
  'contributing',
  'modules',
];

const TOP_LEVEL_FILES = [
  'AGENT_TOOLS_BEST_PRACTICES.md',
  'ARTIFACTS_MONICA_INTEGRATION.md',
  'CHAT_SYSTEM_AUDIT.md',
  'MARKETING_FILTERS_DOC.md',
  'MCP_TOOLS_MIGRATION_PLAN.md',
  'MONICA_CHAT_CONTEXT.md',
  'MULTI_SESSION_CHAT_PLAN.md',
  'REFACTOR_CHAT_TOOLS_PLAN.md',
  'TESTING_RESULTS_FEB13.md',
  'TOOLS_REFACTORING_PROPOSAL.md',
];

// ── Language replacements ──────────────────────────────────────
// VitePress uses Shiki; these languages are not supported.
const LANG_REPLACEMENTS = {
  'json:ui': 'json',
  'jsonb': 'json',
  'env': 'ini',
  'gitignore': 'text',
};

function fixUnsupportedLanguages(content) {
  // Match code fences like ```json:ui or ```env (with optional leading whitespace)
  return content.replace(/^(\s*```)([\w:.+-]+)/gm, (match, fence, lang) => {
    const replacement = LANG_REPLACEMENTS[lang];
    return replacement ? `${fence}${replacement}` : match;
  });
}

// ── HTML/Vue escaping ──────────────────────────────────────────
// VitePress treats .md as Vue SFC. Raw HTML tags and angle-bracket
// placeholders like <PORT> break the Vue compiler. We escape them
// ONLY outside of fenced code blocks and inline code.
function escapeAngleBracketPlaceholders(content) {
  const lines = content.split('\n');
  let inCodeBlock = false;
  const result = [];

  for (const line of lines) {
    if (/^```/.test(line.trimStart())) {
      inCodeBlock = !inCodeBlock;
      result.push(line);
      continue;
    }
    if (inCodeBlock) {
      result.push(line);
      continue;
    }

    // Outside code blocks: escape <PLACEHOLDER> patterns that look like
    // template variables (all-caps, underscores, hyphens) but NOT
    // valid HTML tags like <div>, <script>, <br />, <a href="...">, etc.
    // Also skip inline code (`...`).
    let processed = line.replace(
      /(`[^`]*`)|<([A-Z][A-Z0-9_-]+)>/g,
      (match, inlineCode, placeholder) => {
        if (inlineCode) return inlineCode; // preserve inline code
        return `\`<${placeholder}>\``;
      }
    );
    result.push(processed);
  }

  return result.join('\n');
}

// ── README → index renaming ───────────────────────────────────
function resolveDestFilename(filename) {
  if (filename.toLowerCase() === 'readme.md') return 'index.md';
  return filename;
}

// ── Link normalization ────────────────────────────────────────
// Replace ./foo/README.md links with ./foo/ for VitePress
function normalizeReadmeLinks(content) {
  return content.replace(
    /\]\(([^)]*?)README\.md\)/g,
    (match, prefix) => `](${prefix})`
  );
}

// ── Frontmatter ───────────────────────────────────────────────
function sanitizeYamlTitle(title) {
  title = title.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}]/gu, '').trim();
  title = title.replace(/"/g, '\\"');
  title = title.replace(/[:\[\]{}&*?|>!%@`#]/g, '').trim();
  title = title.replace(/\s+/g, ' ');
  return title;
}

function getTitleFromContent(content, filename) {
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return sanitizeYamlTitle(h1Match[1].trim());

  const name = basename(filename, extname(filename));
  return sanitizeYamlTitle(
    name
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
  );
}

function addFrontmatter(content, filename) {
  const trimmed = content.trimStart();

  if (trimmed.startsWith('---')) {
    if (/^title:\s*/m.test(content)) {
      return content;
    }
    const title = getTitleFromContent(content, filename);
    return content.replace(/^---\s*$/m, `---\ntitle: "${title}"`);
  }

  const title = getTitleFromContent(content, filename);
  const withoutH1 = content.replace(/^#\s+.+\r?\n?/m, '');

  return `---\ntitle: "${title}"\n---\n\n${withoutH1.trimStart()}`;
}

// ── Processing pipeline ───────────────────────────────────────
function processContent(content, filename) {
  let result = content;
  result = addFrontmatter(result, filename);
  result = fixUnsupportedLanguages(result);
  result = escapeAngleBracketPlaceholders(result);
  result = normalizeReadmeLinks(result);
  return result;
}

// ── File walking ──────────────────────────────────────────────
async function getAllMdFiles(dir) {
  const results = [];

  async function walk(currentDir) {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
  }

  await walk(dir);
  return results;
}

// ── Copy directories ─────────────────────────────────────────
async function copyDocsDirectory(dirName) {
  const sourceDir = join(SOURCE_ROOT, dirName);
  const destDir = join(DEST_ROOT, dirName);

  try {
    await stat(sourceDir);
  } catch {
    console.log(`  SKIP: ${dirName} (not found)`);
    return 0;
  }

  const files = await getAllMdFiles(sourceDir);
  let count = 0;

  for (const filePath of files) {
    const relPath = relative(sourceDir, filePath);
    const destFilename = resolveDestFilename(basename(relPath));
    const destPath = join(destDir, dirname(relPath), destFilename);

    await mkdir(dirname(destPath), { recursive: true });

    const content = await readFile(filePath, 'utf-8');
    const processed = processContent(content, basename(filePath));
    await writeFile(destPath, processed, 'utf-8');
    count++;
  }

  console.log(`  OK: ${dirName} (${count} files)`);
  return count;
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('\n=== Migrating docs to VitePress ===');
  console.log(`Source: ${SOURCE_ROOT}`);
  console.log(`Dest:   ${DEST_ROOT}\n`);

  let total = 0;

  // Copy directory-based sections
  for (const dir of DIRECTORIES) {
    total += await copyDocsDirectory(dir);
  }

  // Copy top-level files into "reference" section
  const refDir = join(DEST_ROOT, 'reference');
  await mkdir(refDir, { recursive: true });
  let refCount = 0;

  for (const fileName of TOP_LEVEL_FILES) {
    const sourcePath = join(SOURCE_ROOT, fileName);
    try {
      const content = await readFile(sourcePath, 'utf-8');
      const processed = processContent(content, fileName);
      await writeFile(join(refDir, fileName), processed, 'utf-8');
      refCount++;
    } catch {
      // File not found, skip
    }
  }
  console.log(`  OK: reference (${refCount} files)`);
  total += refCount;

  // Copy main README as overview
  try {
    const readmeContent = await readFile(join(SOURCE_ROOT, 'README.md'), 'utf-8');
    const processed = processContent(readmeContent, 'overview.md');
    await writeFile(join(DEST_ROOT, 'overview.md'), processed, 'utf-8');
    console.log('  OK: overview (main README)');
    total++;
  } catch {
    // No README
  }

  console.log(`\n=== Migration complete! ===`);
  console.log(`Total: ${total} docs migrated\n`);
}

main().catch(console.error);

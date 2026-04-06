#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, sep } from "path";

const DOCS_DIR = join(import.meta.dirname, "docs");

// --- Helpers ---

function walkDir(dir, ext = ".md") {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.name === ".vitepress" || entry.name === "public" || entry.name === "node_modules") continue;
    if (entry.isDirectory()) {
      results.push(...walkDir(full, ext));
    } else if (entry.name.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

function getAllDocs() {
  return walkDir(DOCS_DIR).map((f) => {
    const rel = relative(DOCS_DIR, f).split(sep).join("/");
    const content = readFileSync(f, "utf-8");
    const titleMatch = content.match(/^#\s+(.+)$/m) || content.match(/^title:\s*"?(.+?)"?\s*$/m);
    return {
      path: rel,
      title: titleMatch ? titleMatch[1].trim() : rel.replace(/\.md$/, ""),
      section: rel.includes("/") ? rel.split("/")[0] : "root",
      size: content.length,
    };
  });
}

function getDocContent(docPath) {
  const normalized = docPath.replace(/\\/g, "/").replace(/^\//, "");
  const full = join(DOCS_DIR, normalized);
  try {
    return readFileSync(full, "utf-8");
  } catch {
    return null;
  }
}

function searchDocs(query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const allFiles = walkDir(DOCS_DIR);
  const results = [];

  for (const file of allFiles) {
    const content = readFileSync(file, "utf-8");
    const lower = content.toLowerCase();
    const rel = relative(DOCS_DIR, file).split(sep).join("/");

    // Score: count how many terms match and how often
    let score = 0;
    const matchedLines = [];

    for (const term of terms) {
      const idx = lower.indexOf(term);
      if (idx !== -1) {
        score += (lower.split(term).length - 1); // frequency
        // Find matching lines for context
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(term) && matchedLines.length < 5) {
            matchedLines.push({ line: i + 1, text: lines[i].trim().slice(0, 200) });
          }
        }
      }
    }

    if (score > 0) {
      // Boost if query matches in title/headers
      const headerMatch = content.match(/^#+\s+(.+)$/gm) || [];
      for (const h of headerMatch) {
        for (const term of terms) {
          if (h.toLowerCase().includes(term)) score += 5;
        }
      }
      // Boost if query matches in path
      for (const term of terms) {
        if (rel.toLowerCase().includes(term)) score += 3;
      }
      results.push({ path: rel, score, matchedLines });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 15);
}

// --- MCP Server ---

const server = new McpServer({
  name: "urpe-docs",
  version: "1.0.0",
});

server.tool(
  "list_docs",
  "Lista todos los documentos disponibles en la documentacion de Monica CRM / Urpe AI Lab. Usa esto para descubrir que documentacion existe antes de leer un archivo especifico. Puedes filtrar por seccion.",
  {
    section: z
      .string()
      .optional()
      .describe(
        "Filtrar por seccion: api, architecture, contributing, core, getting-started, integrations, mobile, modules, reference, technical"
      ),
  },
  async ({ section }) => {
    let docs = getAllDocs();
    if (section) {
      docs = docs.filter((d) => d.section === section);
    }

    const grouped = {};
    for (const d of docs) {
      if (!grouped[d.section]) grouped[d.section] = [];
      grouped[d.section].push(`  - ${d.path} — ${d.title}`);
    }

    let text = `# Documentacion disponible (${docs.length} archivos)\n\n`;
    for (const [sec, items] of Object.entries(grouped).sort()) {
      text += `## ${sec}/\n${items.join("\n")}\n\n`;
    }

    return { content: [{ type: "text", text }] };
  }
);

server.tool(
  "read_doc",
  "Lee el contenido completo de un documento de la documentacion. Usa list_docs primero para conocer las rutas disponibles.",
  {
    path: z.string().describe("Ruta relativa del documento, ej: 'modules/chat/index.md' o 'getting-started/environment-setup.md'"),
  },
  async ({ path }) => {
    const content = getDocContent(path);
    if (!content) {
      return {
        content: [{ type: "text", text: `Error: Documento no encontrado en '${path}'. Usa list_docs para ver documentos disponibles.` }],
        isError: true,
      };
    }
    return { content: [{ type: "text", text: `# ${path}\n\n${content}` }] };
  }
);

server.tool(
  "search_docs",
  "Busca en toda la documentacion por palabras clave. Retorna los documentos mas relevantes con lineas coincidentes. Ideal para encontrar informacion sobre un tema especifico sin saber en que archivo esta.",
  {
    query: z.string().describe("Terminos de busqueda, ej: 'supabase auth RLS' o 'calendario nylas eventos'"),
  },
  async ({ query }) => {
    const results = searchDocs(query);

    if (results.length === 0) {
      return {
        content: [{ type: "text", text: `No se encontraron resultados para: "${query}"` }],
      };
    }

    let text = `# Resultados para "${query}" (${results.length} documentos)\n\n`;
    for (const r of results) {
      text += `## ${r.path} (relevancia: ${r.score})\n`;
      for (const m of r.matchedLines) {
        text += `  L${m.line}: ${m.text}\n`;
      }
      text += "\n";
    }
    text += `\nUsa read_doc para leer el contenido completo de cualquier documento.`;

    return { content: [{ type: "text", text }] };
  }
);

// Start
const transport = new StdioServerTransport();
await server.connect(transport);

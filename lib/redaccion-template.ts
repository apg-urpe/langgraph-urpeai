// Redacción document HTML template generator for PDF generation
// Follows the same pattern as lib/invoice-template.ts

import { RedaccionDetalle } from '@/types/redaccion';

export interface RedaccionTemplateData {
  empresa: {
    nombre: string;
    logoUrl?: string | null;
  };
  documento: {
    nombre: string;
    descripcion?: string | null;
    tipo?: string | null;
    estado?: string;
    contacto?: string | null;
    fecha: string;
  };
  secciones: RedaccionDetalle[];
  // Logo as base64 data URL (set by pdf generator before rendering)
  _logoBase64?: string;
}

/**
 * Convert basic markdown to HTML for PDF rendering.
 * Handles: headings, bold, italic, lists, blockquotes, code, links, tables, hr.
 */
function markdownToHTML(md: string): string {
  if (!md) return '';

  let html = md;

  // Escape HTML entities first (but preserve markdown syntax)
  // We do NOT escape < > because markdown may contain HTML tags
  // html2pdf handles this fine

  // Code blocks (```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const escaped = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<pre style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;overflow-x:auto;font-size:12px;line-height:1.6;font-family:'Courier New',monospace;color:#334155;margin:12px 0;"><code>${escaped}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code style="background:#fff1f2;color:#e11d48;padding:2px 6px;border-radius:4px;font-size:0.9em;font-family:\'Courier New\',monospace;">$1</code>');

  // Tables (GFM)
  html = html.replace(/^(\|.+\|)\n(\|[\s\-:|]+\|)\n((?:\|.+\|\n?)+)/gm, (_, header, _sep, body) => {
    const ths = header.split('|').filter((c: string) => c.trim()).map((c: string) =>
      `<th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;border-bottom:2px solid #e2e8f0;background:#f8fafc;">${c.trim()}</th>`
    ).join('');

    const rows = body.trim().split('\n').map((row: string) => {
      const tds = row.split('|').filter((c: string) => c.trim()).map((c: string) =>
        `<td style="padding:8px 12px;font-size:13px;color:#334155;border-bottom:1px solid #f1f5f9;">${c.trim()}</td>`
      ).join('');
      return `<tr>${tds}</tr>`;
    }).join('');

    return `<div style="overflow-x:auto;margin:12px 0;border:1px solid #e2e8f0;border-radius:8px;"><table style="width:100%;border-collapse:collapse;"><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table></div>`;
  });

  // Headings
  html = html.replace(/^#### (.+)$/gm, '<h4 style="font-size:13px;font-weight:600;color:#1e293b;margin:14px 0 6px;">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 style="font-size:14px;font-weight:600;color:#0f172a;margin:16px 0 8px;">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 style="font-size:16px;font-weight:600;color:#0f172a;margin:20px 0 8px;">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 style="font-size:18px;font-weight:700;color:#0f172a;margin:24px 0 10px;padding-bottom:8px;border-bottom:1px solid #e2e8f0;">$1</h1>');

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid #cbd5e1;padding:8px 16px;margin:12px 0;color:#475569;font-style:italic;background:#f8fafc;border-radius:0 8px 8px 0;">$1</blockquote>');

  // HR
  html = html.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;">');

  // Bold + Italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#0f172a;">$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em style="color:#475569;">$1</em>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#2563eb;text-decoration:none;">$1</a>');

  // Unordered lists
  html = html.replace(/^(\s*)[-*] (.+)$/gm, (_, indent, content) => {
    const level = indent.length >= 4 ? 2 : indent.length >= 2 ? 1 : 0;
    const ml = level * 20;
    return `<li style="margin-left:${ml}px;margin-bottom:4px;color:#334155;line-height:1.7;list-style-type:disc;">${content}</li>`;
  });
  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li[^>]*>.*?<\/li>\n?)+)/g, '<ul style="padding-left:20px;margin:8px 0;">$1</ul>');

  // Ordered lists
  html = html.replace(/^(\d+)\. (.+)$/gm, '<oli>$2</oli>');
  html = html.replace(/((?:<oli>.*?<\/oli>\n?)+)/g, (match) => {
    const items = match.replace(/<oli>/g, '<li style="margin-bottom:4px;color:#334155;line-height:1.7;">').replace(/<\/oli>/g, '</li>');
    return `<ol style="padding-left:20px;margin:8px 0;">${items}</ol>`;
  });

  // Paragraphs — wrap remaining plain text lines
  html = html.replace(/^(?!<[a-z/])((?!$).+)$/gm, '<p style="margin:8px 0;line-height:1.75;color:#334155;">$1</p>');

  // Clean up multiple blank lines
  html = html.replace(/\n{3,}/g, '\n\n');

  return html;
}

/**
 * Generate full HTML document for a Redacción document (for PDF rendering).
 */
export function generateRedaccionHTML(data: RedaccionTemplateData): string {
  const logoSrc = data._logoBase64 || data.empresa.logoUrl || '';

  const sectionsHTML = data.secciones
    .filter(s => s.contenido || s.titulo)
    .map((s, i) => {
      const contentHTML = s.contenido ? markdownToHTML(s.contenido) : '<p style="color:#94a3b8;font-style:italic;">Sección sin contenido</p>';
      const separator = i > 0 ? '<div style="border-top:1px solid #e2e8f0;margin:24px 0;"></div>' : '';

      return `
        ${separator}
        <div class="section" style="margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
            <div style="width:28px;height:28px;border-radius:6px;background:#f1f5f9;border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#475569;flex-shrink:0;">
              ${s.orden}
            </div>
            <h2 style="font-size:15px;font-weight:600;color:#0f172a;margin:0;">${s.titulo}</h2>
            ${s.evaluacion !== null ? `
              <span style="font-size:10px;color:#94a3b8;margin-left:auto;">
                ${s.evaluacion}/10
              </span>
            ` : ''}
          </div>
          <div style="font-size:13px;line-height:1.75;color:#334155;">
            ${contentHTML}
          </div>
        </div>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.documento.nombre}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #1a1a2e;
      background: #fff;
      font-size: 13px;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }
    .page {
      max-width: 816px;
      margin: 0 auto;
      background: #fff;
    }

    /* Accent bar */
    .accent-bar {
      height: 3px;
      background: linear-gradient(90deg, #2563eb, #7c3aed);
    }

    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 32px 48px 24px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-logo {
      height: 40px;
      width: auto;
      max-width: 140px;
      object-fit: contain;
    }
    .brand-fallback {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      background: linear-gradient(135deg, #2563eb, #7c3aed);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: 700;
      font-size: 18px;
    }
    .brand-text h1 {
      font-size: 15px;
      font-weight: 700;
      color: #0f172a;
    }
    .doc-meta {
      text-align: right;
    }
    .doc-title {
      font-size: 18px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 4px;
      max-width: 350px;
    }
    .meta-row {
      font-size: 11px;
      color: #94a3b8;
      margin-top: 2px;
    }
    .meta-value {
      color: #475569;
      font-weight: 500;
    }

    /* Divider */
    .divider {
      height: 1px;
      background: #e2e8f0;
      margin: 0 48px;
    }

    /* Content */
    .content {
      padding: 24px 48px 32px;
    }

    /* Footer */
    .page-footer {
      padding: 16px 48px;
      border-top: 1px solid #f1f5f9;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      color: #94a3b8;
    }

    .bottom-bar {
      height: 3px;
      background: linear-gradient(90deg, #2563eb, #7c3aed);
    }

    @media print {
      body { background: #fff; }
      .page { box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="accent-bar"></div>

    <!-- Header -->
    <div class="header">
      <div class="brand">
        ${logoSrc
          ? `<img src="${logoSrc}" alt="${data.empresa.nombre}" class="brand-logo" crossorigin="anonymous">`
          : `<div class="brand-fallback">${data.empresa.nombre.charAt(0).toUpperCase()}</div>`
        }
        <div class="brand-text">
          <h1>${data.empresa.nombre}</h1>
        </div>
      </div>
      <div class="doc-meta">
        <div class="doc-title">${data.documento.nombre}</div>
        ${data.documento.tipo ? `<div class="meta-row">Tipo: <span class="meta-value">${data.documento.tipo}</span></div>` : ''}
        ${data.documento.contacto ? `<div class="meta-row">Contacto: <span class="meta-value">${data.documento.contacto}</span></div>` : ''}
        <div class="meta-row">Fecha: <span class="meta-value">${data.documento.fecha}</span></div>
      </div>
    </div>

    <div class="divider"></div>

    <!-- Content -->
    <div class="content">
      ${sectionsHTML}
    </div>

    <!-- Footer -->
    <div class="page-footer">
      <span>${data.empresa.nombre}</span>
      <span>${data.documento.nombre} — ${data.documento.fecha}</span>
    </div>

    <div class="bottom-bar"></div>
  </div>
</body>
</html>`;
}

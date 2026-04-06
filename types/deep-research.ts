// ============================================================================
// DEEP RESEARCH TYPES - Monica Deep Research con Firecrawl Agent
// ============================================================================

export type ResearchStatus = 'idle' | 'queued' | 'processing' | 'completed' | 'failed';

export interface DeepResearchJob {
  id: string;
  user_id: string;
  
  // Request
  prompt: string;
  urls?: string[];
  schema?: Record<string, unknown>;
  
  // Firecrawl
  firecrawl_job_id?: string;
  
  // Status
  status: ResearchStatus;
  progress?: number; // 0-100
  error?: string;
  
  // Result
  artifact_id?: string;
  data?: unknown;
  credits_used?: number;
  
  // Timestamps
  created_at: string;
  started_at?: string;
  completed_at?: string;
  expires_at?: string;
}

export interface CreateResearchPayload {
  prompt: string;
  urls?: string[];
  schema?: Record<string, unknown>;
}

export interface ResearchResult {
  success: boolean;
  status: ResearchStatus;
  data?: unknown;
  expiresAt?: string;
  creditsUsed?: number;
  error?: string;
}

// ============================================================================
// FIRECRAWL API TYPES
// ============================================================================

export interface FirecrawlAgentRequest {
  prompt: string;
  urls?: string[];
  schema?: Record<string, unknown>;
}

export interface FirecrawlAgentResponse {
  success: boolean;
  status: 'processing' | 'completed' | 'failed';
  id?: string; // Job ID for polling
  data?: unknown;
  expiresAt?: string;
  creditsUsed?: number;
  error?: string;
}

export interface FirecrawlStartResponse {
  success: boolean;
  id: string;
  status: 'processing';
}

export interface FirecrawlStatusResponse {
  success: boolean;
  status: 'processing' | 'completed' | 'failed';
  data?: unknown;
  expiresAt?: string;
  creditsUsed?: number;
  error?: string;
}

// ============================================================================
// UI STATE
// ============================================================================

export interface DeepResearchPanelState {
  isExpanded: boolean;
  inputValue: string;
  showHistory: boolean;
}

export const DEFAULT_PANEL_STATE: DeepResearchPanelState = {
  isExpanded: false,
  inputValue: '',
  showHistory: true
};

// ============================================================================
// HELPERS
// ============================================================================

export const RESEARCH_STATUS_LABELS: Record<ResearchStatus, string> = {
  idle: 'Listo',
  queued: 'En cola',
  processing: 'Investigando...',
  completed: 'Completado',
  failed: 'Error'
};

export const RESEARCH_STATUS_COLORS: Record<ResearchStatus, string> = {
  idle: 'text-zinc-400 bg-zinc-500/10',
  queued: 'text-amber-400 bg-amber-500/10',
  processing: 'text-violet-400 bg-violet-500/10',
  completed: 'text-emerald-400 bg-emerald-500/10',
  failed: 'text-red-400 bg-red-500/10'
};

export function formatResearchDuration(startedAt: string, completedAt?: string): string {
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const diffSeconds = Math.floor((end - start) / 1000);
  
  if (diffSeconds < 60) return `${diffSeconds}s`;
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ${diffSeconds % 60}s`;
  return `${Math.floor(diffSeconds / 3600)}h ${Math.floor((diffSeconds % 3600) / 60)}m`;
}

export function generateResearchTitle(prompt: string): string {
  // Truncate and clean up the prompt for a title
  const cleaned = prompt.trim().replace(/\s+/g, ' ');
  if (cleaned.length <= 50) return cleaned;
  return cleaned.substring(0, 47) + '...';
}

export function formatResearchDataAsMarkdown(data: unknown, prompt: string): string {
  // Now generates HTML instead of markdown for better visual rendering
  return formatResearchDataAsHtml(data, prompt);
}

// Helper to escape HTML
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Render JSON value recursively as HTML
function renderJsonValue(value: unknown, depth = 0): string {
  if (value === null || value === undefined) {
    return '<span class="text-zinc-500 italic">null</span>';
  }
  
  if (typeof value === 'string') {
    return `<span class="text-zinc-200">${escapeHtml(value)}</span>`;
  }
  
  if (typeof value === 'number') {
    return `<span class="text-cyan-400 font-mono">${value}</span>`;
  }
  
  if (typeof value === 'boolean') {
    return `<span class="text-amber-400">${value}</span>`;
  }
  
  if (Array.isArray(value)) {
    if (value.length === 0) return '<span class="text-zinc-500">[]</span>';
    
    // Check if array of simple strings
    if (value.every(v => typeof v === 'string')) {
      return `
        <div class="flex flex-wrap gap-1.5 mt-1">
          ${value.map(v => `
            <span class="px-2 py-0.5 text-xs bg-violet-500/10 text-violet-300 rounded-full border border-violet-500/20">
              ${escapeHtml(String(v))}
            </span>
          `).join('')}
        </div>
      `;
    }
    
    // Check if array of objects with "empresa" and "fundadores" (company pattern)
    if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
      const firstItem = value[0] as Record<string, unknown>;
      
      // Company/Founders pattern
      if ('empresa' in firstItem && 'fundadores' in firstItem) {
        return renderCompanyGrid(value as Array<{empresa: string; fundadores: string[]}>);
      }
      
      // Generic object array - render as cards
      return `
        <div class="grid gap-3 mt-2">
          ${value.map((item, i) => `
            <div class="p-3 bg-zinc-800/50 rounded-lg border border-white/5">
              ${renderJsonValue(item, depth + 1)}
            </div>
          `).join('')}
        </div>
      `;
    }
    
    return `
      <div class="space-y-1 mt-1">
        ${value.map(v => `<div class="ml-3">• ${renderJsonValue(v, depth + 1)}</div>`).join('')}
      </div>
    `;
  }
  
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const entries = Object.entries(obj);
    
    if (entries.length === 0) return '<span class="text-zinc-500">{}</span>';
    
    return `
      <div class="${depth > 0 ? 'space-y-2' : 'space-y-3'}">
        ${entries.map(([key, val]) => `
          <div>
            <span class="text-xs font-semibold text-zinc-400 uppercase tracking-wide">${escapeHtml(key)}</span>
            <div class="mt-0.5">${renderJsonValue(val, depth + 1)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  return String(value);
}

// Render company grid (for fundadores pattern)
function renderCompanyGrid(companies: Array<{empresa: string; fundadores: string[]}>): string {
  return `
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-4">
      ${companies.map(company => `
        <div class="group p-4 bg-gradient-to-br from-zinc-800/80 to-zinc-900/80 rounded-xl border border-white/5 hover:border-violet-500/30 transition-all">
          <div class="flex items-center gap-2 mb-3">
            <div class="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center text-violet-400 font-bold text-sm">
              ${escapeHtml(company.empresa.charAt(0).toUpperCase())}
            </div>
            <h3 class="font-semibold text-zinc-100 group-hover:text-violet-300 transition-colors">
              ${escapeHtml(company.empresa)}
            </h3>
          </div>
          <div class="flex flex-wrap gap-1">
            ${company.fundadores.map(f => `
              <span class="text-[11px] px-2 py-0.5 bg-zinc-700/50 text-zinc-300 rounded-full">
                ${escapeHtml(f)}
              </span>
            `).join('')}
          </div>
          <div class="mt-2 text-[10px] text-zinc-500">
            ${company.fundadores.length} fundador${company.fundadores.length !== 1 ? 'es' : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

export function formatResearchDataAsHtml(data: unknown, prompt: string): string {
  const date = new Date().toLocaleDateString('es', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  // Check if data has a specific structure
  let summaryHtml = '';
  let contentHtml = '';
  
  if (typeof data === 'object' && data !== null) {
    const obj = data as Record<string, unknown>;
    
    // Extract summary metrics if available
    const metrics: Array<{label: string; value: string | number}> = [];
    
    if ('total_empresas' in obj && typeof obj.total_empresas === 'number') {
      metrics.push({ label: 'Total Empresas', value: obj.total_empresas });
    }
    if ('total' in obj && typeof obj.total === 'number') {
      metrics.push({ label: 'Total', value: obj.total });
    }
    if ('count' in obj && typeof obj.count === 'number') {
      metrics.push({ label: 'Resultados', value: obj.count });
    }
    
    if (metrics.length > 0) {
      summaryHtml = `
        <div class="flex flex-wrap gap-3 mb-6">
          ${metrics.map(m => `
            <div class="px-4 py-2 bg-violet-500/10 border border-violet-500/20 rounded-lg">
              <div class="text-2xl font-bold text-violet-400">${m.value}</div>
              <div class="text-xs text-violet-300/70">${m.label}</div>
            </div>
          `).join('')}
        </div>
      `;
    }
    
    // Render main content
    if ('empresas' in obj && Array.isArray(obj.empresas)) {
      contentHtml = renderJsonValue(obj.empresas, 0);
    } else {
      contentHtml = renderJsonValue(data, 0);
    }
  } else if (typeof data === 'string') {
    contentHtml = `<div class="prose prose-invert prose-sm max-w-none">${escapeHtml(data)}</div>`;
  } else {
    contentHtml = '<p class="text-zinc-500">No se encontraron datos.</p>';
  }
  
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { 
      background: linear-gradient(135deg, #0c0c0e 0%, #18181b 100%);
      min-height: 100vh;
    }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #52525b; }
  </style>
</head>
<body class="text-zinc-100 p-6 md:p-8">
  <div class="max-w-5xl mx-auto">
    
    <!-- Header -->
    <div class="mb-8">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
          <svg class="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
        </div>
        <div>
          <h1 class="text-xl md:text-2xl font-bold text-zinc-100">
            ${escapeHtml(generateResearchTitle(prompt))}
          </h1>
          <p class="text-xs text-zinc-500">Deep Research • Monica AI</p>
        </div>
      </div>
      
      <div class="p-4 bg-zinc-800/30 rounded-lg border border-white/5">
        <div class="text-xs text-zinc-500 mb-1">Consulta original</div>
        <p class="text-sm text-zinc-300">${escapeHtml(prompt)}</p>
      </div>
      
      <div class="flex items-center gap-4 mt-4 text-xs text-zinc-500">
        <span class="flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          ${date}
        </span>
      </div>
    </div>
    
    <!-- Summary Metrics -->
    ${summaryHtml}
    
    <!-- Results -->
    <div class="mb-6">
      <h2 class="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4 flex items-center gap-2">
        <svg class="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        Resultados
      </h2>
      ${contentHtml}
    </div>
    
    <!-- Footer -->
    <div class="mt-8 pt-4 border-t border-white/5 flex items-center justify-between text-xs text-zinc-600">
      <span class="flex items-center gap-1.5">
        <svg class="w-3.5 h-3.5 text-violet-500" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
        Generado por Monica Deep Research
      </span>
      <span>Powered by Firecrawl Agent</span>
    </div>
    
  </div>
</body>
</html>
  `.trim();
}

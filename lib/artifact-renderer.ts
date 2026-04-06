// ============================================================================
// ARTIFACT RENDERER - Sistema Inteligente de Renderizado de Datos
// ============================================================================
// Detecta automáticamente el tipo de datos y los renderiza de forma visual

import { logger } from './logger';

// ============================================================================
// TIPOS
// ============================================================================

export type DataPattern = 
  | 'people'           // Lista de personas (investigadores, fundadores, etc.)
  | 'companies'        // Lista de empresas/organizaciones
  | 'products'         // Lista de productos/servicios
  | 'events'           // Lista de eventos/conferencias
  | 'locations'        // Lista de ubicaciones/lugares
  | 'stats'            // Estadísticas/métricas
  | 'timeline'         // Línea de tiempo/cronología
  | 'comparison'       // Comparación de items
  | 'hierarchy'        // Estructura jerárquica
  | 'key-value'        // Pares clave-valor simples
  | 'table'            // Datos tabulares
  | 'list'             // Lista simple
  | 'unknown';         // Fallback

export interface DataAnalysis {
  pattern: DataPattern;
  confidence: number;
  rootKey: string | null;
  items: any[];
  metadata: Record<string, any>;
}

// ============================================================================
// DETECCIÓN DE PATRONES
// ============================================================================

const PERSON_FIELDS = ['nombre', 'name', 'apellido', 'lastname', 'email', 'telefono', 'phone', 'cargo', 'position', 'posicion', 'rol', 'role', 'afiliacion', 'affiliation', 'institucion', 'institution', 'universidad', 'university', 'areas_investigacion', 'research_areas', 'especialidad', 'specialty', 'pais', 'country'];
const COMPANY_FIELDS = ['empresa', 'company', 'fundadores', 'founders', 'industria', 'industry', 'sector', 'empleados', 'employees', 'revenue', 'ingresos', 'fundacion', 'founded', 'headquarters', 'sede'];
const PRODUCT_FIELDS = ['producto', 'product', 'precio', 'price', 'descripcion', 'description', 'categoria', 'category', 'stock', 'sku', 'marca', 'brand'];
const EVENT_FIELDS = ['evento', 'event', 'fecha', 'date', 'ubicacion', 'location', 'organizador', 'organizer', 'participantes', 'participants'];
const LOCATION_FIELDS = ['ciudad', 'city', 'pais', 'country', 'direccion', 'address', 'coordenadas', 'coordinates', 'region', 'estado', 'state'];

function countMatchingFields(obj: any, fields: string[]): number {
  if (!obj || typeof obj !== 'object') return 0;
  const keys = Object.keys(obj).map(k => k.toLowerCase());
  return fields.filter(f => keys.some(k => k.includes(f) || f.includes(k))).length;
}

function detectArrayPattern(items: any[]): DataPattern {
  if (items.length === 0) return 'list';
  
  // Sample first few items
  const sample = items.slice(0, 3);
  const scores: Record<DataPattern, number> = {
    people: 0,
    companies: 0,
    products: 0,
    events: 0,
    locations: 0,
    stats: 0,
    timeline: 0,
    comparison: 0,
    hierarchy: 0,
    'key-value': 0,
    table: 0,
    list: 0,
    unknown: 0
  };

  for (const item of sample) {
    if (typeof item !== 'object' || item === null) {
      scores.list += 1;
      continue;
    }

    scores.people += countMatchingFields(item, PERSON_FIELDS);
    scores.companies += countMatchingFields(item, COMPANY_FIELDS);
    scores.products += countMatchingFields(item, PRODUCT_FIELDS);
    scores.events += countMatchingFields(item, EVENT_FIELDS);
    scores.locations += countMatchingFields(item, LOCATION_FIELDS);

    // Check for tabular data (consistent keys across items)
    const keys = Object.keys(item);
    if (keys.length > 2 && keys.length < 15) {
      scores.table += 2;
    }
  }

  // Find highest score
  let maxPattern: DataPattern = 'table';
  let maxScore = 0;
  for (const [pattern, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      maxPattern = pattern as DataPattern;
    }
  }

  return maxScore > 0 ? maxPattern : 'table';
}

export function analyzeData(data: any): DataAnalysis {
  if (!data || typeof data !== 'object') {
    return { pattern: 'unknown', confidence: 0, rootKey: null, items: [], metadata: {} };
  }

  // Check if it's an array at root
  if (Array.isArray(data)) {
    const pattern = detectArrayPattern(data);
    return {
      pattern,
      confidence: 0.7,
      rootKey: null,
      items: data,
      metadata: { totalItems: data.length }
    };
  }

  // Find array keys in object
  const keys = Object.keys(data);
  const arrayKeys = keys.filter(k => Array.isArray(data[k]));
  
  // Common root key patterns
  const commonRootKeys = ['investigadores', 'researchers', 'personas', 'people', 'empresas', 'companies', 'productos', 'products', 'items', 'results', 'resultados', 'data', 'datos', 'lista', 'list', 'entries', 'records'];
  
  // Find the main array
  let rootKey: string | null = null;
  let items: any[] = [];
  
  // Priority: known root keys first
  for (const key of arrayKeys) {
    if (commonRootKeys.some(rk => key.toLowerCase().includes(rk))) {
      rootKey = key;
      items = data[key];
      break;
    }
  }
  
  // Fallback: first array with items
  if (!rootKey && arrayKeys.length > 0) {
    rootKey = arrayKeys[0];
    items = data[arrayKeys[0]];
  }

  // Extract metadata (non-array fields)
  const metadata: Record<string, any> = {};
  for (const key of keys) {
    if (!Array.isArray(data[key])) {
      metadata[key] = data[key];
    }
  }

  const pattern = items.length > 0 ? detectArrayPattern(items) : 'key-value';
  
  return {
    pattern,
    confidence: rootKey ? 0.85 : 0.5,
    rootKey,
    items,
    metadata
  };
}

// ============================================================================
// RENDERIZADORES ESPECÍFICOS
// ============================================================================

function escapeHtml(str: string): string {
  if (typeof str !== 'string') return String(str);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getInitial(name: string): string {
  return (name || '?').charAt(0).toUpperCase();
}

function formatValue(value: any): string {
  if (value === null || value === undefined) return '<span class="text-zinc-500">N/A</span>';
  if (typeof value === 'boolean') return value ? '✓' : '✗';
  if (Array.isArray(value)) {
    return value.map(v => `<span class="inline-block text-[11px] px-2 py-0.5 bg-zinc-700/50 text-zinc-300 rounded-full mr-1 mb-1">${escapeHtml(String(v))}</span>`).join('');
  }
  if (typeof value === 'object') {
    return `<pre class="text-[10px] bg-zinc-800/50 p-2 rounded overflow-auto max-h-20">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
  }
  return escapeHtml(String(value));
}

function renderPersonCard(person: any, index: number): string {
  const name = person.nombre || person.name || person.fullName || `Persona ${index + 1}`;
  const position = person.posicion || person.position || person.cargo || person.rol || person.role || '';
  const affiliation = person.afiliacion || person.affiliation || person.institucion || person.institution || person.empresa || person.company || '';
  const country = person.pais || person.country || '';
  const email = person.email || '';
  const areas = person.areas_investigacion || person.research_areas || person.especialidades || person.specialties || [];
  const type = person.tipo || person.type || '';
  const salary = person.salario_estimado || person.salary || person.estimated_salary || '';
  const additionalRoles = person.roles_adicionales || person.additional_roles || '';
  
  // Get all other fields not already displayed
  const displayedFields = ['nombre', 'name', 'fullName', 'posicion', 'position', 'cargo', 'rol', 'role', 'afiliacion', 'affiliation', 'institucion', 'institution', 'empresa', 'company', 'pais', 'country', 'email', 'areas_investigacion', 'research_areas', 'especialidades', 'specialties', 'tipo', 'type', 'salario_estimado', 'salary', 'estimated_salary', 'roles_adicionales', 'additional_roles'];
  const otherFields = Object.entries(person).filter(([key]) => !displayedFields.includes(key));

  return `
    <div class="p-4 bg-gradient-to-br from-zinc-800/80 to-zinc-900/80 rounded-xl border border-white/5 hover:border-violet-500/30 transition-all group">
      <div class="flex items-start gap-3 mb-3">
        <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/30 to-purple-600/30 flex items-center justify-center text-violet-300 font-bold text-lg shrink-0 group-hover:scale-105 transition-transform">
          ${getInitial(name)}
        </div>
        <div class="min-w-0 flex-1">
          <h3 class="font-semibold text-zinc-100 truncate">${escapeHtml(name)}</h3>
          ${position ? `<p class="text-xs text-violet-400">${escapeHtml(position)}</p>` : ''}
          ${affiliation ? `<p class="text-[11px] text-zinc-400 truncate">${escapeHtml(affiliation)}</p>` : ''}
        </div>
        ${type ? `<span class="text-[9px] px-2 py-0.5 bg-violet-500/20 text-violet-300 rounded-full shrink-0">${escapeHtml(type)}</span>` : ''}
      </div>
      
      ${country || email ? `
      <div class="flex flex-wrap items-center gap-2 mb-3 text-[11px] text-zinc-400">
        ${country ? `<span class="flex items-center gap-1">📍 ${escapeHtml(country)}</span>` : ''}
        ${email ? `<span class="flex items-center gap-1 truncate">✉️ ${escapeHtml(email)}</span>` : ''}
      </div>
      ` : ''}
      
      ${Array.isArray(areas) && areas.length > 0 ? `
      <div class="mb-3">
        <div class="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">Áreas</div>
        <div class="flex flex-wrap gap-1">
          ${areas.slice(0, 5).map((area: string) => `<span class="text-[10px] px-2 py-0.5 bg-zinc-700/60 text-zinc-300 rounded-full">${escapeHtml(area)}</span>`).join('')}
          ${areas.length > 5 ? `<span class="text-[10px] px-2 py-0.5 bg-zinc-600/40 text-zinc-400 rounded-full">+${areas.length - 5}</span>` : ''}
        </div>
      </div>
      ` : ''}
      
      ${additionalRoles ? `
      <div class="mb-3">
        <div class="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Roles adicionales</div>
        <p class="text-[11px] text-zinc-300">${escapeHtml(additionalRoles)}</p>
      </div>
      ` : ''}
      
      ${salary ? `
      <div class="mt-2 pt-2 border-t border-white/5">
        <div class="text-[10px] text-zinc-500">💰 ${escapeHtml(salary)}</div>
      </div>
      ` : ''}
      
      ${otherFields.length > 0 ? `
      <div class="mt-3 pt-3 border-t border-white/5">
        <details class="group/details">
          <summary class="text-[10px] text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors">
            + ${otherFields.length} campos adicionales
          </summary>
          <div class="mt-2 space-y-1.5">
            ${otherFields.map(([key, val]) => `
              <div class="flex justify-between items-start gap-2">
                <span class="text-[10px] text-zinc-500 shrink-0">${escapeHtml(key)}:</span>
                <span class="text-[10px] text-zinc-300 text-right">${formatValue(val)}</span>
              </div>
            `).join('')}
          </div>
        </details>
      </div>
      ` : ''}
    </div>
  `;
}

function renderCompanyCard(company: any, index: number): string {
  const name = company.empresa || company.company || company.nombre || company.name || `Empresa ${index + 1}`;
  const founders = company.fundadores || company.founders || [];
  const industry = company.industria || company.industry || company.sector || '';
  const employees = company.empleados || company.employees || '';
  const founded = company.fundacion || company.founded || company.año || company.year || '';
  const description = company.descripcion || company.description || '';
  
  return `
    <div class="p-4 bg-gradient-to-br from-zinc-800/80 to-zinc-900/80 rounded-xl border border-white/5 hover:border-cyan-500/30 transition-all">
      <div class="flex items-center gap-2 mb-3">
        <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/30 to-blue-600/30 flex items-center justify-center text-cyan-300 font-bold">
          ${getInitial(name)}
        </div>
        <div class="min-w-0 flex-1">
          <h3 class="font-semibold text-zinc-100 truncate">${escapeHtml(name)}</h3>
          ${industry ? `<p class="text-[11px] text-cyan-400">${escapeHtml(industry)}</p>` : ''}
        </div>
      </div>
      
      ${description ? `<p class="text-xs text-zinc-400 mb-3 line-clamp-2">${escapeHtml(description)}</p>` : ''}
      
      ${Array.isArray(founders) && founders.length > 0 ? `
      <div class="mb-3">
        <div class="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">Fundadores</div>
        <div class="flex flex-wrap gap-1">
          ${founders.map((f: string) => `<span class="text-[11px] px-2 py-0.5 bg-zinc-700/50 text-zinc-300 rounded-full">${escapeHtml(f)}</span>`).join('')}
        </div>
      </div>
      ` : ''}
      
      <div class="flex flex-wrap gap-3 text-[10px] text-zinc-400 mt-2 pt-2 border-t border-white/5">
        ${founded ? `<span>📅 ${escapeHtml(String(founded))}</span>` : ''}
        ${employees ? `<span>👥 ${escapeHtml(String(employees))}</span>` : ''}
      </div>
    </div>
  `;
}

function renderGenericCard(item: any, index: number): string {
  if (typeof item !== 'object' || item === null) {
    return `<div class="p-3 bg-zinc-800/60 rounded-lg text-sm text-zinc-300">${formatValue(item)}</div>`;
  }

  const entries = Object.entries(item);
  const titleField = entries.find(([k]) => ['nombre', 'name', 'titulo', 'title', 'label'].includes(k.toLowerCase()));
  const title = titleField ? String(titleField[1]) : `Item ${index + 1}`;
  
  return `
    <div class="p-4 bg-gradient-to-br from-zinc-800/80 to-zinc-900/80 rounded-xl border border-white/5 hover:border-emerald-500/30 transition-all">
      <h3 class="font-semibold text-zinc-100 mb-3">${escapeHtml(title)}</h3>
      <div class="space-y-2">
        ${entries.filter(([k]) => k !== (titleField?.[0])).slice(0, 6).map(([key, val]) => `
          <div class="flex justify-between items-start gap-2 text-xs">
            <span class="text-zinc-500 shrink-0">${escapeHtml(key)}:</span>
            <span class="text-zinc-300 text-right truncate max-w-[70%]">${formatValue(val)}</span>
          </div>
        `).join('')}
        ${entries.length > 7 ? `<div class="text-[10px] text-zinc-500 text-center pt-2">+ ${entries.length - 7} campos más</div>` : ''}
      </div>
    </div>
  `;
}

function renderTable(items: any[]): string {
  if (items.length === 0) return '<p class="text-zinc-500">Sin datos</p>';
  
  // Get all unique keys
  const allKeys = new Set<string>();
  items.forEach(item => {
    if (typeof item === 'object' && item !== null) {
      Object.keys(item).forEach(k => allKeys.add(k));
    }
  });
  const headers = Array.from(allKeys).slice(0, 8); // Limit columns
  
  return `
    <div class="overflow-x-auto rounded-xl border border-white/5">
      <table class="w-full text-sm">
        <thead class="bg-zinc-800/80">
          <tr>
            ${headers.map(h => `<th class="px-4 py-3 text-left text-[11px] font-bold text-zinc-400 uppercase tracking-wider">${escapeHtml(h)}</th>`).join('')}
          </tr>
        </thead>
        <tbody class="divide-y divide-white/5">
          ${items.slice(0, 50).map((item, i) => `
            <tr class="hover:bg-zinc-800/40 transition-colors ${i % 2 === 0 ? 'bg-zinc-900/40' : 'bg-zinc-900/20'}">
              ${headers.map(h => `<td class="px-4 py-3 text-xs text-zinc-300">${formatValue(item?.[h])}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${items.length > 50 ? `<div class="text-center py-3 text-xs text-zinc-500 bg-zinc-800/40">Mostrando 50 de ${items.length} registros</div>` : ''}
    </div>
  `;
}

function renderKeyValue(data: Record<string, any>): string {
  const entries = Object.entries(data);
  
  return `
    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      ${entries.map(([key, val]) => `
        <div class="p-4 bg-zinc-800/60 rounded-xl border border-white/5">
          <div class="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">${escapeHtml(key)}</div>
          <div class="text-sm text-zinc-200">${formatValue(val)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderStats(data: any): string {
  const stats = Array.isArray(data) ? data : [data];
  
  return `
    <div class="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
      ${stats.slice(0, 8).map((stat: any) => {
        const label = stat.label || stat.nombre || stat.name || stat.key || 'Métrica';
        const value = stat.value || stat.valor || stat.count || stat.total || '0';
        const trend = stat.trend || stat.tendencia || '';
        
        return `
          <div class="p-4 bg-gradient-to-br from-zinc-800/80 to-zinc-900/80 rounded-xl border border-white/5 text-center">
            <div class="text-2xl font-bold text-violet-400 mb-1">${escapeHtml(String(value))}</div>
            <div class="text-[11px] text-zinc-400">${escapeHtml(label)}</div>
            ${trend ? `<div class="text-[10px] ${trend.includes('+') || trend.includes('up') ? 'text-emerald-400' : 'text-red-400'} mt-1">${escapeHtml(trend)}</div>` : ''}
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ============================================================================
// FUNCIÓN PRINCIPAL DE RENDERIZADO
// ============================================================================

export function renderDataToHtml(data: any, title?: string, query?: string, date?: string): string {
  const analysis = analyzeData(data);
  
  logger.info('[ArtifactRenderer] Analyzed data', { 
    pattern: analysis.pattern, 
    confidence: analysis.confidence,
    rootKey: analysis.rootKey,
    itemCount: analysis.items.length 
  });

  let contentHtml = '';
  const items = analysis.items;
  const metadata = analysis.metadata;

  // Render based on pattern
  switch (analysis.pattern) {
    case 'people':
      contentHtml = `
        <div class="mb-4 flex flex-wrap gap-3">
          <div class="px-4 py-2 bg-violet-500/10 border border-violet-500/20 rounded-lg">
            <div class="text-2xl font-bold text-violet-400">${items.length}</div>
            <div class="text-xs text-violet-300/70">${analysis.rootKey || 'Personas'}</div>
          </div>
          ${Object.entries(metadata).slice(0, 3).map(([k, v]) => `
            <div class="px-4 py-2 bg-zinc-800/60 border border-white/5 rounded-lg">
              <div class="text-lg font-bold text-zinc-200">${formatValue(v)}</div>
              <div class="text-xs text-zinc-500">${escapeHtml(k)}</div>
            </div>
          `).join('')}
        </div>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          ${items.map((item, i) => renderPersonCard(item, i)).join('')}
        </div>
      `;
      break;

    case 'companies':
      contentHtml = `
        <div class="mb-4 px-4 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-lg inline-block">
          <div class="text-2xl font-bold text-cyan-400">${metadata.total_empresas || items.length}</div>
          <div class="text-xs text-cyan-300/70">Total Empresas</div>
        </div>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          ${items.map((item, i) => renderCompanyCard(item, i)).join('')}
        </div>
      `;
      break;

    case 'stats':
      contentHtml = renderStats(items.length > 0 ? items : data);
      break;

    case 'key-value':
      contentHtml = renderKeyValue(typeof data === 'object' && !Array.isArray(data) ? data : metadata);
      break;

    case 'table':
      contentHtml = `
        <div class="mb-4 text-sm text-zinc-400">
          ${items.length} registros encontrados
        </div>
        ${renderTable(items)}
      `;
      break;

    default:
      // Generic cards for unknown patterns
      if (items.length > 0) {
        contentHtml = `
          <div class="mb-4 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg inline-block">
            <div class="text-2xl font-bold text-emerald-400">${items.length}</div>
            <div class="text-xs text-emerald-300/70">${analysis.rootKey || 'Resultados'}</div>
          </div>
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            ${items.map((item, i) => renderGenericCard(item, i)).join('')}
          </div>
        `;
      } else {
        // Just render the raw object nicely
        contentHtml = renderKeyValue(data);
      }
  }

  // Build full HTML document
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    body { background: linear-gradient(135deg, #0c0c0e 0%, #18181b 100%); min-height: 100vh; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 3px; }
    .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  </style>
</head>
<body class="text-zinc-100 p-6 md:p-8">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="mb-8">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
          <svg class="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
        </div>
        <div>
          <h1 class="text-xl md:text-2xl font-bold text-zinc-100">${escapeHtml(title || 'Resultados de Investigación')}</h1>
          <p class="text-xs text-zinc-500">Deep Research • Monica AI</p>
        </div>
      </div>
      ${query ? `
      <div class="p-4 bg-zinc-800/30 rounded-lg border border-white/5">
        <div class="text-xs text-zinc-500 mb-1">Consulta original</div>
        <p class="text-sm text-zinc-300">${escapeHtml(query)}</p>
      </div>
      ` : ''}
      ${date ? `
      <div class="flex items-center gap-4 mt-4 text-xs text-zinc-500">
        <span class="flex items-center gap-1.5">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          ${escapeHtml(date)}
        </span>
      </div>
      ` : ''}
    </div>
    
    <!-- Content -->
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
  `;
}

// ============================================================================
// DETECCIÓN DE MARKDOWN
// ============================================================================

function isMarkdownContent(content: string): boolean {
  const trimmed = content.trim();
  
  // Patterns that indicate Markdown
  const markdownPatterns = [
    /^#{1,6}\s+.+/m,           // Headers: # ## ### etc
    /\*\*[^*]+\*\*/,           // Bold: **text**
    /\*[^*]+\*/,               // Italic: *text*
    /^\s*[-*+]\s+/m,           // Unordered lists: - item, * item
    /^\s*\d+\.\s+/m,           // Ordered lists: 1. item
    /\[.+\]\(.+\)/,            // Links: [text](url)
    /^\|.+\|$/m,               // Tables: | col1 | col2 |
    /^>\s+/m,                  // Blockquotes: > text
    /^---+$/m,                 // Horizontal rules: ---
    /`[^`]+`/,                 // Inline code: `code`
    /^```[\s\S]*?```/m,        // Code blocks: ```code```
  ];
  
  // Count how many markdown patterns match
  let matchCount = 0;
  for (const pattern of markdownPatterns) {
    if (pattern.test(trimmed)) {
      matchCount++;
    }
  }
  
  // If at least 2 markdown patterns match, it's likely markdown
  return matchCount >= 2;
}

// ============================================================================
// CONVERTIDOR DE MARKDOWN A HTML
// ============================================================================

function markdownToHtml(content: string): string {
  let html = content;
  
  // Escape HTML first (except for our conversions)
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Code blocks (must be done before other patterns)
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre class="bg-zinc-900/80 border border-zinc-800 rounded-xl p-4 overflow-x-auto my-4"><code class="text-sm text-zinc-300 font-mono">${code.trim()}</code></pre>`;
  });
  
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-zinc-800/60 text-primary-300 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>');
  
  // Headers (process from h6 to h1 to avoid conflicts)
  html = html.replace(/^######\s+(.+)$/gm, '<h6 class="text-sm font-semibold text-zinc-400 mt-4 mb-2">$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5 class="text-sm font-semibold text-zinc-300 mt-4 mb-2">$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4 class="text-base font-semibold text-zinc-200 mt-5 mb-3">$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3 class="text-lg font-bold text-primary-400 mt-6 mb-3 uppercase tracking-wide">$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2 class="text-xl font-bold text-zinc-100 mt-8 mb-4 pb-2 border-b border-zinc-800">$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1 class="text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary-400 to-primary-200 bg-clip-text text-transparent mt-6 mb-6">$1</h1>');
  
  // Bold and italic
  html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong class="font-bold text-white"><em>$1</em></strong>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-zinc-100">$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em class="italic text-zinc-300">$1</em>');
  
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary-400 hover:text-primary-300 underline underline-offset-2 transition-colors">$1</a>');
  
  // Blockquotes
  html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote class="border-l-4 border-primary-500/50 pl-4 py-2 my-4 bg-zinc-900/30 rounded-r-lg text-zinc-400 italic">$1</blockquote>');
  
  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr class="border-zinc-800 my-8" />');
  html = html.replace(/^\*\*\*+$/gm, '<hr class="border-zinc-800 my-8" />');
  
  // Tables - more complex handling
  html = convertMarkdownTables(html);
  
  // Unordered lists
  html = html.replace(/^(\s*)[-*+]\s+(.+)$/gm, (_, indent, item) => {
    const level = Math.floor(indent.length / 2);
    const marginClass = level > 0 ? `ml-${level * 4}` : '';
    return `<li class="flex items-start gap-2 my-1.5 ${marginClass}"><span class="text-primary-400 mt-1.5">•</span><span class="text-zinc-300">${item}</span></li>`;
  });
  
  // Wrap consecutive list items in <ul>
  html = html.replace(/(<li class="flex[^>]*>[\s\S]*?<\/li>\n?)+/g, (match) => {
    return `<ul class="my-4 space-y-1">${match}</ul>`;
  });
  
  // Ordered lists
  let olCounter = 0;
  html = html.replace(/^\s*(\d+)\.\s+(.+)$/gm, (_, num, item) => {
    olCounter++;
    return `<li class="flex items-start gap-3 my-1.5"><span class="text-primary-400 font-mono text-sm min-w-[1.5rem]">${num}.</span><span class="text-zinc-300">${item}</span></li>`;
  });
  
  // Paragraphs - wrap non-tagged content
  html = html.split('\n\n').map(block => {
    const trimmedBlock = block.trim();
    if (!trimmedBlock) return '';
    // Skip if already has HTML tags
    if (trimmedBlock.startsWith('<') && !trimmedBlock.startsWith('&lt;')) {
      return trimmedBlock;
    }
    // Skip empty lines or lines that are just whitespace
    if (/^\s*$/.test(trimmedBlock)) return '';
    // Wrap in paragraph if it's plain text
    if (!/<[a-z][\s\S]*>/i.test(trimmedBlock)) {
      return `<p class="text-zinc-300 leading-relaxed my-4">${trimmedBlock}</p>`;
    }
    return trimmedBlock;
  }).join('\n');
  
  // Clean up extra newlines
  html = html.replace(/\n{3,}/g, '\n\n');
  
  return html;
}

function convertMarkdownTables(html: string): string {
  // Match table blocks (lines starting with |)
  const tableRegex = /(\|.+\|[\r\n]+)+/g;
  
  return html.replace(tableRegex, (tableBlock) => {
    const lines = tableBlock.trim().split('\n').filter(line => line.trim());
    if (lines.length < 2) return tableBlock;
    
    // Check if second line is separator (|---|---|)
    const separatorLine = lines[1];
    if (!/^\|[\s:-]+\|/.test(separatorLine)) return tableBlock;
    
    // Parse header
    const headerCells = lines[0].split('|').filter(cell => cell.trim());
    
    // Parse body rows
    const bodyRows = lines.slice(2);
    
    let tableHtml = `
      <div class="overflow-x-auto my-6 rounded-xl border border-zinc-800/50">
        <table class="w-full text-sm">
          <thead class="bg-zinc-900/80">
            <tr>
              ${headerCells.map(cell => `<th class="px-4 py-3 text-left text-xs font-bold text-zinc-300 uppercase tracking-wider border-b border-zinc-800">${cell.trim()}</th>`).join('')}
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-800/50">
    `;
    
    bodyRows.forEach((row, i) => {
      const cells = row.split('|').filter(cell => cell.trim() !== '');
      tableHtml += `
        <tr class="${i % 2 === 0 ? 'bg-zinc-900/20' : 'bg-zinc-900/40'} hover:bg-zinc-800/40 transition-colors">
          ${cells.map(cell => `<td class="px-4 py-3 text-zinc-300">${cell.trim()}</td>`).join('')}
        </tr>
      `;
    });
    
    tableHtml += `
          </tbody>
        </table>
      </div>
    `;
    
    return tableHtml;
  });
}

// ============================================================================
// FUNCIÓN PARA PARSEAR Y RENDERIZAR CONTENIDO MIXTO
// ============================================================================

export function parseAndRenderContent(content: string): string {
  const trimmed = content.trim();
  
  // If already HTML, return as-is
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    return content;
  }

  // Try to extract metadata from markdown format
  let title = 'Resultados';
  let query = '';
  let date = '';

  // Extract title
  const titleMatch = content.match(/^#\s*(.+)$/m);
  if (titleMatch) {
    title = titleMatch[1].replace('🔍 Investigación: ', '').replace('🔍 ', '');
  }
  
  // Extract query
  const queryMatch = content.match(/\*\*Consulta(?:\s+original)?:\*\*\s*(.+)/i);
  if (queryMatch) {
    query = queryMatch[1];
  }
  
  // Extract date
  const dateMatch = content.match(/\*\*Fecha:\*\*\s*(.+)/);
  if (dateMatch) {
    date = dateMatch[1];
  }

  // Try to find and parse JSON
  let jsonData: any = null;
  
  // Look for ```json block
  const jsonBlockMatch = content.match(/```json\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    try {
      jsonData = JSON.parse(jsonBlockMatch[1].trim());
    } catch (e) {
      logger.warn('[ArtifactRenderer] Failed to parse JSON block', e);
    }
  }
  
  // If no JSON block, try parsing entire content as JSON
  if (!jsonData) {
    try {
      // Check if content looks like JSON
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
          (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        jsonData = JSON.parse(trimmed);
      }
    } catch (e) {
      // Not JSON, that's ok
    }
  }

  // If we found JSON data, render it
  if (jsonData) {
    return renderDataToHtml(jsonData, title, query, date);
  }

  // Check if content is Markdown and render it beautifully
  if (isMarkdownContent(content)) {
    logger.info('[ArtifactRenderer] Detected Markdown content, rendering with styles');
    const htmlContent = markdownToHtml(content);
    
    return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"><\/script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            primary: {
              200: '#a5f3fc',
              300: '#67e8f9',
              400: '#22d3ee',
              500: '#06b6d4',
            }
          }
        }
      }
    }
  <\/script>
  <style>
    body { 
      background: linear-gradient(180deg, #0c0c0e 0%, #111113 100%); 
      min-height: 100vh; 
    }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #52525b; }
    
    /* Smooth animations */
    h1, h2, h3, h4, h5, h6 { animation: fadeIn 0.3s ease-out; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
  </style>
</head>
<body class="text-zinc-100 p-6 md:p-10">
  <div class="max-w-4xl mx-auto">
    <article class="prose prose-invert prose-lg max-w-none">
      ${htmlContent}
    </article>
    
    <!-- Footer -->
    <div class="mt-12 pt-6 border-t border-zinc-800/50 flex items-center justify-between text-xs text-zinc-600">
      <span class="flex items-center gap-1.5">
        <svg class="w-3.5 h-3.5 text-primary-500" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
        Monica AI
      </span>
      <span>Documento renderizado</span>
    </div>
  </div>
</body>
</html>
    `;
  }

  // Fallback: wrap as-is with basic styling (plain text)
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    body { background: #0c0c0e; min-height: 100vh; }
  </style>
</head>
<body class="text-zinc-100 p-6">
  <div class="max-w-4xl mx-auto">
    <pre class="whitespace-pre-wrap text-sm text-zinc-300 leading-relaxed font-sans">${escapeHtml(content)}</pre>
  </div>
</body>
</html>
  `;
}

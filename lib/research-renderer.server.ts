// ============================================================================
// RESEARCH RENDERER (Server-Side) - Renderizado Visual de Datos de Investigación
// ============================================================================
// Versión server-side del renderer para Deep Research API routes
// Genera HTML visual en lugar de JSON en crudo

// ============================================================================
// TIPOS
// ============================================================================

type DataPattern = 
  | 'people'
  | 'companies'
  | 'products'
  | 'pricing'
  | 'features'
  | 'table'
  | 'key-value'
  | 'list'
  | 'unknown';

interface DataAnalysis {
  pattern: DataPattern;
  rootKey: string | null;
  items: any[];
  metadata: Record<string, any>;
}

// ============================================================================
// HELPERS
// ============================================================================

function escapeHtml(str: string): string {
  if (typeof str !== 'string') return String(str ?? '');
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

function formatValue(value: any, maxLength = 200): string {
  if (value === null || value === undefined) return '<span class="text-zinc-500 italic">N/A</span>';
  if (typeof value === 'boolean') return value ? '✓ Sí' : '✗ No';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '<span class="text-zinc-500 italic">Vacío</span>';
    return value.map(v => 
      `<span class="inline-block text-[11px] px-2 py-0.5 bg-zinc-700/50 text-zinc-300 rounded-full mr-1 mb-1">${escapeHtml(String(v))}</span>`
    ).join('');
  }
  if (typeof value === 'object') {
    const json = JSON.stringify(value, null, 2);
    if (json.length > maxLength) {
      return `<details class="inline"><summary class="cursor-pointer text-violet-400 text-xs">Ver objeto...</summary><pre class="text-[10px] bg-zinc-800/50 p-2 rounded mt-1 overflow-auto max-h-32">${escapeHtml(json)}</pre></details>`;
    }
    return `<pre class="text-[10px] bg-zinc-800/50 p-2 rounded overflow-auto max-h-24">${escapeHtml(json)}</pre>`;
  }
  const str = String(value);
  if (str.length > maxLength) {
    return `<span title="${escapeHtml(str)}">${escapeHtml(str.substring(0, maxLength))}...</span>`;
  }
  return escapeHtml(str);
}

function formatFieldName(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^\w/, c => c.toUpperCase())
    .trim();
}

// ============================================================================
// PATTERN DETECTION
// ============================================================================

const PERSON_FIELDS = ['nombre', 'name', 'apellido', 'email', 'telefono', 'phone', 'cargo', 'position', 'posicion', 'rol', 'role', 'afiliacion', 'affiliation', 'institucion', 'institution', 'areas_investigacion', 'research_areas', 'especialidad', 'pais', 'country'];
const COMPANY_FIELDS = ['empresa', 'company', 'fundadores', 'founders', 'industria', 'industry', 'sector', 'empleados', 'employees', 'fundacion', 'founded', 'sede', 'headquarters'];
const PRICING_FIELDS = ['precio', 'price', 'plan', 'planes', 'suscripcion', 'subscription', 'costo', 'cost', 'tarifa', 'mensual', 'anual'];
const FEATURE_FIELDS = ['caracteristicas', 'features', 'funcionalidades', 'capacidades', 'capabilities'];

function countMatchingFields(obj: any, fields: string[]): number {
  if (!obj || typeof obj !== 'object') return 0;
  const keys = Object.keys(obj).map(k => k.toLowerCase());
  return fields.filter(f => keys.some(k => k.includes(f) || f.includes(k))).length;
}

function detectPattern(items: any[]): DataPattern {
  if (items.length === 0) return 'list';
  
  const sample = items.slice(0, 3);
  let scores = { people: 0, companies: 0, pricing: 0, features: 0, table: 0 };

  for (const item of sample) {
    if (typeof item !== 'object' || item === null) continue;
    scores.people += countMatchingFields(item, PERSON_FIELDS);
    scores.companies += countMatchingFields(item, COMPANY_FIELDS);
    scores.pricing += countMatchingFields(item, PRICING_FIELDS);
    scores.features += countMatchingFields(item, FEATURE_FIELDS);
    if (Object.keys(item).length > 2) scores.table += 1;
  }

  const max = Math.max(...Object.values(scores));
  if (max === 0) return 'table';
  
  if (scores.people === max) return 'people';
  if (scores.companies === max) return 'companies';
  if (scores.pricing === max) return 'pricing';
  if (scores.features === max) return 'features';
  return 'table';
}

function analyzeData(data: any): DataAnalysis {
  if (!data || typeof data !== 'object') {
    return { pattern: 'unknown', rootKey: null, items: [], metadata: {} };
  }

  if (Array.isArray(data)) {
    return { pattern: detectPattern(data), rootKey: null, items: data, metadata: {} };
  }

  const keys = Object.keys(data);
  const arrayKeys = keys.filter(k => Array.isArray(data[k]) && data[k].length > 0);
  
  // Find main array
  let rootKey: string | null = null;
  let items: any[] = [];
  
  // Priority: largest array or known keys
  const knownRoots = ['investigadores', 'researchers', 'empresas', 'companies', 'personas', 'people', 'productos', 'products', 'planes_suscripcion', 'plans', 'resultados', 'results', 'items', 'data', 'lista', 'list'];
  
  for (const key of arrayKeys) {
    if (knownRoots.some(rk => key.toLowerCase().includes(rk))) {
      rootKey = key;
      items = data[key];
      break;
    }
  }
  
  if (!rootKey && arrayKeys.length > 0) {
    // Pick largest array
    rootKey = arrayKeys.reduce((a, b) => data[a].length > data[b].length ? a : b);
    items = data[rootKey];
  }

  // Extract metadata (non-array top-level fields)
  const metadata: Record<string, any> = {};
  for (const key of keys) {
    if (!Array.isArray(data[key])) {
      metadata[key] = data[key];
    }
  }

  const pattern = items.length > 0 ? detectPattern(items) : 'key-value';
  
  return { pattern, rootKey, items, metadata };
}

// ============================================================================
// RENDERERS
// ============================================================================

function renderPersonCard(person: any, index: number): string {
  const name = person.nombre || person.name || person.fullName || `Persona ${index + 1}`;
  const position = person.posicion || person.position || person.cargo || person.rol || person.role || '';
  const affiliation = person.afiliacion || person.affiliation || person.institucion || person.institution || person.empresa || person.company || '';
  const country = person.pais || person.country || '';
  const email = person.email || '';
  const areas = person.areas_investigacion || person.research_areas || person.especialidades || person.specialties || [];
  const type = person.tipo || person.type || '';
  
  const displayedFields = ['nombre', 'name', 'fullName', 'posicion', 'position', 'cargo', 'rol', 'role', 'afiliacion', 'affiliation', 'institucion', 'institution', 'empresa', 'company', 'pais', 'country', 'email', 'areas_investigacion', 'research_areas', 'especialidades', 'specialties', 'tipo', 'type'];
  const otherFields = Object.entries(person).filter(([key]) => !displayedFields.includes(key));

  return `
    <div class="p-4 bg-gradient-to-br from-zinc-800/80 to-zinc-900/80 rounded-xl border border-white/5 hover:border-violet-500/30 transition-all">
      <div class="flex items-start gap-3 mb-3">
        <div class="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/30 to-purple-600/30 flex items-center justify-center text-violet-300 font-bold text-lg shrink-0">
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
          ${areas.slice(0, 4).map((area: string) => `<span class="text-[10px] px-2 py-0.5 bg-zinc-700/60 text-zinc-300 rounded-full">${escapeHtml(area)}</span>`).join('')}
          ${areas.length > 4 ? `<span class="text-[10px] px-2 py-0.5 bg-zinc-600/40 text-zinc-400 rounded-full">+${areas.length - 4}</span>` : ''}
        </div>
      </div>
      ` : ''}
      
      ${otherFields.length > 0 ? `
      <details class="mt-3 pt-3 border-t border-white/5">
        <summary class="text-[10px] text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors">
          + ${otherFields.length} campos adicionales
        </summary>
        <div class="mt-2 space-y-1.5">
          ${otherFields.slice(0, 6).map(([key, val]) => `
            <div class="flex justify-between items-start gap-2">
              <span class="text-[10px] text-zinc-500 shrink-0">${formatFieldName(key)}:</span>
              <span class="text-[10px] text-zinc-300 text-right">${formatValue(val, 100)}</span>
            </div>
          `).join('')}
        </div>
      </details>
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
  const description = company.descripcion || company.description || company.descripcion_general || '';
  
  const displayedFields = ['empresa', 'company', 'nombre', 'name', 'fundadores', 'founders', 'industria', 'industry', 'sector', 'empleados', 'employees', 'fundacion', 'founded', 'año', 'year', 'descripcion', 'description', 'descripcion_general'];
  const otherFields = Object.entries(company).filter(([key]) => !displayedFields.includes(key));
  
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
      
      ${description ? `<p class="text-xs text-zinc-400 mb-3 line-clamp-2">${escapeHtml(typeof description === 'string' ? description.substring(0, 150) : String(description))}</p>` : ''}
      
      ${Array.isArray(founders) && founders.length > 0 ? `
      <div class="mb-3">
        <div class="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">Fundadores</div>
        <div class="flex flex-wrap gap-1">
          ${founders.slice(0, 5).map((f: string) => `<span class="text-[11px] px-2 py-0.5 bg-zinc-700/50 text-zinc-300 rounded-full">${escapeHtml(f)}</span>`).join('')}
        </div>
      </div>
      ` : ''}
      
      <div class="flex flex-wrap gap-3 text-[10px] text-zinc-400 mt-2 pt-2 border-t border-white/5">
        ${founded ? `<span>📅 ${escapeHtml(String(founded))}</span>` : ''}
        ${employees ? `<span>👥 ${escapeHtml(String(employees))}</span>` : ''}
      </div>
      
      ${otherFields.length > 0 ? `
      <details class="mt-3">
        <summary class="text-[10px] text-zinc-500 cursor-pointer hover:text-zinc-300">+ ${otherFields.length} campos</summary>
        <div class="mt-2 space-y-1">
          ${otherFields.slice(0, 5).map(([key, val]) => `
            <div class="text-[10px]">
              <span class="text-zinc-500">${formatFieldName(key)}:</span>
              <span class="text-zinc-300 ml-1">${formatValue(val, 80)}</span>
            </div>
          `).join('')}
        </div>
      </details>
      ` : ''}
    </div>
  `;
}

function renderPricingCard(plan: any, index: number): string {
  const name = plan.nombre || plan.name || plan.plan || `Plan ${index + 1}`;
  const price = plan.precio_mensual_usd || plan.precio || plan.price || plan.costo || '';
  const features = plan.caracteristicas_clave || plan.caracteristicas || plan.features || plan.caracteristicas_adicionales || [];
  const idealFor = plan.ideal_para || plan.target || '';
  const support = plan.soporte || plan.support || '';
  
  return `
    <div class="p-4 bg-gradient-to-br from-zinc-800/80 to-zinc-900/80 rounded-xl border border-white/5 hover:border-emerald-500/30 transition-all flex flex-col">
      <div class="text-center mb-4">
        <h3 class="font-bold text-lg text-zinc-100">${escapeHtml(name)}</h3>
        ${price ? `<div class="text-2xl font-bold text-emerald-400 mt-2">$${escapeHtml(String(price))}<span class="text-sm text-zinc-500">/mes</span></div>` : ''}
        ${idealFor ? `<p class="text-[11px] text-zinc-400 mt-2">${escapeHtml(idealFor)}</p>` : ''}
      </div>
      
      ${Array.isArray(features) && features.length > 0 ? `
      <div class="flex-1">
        <div class="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Incluye:</div>
        <ul class="space-y-1.5">
          ${features.slice(0, 6).map((f: string) => `
            <li class="text-[11px] text-zinc-300 flex items-start gap-2">
              <span class="text-emerald-400 shrink-0">✓</span>
              <span>${escapeHtml(f)}</span>
            </li>
          `).join('')}
          ${features.length > 6 ? `<li class="text-[10px] text-zinc-500">+${features.length - 6} más...</li>` : ''}
        </ul>
      </div>
      ` : ''}
      
      ${support ? `
      <div class="mt-3 pt-3 border-t border-white/5 text-[10px] text-zinc-400">
        💬 ${escapeHtml(support)}
      </div>
      ` : ''}
    </div>
  `;
}

function renderGenericCard(item: any, index: number): string {
  if (typeof item !== 'object' || item === null) {
    return `<div class="p-3 bg-zinc-800/60 rounded-lg text-sm text-zinc-300">${formatValue(item)}</div>`;
  }

  const entries = Object.entries(item);
  const titleField = entries.find(([k]) => ['nombre', 'name', 'titulo', 'title', 'label', 'tipo', 'type'].includes(k.toLowerCase()));
  const title = titleField ? String(titleField[1]) : `Item ${index + 1}`;
  
  return `
    <div class="p-4 bg-gradient-to-br from-zinc-800/80 to-zinc-900/80 rounded-xl border border-white/5 hover:border-zinc-600/50 transition-all">
      <h3 class="font-semibold text-zinc-100 mb-3 truncate">${escapeHtml(title)}</h3>
      <div class="space-y-2">
        ${entries.filter(([k]) => k !== (titleField?.[0])).slice(0, 5).map(([key, val]) => `
          <div class="text-xs">
            <span class="text-zinc-500">${formatFieldName(key)}:</span>
            <div class="text-zinc-300 mt-0.5">${formatValue(val, 150)}</div>
          </div>
        `).join('')}
        ${entries.length > 6 ? `<div class="text-[10px] text-zinc-500 pt-2">+ ${entries.length - 6} campos más</div>` : ''}
      </div>
    </div>
  `;
}

function renderTable(items: any[]): string {
  if (items.length === 0) return '<p class="text-zinc-500 text-center py-4">Sin datos</p>';
  
  const allKeys = new Set<string>();
  items.forEach(item => {
    if (typeof item === 'object' && item !== null) {
      Object.keys(item).forEach(k => allKeys.add(k));
    }
  });
  const headers = Array.from(allKeys).slice(0, 6);
  
  return `
    <div class="overflow-x-auto rounded-xl border border-white/5">
      <table class="w-full text-sm">
        <thead class="bg-zinc-800/80">
          <tr>
            ${headers.map(h => `<th class="px-4 py-3 text-left text-[11px] font-bold text-zinc-400 uppercase tracking-wider">${formatFieldName(h)}</th>`).join('')}
          </tr>
        </thead>
        <tbody class="divide-y divide-white/5">
          ${items.slice(0, 20).map((item, i) => `
            <tr class="hover:bg-zinc-800/40 transition-colors ${i % 2 === 0 ? 'bg-zinc-900/40' : 'bg-zinc-900/20'}">
              ${headers.map(h => `<td class="px-4 py-3 text-xs text-zinc-300">${formatValue(item?.[h], 80)}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${items.length > 20 ? `<div class="text-center py-3 text-xs text-zinc-500 bg-zinc-800/40">Mostrando 20 de ${items.length} registros</div>` : ''}
    </div>
  `;
}

function renderKeyValue(data: Record<string, any>, maxItems = 12): string {
  const entries = Object.entries(data).slice(0, maxItems);
  
  return `
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      ${entries.map(([key, val]) => {
        const isComplex = typeof val === 'object' && val !== null;
        return `
          <div class="p-4 bg-zinc-800/60 rounded-xl border border-white/5">
            <div class="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5">${formatFieldName(key)}</div>
            <div class="text-sm text-zinc-200">${isComplex ? formatValue(val, 300) : formatValue(val, 200)}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderNestedObject(obj: any, title: string): string {
  if (typeof obj !== 'object' || obj === null) {
    return `<div class="p-4 bg-zinc-800/60 rounded-xl">
      <h3 class="text-sm font-semibold text-zinc-200 mb-2">${formatFieldName(title)}</h3>
      <div class="text-zinc-300">${formatValue(obj)}</div>
    </div>`;
  }

  const entries = Object.entries(obj);
  
  return `
    <div class="p-4 bg-zinc-800/40 rounded-xl border border-white/5">
      <h3 class="text-sm font-semibold text-zinc-200 mb-3 flex items-center gap-2">
        <span class="w-1.5 h-1.5 rounded-full bg-violet-400"></span>
        ${formatFieldName(title)}
      </h3>
      <div class="space-y-2">
        ${entries.slice(0, 8).map(([key, val]) => `
          <div class="text-xs">
            <span class="text-zinc-500">${formatFieldName(key)}:</span>
            <div class="text-zinc-300 mt-0.5 pl-2">${formatValue(val, 200)}</div>
          </div>
        `).join('')}
        ${entries.length > 8 ? `<div class="text-[10px] text-zinc-500">+ ${entries.length - 8} campos más</div>` : ''}
      </div>
    </div>
  `;
}

// ============================================================================
// MAIN RENDER FUNCTION
// ============================================================================

export function renderResearchDataAsHtml(data: unknown, prompt: string): string {
  const analysis = analyzeData(data);
  const date = new Date().toLocaleDateString('es-ES', { 
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  let contentHtml = '';
  const items = analysis.items;
  const metadata = analysis.metadata;

  // Render summary metrics from metadata
  let metricsHtml = '';
  const metricKeys = Object.keys(metadata).filter(k => 
    typeof metadata[k] === 'string' || typeof metadata[k] === 'number'
  ).slice(0, 4);
  
  if (metricKeys.length > 0 || items.length > 0) {
    metricsHtml = `
      <div class="mb-6 flex flex-wrap gap-3">
        ${items.length > 0 ? `
        <div class="px-4 py-2 bg-violet-500/10 border border-violet-500/20 rounded-lg">
          <div class="text-2xl font-bold text-violet-400">${items.length}</div>
          <div class="text-xs text-violet-300/70">${formatFieldName(analysis.rootKey || 'Resultados')}</div>
        </div>
        ` : ''}
        ${metricKeys.map(key => `
          <div class="px-4 py-2 bg-zinc-800/60 border border-white/5 rounded-lg">
            <div class="text-lg font-bold text-zinc-200">${formatValue(metadata[key], 50)}</div>
            <div class="text-xs text-zinc-500">${formatFieldName(key)}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Render items based on pattern
  if (items.length > 0) {
    const gridClass = analysis.pattern === 'pricing' 
      ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3' 
      : 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3';
    
    let itemsHtml = '';
    switch (analysis.pattern) {
      case 'people':
        itemsHtml = items.map((item, i) => renderPersonCard(item, i)).join('');
        break;
      case 'companies':
        itemsHtml = items.map((item, i) => renderCompanyCard(item, i)).join('');
        break;
      case 'pricing':
        itemsHtml = items.map((item, i) => renderPricingCard(item, i)).join('');
        break;
      case 'table':
        contentHtml = renderTable(items);
        break;
      default:
        itemsHtml = items.map((item, i) => renderGenericCard(item, i)).join('');
    }
    
    if (analysis.pattern !== 'table') {
      contentHtml = `<div class="${gridClass}">${itemsHtml}</div>`;
    }
  }

  // Render complex nested objects from metadata
  const complexKeys = Object.keys(metadata).filter(k => 
    typeof metadata[k] === 'object' && metadata[k] !== null && !Array.isArray(metadata[k])
  );
  
  let nestedHtml = '';
  if (complexKeys.length > 0) {
    nestedHtml = `
      <div class="mt-6">
        <h2 class="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4">Información Detallada</h2>
        <div class="grid gap-4 sm:grid-cols-2">
          ${complexKeys.slice(0, 6).map(key => renderNestedObject(metadata[key], key)).join('')}
        </div>
      </div>
    `;
  }

  // If no items but have metadata, render as key-value
  if (items.length === 0 && Object.keys(metadata).length > 0) {
    contentHtml = renderKeyValue(metadata);
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Deep Research: ${escapeHtml(prompt.substring(0, 50))}</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  <style>
    body { background: linear-gradient(135deg, #0c0c0e 0%, #18181b 100%); min-height: 100vh; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: #52525b; }
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
          <h1 class="text-xl md:text-2xl font-bold text-zinc-100">Deep Research</h1>
          <p class="text-xs text-zinc-500">Investigación completada • ${date}</p>
        </div>
      </div>
      <div class="p-4 bg-zinc-800/30 rounded-lg border border-white/5">
        <div class="text-xs text-zinc-500 mb-1">Consulta original</div>
        <p class="text-sm text-zinc-300">${escapeHtml(prompt)}</p>
      </div>
    </div>
    
    <!-- Metrics Summary -->
    ${metricsHtml}
    
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
    
    <!-- Nested Details -->
    ${nestedHtml}
    
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
</html>`;
}

/**
 * Tipos para el módulo Lab Redacción
 * 
 * Tablas: redaccion_tipos, redaccion, redaccion_detalles
 * Módulo independiente — sin dependencias del resto del sistema.
 * 
 * @module types/redaccion
 */

// ============================================================================
// REDACCION TIPOS (Plantillas de documentos)
// ============================================================================

export interface RedaccionTipo {
  id: number;
  nombre: string;
  partes: number;
  instrucciones: string | null;
  longitud: number | null;
  objetivo: string | null;
  requerimientos: string | null;
  empresa_id: number | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// REDACCION (Documentos)
// ============================================================================

export type RedaccionEstado = 'borrador' | 'en_revision' | 'publicado' | 'archivado' | 'preparando';

export interface RedaccionContacto {
  id: number;
  nombre: string | null;
  apellido: string | null;
  telefono: string | null;
}

export interface Redaccion {
  id: number;
  nombre: string;
  url_doc: string | null;
  tipo_id: number;
  contacto_id: number | null;
  estado: RedaccionEstado;
  descripcion: string | null;
  created_at: string;
  updated_at: string;
  // Join data
  tipo?: RedaccionTipo;
  contacto?: RedaccionContacto | null;
}

// ============================================================================
// REDACCION DETALLES (Secciones/Partes del documento)
// ============================================================================

export interface RedaccionDetalle {
  id: number;
  titulo: string;
  contenido: string | null;
  orden: number;
  redaccion_id: number;
  evaluacion: number | null;
  plan_seccion: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// FILTROS
// ============================================================================

export interface RedaccionFilters {
  search: string;
  tipoId: number | null;
  estado: RedaccionEstado | null;
}

export const DEFAULT_REDACCION_FILTERS: RedaccionFilters = {
  search: '',
  tipoId: null,
  estado: null,
};

// ============================================================================
// ESTADO LABELS & COLORES
// ============================================================================

export const ESTADO_CONFIG: Record<RedaccionEstado, { label: string; color: string; bg: string }> = {
  borrador: { label: 'Borrador', color: 'text-zinc-400', bg: 'bg-zinc-500/20' },
  preparando: { label: 'Preparando', color: 'text-amber-400', bg: 'bg-amber-500/20' },
  en_revision: { label: 'En Revisión', color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
  publicado: { label: 'Publicado', color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  archivado: { label: 'Archivado', color: 'text-zinc-500', bg: 'bg-zinc-600/20' },
};

// ============================================================================
// GENERADOR IA — Request / Response / Progress
// ============================================================================

export interface GenerateRedaccionRequest {
  contexto: string;
  tipo_id: number;
  contacto_id?: number;
  empresa_id: number;
  contexto_structured?: ContextOrganized | null;
}

export type GenerationPhase = 'idle' | 'planning' | 'writing' | 'complete' | 'error';

export interface GenerationProgress {
  phase: GenerationPhase;
  currentSection: number;
  totalSections: number;
  currentTitle: string;
  redaccionId: number | null;
  error: string | null;
}

export const INITIAL_GENERATION_PROGRESS: GenerationProgress = {
  phase: 'idle',
  currentSection: 0,
  totalSections: 0,
  currentTitle: '',
  redaccionId: null,
  error: null,
};

// SSE event types streamed from the API
export type GenerationSSEEvent =
  | { type: 'plan_created'; redaccionId: number; totalSections: number; nombre: string }
  | { type: 'writing_section'; orden: number; titulo: string }
  | { type: 'section_complete'; orden: number; titulo: string }
  | { type: 'complete'; redaccionId: number }
  | { type: 'error'; message: string };

// ============================================================================
// GESTOR DE CONTEXTO — Fuentes de datos + organización IA
// ============================================================================

export type ContextSourceType = 'text' | 'url' | 'json' | 'csv' | 'markdown' | 'excel';

export const CONTEXT_SOURCE_ACCEPT: Record<ContextSourceType, string> = {
  text: '.txt',
  url: '',
  json: '.json',
  csv: '.csv',
  markdown: '.md',
  excel: '.xlsx,.xls',
};

export const CONTEXT_SOURCE_LABELS: Record<ContextSourceType, string> = {
  text: 'Texto',
  url: 'URL',
  json: 'JSON',
  csv: 'CSV',
  markdown: 'Markdown',
  excel: 'Excel',
};

export interface ContextSource {
  id: string;
  type: ContextSourceType;
  name: string;
  rawContent: string;
  addedAt: number;
}

export interface ContextOrganized {
  resumen: string;
  categorias: Array<{
    nombre: string;
    datos: Record<string, unknown>[];
  }>;
  puntos_clave: string[];
  metadata: {
    totalSources: number;
    processedAt: string;
  };
  [key: string]: unknown;
}

export type ContextPhase = 'idle' | 'adding' | 'processing' | 'ready' | 'error';

export interface ContextManagerState {
  sources: ContextSource[];
  organizedJson: ContextOrganized | null;
  phase: ContextPhase;
  error: string | null;
}

// ============================================================================
// ARTIFACT TYPES - Sistema de Artefactos con Versionado
// ============================================================================

export type ArtifactType = 'html' | 'markdown' | 'svg' | 'mermaid' | 'react' | 'code' | 'research';

export type ArtifactStatus = 'building' | 'ready' | 'error';

export interface Artifact {
  id: string;
  user_id: string;
  session_id?: string | null;
  message_id?: string | null;
  
  // Content
  title: string;
  content: string;
  type: ArtifactType;
  language?: string | null; // For type='code': 'javascript', 'python', etc.
  
  // Metadata
  description?: string | null;
  tags: string[];
  is_pinned: boolean;
  is_public: boolean;
  public_slug?: string | null;
  
  // Stats
  view_count: number;
  fork_count: number;
  forked_from?: string | null;
  
  // Timestamps
  created_at: string;
  updated_at: string;
  
  // Computed (from joins)
  versions?: ArtifactVersion[];
  version_count?: number;
  is_starred?: boolean;
}

export interface ArtifactVersion {
  id: string;
  artifact_id: string;
  content: string;
  title?: string | null;
  description?: string | null;
  version_number: number;
  change_description?: string | null;
  is_auto_save: boolean;
  created_at: string;
}

export interface ArtifactStar {
  id: string;
  user_id: string;
  artifact_id: string;
  created_at: string;
}

// ============================================================================
// PAYLOADS
// ============================================================================

export interface CreateArtifactPayload {
  title?: string;
  content: string;
  type?: ArtifactType;
  language?: string;
  description?: string;
  tags?: string[];
  session_id?: string;
  message_id?: string;
}

export interface UpdateArtifactPayload {
  title?: string;
  content?: string;
  type?: ArtifactType;
  language?: string;
  description?: string;
  tags?: string[];
  is_pinned?: boolean;
}

export interface CreateVersionPayload {
  content: string;
  title?: string;
  description?: string;
  change_description?: string;
  is_auto_save?: boolean;
}

// ============================================================================
// FILTERS
// ============================================================================

export interface ArtifactFilters {
  type?: ArtifactType | null;
  search?: string;
  tags?: string[];
  is_pinned?: boolean;
  is_starred?: boolean;
  session_id?: string;
  sort_by?: 'created_at' | 'updated_at' | 'title';
  sort_order?: 'asc' | 'desc';
}

export const DEFAULT_ARTIFACT_FILTERS: ArtifactFilters = {
  type: null,
  search: '',
  tags: [],
  is_pinned: false,
  is_starred: false,
  session_id: undefined,
  sort_by: 'updated_at',
  sort_order: 'desc'
};

// ============================================================================
// UI STATE
// ============================================================================

export interface ArtifactPanelState {
  isOpen: boolean;
  activeArtifactId: string | null;
  mode: 'preview' | 'code' | 'edit';
  previewSize: 'desktop' | 'tablet' | 'mobile';
  status: ArtifactStatus;
  hasUnsavedChanges: boolean;
  editContent: string;
  currentVersionIndex: number;
}

export const DEFAULT_ARTIFACT_PANEL_STATE: ArtifactPanelState = {
  isOpen: false,
  activeArtifactId: null,
  mode: 'preview',
  previewSize: 'desktop',
  status: 'ready',
  hasUnsavedChanges: false,
  editContent: '',
  currentVersionIndex: -1 // -1 = latest
};

// ============================================================================
// HELPERS
// ============================================================================

export const ARTIFACT_TYPE_LABELS: Record<ArtifactType, string> = {
  html: 'HTML / App',
  markdown: 'Markdown',
  svg: 'SVG Image',
  mermaid: 'Diagram',
  react: 'React Component',
  code: 'Code Snippet',
  research: 'Investigación'
};

export const ARTIFACT_TYPE_ICONS: Record<ArtifactType, string> = {
  html: 'Code2',
  markdown: 'FileText',
  svg: 'Image',
  mermaid: 'GitBranch',
  react: 'Component',
  code: 'Terminal',
  research: 'Sparkles'
};

export const ARTIFACT_TYPE_COLORS: Record<ArtifactType, string> = {
  html: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  markdown: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  svg: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  mermaid: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  react: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
  code: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  research: 'text-violet-400 bg-violet-500/10 border-violet-500/20'
};

export function detectArtifactType(content: string): ArtifactType {
  const trimmed = content.trim();
  
  // Research detection - JSON with research patterns or markdown with JSON blocks
  // Check this early since research can contain other patterns
  if (
    // Has JSON block in markdown
    (trimmed.includes('```json') && (trimmed.includes('Investigación') || trimmed.includes('🔍') || trimmed.includes('Resultados'))) ||
    // Pure JSON that looks like research data
    (isLikelyResearchJson(trimmed))
  ) {
    return 'research';
  }
  
  // SVG detection
  if (trimmed.startsWith('<svg') || trimmed.includes('xmlns="http://www.w3.org/2000/svg"')) {
    return 'svg';
  }
  
  // Mermaid detection
  if (trimmed.startsWith('```mermaid') || /^(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|mindmap)/i.test(trimmed)) {
    return 'mermaid';
  }
  
  // React detection (JSX with imports)
  if (trimmed.includes('import React') || trimmed.includes('from "react"') || trimmed.includes("from 'react'")) {
    return 'react';
  }
  
  // HTML detection
  if (/<[a-z][\s\S]*>/i.test(trimmed) && (trimmed.includes('</') || trimmed.includes('/>') || trimmed.includes('<html') || trimmed.includes('<div') || trimmed.includes('<table'))) {
    return 'html';
  }
  
  // Pure JSON detection - structured data that should be visualized
  if (isStructuredJson(trimmed)) {
    return 'research'; // Use research type for JSON data visualization
  }
  
  // Markdown detection (has headers, lists, links)
  if (/^#{1,6}\s/m.test(trimmed) || /^\s*[-*+]\s/m.test(trimmed) || /\[.+\]\(.+\)/.test(trimmed)) {
    return 'markdown';
  }
  
  // Default to code
  return 'code';
}

// Helper to detect if content is likely research JSON
function isLikelyResearchJson(content: string): boolean {
  if (!content.startsWith('{') && !content.startsWith('[')) return false;
  
  try {
    const data = JSON.parse(content);
    if (!data || typeof data !== 'object') return false;
    
    // Check for common research/data patterns
    const keys = Object.keys(data);
    const researchKeys = ['investigadores', 'researchers', 'empresas', 'companies', 'personas', 'people', 
                          'resultados', 'results', 'datos', 'data', 'items', 'records', 'entries',
                          'productos', 'products', 'eventos', 'events', 'lista', 'list'];
    
    // Has a root key that looks like research data
    const hasResearchKey = keys.some(k => researchKeys.some(rk => k.toLowerCase().includes(rk)));
    
    // Or has arrays of objects (structured data)
    const hasArrayOfObjects = keys.some(k => 
      Array.isArray(data[k]) && data[k].length > 0 && typeof data[k][0] === 'object'
    );
    
    return hasResearchKey || hasArrayOfObjects;
  } catch {
    return false;
  }
}

// Helper to detect structured JSON that should be visualized
function isStructuredJson(content: string): boolean {
  if ((!content.startsWith('{') || !content.endsWith('}')) && 
      (!content.startsWith('[') || !content.endsWith(']'))) {
    return false;
  }
  
  try {
    const data = JSON.parse(content);
    if (!data || typeof data !== 'object') return false;
    
    // Arrays with objects
    if (Array.isArray(data)) {
      return data.length > 0 && typeof data[0] === 'object' && data[0] !== null;
    }
    
    // Objects with arrays or nested structures
    const values = Object.values(data);
    const hasComplexStructure = values.some(v => 
      Array.isArray(v) || (typeof v === 'object' && v !== null)
    );
    
    return hasComplexStructure;
  } catch {
    return false;
  }
}

export function formatArtifactSize(content: string): string {
  const bytes = new Blob([content]).size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function generateArtifactTitle(content: string, type: ArtifactType): string {
  // Try to extract title from content
  if (type === 'html') {
    const titleMatch = content.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) return titleMatch[1];
    
    const h1Match = content.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match) return h1Match[1];
  }
  
  if (type === 'markdown') {
    const headerMatch = content.match(/^#\s+(.+)$/m);
    if (headerMatch) return headerMatch[1];
  }
  
  // Default titles by type
  const defaultTitles: Record<ArtifactType, string> = {
    html: 'Interactive Canvas',
    markdown: 'Document',
    svg: 'Vector Image',
    mermaid: 'Diagram',
    react: 'React Component',
    code: 'Code Snippet',
    research: 'Deep Research'
  };
  
  return defaultTitles[type];
}

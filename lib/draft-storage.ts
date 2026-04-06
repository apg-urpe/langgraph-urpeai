/**
 * Draft Storage System - Persistencia de borradores en localStorage
 * 
 * Características:
 * - Debounce automático para evitar escrituras excesivas
 * - TTL configurable con auto-limpieza
 * - Namespaces para organizar borradores
 * - Límite de tamaño para evitar sobrecarga
 */

import { logger } from './logger';

// ============================================
// CONSTANTS
// ============================================

const STORAGE_PREFIX = 'urpe_draft_';
const DEFAULT_TTL_MS = 48 * 60 * 60 * 1000; // 48 horas
const MAX_DRAFT_SIZE_BYTES = 50 * 1024; // 50KB por borrador
const MAX_DRAFTS_PER_NAMESPACE = 20;
const DEBOUNCE_MS = 500;

// ============================================
// TYPES
// ============================================

export type DraftNamespace = 
  | 'contact_note'      // Notas de contacto
  | 'chat_input'        // Input del chat Monica
  | 'task_form'         // Formulario de tareas
  | 'message_reply'     // Respuesta a mensajes (ConversationMessages)
  | 'campaign_form'     // Formulario de campañas
  | 'team_member_form'  // Formulario de miembros de equipo
  | 'search_query';     // Queries de búsqueda

interface DraftEntry<T = string> {
  value: T;
  createdAt: number;
  updatedAt: number;
  namespace: DraftNamespace;
}

interface DraftMetadata {
  namespace: DraftNamespace;
  key: string;
  updatedAt: number;
  size: number;
}

// ============================================
// DEBOUNCE REGISTRY
// ============================================

const debounceTimers: Map<string, NodeJS.Timeout> = new Map();

// ============================================
// CORE FUNCTIONS
// ============================================

/**
 * Genera la key completa para localStorage
 */
function getStorageKey(namespace: DraftNamespace, key: string): string {
  return `${STORAGE_PREFIX}${namespace}_${key}`;
}

/**
 * Guarda un borrador (con debounce automático)
 */
export function saveDraft<T = string>(
  namespace: DraftNamespace,
  key: string,
  value: T,
  immediate = false
): void {
  const storageKey = getStorageKey(namespace, key);
  
  // Cancelar timer anterior si existe
  const existingTimer = debounceTimers.get(storageKey);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const saveOperation = () => {
    try {
      // Verificar tamaño
      const serialized = JSON.stringify(value);
      if (serialized.length > MAX_DRAFT_SIZE_BYTES) {
        logger.warn(`[DraftStorage] Draft too large for ${namespace}/${key}: ${serialized.length} bytes`);
        return;
      }

      const entry: DraftEntry<T> = {
        value,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        namespace
      };

      // Verificar si ya existe para preservar createdAt
      const existing = getDraftEntry<T>(namespace, key);
      if (existing) {
        entry.createdAt = existing.createdAt;
      }

      localStorage.setItem(storageKey, JSON.stringify(entry));
      
      // Limpiar borradores antiguos del namespace si excede el límite
      cleanupNamespace(namespace);
      
    } catch (err) {
      logger.error('[DraftStorage] Error saving draft:', err);
    }
  };

  if (immediate) {
    saveOperation();
  } else {
    const timer = setTimeout(saveOperation, DEBOUNCE_MS);
    debounceTimers.set(storageKey, timer);
  }
}

/**
 * Obtiene un borrador
 */
export function getDraft<T = string>(namespace: DraftNamespace, key: string): T | null {
  const entry = getDraftEntry<T>(namespace, key);
  if (!entry) return null;
  
  // Verificar TTL
  if (Date.now() - entry.updatedAt > DEFAULT_TTL_MS) {
    deleteDraft(namespace, key);
    return null;
  }
  
  return entry.value;
}

/**
 * Obtiene la entrada completa del borrador (incluyendo metadata)
 */
function getDraftEntry<T = string>(namespace: DraftNamespace, key: string): DraftEntry<T> | null {
  try {
    const storageKey = getStorageKey(namespace, key);
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    
    return JSON.parse(raw) as DraftEntry<T>;
  } catch {
    return null;
  }
}

/**
 * Elimina un borrador
 */
export function deleteDraft(namespace: DraftNamespace, key: string): void {
  try {
    const storageKey = getStorageKey(namespace, key);
    
    // Cancelar cualquier operación de guardado pendiente
    const timer = debounceTimers.get(storageKey);
    if (timer) {
      clearTimeout(timer);
      debounceTimers.delete(storageKey);
    }
    
    localStorage.removeItem(storageKey);
  } catch (err) {
    logger.error('[DraftStorage] Error deleting draft:', err);
  }
}

/**
 * Verifica si existe un borrador
 */
export function hasDraft(namespace: DraftNamespace, key: string): boolean {
  return getDraft(namespace, key) !== null;
}

// ============================================
// CLEANUP FUNCTIONS
// ============================================

/**
 * Limpia borradores antiguos de un namespace específico
 */
function cleanupNamespace(namespace: DraftNamespace): void {
  try {
    const drafts = getAllDraftsMetadata(namespace);
    
    if (drafts.length <= MAX_DRAFTS_PER_NAMESPACE) return;
    
    // Ordenar por fecha de actualización (más antiguos primero)
    drafts.sort((a, b) => a.updatedAt - b.updatedAt);
    
    // Eliminar los más antiguos hasta estar dentro del límite
    const toDelete = drafts.slice(0, drafts.length - MAX_DRAFTS_PER_NAMESPACE);
    for (const draft of toDelete) {
      localStorage.removeItem(getStorageKey(draft.namespace, draft.key));
      logger.debug(`[DraftStorage] Cleaned up old draft: ${draft.namespace}/${draft.key}`);
    }
  } catch (err) {
    logger.error('[DraftStorage] Error cleaning namespace:', err);
  }
}

/**
 * Limpia TODOS los borradores expirados
 */
export function cleanupExpiredDrafts(): number {
  let cleaned = 0;
  
  try {
    const allKeys = Object.keys(localStorage).filter(k => k.startsWith(STORAGE_PREFIX));
    
    for (const key of allKeys) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        
        const entry = JSON.parse(raw) as DraftEntry;
        if (Date.now() - entry.updatedAt > DEFAULT_TTL_MS) {
          localStorage.removeItem(key);
          cleaned++;
        }
      } catch {
        // Si no se puede parsear, eliminar
        localStorage.removeItem(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.info(`[DraftStorage] Cleaned ${cleaned} expired drafts`);
    }
  } catch (err) {
    logger.error('[DraftStorage] Error during cleanup:', err);
  }
  
  return cleaned;
}

/**
 * Obtiene metadata de todos los borradores de un namespace
 */
function getAllDraftsMetadata(namespace: DraftNamespace): DraftMetadata[] {
  const prefix = `${STORAGE_PREFIX}${namespace}_`;
  const drafts: DraftMetadata[] = [];
  
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      
      try {
        const entry = JSON.parse(raw) as DraftEntry;
        drafts.push({
          namespace,
          key: key.replace(prefix, ''),
          updatedAt: entry.updatedAt,
          size: raw.length
        });
      } catch {
        // Ignorar entradas corruptas
      }
    }
  } catch (err) {
    logger.error('[DraftStorage] Error getting drafts metadata:', err);
  }
  
  return drafts;
}

// ============================================
// STATISTICS
// ============================================

export interface DraftStorageStats {
  totalDrafts: number;
  totalSizeBytes: number;
  byNamespace: Record<DraftNamespace, number>;
}

/**
 * Obtiene estadísticas del almacenamiento de borradores
 */
export function getDraftStorageStats(): DraftStorageStats {
  const stats: DraftStorageStats = {
    totalDrafts: 0,
    totalSizeBytes: 0,
    byNamespace: {
      contact_note: 0,
      chat_input: 0,
      task_form: 0,
      message_reply: 0,
      campaign_form: 0,
      team_member_form: 0,
      search_query: 0
    }
  };
  
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
      
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      
      stats.totalDrafts++;
      stats.totalSizeBytes += raw.length;
      
      // Extraer namespace del key
      const nsMatch = key.replace(STORAGE_PREFIX, '').split('_')[0] as DraftNamespace;
      if (nsMatch && nsMatch in stats.byNamespace) {
        stats.byNamespace[nsMatch]++;
      }
    }
  } catch (err) {
    logger.error('[DraftStorage] Error getting stats:', err);
  }
  
  return stats;
}

// ============================================
// AUTO-CLEANUP ON LOAD
// ============================================

// Ejecutar limpieza al cargar el módulo (solo en cliente)
if (typeof window !== 'undefined') {
  // Delay para no bloquear la carga inicial
  setTimeout(() => {
    cleanupExpiredDrafts();
  }, 5000);
}

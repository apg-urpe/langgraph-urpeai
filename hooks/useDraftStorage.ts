/**
 * Hook para persistencia de borradores en localStorage
 * 
 * Uso:
 * const [value, setValue, clearDraft] = useDraftStorage('contact_note', `note_${contactId}`, '');
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  DraftNamespace, 
  saveDraft, 
  getDraft, 
  deleteDraft 
} from '../lib/draft-storage';

/**
 * Hook principal para manejar borradores
 * 
 * @param namespace - Categoría del borrador
 * @param key - Identificador único (ej: contactId, sessionId)
 * @param initialValue - Valor inicial si no hay borrador guardado
 * @returns [value, setValue, clearDraft, hasSavedDraft]
 */
export function useDraftStorage<T = string>(
  namespace: DraftNamespace,
  key: string,
  initialValue: T
): [T, (value: T) => void, () => void, boolean] {
  // Track if we've loaded the draft
  const hasLoadedRef = useRef(false);
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  
  // Initialize state with saved draft or initial value
  const [value, setValueInternal] = useState<T>(() => {
    // Solo en cliente
    if (typeof window === 'undefined') return initialValue;
    
    const saved = getDraft<T>(namespace, key);
    if (saved !== null) {
      hasLoadedRef.current = true;
      return saved;
    }
    return initialValue;
  });

  // Check for saved draft on mount (para SSR)
  useEffect(() => {
    if (hasLoadedRef.current) {
      setHasSavedDraft(true);
      return;
    }
    
    const saved = getDraft<T>(namespace, key);
    if (saved !== null) {
      setValueInternal(saved);
      setHasSavedDraft(true);
      hasLoadedRef.current = true;
    }
  }, [namespace, key]);

  // Setter que también guarda en localStorage
  const setValue = useCallback((newValue: T) => {
    setValueInternal(newValue);
    
    // Solo guardar si hay contenido significativo
    const hasContent = typeof newValue === 'string' 
      ? newValue.trim().length > 0 
      : newValue !== null && newValue !== undefined;
    
    if (hasContent) {
      saveDraft(namespace, key, newValue);
      setHasSavedDraft(true);
    } else {
      // Si está vacío, eliminar el borrador
      deleteDraft(namespace, key);
      setHasSavedDraft(false);
    }
  }, [namespace, key]);

  // Función para limpiar el borrador
  const clearDraft = useCallback(() => {
    deleteDraft(namespace, key);
    setValueInternal(initialValue);
    setHasSavedDraft(false);
  }, [namespace, key, initialValue]);

  return [value, setValue, clearDraft, hasSavedDraft];
}

/**
 * Hook simplificado para formularios con múltiples campos
 * 
 * Uso:
 * const { values, setValue, clearAll, hasDraft } = useDraftForm('task_form', taskId, {
 *   titulo: '',
 *   descripcion: '',
 *   prioridad: 2
 * });
 */
export function useDraftForm<T extends Record<string, unknown>>(
  namespace: DraftNamespace,
  key: string,
  initialValues: T
): {
  values: T;
  setValue: <K extends keyof T>(field: K, value: T[K]) => void;
  setValues: (newValues: Partial<T>) => void;
  clearAll: () => void;
  hasDraft: boolean;
} {
  const [values, setValuesInternal, clearAll, hasDraft] = useDraftStorage<T>(
    namespace,
    key,
    initialValues
  );

  const setValue = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
    setValuesInternal({
      ...values,
      [field]: value
    });
  }, [values, setValuesInternal]);

  const setValues = useCallback((newValues: Partial<T>) => {
    setValuesInternal({
      ...values,
      ...newValues
    });
  }, [values, setValuesInternal]);

  return { values, setValue, setValues, clearAll, hasDraft };
}

/**
 * Hook para inputs simples de texto
 * Retorna props listos para usar en un input/textarea
 */
export function useDraftInput(
  namespace: DraftNamespace,
  key: string,
  initialValue = ''
): {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  clear: () => void;
  hasDraft: boolean;
} {
  const [value, setValue, clear, hasDraft] = useDraftStorage(namespace, key, initialValue);

  const onChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValue(e.target.value);
  }, [setValue]);

  return { value, onChange, clear, hasDraft };
}

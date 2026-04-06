/**
 * Contact Store — Actions Slice
 * Notes CRUD, Multimedia CRUD, Team Assignments CRUD, Merge Contacts,
 * fetchTeamMembers, fetchOrigenOptions
 * @module store/contact/actionsSlice
 */

import { supabase } from '../../lib/supabase-client';
import { logger } from '../../lib/logger';
import { logActivity } from '../../lib/activity-logger';
import type { ContactState, ContactSet, ContactGet, ContactTeamAssignment, CreateAssignmentPayload, UpdateAssignmentPayload } from './types';

export const createActionsSlice = (set: ContactSet, get: ContactGet) => ({

  // ============================================
  // TEAM MEMBERS & ORIGEN OPTIONS
  // ============================================

  fetchTeamMembers: async (forceRefresh = false, enterpriseIdOverride: number | null = null) => {
    const { selectedEnterpriseId, teamMembers, teamMembersEnterpriseId } = get();
    const enterpriseId = enterpriseIdOverride ?? selectedEnterpriseId;
    if (!enterpriseId) return;

    // Skip if already loaded and not forcing refresh
    if (!forceRefresh && teamMembers.length > 0 && teamMembersEnterpriseId === enterpriseId) {
      console.log('[ContactStore] ⏩ Using cached team members');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('wp_team_humano')
        .select('id, nombre, apellido, email, is_active, rol, role_id')
        .eq('empresa_id', enterpriseId)
        .order('is_active', { ascending: false })
        .order('nombre', { ascending: true });

      if (error) {
        console.error('[ContactStore] Error fetching team members:', error);
        return;
      }

      set({ teamMembers: data || [], teamMembersEnterpriseId: enterpriseId });
      console.log('[ContactStore] ✅ Team members loaded:', data?.length || 0);
    } catch (err) {
      console.error('Error in fetchTeamMembers:', err);
    }
  },

  fetchOrigenOptions: async (forceRefresh = false) => {
    const { selectedEnterpriseId, origenOptions, origenOptionsEnterpriseId } = get();
    if (!selectedEnterpriseId) return;

    // Skip if already loaded for THIS enterprise and not forcing refresh
    if (!forceRefresh && origenOptions.length > 0 && origenOptionsEnterpriseId === selectedEnterpriseId) return;

    try {
      const { data, error } = await supabase
        .from('wp_contactos')
        .select('origen')
        .eq('empresa_id', selectedEnterpriseId)
        .not('origen', 'is', null)
        .order('origen', { ascending: true });

      if (error) {
        console.error('[ContactStore] Error fetching origen options:', error);
        return;
      }

      // Extract distinct values client-side
      const unique = Array.from(new Set((data || []).map((r: any) => r.origen as string).filter(Boolean)));
      set({ origenOptions: unique, origenOptionsEnterpriseId: selectedEnterpriseId });
      console.log('[ContactStore] ✅ Origen options loaded:', unique.length);
    } catch (err) {
      console.error('Error in fetchOrigenOptions:', err);
    }
  },

  // ============================================
  // NOTE ACTIONS
  // ============================================

  addContactNote: async (contactId: number, description: string, options?: { titulo?: string; etiquetas?: string[]; es_fijado?: boolean; archivos_urls?: string[]; visible_ia?: boolean }) => {
    logger.debug('[ContactStore] 📝 addContactNote called:', { contactId, description: description.substring(0, 50), options });
    
    // Log when dev team is writing to another enterprise
    if (get().isObservationMode) {
      logger.info('[ContactStore] 📝 Dev team adding note in observed enterprise');
    }
    
    const { userContext } = get();
    
    // Verificar que tenemos contexto de usuario
    if (!userContext?.id) {
      logger.error('[ContactStore] ❌ addContactNote failed: No userContext available');
      throw new Error('No hay sesión de usuario activa. Por favor recarga la página.');
    }
    
    const teamHumanoId = userContext.id;
    logger.debug('[ContactStore] 📝 User context:', { teamHumanoId, userName: userContext.nombre });

    const payload: Record<string, unknown> = {
      contacto_id: contactId,
      descripcion: description,
      team_humano_id: teamHumanoId
    };

    if (options?.titulo) payload.titulo = options.titulo;
    if (options?.etiquetas && options.etiquetas.length > 0) payload.etiquetas = options.etiquetas;
    if (options?.es_fijado !== undefined) payload.es_fijado = options.es_fijado;
    if (options?.archivos_urls && options.archivos_urls.length > 0) payload.archivos_urls = options.archivos_urls;
    if (options?.visible_ia !== undefined) payload.visible_ia = options.visible_ia;

    logger.debug('[ContactStore] 📝 Insert payload:', payload);

    // Helper to detect network errors
    const isNetworkError = (err: unknown): boolean => {
      if (err instanceof TypeError && err.message === 'Failed to fetch') return true;
      if (err instanceof Error && (
        err.message.includes('NetworkError') ||
        err.message.includes('network') ||
        err.message.includes('fetch')
      )) return true;
      return false;
    };

    // Attempt with retry on network failure
    const maxRetries = 2;
    let lastError: unknown = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          logger.debug(`[ContactStore] addContactNote retry ${attempt}/${maxRetries}`);
          try {
            await supabase.auth.refreshSession();
          } catch { /* ignore refresh errors */ }
          await new Promise(resolve => setTimeout(resolve, 500 * attempt));
        }

        const { data, error } = await supabase
          .from('wp_contactos_nota')
          .insert(payload)
          .select(`
            *,
            author:wp_team_humano(nombre, apellido)
          `)
          .single();

        if (error) {
          logger.error('[ContactStore] ❌ Supabase insert error:', error);
          throw new Error(`Error al guardar nota: ${error.message}`);
        }

        if (!data) {
          logger.error('[ContactStore] ❌ No data returned from insert');
          throw new Error('No se recibió respuesta del servidor al crear la nota');
        }

        logger.info('[ContactStore] ✅ Note created successfully:', { noteId: data.id });

        const empresaId = get().selectedEnterpriseId;
        if (empresaId) {
          void logActivity({
            tipo: 'nota', accion: 'crear',
            descripcion: `Nota creada: ${(options?.titulo || description.substring(0, 40))}`,
            contactoId: contactId,
            empresaId,
            usuarioId: get().userContext?.authUid
          });
        }

        // Update local state with author info and sort (pinned first)
        set(state => {
          const newNotes = [data, ...state.activeContactData.notes].sort((a, b) => {
            if (a.es_fijado && !b.es_fijado) return -1;
            if (!a.es_fijado && b.es_fijado) return 1;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          });
          
          return {
            activeContactData: {
              ...state.activeContactData,
              notes: newNotes
            }
          };
        });

        return; // Success - exit

      } catch (err) {
        lastError = err;
        if (isNetworkError(err) && attempt < maxRetries) {
          logger.warn(`[ContactStore] addContactNote network error, will retry...`);
          continue;
        }
        break;
      }
    }

    // All retries failed
    if (lastError instanceof TypeError && lastError.message === 'Failed to fetch') {
      throw new Error('Error de conexión. Verifica tu internet e intenta de nuevo.');
    }
    throw lastError;
  },

  updateContactNote: async (noteId: number, description: string, options?: { titulo?: string; etiquetas?: string[]; es_fijado?: boolean; archivos_urls?: string[]; visible_ia?: boolean }) => {
    // Log when dev team is writing to another enterprise
    if (get().isObservationMode) {
      logger.info('[ContactStore] 📝 Dev team updating note in observed enterprise');
    }

    try {
      // Capture old values before update for diff
      const oldNote = get().activeContactData.notes.find(n => n.id === noteId);

      const payload: any = { descripcion: description };

      if (options?.titulo !== undefined) payload.titulo = options.titulo;
      if (options?.etiquetas !== undefined) payload.etiquetas = options.etiquetas;
      if (options?.es_fijado !== undefined) payload.es_fijado = options.es_fijado;
      if (options?.archivos_urls !== undefined) payload.archivos_urls = options.archivos_urls;
      if (options?.visible_ia !== undefined) payload.visible_ia = options.visible_ia;

      const { error } = await supabase
        .from('wp_contactos_nota')
        .update(payload)
        .eq('id', noteId);

      if (error) {
        console.error('Error updating note:', error);
        return;
      }

      const empresaId = get().selectedEnterpriseId;
      if (empresaId) {
        const antes: Record<string, unknown> = {};
        const despues: Record<string, unknown> = {};
        if (oldNote) {
          if (options?.titulo !== undefined && oldNote.titulo !== options.titulo) { antes.titulo = oldNote.titulo; despues.titulo = options.titulo; }
          if (options?.es_fijado !== undefined && oldNote.es_fijado !== options.es_fijado) { antes.es_fijado = oldNote.es_fijado; despues.es_fijado = options.es_fijado; }
          if (oldNote.descripcion !== description) { antes.descripcion = (oldNote.descripcion || '').substring(0, 60); despues.descripcion = description.substring(0, 60); }
        }
        void logActivity({
          tipo: 'nota', accion: 'actualizar',
          descripcion: `Nota editada: ${options?.titulo || oldNote?.titulo || description.substring(0, 40)}`,
          contactoId: get().activeContact?.id,
          empresaId,
          datosAntes: Object.keys(antes).length > 0 ? antes : undefined,
          datosDespues: Object.keys(despues).length > 0 ? despues : undefined,
          usuarioId: get().userContext?.authUid
        });
      }

      // Update local state
      set(state => {
        const updatedNotes = state.activeContactData.notes.map(note =>
          note.id === noteId ? { ...note, ...payload } : note
        ).sort((a, b) => {
          // Re-sort in case pinning changed
          if (a.es_fijado && !b.es_fijado) return -1;
          if (!a.es_fijado && b.es_fijado) return 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        return {
          activeContactData: {
            ...state.activeContactData,
            notes: updatedNotes
          }
        };
      });
    } catch (err) {
      console.error('Error in updateContactNote:', err);
    }
  },

  deleteContactNote: async (noteId: number) => {
    // Log when dev team is writing to another enterprise
    if (get().isObservationMode) {
      logger.info('[ContactStore] 📝 Dev team deleting note in observed enterprise');
    }
    
    try {
      const { error } = await supabase
        .from('wp_contactos_nota')
        .delete()
        .eq('id', noteId);

      if (error) {
        console.error('Error deleting note:', error);
        return;
      }

      // Update local state
      set(state => ({
        activeContactData: {
          ...state.activeContactData,
          notes: state.activeContactData.notes.filter(note => note.id !== noteId)
        }
      }));

      const empresaId = get().selectedEnterpriseId;
      if (empresaId) {
        void logActivity({
          tipo: 'nota', accion: 'eliminar',
          descripcion: 'Nota eliminada',
          contactoId: get().activeContact?.id,
          empresaId,
          usuarioId: get().userContext?.authUid
        });
      }
    } catch (err) {
      console.error('Error in deleteContactNote:', err);
    }
  },

  // ===================================================
  // CONTACT MULTIMEDIA ACTIONS
  // ===================================================

  uploadContactMultimedia: async (contactId: number, empresaId: number, file: File) => {
    // Log when dev team is writing to another enterprise
    if (get().isObservationMode) {
      logger.info('[ContactStore] 📝 Dev team uploading multimedia in observed enterprise');
    }

    try {
      // Import storage functions
      const { uploadContactMultimedia: uploadFile, getMultimediaTipo } = await import('../../lib/storage');
      
      // 1. Upload file to storage
      const uploadResult = await uploadFile(file, empresaId, contactId);
      if (!uploadResult.success || !uploadResult.url) {
        return { success: false, error: uploadResult.error || 'Error al subir archivo' };
      }

      // 2. Create record in wp_multimedia
      const tipo = getMultimediaTipo(file.type);
      const { data, error } = await supabase
        .from('wp_multimedia')
        .insert({
          archivo_url: uploadResult.url,
          tipo,
          nombre_archivo: file.name,
          tamaño: file.size,
          contacto_id: contactId,
          empresa_id: empresaId,
          url_carpeta: uploadResult.path,
          estado: 'activo'
        })
        .select()
        .single();

      if (error) {
        logger.error('[ContactStore] Error creating multimedia record:', error);
        return { success: false, error: 'Error al guardar registro de multimedia' };
      }

      // 3. Update local state
      set(state => ({
        activeContactData: {
          ...state.activeContactData,
          multimedia: [data, ...state.activeContactData.multimedia]
        }
      }));

      logger.info(`[ContactStore] ✅ Uploaded multimedia for contact ${contactId}: ${file.name}`);

      void logActivity({
        tipo: 'contacto', accion: 'crear',
        descripcion: `Archivo subido: ${file.name}`,
        contactoId: contactId,
        empresaId,
        datosDespues: { nombre_archivo: file.name, tipo, tamaño: file.size },
        usuarioId: get().userContext?.authUid
      });

      return { success: true, multimedia: data };
    } catch (err: any) {
      logger.error('[ContactStore] Error in uploadContactMultimedia:', err);
      return { success: false, error: err.message || 'Error inesperado' };
    }
  },

  deleteContactMultimedia: async (multimediaId: number, filePath: string) => {
    // Log when dev team is writing to another enterprise
    if (get().isObservationMode) {
      logger.info('[ContactStore] 📝 Dev team deleting multimedia in observed enterprise');
    }

    try {
      // 1. Delete from storage
      const { deleteContactMultimedia: deleteFile } = await import('../../lib/storage');
      const deleteResult = await deleteFile(filePath);
      if (!deleteResult.success) {
        logger.warn('[ContactStore] Could not delete file from storage:', deleteResult.error);
        // Continue to delete DB record anyway
      }

      // 2. Delete record from database
      const { error } = await supabase
        .from('wp_multimedia')
        .delete()
        .eq('id', multimediaId);

      if (error) {
        logger.error('[ContactStore] Error deleting multimedia record:', error);
        return false;
      }

      // 3. Update local state
      set(state => ({
        activeContactData: {
          ...state.activeContactData,
          multimedia: state.activeContactData.multimedia.filter(m => m.id !== multimediaId)
        }
      }));

      logger.info(`[ContactStore] ✅ Deleted multimedia: ${multimediaId}`);

      const empresaId = get().selectedEnterpriseId;
      if (empresaId) {
        void logActivity({
          tipo: 'contacto', accion: 'eliminar',
          descripcion: 'Archivo eliminado',
          contactoId: get().activeContact?.id,
          empresaId,
          usuarioId: get().userContext?.authUid
        });
      }

      return true;
    } catch (err) {
      logger.error('[ContactStore] Error in deleteContactMultimedia:', err);
      return false;
    }
  },

  // ============================================
  // CONTACT TEAM ASSIGNMENTS - Asignaciones múltiples
  // ============================================

  fetchContactAssignments: async (contactId: number) => {
    try {
      const { data, error } = await supabase
        .rpc('get_contacto_asignaciones', { p_contacto_id: contactId });

      if (error) {
        logger.warn('[ContactStore] RPC get_contacto_asignaciones falló, usando fallback:', error);

        const { data: rawAssignments, error: rawError } = await supabase
          .from('wp_contacto_team_asignaciones')
          .select('id, contacto_id, team_humano_id, es_principal, rol_asignacion, empresa_id, asignado_por, created_at, updated_at')
          .eq('contacto_id', contactId)
          .order('es_principal', { ascending: false })
          .order('created_at', { ascending: true });

        if (rawError || !rawAssignments) {
          logger.error('[ContactStore] Error fetching contact assignments fallback:', rawError || error);
          return [];
        }

        const teamIds = rawAssignments.map(a => a.team_humano_id).filter(Boolean);
        if (teamIds.length === 0) {
          return rawAssignments as ContactTeamAssignment[];
        }

        const { data: teamData, error: teamError } = await supabase
          .from('wp_team_humano')
          .select('id, nombre, apellido, email, rol, is_active')
          .in('id', teamIds);

        if (teamError) {
          logger.error('[ContactStore] Error fetching team data for assignments:', teamError);
          return rawAssignments as ContactTeamAssignment[];
        }

        const teamById = new Map((teamData || []).map(m => [m.id, m]));

        return rawAssignments.map((a) => {
          const team = teamById.get(a.team_humano_id);
          return {
            ...a,
            team_nombre: team?.nombre,
            team_apellido: team?.apellido,
            team_email: team?.email,
            team_rol: team?.rol,
            team_is_active: team?.is_active,
          } as ContactTeamAssignment;
        });
      }

      return (data || []) as ContactTeamAssignment[];
    } catch (err) {
      logger.error('[ContactStore] Error in fetchContactAssignments:', err);
      return [];
    }
  },

  addContactAssignment: async (payload: CreateAssignmentPayload) => {
    if (get().isObservationMode) {
      logger.info('[ContactStore] 📝 Dev team adding assignment in observed enterprise');
    }

    try {
      const userContext = get().userContext;
      const { data, error } = await supabase
        .from('wp_contacto_team_asignaciones')
        .insert({
          contacto_id: payload.contacto_id,
          team_humano_id: payload.team_humano_id,
          es_principal: payload.es_principal || false,
          rol_asignacion: payload.rol_asignacion || 'colaborador',
          empresa_id: payload.empresa_id,
          asignado_por: userContext?.id || null
        })
        .select()
        .single();

      if (error) {
        logger.error('[ContactStore] Error adding assignment:', error);
        return { success: false, error: error.message };
      }

      logger.info(`[ContactStore] ✅ Added assignment: ${data.id}`);

      void logActivity({
        tipo: 'contacto', accion: 'actualizar',
        descripcion: `Asignación añadida: ${payload.rol_asignacion || 'colaborador'}`,
        contactoId: payload.contacto_id,
        empresaId: payload.empresa_id,
        datosDespues: { team_humano_id: payload.team_humano_id, rol: payload.rol_asignacion, es_principal: payload.es_principal },
        usuarioId: get().userContext?.authUid
      });

      return { success: true, assignment: data };
    } catch (err) {
      logger.error('[ContactStore] Error in addContactAssignment:', err);
      return { success: false, error: 'Error al agregar asignación' };
    }
  },

  updateContactAssignment: async (payload: UpdateAssignmentPayload) => {
    if (get().isObservationMode) {
      logger.info('[ContactStore] 📝 Dev team updating assignment in observed enterprise');
    }

    try {
      const updates: Partial<Pick<ContactTeamAssignment, 'es_principal' | 'rol_asignacion'>> = {};
      if (payload.es_principal !== undefined) updates.es_principal = payload.es_principal;
      if (payload.rol_asignacion !== undefined) updates.rol_asignacion = payload.rol_asignacion;

      const { error } = await supabase
        .from('wp_contacto_team_asignaciones')
        .update(updates)
        .eq('id', payload.id);

      if (error) {
        logger.error('[ContactStore] Error updating assignment:', error);
        return { success: false, error: error.message };
      }

      logger.info(`[ContactStore] ✅ Updated assignment: ${payload.id}`);

      const empresaId = get().selectedEnterpriseId;
      if (empresaId) {
        void logActivity({
          tipo: 'contacto', accion: 'actualizar',
          descripcion: 'Asignación actualizada',
          contactoId: get().activeContact?.id,
          empresaId,
          datosDespues: updates,
          usuarioId: get().userContext?.authUid
        });
      }

      return { success: true };
    } catch (err) {
      logger.error('[ContactStore] Error in updateContactAssignment:', err);
      return { success: false, error: 'Error al actualizar asignación' };
    }
  },

  deleteContactAssignment: async (assignmentId: number) => {
    if (get().isObservationMode) {
      logger.info('[ContactStore] 📝 Dev team deleting assignment in observed enterprise');
    }

    try {
      const { error } = await supabase
        .from('wp_contacto_team_asignaciones')
        .delete()
        .eq('id', assignmentId);

      if (error) {
        logger.error('[ContactStore] Error deleting assignment:', error);
        return { success: false, error: error.message };
      }

      logger.info(`[ContactStore] ✅ Deleted assignment: ${assignmentId}`);

      const empresaId = get().selectedEnterpriseId;
      if (empresaId) {
        void logActivity({
          tipo: 'contacto', accion: 'eliminar',
          descripcion: 'Asignación eliminada',
          contactoId: get().activeContact?.id,
          empresaId,
          usuarioId: get().userContext?.authUid
        });
      }

      return { success: true };
    } catch (err) {
      logger.error('[ContactStore] Error in deleteContactAssignment:', err);
      return { success: false, error: 'Error al eliminar asignación' };
    }
  },

  // ============================================
  // MERGE CONTACTS
  // ============================================
  
  previewMerge: async (primaryId: number, secondaryId: number) => {
    try {
      const res = await fetch(`/api/contacts/merge?primaryId=${primaryId}&secondaryId=${secondaryId}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Error al obtener preview' };
      }
      return { success: true, primary: data.primary, secondary: data.secondary, preview: data.preview };
    } catch (err: any) {
      logger.error('[ContactStore] Error in previewMerge:', err);
      return { success: false, error: err.message || 'Error de conexión' };
    }
  },

  mergeContacts: async (primaryId: number, secondaryId: number, fieldChoices: Record<string, 'primary' | 'secondary'>, notesStrategy = 'both') => {
    try {
      const res = await fetch('/api/contacts/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryId, secondaryId, fieldChoices, notesStrategy }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Error al unificar contactos' };
      }

      // Remove secondary from local contacts list
      set(state => ({
        contacts: state.contacts.filter(c => c.id !== secondaryId),
      }));

      // Refresh the active contact details (handles swap case too)
      const { selectedContactId, fetchContactDetails, selectedEnterpriseId } = get();
      if (selectedContactId === primaryId || selectedContactId === secondaryId) {
        fetchContactDetails(primaryId);
      }

      if (selectedEnterpriseId) {
        void logActivity({
          tipo: 'contacto', accion: 'actualizar',
          descripcion: `Contactos unificados: #${secondaryId} fusionado en #${primaryId}`,
          contactoId: primaryId,
          empresaId: selectedEnterpriseId,
          entidadTipo: 'merge',
          datosDespues: { secondary_contact_id: secondaryId, tables_updated: data.tablesUpdated },
          usuarioId: get().userContext?.authUid
        });
      }

      return { success: true, tablesUpdated: data.tablesUpdated };
    } catch (err: any) {
      logger.error('[ContactStore] Error in mergeContacts:', err);
      return { success: false, error: err.message || 'Error de conexión' };
    }
  },
});

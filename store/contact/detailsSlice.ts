/**
 * Contact Store — Details Slice
 * selectContact, fetchContactDetails, createContact, updateContactStage,
 * updateContactField, pauseContact, reactivateContact
 * @module store/contact/detailsSlice
 */

import { supabase } from '../../lib/supabase-client';
import { logger } from '../../lib/logger';
import { logContactActivity } from '../../lib/activity-logger';
import type { ContactState, ContactSet, ContactGet, Contact } from './types';
import { normalizePhone } from './constants';

export const createDetailsSlice = (set: ContactSet, get: ContactGet) => ({

  selectContact: (contactId: number | null, initialContact?: Partial<Contact>) => {
    const { contacts } = get();
    // Try to find in current list, otherwise use initialContact
    const contact = contacts.find(c => c.id === contactId) || (initialContact ? { ...initialContact, id: contactId } as Contact : null);

    set({ 
      selectedContactId: contactId,
      activeContact: contact,
      activeContactData: {
        conversations: [],
        appointments: [],
        multimedia: [],
        notes: [],
        transcripciones: [],
        funnelStatus: null,
        messages: [],
        tasks: [],
        services: [],
        funnelStage: null,
        assignedAdvisor: null,
        isLoading: !!contactId,
        error: null
      }
    });
    
    if (contactId) {
      get().fetchContactDetails(contactId);
    }
  },

  // Create a new contact
  createContact: async (payload: Parameters<ContactState['createContact']>[0]) => {
    const { isObservationMode, selectedEnterpriseId } = get();
    
    // Log when dev team is writing to another enterprise (informational)
    if (isObservationMode) {
      logger.info('[ContactStore] 📝 Dev team creating contact in observed enterprise');
    }
    
    if (!selectedEnterpriseId) {
      return { success: false, error: 'No hay empresa seleccionada' };
    }
    
    // Validate required fields
    if (!payload.nombre?.trim() && !payload.telefono?.trim()) {
      return { success: false, error: 'Se requiere al menos nombre o teléfono' };
    }
    
    logger.debug('[ContactStore] ➕ Creating contact:', payload);
    
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
    
    // Attempt operation with retry on network failure
    const maxRetries = 2;
    let lastError: unknown = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // On retry, try to refresh the session first
        if (attempt > 0) {
          logger.debug(`[ContactStore] Retry attempt ${attempt}/${maxRetries}, refreshing session...`);
          try {
            const { error: refreshError } = await supabase.auth.refreshSession();
            if (refreshError) {
              logger.warn('[ContactStore] Session refresh failed:', refreshError.message);
            }
          } catch (refreshErr) {
            logger.warn('[ContactStore] Could not refresh session:', refreshErr);
          }
          // Small delay before retry
          await new Promise(resolve => setTimeout(resolve, 500 * attempt));
        }
        
        // Sanitize phone: remove +, spaces, dashes, parentheses - only digits
        const sanitizedPhone = payload.telefono?.trim() 
          ? normalizePhone(payload.telefono.trim()) 
          : '';
        const phoneValue = sanitizedPhone.length > 0 ? sanitizedPhone : null;
        
        const { data, error } = await supabase
          .from('wp_contactos')
          .insert({
            nombre: payload.nombre?.trim() || null,
            apellido: payload.apellido?.trim() || null,
            telefono: phoneValue,
            email: payload.email?.trim() || null,
            estado: payload.estado || 'prospecto',
            es_calificado: payload.es_calificado || 'evaluando',
            origen: payload.origen || 'manual',
            notas: payload.notas?.trim() || null,
            empresa_id: payload.empresa_id,
            team_humano_id: payload.team_humano_id || null,
            is_active: true,
          })
          .select()
          .single();
        
        if (error) {
          logger.error('[ContactStore] Error creating contact:', error);
          // Provide more specific error messages
          let errorMessage = 'Error al crear el contacto';
          if (error.code === '23505') {
            errorMessage = 'Ya existe un contacto con este teléfono o email';
          } else if (error.code === '23503') {
            errorMessage = 'Error de referencia: empresa o asesor no válido';
          } else if (error.message) {
            errorMessage = error.message;
          }
          return { success: false, error: errorMessage };
        }
        
        if (!data) {
          return { success: false, error: 'No se recibió respuesta del servidor' };
        }
        
        // Add to contacts list at the beginning
        set(state => ({
          contacts: [data as Contact, ...state.contacts],
          pagination: {
            ...state.pagination,
            totalCount: state.pagination.totalCount + 1
          }
        }));
        
        logger.info('[ContactStore] ✅ Contact created:', data.id);

        void logContactActivity('crear', data.id, payload.empresa_id,
          `Contacto creado: ${[payload.nombre, payload.apellido].filter(Boolean).join(' ') || 'Sin nombre'}`,
          { despues: { nombre: data.nombre, apellido: data.apellido, telefono: data.telefono, email: data.email, estado: data.estado, origen: data.origen } },
          get().userContext?.authUid
        );

        return { success: true, contact: data as Contact };
        
      } catch (err) {
        lastError = err;
        
        // Check if it's a network error and we should retry
        if (isNetworkError(err) && attempt < maxRetries) {
          logger.warn(`[ContactStore] Network error on attempt ${attempt + 1}, will retry...`);
          continue;
        }
        
        // Not a network error or exhausted retries
        break;
      }
    }
    
    // All retries failed
    let errorMessage = 'Error de conexión';
    if (lastError instanceof TypeError && lastError.message === 'Failed to fetch') {
      errorMessage = 'Error de conexión. Verifica tu internet e intenta de nuevo.';
    } else if (lastError instanceof Error) {
      errorMessage = lastError.message;
    }
    
    logger.error('[ContactStore] Exception creating contact after retries:', lastError);
    return { success: false, error: errorMessage };
  },

  // SECURITY: Verify contact belongs to current enterprise before fetching details
  // PERF: 2-phase loading - essential data first, rest in background
  fetchContactDetails: async (contactId: number, options?: { priorityTab?: 'appointments' | 'conversations' }) => {
    const { selectedEnterpriseId } = get();
    const priorityTab = options?.priorityTab;

    if (!selectedEnterpriseId) {
      logger.warn('[ContactStore] fetchContactDetails abortado: selectedEnterpriseId es null (contexto aún no cargado)');
      set(state => ({
        activeContactData: {
          ...state.activeContactData,
          isLoading: false,
          error: 'Cargando contexto de empresa, intenta de nuevo en un momento'
        }
      }));
      return;
    }
    
    set(state => ({
      activeContactData: {
        ...state.activeContactData,
        isLoading: true,
        error: null
      }
    }));

    try {
      // ═══════════════════════════════════════════════════════════════════
      // FASE 1: Datos esenciales (~200ms) - Perfil + Datos de tab prioritaria
      // ═══════════════════════════════════════════════════════════════════
      
      // SECURITY: Always verify and fetch the contact with empresa_id filter
      const { data: profile, error: profileError } = await supabase
        .from('wp_contactos')
        .select('*')
        .eq('id', contactId)
        .eq('empresa_id', selectedEnterpriseId)
        .single();
      
      if (profileError || !profile) {
        console.error('[ContactStore] ⛔ Access denied: contact does not belong to current enterprise');
        set(state => ({
          activeContactData: {
            ...state.activeContactData,
            isLoading: false,
            error: 'Contacto no encontrado o sin acceso'
          }
        }));
        return;
      }
      
      set(state => ({
        activeContact: profile,
        // FIX: Sincronizar contacto actualizado en el array contacts[] para que
        // ContactCards en la lista reflejen cambios (ej. team_humano_id tras asignación)
        contacts: state.contacts.map(c => c.id === profile.id ? { ...c, ...profile } : c)
      }));

      // FASE 1: Cargar datos esenciales según tab prioritaria
      const [appointmentsRes, funnelStageRes, advisorRes, funnelRes] = await Promise.all([
        // Siempre cargar: Appointments (rápido, esencial para calendario)
        supabase
          .from('wp_citas')
          .select('*')
          .eq('contacto_id', contactId)
          .order('fecha_hora', { ascending: false }),
        // Siempre cargar: Funnel stage (para el sidebar)
        // IMPORTANTE: Filtrar por empresa_id para evitar error 400 de RLS
        profile.etapa_embudo ? supabase
          .from('wp_empresa_embudo')
          .select('id, nombre_etapa, descripcion, orden_etapa, empresa_id, configuracion_seguimiento')
          .eq('id', profile.etapa_embudo)
          .eq('empresa_id', selectedEnterpriseId)
          .maybeSingle() : Promise.resolve({ data: null, error: null }),
        // Siempre cargar: Advisor asignado (para el sidebar)
        profile.team_humano_id ? supabase
          .from('wp_team_humano')
          .select('id, nombre, apellido, email, rol, is_active, empresa_id')
          .eq('id', profile.team_humano_id)
          .single() : Promise.resolve({ data: null, error: null }),
        // Funnel status (maybeSingle: not all contacts have a funnel status record)
        supabase
          .from('wp_contacto_estado_embudo')
          .select('*')
          .eq('contacto_id', contactId)
          .maybeSingle(),
      ]);

      if (appointmentsRes.error) console.error('[ContactStore] Error fetching appointments:', appointmentsRes.error);
      if (funnelStageRes.error) console.error('[ContactStore] Error fetching funnel stage:', funnelStageRes.error);
      if (advisorRes.error) console.error('[ContactStore] Error fetching advisor:', advisorRes.error);
      if (funnelRes.error) console.error('[ContactStore] Error fetching funnel status:', funnelRes.error);

      // Actualizar UI inmediatamente con datos esenciales (FAST PATH)
      set(state => ({
        activeContactData: {
          ...state.activeContactData,
          appointments: appointmentsRes.data || [],
          funnelStage: funnelStageRes.data || null,
          assignedAdvisor: advisorRes.data || null,
          funnelStatus: funnelRes.data || null,
          isLoading: false, // UI ya puede renderizar
          error: null
        }
      }));

      // ═══════════════════════════════════════════════════════════════════
      // FASE 2: Datos secundarios (background) - No bloquea UI
      // ═══════════════════════════════════════════════════════════════════
      
      // Ejecutar en background sin await para no bloquear
      (async () => {
        try {
          const [
            conversationsRes,
            multimediaRes,
            notesRes,
            tasksRes,
            servicesRes
          ] = await Promise.all([
            // Conversations
            supabase
              .from('wp_conversaciones')
              .select('*')
              .eq('contacto_id', contactId)
              .order('fecha_inicio', { ascending: false }),
            // Multimedia
            supabase
              .from('wp_multimedia')
              .select('*')
              .eq('contacto_id', contactId)
              .order('created_at', { ascending: false }),
            // Notes (with author join)
            supabase
              .from('wp_contactos_nota')
              .select(`
                *,
                author:wp_team_humano(nombre, apellido)
              `)
              .eq('contacto_id', contactId)
              .order('es_fijado', { ascending: false })
              .order('created_at', { ascending: false }),
            // Tasks with items
            supabase
              .from('wp_tareas')
              .select(`
                *,
                items:wp_tareas_items(*),
                asignado:wp_team_humano!wp_tareas_asignado_a_fkey(id, nombre, apellido),
                creador:wp_team_humano!wp_tareas_creado_por_fkey(id, nombre, apellido)
              `)
              .eq('contacto_id', contactId)
              .order('created_at', { ascending: false }),
            // Services/Portfolio with payments
            supabase
              .from('wp_crm_servicios')
              .select(`
                *,
                pagos:wp_crm_pagos(*)
              `)
              .eq('contacto_id', contactId)
              .order('created_at', { ascending: false }),
          ]);

          // Actualizar con datos de fase 2
          set(state => ({
            activeContactData: {
              ...state.activeContactData,
              conversations: conversationsRes.data || [],
              multimedia: multimediaRes.data || [],
              notes: notesRes.data || [],
              tasks: tasksRes.data || [],
              services: servicesRes.data || [],
            }
          }));

          // ═══════════════════════════════════════════════════════════════════
          // FASE 3: Datos dependientes (transcripciones + mensajes)
          // ═══════════════════════════════════════════════════════════════════
          
          const citaIds = (appointmentsRes.data || []).map((apt: any) => apt.id).filter(Boolean);
          const conversationIds = (conversationsRes.data || []).map((c: any) => c.id).filter(Boolean);
          
          const [transcripcionesRes, messagesRes] = await Promise.all([
            citaIds.length > 0
              ? supabase
                  .from('transcripciones')
                  .select(`*, cita:wp_citas(id, titulo, fecha_hora)`)
                  .in('cita_id', citaIds)
                  .order('created_at', { ascending: false })
              : Promise.resolve({ data: [], error: null }),
            conversationIds.length > 0
              ? supabase
                  .from('wp_mensajes')
                  .select('*')
                  .in('conversacion_id', conversationIds)
                  .order('created_at', { ascending: true })
              : Promise.resolve({ data: [], error: null })
          ]);

          // Actualizar con datos finales
          set(state => ({
            activeContactData: {
              ...state.activeContactData,
              transcripciones: transcripcionesRes.data || [],
              messages: messagesRes.data || [],
            }
          }));

        } catch (bgErr) {
          console.error('[ContactStore] Background fetch error:', bgErr);
        }
      })();
      
    } catch (err) {
      console.error('Error fetching contact details:', err);
      set(state => ({
        activeContactData: {
          ...state.activeContactData,
          isLoading: false,
          error: 'Error al cargar detalles del contacto'
        }
      }));
    }
  },

  updateContactStage: async (contactId: number, stageId: number, origen: 'manual' | 'ia' | 'automatico' = 'manual', notas?: string) => {
    // Log when dev team is writing to another enterprise
    if (get().isObservationMode) {
      logger.info('[ContactStore] 📝 Dev team updating contact stage in observed enterprise');
    }
    
    const { contacts, activeContact } = get();
    
    // Find contact in list OR use activeContact as fallback
    let contact = contacts.find(c => c.id === contactId);
    if (!contact && activeContact?.id === contactId) {
      contact = activeContact;
      logger.debug(`[ContactStore] 📌 Using activeContact as fallback for stage update (contact not in paginated list)`);
    }
    
    if (!contact) {
      logger.warn(`[ContactStore] ⚠️ Cannot update stage: contact ${contactId} not found in contacts[] or activeContact`);
      return;
    }

    const oldStageId = contact.etapa_embudo;
    if (oldStageId === stageId) return;

    try {
      // 1. Update wp_contactos
      const { error: contactError } = await supabase
        .from('wp_contactos')
        .update({ 
          etapa_embudo: stageId,
          updated_at: new Date().toISOString()
        })
        .eq('id', contactId);

      if (contactError) throw contactError;

      // 2. Log change in wp_contacto_estado_embudo for traceability
      const { error: historyError } = await supabase
        .from('wp_contacto_estado_embudo')
        .upsert({
          contacto_id: contactId,
          etapa_actual: stageId,
          etapa_anterior: oldStageId,
          origen_cambio: origen,
          notas: notas || `Cambio de etapa ${origen}`,
          fecha_ultimo_cambio: new Date().toISOString()
        }, { onConflict: 'contacto_id' });

      if (historyError) {
        logger.warn('[ContactStore] ⚠️ Failed to log funnel history:', historyError.message);
      }

      // 3. Update local state (Optimistic update)
      set(state => ({
        contacts: state.contacts.map(c => 
          c.id === contactId ? { ...c, etapa_embudo: stageId } : c
        ),
        activeContact: state.activeContact?.id === contactId
          ? { ...state.activeContact, etapa_embudo: stageId }
          : state.activeContact,
        activeContactData: state.activeContact?.id === contactId
          ? { 
              ...state.activeContactData, 
              funnelStatus: {
                id: state.activeContactData.funnelStatus?.id || 0,
                contacto_id: contactId,
                etapa_actual: stageId,
                etapa_anterior: oldStageId,
                fecha_ultimo_cambio: new Date().toISOString(),
                origen_cambio: origen,
                notas: notas || null
              }
            }
          : state.activeContactData
      }));

      logger.info(`[ContactStore] ✅ Stage updated with history: contact=${contactId}, stage=${stageId}, origin=${origen}`);

      void logContactActivity('actualizar', contactId, contact.empresa_id!,
        `Etapa de embudo cambiada (${origen})`,
        { antes: { etapa_embudo: oldStageId }, despues: { etapa_embudo: stageId } },
        get().userContext?.authUid
      );

    } catch (err) {
      logger.error('[ContactStore] ❌ Error in updateContactStage:', err);
    }
  },

  updateContactField: async (contactId: number, field: keyof Contact, value: any) => {
    // Log when dev team is writing to another enterprise
    if (get().isObservationMode) {
      logger.info('[ContactStore] 📝 Dev team updating contact field in observed enterprise');
    }
    
    try {
      const sanitizedValue = field === 'telefono'
        ? (typeof value === 'string' && value.trim() ? normalizePhone(value) : null)
        : value;

      const { error } = await supabase
        .from('wp_contactos')
        .update({ 
          [field]: sanitizedValue,
          updated_at: new Date().toISOString()
        })
        .eq('id', contactId);

      if (error) {
        console.error('Error updating contact field:', error);
        return;
      }

      // Capture old value BEFORE optimistic update
      const oldFieldValue = get().activeContact?.id === contactId ? get().activeContact?.[field] : undefined;

      // Optimistic update for local state
      set(state => ({
        contacts: state.contacts.map(c => 
          c.id === contactId ? { ...c, [field]: sanitizedValue } : c
        ),
        activeContact: state.activeContact?.id === contactId 
          ? { ...state.activeContact, [field]: sanitizedValue } 
          : state.activeContact
      }));

      console.log(`[ContactStore] ✅ Updated contact ${contactId} field "${String(field)}" to:`, value);

      const empresaId = get().selectedEnterpriseId;
      if (empresaId) {
        void logContactActivity('actualizar', contactId, empresaId,
          `Campo "${String(field)}" actualizado`,
          { antes: { [field]: oldFieldValue }, despues: { [field]: sanitizedValue } },
          get().userContext?.authUid
        );
      }

      // Award XP when qualifying a contact
      if (field === 'es_calificado' && value === 'si') {
        try {
          const { useGamificationStore } = await import('../gamificationStore');
          const contact = get().contacts.find(c => c.id === contactId);
          useGamificationStore.getState().awardXP(
            'contact_qualified',
            `Contacto calificado: ${contact?.nombre || contactId}`,
            contactId,
            'contact'
          );
        } catch (gamErr) {
          logger.debug('[ContactStore] Gamification XP not awarded:', gamErr);
        }
      }
    } catch (err) {
      console.error('Error in updateContactField:', err);
    }
  },

  // Contact Pause/Active Actions
  pauseContact: async (contactId: number, durationMinutes: number | null) => {
    // Log when dev team is writing to another enterprise
    if (get().isObservationMode) {
      logger.info('[ContactStore] 📝 Dev team pausing contact in observed enterprise');
    }
    
    try {
      // Calculate paused_until timestamp
      let pausedUntil: string | null = null;
      if (durationMinutes !== null) {
        const pauseEnd = new Date();
        pauseEnd.setMinutes(pauseEnd.getMinutes() + durationMinutes);
        pausedUntil = pauseEnd.toISOString();
      }

      const { error } = await supabase
        .from('wp_contactos')
        .update({ 
          is_active: false,
          paused_until: pausedUntil,
          updated_at: new Date().toISOString()
        })
        .eq('id', contactId);

      if (error) {
        console.error('[ContactStore] Error pausing contact:', error);
        return false;
      }

      // Optimistic update for local state
      set(state => ({
        contacts: state.contacts.map(c => 
          c.id === contactId ? { ...c, is_active: false, paused_until: pausedUntil } : c
        ),
        activeContact: state.activeContact?.id === contactId 
          ? { ...state.activeContact, is_active: false, paused_until: pausedUntil } 
          : state.activeContact
      }));

      const durationText = durationMinutes ? `${durationMinutes} minutos` : 'permanentemente';
      console.log(`[ContactStore] ✅ Contact ${contactId} paused for ${durationText}`);

      const empresaId = get().selectedEnterpriseId;
      if (empresaId) {
        void logContactActivity('actualizar', contactId, empresaId,
          durationMinutes ? `Contacto pausado por ${durationMinutes} minutos` : 'Contacto desactivado permanentemente',
          { antes: { is_active: true, paused_until: null }, despues: { is_active: false, paused_until: pausedUntil } },
          get().userContext?.authUid
        );
      }

      return true;
    } catch (err) {
      console.error('[ContactStore] Error in pauseContact:', err);
      return false;
    }
  },

  reactivateContact: async (contactId: number) => {
    // Log when dev team is writing to another enterprise
    if (get().isObservationMode) {
      logger.info('[ContactStore] 📝 Dev team reactivating contact in observed enterprise');
    }
    
    try {
      const { error } = await supabase
        .from('wp_contactos')
        .update({ 
          is_active: true,
          paused_until: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', contactId);

      if (error) {
        console.error('[ContactStore] Error reactivating contact:', error);
        return false;
      }

      // Optimistic update for local state
      set(state => ({
        contacts: state.contacts.map(c => 
          c.id === contactId ? { ...c, is_active: true, paused_until: null } : c
        ),
        activeContact: state.activeContact?.id === contactId 
          ? { ...state.activeContact, is_active: true, paused_until: null } 
          : state.activeContact
      }));

      console.log(`[ContactStore] ✅ Contact ${contactId} reactivated`);

      const empresaId = get().selectedEnterpriseId;
      if (empresaId) {
        void logContactActivity('actualizar', contactId, empresaId,
          'Contacto reactivado',
          { antes: { is_active: false }, despues: { is_active: true, paused_until: null } },
          get().userContext?.authUid
        );
      }

      return true;
    } catch (err) {
      console.error('[ContactStore] Error in reactivateContact:', err);
      return false;
    }
  },
});

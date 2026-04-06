/**
 * Contact Store — Funnel Slice
 * fetchFunnelStages, fetchStageCounts, fetchContactsByStage,
 * createFunnelStage, updateFunnelStage, deleteFunnelStage, reorderFunnelStages
 * @module store/contact/funnelSlice
 */

import { supabase } from '../../lib/supabase-client';
import { logger } from '../../lib/logger';
import { logActivity } from '../../lib/activity-logger';
import type { ContactState, ContactSet, ContactGet, Contact, FunnelStage } from './types';

export const createFunnelSlice = (set: ContactSet, get: ContactGet) => ({

  fetchFunnelStages: async (forceRefresh = false) => {
    const { selectedEnterpriseId, isCacheValid, funnelStages } = get();
    if (!selectedEnterpriseId) return;

    // Skip if cache is valid and not forcing refresh
    if (!forceRefresh && isCacheValid('funnelStages') && funnelStages.length > 0) {
      console.log('[ContactStore] ⏩ Using cached funnel stages');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('wp_empresa_embudo')
        .select('*')
        .eq('empresa_id', selectedEnterpriseId)
        .order('orden_etapa', { ascending: true });

      if (error) {
        console.error('Error fetching funnel stages:', error);
        return;
      }

      set({ funnelStages: data || [], funnelStagesLastFetch: Date.now() });
    } catch (err) {
      console.error('Error in fetchFunnelStages:', err);
    }
  },

  fetchStageCounts: async () => {
    const { selectedEnterpriseId } = get();
    if (!selectedEnterpriseId) return;

    try {
      // Use optimized RPC to get counts directly from PostgreSQL
      const { data, error } = await supabase.rpc('get_funnel_stage_counts', { 
        p_empresa_id: selectedEnterpriseId 
      });

      if (error) {
        console.error('[ContactStore] Error calling get_funnel_stage_counts:', error);
        return;
      }

      // Convert RPC result [{ etapa_id, count }, ...] to Record<number, number>
      const counts: Record<number, number> = {};
      (data || []).forEach((row: { etapa_id: number; count: number }) => {
        counts[row.etapa_id] = Number(row.count);
      });

      set({ stageCounts: counts });
      logger.debug('[ContactStore] Stage counts updated via RPC:', counts);
    } catch (err) {
      console.error('Error in fetchStageCounts:', err);
    }
  },

  // Fetch contacts for a specific funnel stage and merge into existing contacts
  // Uses automatic offset based on already-loaded contacts for this stage
  fetchContactsByStage: async (stageId: number, limit = 50) => {
    const { selectedEnterpriseId, contacts } = get();
    if (!selectedEnterpriseId) return;

    try {
      // Calculate offset: how many contacts for this stage are already in memory
      const alreadyLoadedForStage = contacts.filter(c => {
        if (stageId === -1) return c.etapa_embudo === null || c.etapa_embudo === undefined;
        return c.etapa_embudo === stageId;
      }).length;

      logger.debug(`[ContactStore] Fetching contacts for stage ${stageId} (offset: ${alreadyLoadedForStage}, limit: ${limit})...`);
      
      // Build query for specific stage with offset for pagination
      const rangeStart = alreadyLoadedForStage;
      const rangeEnd = rangeStart + limit - 1;

      let query = supabase
        .from('wp_contactos')
        .select(`
          id,
          nombre,
          apellido,
          telefono,
          email,
          estado,
          es_calificado,
          origen,
          metadata,
          created_at,
          updated_at,
          ultima_interaccion,
          is_active,
          paused_until,
          etapa_embudo,
          etapa_emocional,
          team_humano_id
        `)
        .eq('empresa_id', selectedEnterpriseId)
        .order('updated_at', { ascending: false })
        .range(rangeStart, rangeEnd);

      // Handle unassigned (-1) vs specific stage
      if (stageId === -1) {
        query = query.is('etapa_embudo', null);
      } else {
        query = query.eq('etapa_embudo', stageId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[ContactStore] Error fetching contacts by stage:', error);
        return;
      }

      if (!data || data.length === 0) {
        logger.debug(`[ContactStore] No more contacts for stage ${stageId}`);
        return;
      }

      // Merge new contacts with existing ones (avoid duplicates - safety net)
      const existingIds = new Set(contacts.map(c => c.id));
      const newContacts = (data as Contact[]).filter(c => !existingIds.has(c.id));
      
      if (newContacts.length > 0) {
        set({ contacts: [...contacts, ...newContacts] });
        logger.debug(`[ContactStore] ✅ Added ${newContacts.length} contacts for stage ${stageId} (total loaded: ${alreadyLoadedForStage + newContacts.length})`);
      } else {
        logger.debug(`[ContactStore] All contacts for stage ${stageId} already loaded`);
      }
    } catch (err) {
      console.error('Error in fetchContactsByStage:', err);
    }
  },

  // ===================================================
  // FUNNEL STAGE CRUD ACTIONS
  // ===================================================

  createFunnelStage: async (payload: any) => {
    // Log when dev team is writing to another enterprise
    if (get().isObservationMode) {
      logger.info('[ContactStore] 📝 Dev team creating funnel stage in observed enterprise');
    }

    try {
      // Get correct next order from DB (not local state) to avoid stale/broken orders
      let nextOrder = payload.orden_etapa;
      try {
        const { data: rpcOrder, error: rpcError } = await supabase
          .rpc('get_next_funnel_order', { p_enterprise_id: payload.empresa_id });
        if (!rpcError && typeof rpcOrder === 'number') {
          nextOrder = rpcOrder;
          logger.info(`[ContactStore] 📊 Next funnel order from DB: ${nextOrder}`);
        } else {
          // Fallback: calculate from local state using max orden_etapa
          const stages = get().funnelStages;
          nextOrder = stages.length > 0
            ? Math.max(...stages.map(s => s.orden_etapa)) + 1
            : 1;
          logger.warn('[ContactStore] ⚠️ RPC get_next_funnel_order unavailable, using local fallback:', nextOrder);
        }
      } catch {
        // Fallback: calculate from local state
        const stages = get().funnelStages;
        nextOrder = stages.length > 0
          ? Math.max(...stages.map(s => s.orden_etapa)) + 1
          : 1;
        logger.warn('[ContactStore] ⚠️ RPC call failed, using local fallback order:', nextOrder);
      }

      const { data, error } = await supabase
        .from('wp_empresa_embudo')
        .insert({
          nombre_etapa: payload.nombre_etapa,
          orden_etapa: nextOrder,
          empresa_id: payload.empresa_id,
          descripcion: payload.descripcion || null,
          configuracion_seguimiento: payload.configuracion_seguimiento || null
        })
        .select()
        .single();

      if (error) {
        logger.error('[ContactStore] Error creating funnel stage:', error);
        return null;
      }

      // Update local state
      set(state => ({
        funnelStages: [...state.funnelStages, data].sort((a, b) => a.orden_etapa - b.orden_etapa)
      }));

      logger.info(`[ContactStore] ✅ Created funnel stage: ${data.nombre_etapa} (order: ${nextOrder})`);

      void logActivity({
        tipo: 'admin', accion: 'crear',
        descripcion: `Etapa de embudo creada: ${data.nombre_etapa}`,
        empresaId: payload.empresa_id,
        entidadTipo: 'embudo',
        entidadId: String(data.id),
        datosDespues: { nombre_etapa: data.nombre_etapa, orden_etapa: nextOrder },
        usuarioId: get().userContext?.authUid
      });

      return data as FunnelStage;
    } catch (err) {
      logger.error('[ContactStore] Error in createFunnelStage:', err);
      return null;
    }
  },

  updateFunnelStage: async (stageId: number, updates: any) => {
    // Log when dev team is writing to another enterprise
    if (get().isObservationMode) {
      logger.info('[ContactStore] 📝 Dev team updating funnel stage in observed enterprise');
    }

    try {
      const effectiveEnterpriseId = updates.empresa_id ?? get().selectedEnterpriseId;
      if (!effectiveEnterpriseId) {
        logger.error('[ContactStore] updateFunnelStage failed: missing enterprise context', { stageId });
        return false;
      }

      // Extraer empresa_id del payload para no enviarlo en el update
      const { empresa_id, ...updatePayload } = updates;

      // Log detallado para diagnóstico
      logger.info('[ContactStore] 🔄 updateFunnelStage attempt:', {
        stageId,
        empresa_id: effectiveEnterpriseId,
        fieldsToUpdate: Object.keys(updatePayload)
      });

      const { data, error } = await supabase
        .from('wp_empresa_embudo')
        .update(updatePayload)
        .eq('id', stageId)
        .eq('empresa_id', effectiveEnterpriseId)
        .select('id, nombre_etapa')
        .maybeSingle();

      if (error) {
        logger.error('[ContactStore] ❌ Error updating funnel stage:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          stageId,
          empresa_id: effectiveEnterpriseId
        });
        return false;
      }

      if (!data) {
        logger.error('[ContactStore] ❌ updateFunnelStage: no rows updated', {
          stageId,
          empresa_id: effectiveEnterpriseId,
          possibleCauses: ['RLS policy blocking', 'Stage ID not found', 'empresa_id mismatch']
        });
        return false;
      }

      // Update local state
      set(state => ({
        funnelStages: state.funnelStages.map(stage =>
          stage.id === stageId ? { ...stage, ...updatePayload } : stage
        ).sort((a, b) => a.orden_etapa - b.orden_etapa)
      }));

      logger.info(`[ContactStore] ✅ Updated funnel stage: ${stageId}`);

      const oldStage = get().funnelStages.find(s => s.id === stageId);
      void logActivity({
        tipo: 'admin', accion: 'actualizar',
        descripcion: `Etapa de embudo actualizada: ${data.nombre_etapa || stageId}`,
        empresaId: effectiveEnterpriseId,
        entidadTipo: 'embudo',
        entidadId: String(stageId),
        datosAntes: oldStage ? { nombre_etapa: oldStage.nombre_etapa } : undefined,
        datosDespues: updatePayload as Record<string, unknown>,
        usuarioId: get().userContext?.authUid
      });

      return true;
    } catch (err) {
      logger.error('[ContactStore] Error in updateFunnelStage:', err);
      return false;
    }
  },

  deleteFunnelStage: async (stageId: number) => {
    // Log when dev team is writing to another enterprise
    if (get().isObservationMode) {
      logger.info('[ContactStore] 📝 Dev team deleting funnel stage in observed enterprise');
    }

    try {
      // Check if any contacts are in this stage
      const { count } = await supabase
        .from('wp_contactos')
        .select('id', { count: 'exact', head: true })
        .eq('etapa_embudo', stageId);

      if (count && count > 0) {
        logger.warn(`[ContactStore] Cannot delete stage ${stageId}: ${count} contacts still in this stage`);
        return false;
      }

      const { error } = await supabase
        .from('wp_empresa_embudo')
        .delete()
        .eq('id', stageId);

      if (error) {
        logger.error('[ContactStore] Error deleting funnel stage:', error);
        return false;
      }

      // Capture before removing from state
      const deletedStage = get().funnelStages.find(s => s.id === stageId);

      // Update local state
      set(state => ({
        funnelStages: state.funnelStages.filter(stage => stage.id !== stageId)
      }));
      logger.info(`[ContactStore] ✅ Deleted funnel stage: ${stageId}`);

      const empresaId = get().selectedEnterpriseId;
      if (empresaId) {
        void logActivity({
          tipo: 'admin', accion: 'eliminar',
          descripcion: `Etapa de embudo eliminada: ${deletedStage?.nombre_etapa || stageId}`,
          empresaId,
          entidadTipo: 'embudo',
          entidadId: String(stageId),
          datosAntes: deletedStage ? { nombre_etapa: deletedStage.nombre_etapa, orden_etapa: deletedStage.orden_etapa } : undefined,
          usuarioId: get().userContext?.authUid
        });
      }

      return true;
    } catch (err) {
      logger.error('[ContactStore] Error in deleteFunnelStage:', err);
      return false;
    }
  },

  reorderFunnelStages: async (stageIds: number[]) => {
    // Log when dev team is writing to another enterprise
    if (get().isObservationMode) {
      logger.info('[ContactStore] 📝 Dev team reordering funnel stages in observed enterprise');
    }

    try {
      const effectiveEnterpriseId = get().selectedEnterpriseId;
      if (!effectiveEnterpriseId) {
        logger.error('[ContactStore] reorderFunnelStages failed: missing enterprise context');
        return false;
      }

      // Optimistic update: apply new order to UI immediately
      const previousStages = get().funnelStages;
      set(state => ({
        funnelStages: state.funnelStages
          .map(stage => {
            const newOrder = stageIds.indexOf(stage.id);
            return newOrder >= 0 ? { ...stage, orden_etapa: newOrder + 1 } : stage;
          })
          .sort((a, b) => a.orden_etapa - b.orden_etapa)
      }));

      // Use atomic RPC (1 request, 1 transaction) instead of 2*N sequential requests
      const { data, error: rpcError } = await supabase
        .rpc('reorder_funnel_stages', {
          p_stage_ids: stageIds,
          p_enterprise_id: effectiveEnterpriseId
        });

      if (rpcError) {
        logger.warn('[ContactStore] ⚠️ RPC reorder_funnel_stages failed, trying fallback:', rpcError.message);

        // Fallback: sequential updates if RPC not available yet
        // Use high offset to avoid UNIQUE constraint violations
        const TEMP_ORDER_OFFSET = 100000;

        // Step 1: Move all to temporary high orders (parallel - all unique)
        const tempResults = await Promise.all(
          stageIds.map((id, index) =>
            supabase
              .from('wp_empresa_embudo')
              .update({ orden_etapa: index + 1 + TEMP_ORDER_OFFSET })
              .eq('id', id)
              .eq('empresa_id', effectiveEnterpriseId)
          )
        );

        const tempFailed = tempResults.find(r => r.error);
        if (tempFailed?.error) {
          logger.error('[ContactStore] ❌ Fallback reorder temp step failed:', tempFailed.error);
          // Rollback optimistic update
          set({ funnelStages: previousStages });
          return false;
        }

        // Step 2: Move to final orders (parallel - all unique)
        const finalResults = await Promise.all(
          stageIds.map((id, index) =>
            supabase
              .from('wp_empresa_embudo')
              .update({ orden_etapa: index + 1 })
              .eq('id', id)
              .eq('empresa_id', effectiveEnterpriseId)
          )
        );

        const finalFailed = finalResults.find(r => r.error);
        if (finalFailed?.error) {
          logger.error('[ContactStore] ❌ Fallback reorder final step failed:', finalFailed.error);
          // Rollback and refresh from DB
          set({ funnelStages: previousStages });
          get().fetchFunnelStages(true);
          return false;
        }
      }

      logger.info(`[ContactStore] ✅ Reordered ${stageIds.length} funnel stages`);

      void logActivity({
        tipo: 'admin', accion: 'actualizar',
        descripcion: `Etapas de embudo reordenadas (${stageIds.length} etapas)`,
        empresaId: effectiveEnterpriseId,
        entidadTipo: 'embudo',
        datosDespues: { orden: stageIds },
        usuarioId: get().userContext?.authUid
      });

      return true;
    } catch (err) {
      logger.error('[ContactStore] Error in reorderFunnelStages:', err);
      // Refresh from DB to recover consistent state
      get().fetchFunnelStages(true);
      return false;
    }
  },
});

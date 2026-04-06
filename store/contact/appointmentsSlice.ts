/**
 * Contact Store — Appointments Slice
 * fetchEnterpriseAppointments, createAppointment, updateAppointmentStatus, updateAppointmentContact
 * @module store/contact/appointmentsSlice
 */

import { supabase } from '../../lib/supabase-client';
import { logger } from '../../lib/logger';
import { logWarning } from '../../lib/error-logger';
import { logActivity } from '../../lib/activity-logger';
import { trackMetric } from '../../lib/performance-monitor';
import type { ContactState, ContactSet, ContactGet } from './types';
import {
  appointmentsFetchInFlight,
  getAppointmentsFetchInFlightKey,
  getAppointmentsLatestRequestKey,
  setAppointmentsFetchInFlight,
  setAppointmentsLatestRequestKey
} from './constants';

const fetchAllPages = async <T>(
  buildPageQuery: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>,
  pageSize: number
): Promise<{ data: T[]; error: any }> => {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await buildPageQuery(from, to);

    if (error) {
      return { data: rows, error };
    }

    if (!data || data.length === 0) {
      break;
    }

    rows.push(...data);

    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return { data: rows, error: null };
};

export const createAppointmentsSlice = (set: ContactSet, get: ContactGet) => ({

  fetchEnterpriseAppointments: async (teamMemberIds?: number[] | null, dateRange?: { start: string; end: string } | null, forceRefresh = false): Promise<{ fromCache: boolean }> => {
    const { selectedEnterpriseId, isCacheValid, appointmentsCachedRange, appointmentsCacheKey, userContext } = get();
    if (!selectedEnterpriseId) return { fromCache: true };

    const isBasicRole = userContext?.roleId === 3;
    const effectiveTeamMemberIds = isBasicRole && userContext?.id
      ? (teamMemberIds && teamMemberIds.length > 0 ? teamMemberIds : [userContext.id])
      : (teamMemberIds && teamMemberIds.length > 0 ? teamMemberIds : null);
    const normalizedTeamKey = effectiveTeamMemberIds
      ? [...effectiveTeamMemberIds].sort((a, b) => a - b).join(',')
      : 'all';
    const requestRangeKey = dateRange
      ? `${dateRange.start}__${dateRange.end}`
      : 'unbounded';
    const requestKey = `${selectedEnterpriseId}::${normalizedTeamKey}::${requestRangeKey}`;

    setAppointmentsLatestRequestKey(requestKey);

    // CACHE: skip if valid cache exists for the same date range
    if (!forceRefresh && isCacheValid('appointments')) {
      // If requesting a specific range, check if it matches cached range
      if (dateRange && appointmentsCachedRange) {
        if (
          dateRange.start === appointmentsCachedRange.start &&
          dateRange.end === appointmentsCachedRange.end &&
          appointmentsCacheKey === requestKey
        ) {
          logger.debug('[ContactStore] ⏭️ Appointments cache valid for requested range');
          return { fromCache: true };
        }
      } else if (!dateRange && appointmentsCacheKey === requestKey) {
        logger.debug('[ContactStore] ⏭️ Appointments cache valid (no range specified)');
        return { fromCache: true };
      }
    }

    // DEDUP: If a fetch is already in-flight, return that promise
    if (appointmentsFetchInFlight && getAppointmentsFetchInFlightKey() === requestKey) {
      logger.debug('[ContactStore] ⏩ Appointments fetch already in-flight');
      await appointmentsFetchInFlight;
      return { fromCache: false };
    }

    const enterpriseIdAtStart = selectedEnterpriseId;
    const startTime = performance.now();

    const fetchPromise = (async () => {
    try {
      let startDateStr: string;
      let endDateStr: string | null = null;
      
      if (dateRange) {
        startDateStr = dateRange.start;
        endDateStr = dateRange.end;
      } else {
        const d = new Date();
        d.setMonth(d.getMonth() - 3);
        startDateStr = d.toISOString();
      }

      // --- SUPABASE PATH (Direct from wp_citas) ---
      // Optimized: Select only essential fields, reduce JOIN payload
      // FIX: Changed !inner to left join so appointments without valid contact still appear
      // FIX: When dateRange is bounded (calendar view), use ASC order + higher limit
      //      so older appointments are not truncated by the LIMIT.
      //      When unbounded (preload/fallback), keep DESC + conservative limit.
      const hasBoundedRange = !!dateRange;
      const APPOINTMENTS_LIMIT = hasBoundedRange ? 1000 : 200;

      const buildAppointmentsQuery = () => {
        let query = supabase
          .from('wp_citas')
          .select(`
            id,
            fecha_hora,
            titulo,
            estado,
            duracion,
            ubicacion,
            contacto_id,
            team_humano_id,
            event_id,
            metadata,
            timezone_cliente,
            contact:wp_contactos(id, nombre, apellido, telefono, email)
          `)
          .eq('empresa_id', selectedEnterpriseId)
          .gte('fecha_hora', startDateStr)
          .order('fecha_hora', { ascending: hasBoundedRange })
          .order('id', { ascending: hasBoundedRange });

        if (endDateStr) {
          query = query.lte('fecha_hora', endDateStr);
        }

        if (isBasicRole && userContext?.id) {
          query = query.in('team_humano_id', effectiveTeamMemberIds!);
          logger.info('[ContactStore] 🔒 Role 3 appointments filter applied:', effectiveTeamMemberIds);
        } else if (effectiveTeamMemberIds && effectiveTeamMemberIds.length > 0) {
          query = query.in('team_humano_id', effectiveTeamMemberIds);
          logger.debug('[ContactStore] 📅 Appointments filter by team_humano_id:', effectiveTeamMemberIds);
        } else {
          logger.debug('[ContactStore] 📅 Appointments: NO team filter applied (fetching all)');
        }

        return query;
      };

      const buildParticipantsQuery = () => {
        let participantsQuery = supabase
          .from('wp_citas_participantes')
          .select(`
            cita_id,
            team_humano_id,
            rol,
            estado_rsvp,
            email,
            cita:wp_citas!inner(
              id,
              fecha_hora,
              titulo,
              estado,
              duracion,
              ubicacion,
              contacto_id,
              team_humano_id,
              event_id,
              metadata,
              timezone_cliente,
              empresa_id,
              contact:wp_contactos(id, nombre, apellido, telefono, email)
            )
          `)
          .eq('cita.empresa_id', selectedEnterpriseId)
          .gte('cita.fecha_hora', startDateStr)
          .order('cita_id', { ascending: hasBoundedRange })
          .order('team_humano_id', { ascending: true });

        if (endDateStr) {
          participantsQuery = participantsQuery.lte('cita.fecha_hora', endDateStr);
        }

        if (effectiveTeamMemberIds && effectiveTeamMemberIds.length > 0) {
          participantsQuery = participantsQuery.in('team_humano_id', effectiveTeamMemberIds);
        }

        return participantsQuery;
      };

      const [mainResult, partResult] = hasBoundedRange
        ? await Promise.all([
            fetchAllPages(
              async (from, to) => await buildAppointmentsQuery().range(from, to),
              APPOINTMENTS_LIMIT
            ),
            fetchAllPages(
              async (from, to) => await buildParticipantsQuery().range(from, to),
              APPOINTMENTS_LIMIT
            )
          ])
        : await Promise.all([
            buildAppointmentsQuery().limit(APPOINTMENTS_LIMIT),
            buildParticipantsQuery()
          ]);

      const { data, error } = mainResult;
      if (error) {
        console.error('Error fetching enterprise appointments:', error);
        return;
      }

      // DEBUG: Log team_humano_id distribution to diagnose filter issues
      const teamIdDistribution = (data || []).reduce((acc: Record<string, number>, apt: any) => {
        const key = apt.team_humano_id === null ? 'null' : String(apt.team_humano_id);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      logger.debug('[ContactStore] ✅ Loaded appointments:', data?.length || 0, '| team_humano_id distribution:', teamIdDistribution);

      // FIX: Guard against stale response - don't update if enterprise changed during fetch
      if (get().selectedEnterpriseId !== enterpriseIdAtStart) {
        console.log('[ContactStore] ⚠️ Enterprise changed during Supabase fetch, discarding stale results');
        return;
      }

      if (getAppointmentsLatestRequestKey() !== requestKey) {
        logger.debug('[ContactStore] ⚠️ Discarding stale appointments response for outdated request key:', requestKey);
        return;
      }

      const appointments = (data || []).map(apt => ({
        ...apt,
        contact: Array.isArray(apt.contact) ? apt.contact[0] : apt.contact
      }));

      // --- MERGE: Expand participant appointments into the list ---
      // For each participant row, if the participant is NOT the owner of the appointment,
      // create an expanded copy so it appears in their calendar column.
      const ownerSet = new Set(
        appointments.map((a: any) => `${a.id}::${a.team_humano_id}`)
      );

      if (partResult.data && partResult.data.length > 0) {
        logger.debug('[ContactStore] 📅 Participant rows found:', partResult.data.length);

        for (const row of partResult.data as any[]) {
          const cita = Array.isArray(row.cita) ? row.cita[0] : row.cita;
          if (!cita) continue;

          const participantTeamId = row.team_humano_id as number;
          const dedupKey = `${cita.id}::${participantTeamId}`;

          // Skip if this team member already owns this appointment
          if (ownerSet.has(dedupKey)) continue;
          ownerSet.add(dedupKey);

          appointments.push({
            ...cita,
            contact: Array.isArray(cita.contact) ? cita.contact[0] : cita.contact,
            _isParticipantView: true,
            _participantRole: row.rol || null,
            _originalTeamHumanoId: cita.team_humano_id,
            team_humano_id: participantTeamId
          });
        }
      } else if (partResult.error) {
        logger.warn('[ContactStore] ⚠️ Error fetching participants (non-blocking):', partResult.error.message);
      }

      // FIX: Always update cache timestamp + range for consistency
      set({
        enterpriseAppointments: appointments,
        appointmentsLastFetch: Date.now(),
        appointmentsCachedRange: dateRange ? { start: startDateStr, end: endDateStr! } : null,
        appointmentsCacheKey: requestKey
      });
      // Track query performance
      const duration = performance.now() - startTime;
      trackMetric('query_fetchEnterpriseAppointments', duration, 'ms');
      if (duration > 3000) {
        logWarning('contactStore', `Slow query: fetchEnterpriseAppointments took ${duration.toFixed(0)}ms`);
      }
    } catch (err) {
      console.error('Error in fetchEnterpriseAppointments:', err);
    } finally {
      if (getAppointmentsFetchInFlightKey() === requestKey) {
        setAppointmentsFetchInFlight(null, null);
      }
    }
    })();

    setAppointmentsFetchInFlight(fetchPromise, requestKey);
    await fetchPromise;
    return { fromCache: false };
  },

  createAppointment: async (payload: Parameters<ContactState['createAppointment']>[0]) => {
    const { selectedEnterpriseId, userContext, isObservationMode } = get();
    
    // Log when dev team is writing to another enterprise
    if (isObservationMode) {
      logger.info('[ContactStore] 📝 Dev team creating appointment in observed enterprise');
    }

    if (!selectedEnterpriseId) {
      return { success: false, error: 'No hay empresa seleccionada' };
    }

    try {
      set({ isLoading: true });
      
      const { useAuthStore } = await import('../authStore');
      const accessToken = useAuthStore.getState().session?.access_token;

      const response = await fetch('/api/nylas/events', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken && { 'Authorization': `Bearer ${accessToken}` })
        },
        body: JSON.stringify({
          ...payload,
          empresa_id: selectedEnterpriseId
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        return { success: false, error: result.error || 'Error al crear la cita', code: result.code };
      }

      // Refresh appointments list if needed
      if (get().isCacheValid('appointments')) {
        set((state) => ({
          enterpriseAppointments: [result.appointment, ...state.enterpriseAppointments],
          appointmentsLastFetch: Date.now() // Keep cache "valid" but updated
        }));
      }

      await logActivity({
        tipo: 'cita',
        accion: 'crear',
        descripcion: `Cita creada: ${payload.titulo}`,
        empresaId: selectedEnterpriseId,
        usuarioId: userContext?.authUid,
        contactoId: payload.contacto_id
      });

      return { success: true, appointment: result.appointment };
    } catch (err: any) {
      logger.error('[ContactStore] Error in createAppointment:', err);
      return { success: false, error: err.message || 'Error de conexión', code: 'NETWORK_ERROR' };
    } finally {
      set({ isLoading: false });
    }
  },

  updateAppointment: async (appointmentId: number | string, payload: Parameters<ContactState['updateAppointment']>[1]) => {
    const { selectedEnterpriseId, userContext, isObservationMode } = get();

    if (isObservationMode) {
      logger.info('[ContactStore] 📝 Dev team updating appointment in observed enterprise');
    }

    if (!selectedEnterpriseId) {
      return { success: false, error: 'No hay empresa seleccionada', code: 'NO_ENTERPRISE' };
    }

    try {
      set({ isLoading: true });

      const numericId = typeof appointmentId === 'string' ? parseInt(appointmentId, 10) : appointmentId;
      if (!Number.isFinite(numericId)) {
        return { success: false, error: 'ID de cita inválido', code: 'INVALID_APPOINTMENT_ID' };
      }

      const isDevTeam = userContext?.roleId === 1;
      let existingQuery = supabase
        .from('wp_citas')
        .select('id, empresa_id, contacto_id, team_humano_id, event_id, titulo, descripcion, fecha_hora, duracion, ubicacion, estado, metadata')
        .eq('id', numericId);

      if (!isDevTeam) {
        existingQuery = existingQuery.eq('empresa_id', selectedEnterpriseId);
      }

      const { data: existing, error: existingError } = await existingQuery.single();

      if (existingError || !existing) {
        return { success: false, error: 'No se encontró la cita', code: 'APPOINTMENT_NOT_FOUND' };
      }

      const hasOwn = Object.prototype.hasOwnProperty;
      const currentMetadata = existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {};
      const currentIsInternal = currentMetadata?.is_internal === true || currentMetadata?.meeting_kind === 'internal';
      const nextIsInternal = typeof payload.is_internal === 'boolean' ? payload.is_internal : currentIsInternal;
      const nextTipo = payload.tipo || currentMetadata?.tipo || 'videollamada';
      const nextTitle = payload.titulo ?? existing.titulo ?? 'Cita';
      const nextDescription = hasOwn.call(payload, 'descripcion') ? (payload.descripcion ?? null) : (existing.descripcion ?? null);
      const nextLocation = hasOwn.call(payload, 'location') ? (payload.location ?? null) : (existing.ubicacion ?? null);
      const nextStatus = payload.estado ?? existing.estado ?? 'pendiente';
      const nextStart = payload.fecha_inicio ?? existing.fecha_hora;

      const fallbackEnd = existing.fecha_hora
        ? new Date(new Date(existing.fecha_hora).getTime() + (existing.duracion || 30) * 60000).toISOString()
        : null;
      const nextEnd = payload.fecha_fin ?? fallbackEnd;

      if (!nextStart || !nextEnd) {
        return { success: false, error: 'La cita debe tener fecha de inicio y fin válidas', code: 'INVALID_DATE_RANGE' };
      }

      const startDate = new Date(nextStart);
      const endDate = new Date(nextEnd);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
        return { success: false, error: 'Rango de fecha inválido', code: 'INVALID_DATE_RANGE' };
      }

      const durationMinutes = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60)));
      const hasContactOverride = hasOwn.call(payload, 'contacto_id');
      const nextContactId = nextIsInternal
        ? null
        : hasContactOverride
          ? (payload.contacto_id ?? null)
          : (existing.contacto_id ?? null);

      let contactData: { id: number; nombre?: string | null; apellido?: string | null; telefono?: string | null; email?: string | null } | null = null;
      if (nextContactId) {
        const { data: fetchedContact } = await supabase
          .from('wp_contactos')
          .select('id, nombre, apellido, telefono, email')
          .eq('id', nextContactId)
          .single();
        contactData = fetchedContact || null;
      }

      let ownerMember: { id: number; email?: string | null; nombre?: string | null; apellido?: string | null } | null = null;
      if (existing.team_humano_id) {
        const { data: fetchedOwner } = await supabase
          .from('wp_team_humano')
          .select('id, email, nombre, apellido')
          .eq('id', existing.team_humano_id)
          .single();
        ownerMember = fetchedOwner || null;
      }

      const requestedInviteIds = Array.isArray(payload.invitados_ids)
        ? Array.from(new Set(payload.invitados_ids.map(id => Number(id)).filter(id => Number.isFinite(id) && id > 0 && id !== existing.team_humano_id)))
        : null;

      let invitedMembers: Array<{ id: number; email?: string | null; nombre?: string | null; apellido?: string | null }> = [];
      if (requestedInviteIds && requestedInviteIds.length > 0) {
        const { data: fetchedMembers } = await supabase
          .from('wp_team_humano')
          .select('id, email, nombre, apellido')
          .in('id', requestedInviteIds)
          .eq('empresa_id', existing.empresa_id)
          .eq('is_active', true);

        invitedMembers = fetchedMembers || [];
      }

      const mappedParticipantsFromMembers = (() => {
        const items: Array<{ email: string | null; name: string | null; status: string | null }> = [];
        const seenEmails = new Set<string>();

        const pushParticipant = (email?: string | null, name?: string | null, status?: string | null) => {
          const normalizedEmail = (email || '').trim().toLowerCase();
          if (!normalizedEmail || seenEmails.has(normalizedEmail)) return;
          seenEmails.add(normalizedEmail);
          items.push({
            email: normalizedEmail,
            name: name || null,
            status: status || null
          });
        };

        pushParticipant(ownerMember?.email, `${ownerMember?.nombre || ''} ${ownerMember?.apellido || ''}`.trim() || null, 'yes');

        if (!nextIsInternal && contactData?.email) {
          pushParticipant(contactData.email, `${contactData.nombre || ''} ${contactData.apellido || ''}`.trim() || null, null);
        }

        invitedMembers.forEach(member => {
          pushParticipant(member.email, `${member.nombre || ''} ${member.apellido || ''}`.trim() || null, null);
        });

        return items;
      })();

      const nextMetadata = {
        ...currentMetadata,
        ...(payload.metadata || {}),
        tipo: nextTipo,
        fecha_fin: nextEnd,
        is_internal: nextIsInternal,
        meeting_kind: nextIsInternal ? 'internal' : 'contact',
        participants: mappedParticipantsFromMembers
      };

      const remoteEventId = existing.event_id || currentMetadata?.nylas_event_id;
      if (remoteEventId && existing.team_humano_id && ownerMember?.email) {
        const { useAuthStore } = await import('../authStore');
        const accessToken = useAuthStore.getState().session?.access_token;

        const nylasEventPayload: Record<string, unknown> = {
          title: nextTitle,
          description: nextDescription || '',
          when: {
            start_time: Math.floor(startDate.getTime() / 1000),
            end_time: Math.floor(endDate.getTime() / 1000)
          },
          location: nextLocation || '',
          participants: mappedParticipantsFromMembers.map(participant => ({
            name: participant.name,
            email: participant.email,
            ...(participant.status ? { status: participant.status } : {})
          }))
        };

        if (nextTipo === 'videollamada' && !nextLocation) {
          nylasEventPayload.conferencing = {
            provider: 'Google Meet',
            autocreate: {}
          };
        }

        const nylasResponse = await fetch(`/api/nylas/events/${encodeURIComponent(remoteEventId)}`, {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
          },
          body: JSON.stringify({
            appointment_id: numericId,
            ...nylasEventPayload
          })
        });

        const nylasResult = await nylasResponse.json().catch(() => null);
        if (!nylasResponse.ok) {
          return {
            success: false,
            error: nylasResult?.error || 'No se pudo actualizar el evento en el calendario',
            code: nylasResult?.code || 'NYLAS_UPDATE_FAILED'
          };
        }

        const remoteParticipants = Array.isArray(nylasResult?.data?.participants)
          ? nylasResult.data.participants
          : Array.isArray(nylasResult?.participants)
            ? nylasResult.participants
            : null;

        if (remoteParticipants) {
          nextMetadata.participants = remoteParticipants.map((participant: any) => ({
            email: participant.email || null,
            name: participant.name || null,
            status: participant.status || null
          }));
        }

        if (nylasResult?.data?.conferencing) {
          nextMetadata.conferencing = nylasResult.data.conferencing;
        }
      }

      let updateQuery = supabase
        .from('wp_citas')
        .update({
          titulo: nextTitle,
          descripcion: nextDescription,
          fecha_hora: nextStart,
          duracion: durationMinutes,
          ubicacion: nextLocation,
          contacto_id: nextContactId,
          estado: nextStatus,
          metadata: nextMetadata,
          updated_at: new Date().toISOString()
        })
        .eq('id', numericId);

      if (!isDevTeam) {
        updateQuery = updateQuery.eq('empresa_id', selectedEnterpriseId);
      }

      const { data: updatedRecord, error: updateError } = await updateQuery
        .select(`
          id,
          fecha_hora,
          titulo,
          descripcion,
          estado,
          duracion,
          ubicacion,
          contacto_id,
          team_humano_id,
          event_id,
          metadata,
          timezone_cliente,
          contact:wp_contactos(id, nombre, apellido, telefono, email)
        `)
        .single();

      if (updateError || !updatedRecord) {
        return {
          success: false,
          error: updateError?.message || 'No se pudo actualizar la cita',
          code: 'DB_UPDATE_FAILED'
        };
      }

      if (requestedInviteIds) {
        const { data: existingParticipants } = await supabase
          .from('wp_citas_participantes')
          .select('team_humano_id')
          .eq('cita_id', numericId);

        const existingParticipantIds = Array.from(new Set((existingParticipants || []).map(row => row.team_humano_id).filter((id): id is number => typeof id === 'number')));
        const participantIdsToDelete = existingParticipantIds.filter(id => !requestedInviteIds.includes(id));

        if (participantIdsToDelete.length > 0) {
          const { error: deleteError } = await supabase
            .from('wp_citas_participantes')
            .delete()
            .eq('cita_id', numericId)
            .in('team_humano_id', participantIdsToDelete);

          if (deleteError) {
            logger.warn('[ContactStore] Error removing appointment assistants:', deleteError.message);
          }
        }

        if (invitedMembers.length > 0) {
          const participantRows = invitedMembers.map(member => ({
            cita_id: numericId,
            team_humano_id: member.id,
            rol: 'equipo',
            estado_rsvp: 'pendiente',
            email: member.email || null,
            added_by: 'manual'
          }));

          const { error: upsertError } = await supabase
            .from('wp_citas_participantes')
            .upsert(participantRows, { onConflict: 'cita_id,team_humano_id' });

          if (upsertError) {
            logger.warn('[ContactStore] Error upserting appointment assistants:', upsertError.message);
          }
        }
      }

      const normalizedContact = Array.isArray(updatedRecord.contact) ? updatedRecord.contact[0] : updatedRecord.contact;
      const normalizedAppointment = {
        ...updatedRecord,
        contact: normalizedContact || null
      };

      set(state => ({
        activeContactData: {
          ...state.activeContactData,
          appointments: state.activeContactData.appointments.map(apt =>
            apt.id === numericId || apt.event_id === normalizedAppointment.event_id
              ? { ...apt, ...normalizedAppointment }
              : apt
          )
        },
        enterpriseAppointments: state.enterpriseAppointments.map(apt => {
          if (apt.id !== numericId && apt.event_id !== normalizedAppointment.event_id) {
            return apt;
          }

          const nextAppointment = { ...apt, ...normalizedAppointment };
          return apt._isParticipantView
            ? { ...nextAppointment, team_humano_id: apt.team_humano_id }
            : nextAppointment;
        })
      }));

      await logActivity({
        tipo: 'cita',
        accion: 'actualizar',
        descripcion: `Cita actualizada: ${nextTitle}`,
        empresaId: selectedEnterpriseId,
        usuarioId: userContext?.authUid,
        contactoId: nextContactId || undefined
      });

      return { success: true, appointment: normalizedAppointment };
    } catch (err: any) {
      logger.error('[ContactStore] Error in updateAppointment:', err);
      return { success: false, error: err.message || 'Error de conexión', code: 'NETWORK_ERROR' };
    } finally {
      set({ isLoading: false });
    }
  },

  // Appointment Actions
  updateAppointmentLocation: async (appointmentId: number | string, location: string) => {
    const { selectedEnterpriseId, userContext } = get();

    try {
      set({ isLoading: true });

      let appointmentQuery = supabase
        .from('wp_citas')
        .select('id, contacto_id, team_humano_id, metadata, event_id, titulo');

      if (typeof appointmentId === 'number') {
        appointmentQuery = appointmentQuery.eq('id', appointmentId);
      } else {
        appointmentQuery = appointmentQuery.eq('event_id', appointmentId);
      }

      const { data: appointment, error: fetchError } = await appointmentQuery.single();

      if (fetchError || !appointment) {
        logger.error('[ContactStore] Error fetching appointment for location update:', fetchError);
        return { success: false, error: 'No se encontró la cita', code: 'NOT_FOUND' };
      }

      const trimmedLocation = location.trim();
      const nylasEventId = appointment.metadata?.nylas_event_id || appointment.event_id;

      if (nylasEventId) {
        const { useAuthStore } = await import('../authStore');
        const accessToken = useAuthStore.getState().session?.access_token;

        const response = await fetch(`/api/nylas/events/${encodeURIComponent(nylasEventId)}`, {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken && { 'Authorization': `Bearer ${accessToken}` })
          },
          body: JSON.stringify({
            appointment_id: appointment.id,
            location: trimmedLocation
          })
        });

        const result = await response.json();

        if (!response.ok) {
          logger.error('[ContactStore] Error syncing appointment location with Nylas:', result);
          return {
            success: false,
            error: result.error || 'No se pudo actualizar el calendario',
            code: result.code
          };
        }
      }

      const updatedAt = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('wp_citas')
        .update({
          ubicacion: trimmedLocation || null,
          updated_at: updatedAt
        })
        .eq('id', appointment.id);

      if (updateError) {
        logger.error('[ContactStore] Error updating appointment location in DB:', updateError);
        return { success: false, error: 'No se pudo actualizar la cita', code: 'DB_UPDATE_FAILED' };
      }

      set(state => ({
        activeContactData: {
          ...state.activeContactData,
          appointments: state.activeContactData.appointments.map(apt =>
            apt.id === appointment.id || apt.event_id === appointmentId
              ? { ...apt, ubicacion: trimmedLocation || null, updated_at: updatedAt }
              : apt
          )
        },
        enterpriseAppointments: state.enterpriseAppointments.map(apt =>
          apt.id === appointment.id || apt.event_id === appointmentId
            ? { ...apt, ubicacion: trimmedLocation || null, updated_at: updatedAt }
            : apt
        )
      }));

      if (selectedEnterpriseId) {
        await logActivity({
          tipo: 'cita',
          accion: 'actualizar',
          descripcion: `Link de cita actualizado: ${appointment.titulo || 'Sin título'}`,
          empresaId: selectedEnterpriseId,
          usuarioId: userContext?.authUid,
          contactoId: appointment.contacto_id
        });
      }

      return { success: true };
    } catch (err: any) {
      logger.error('[ContactStore] Error in updateAppointmentLocation:', err);
      return { success: false, error: err.message || 'Error de conexión', code: 'NETWORK_ERROR' };
    } finally {
      set({ isLoading: false });
    }
  },

  updateAppointmentStatus: async (appointmentId: number | string, status: string) => {
    try {
      // 1. Primero obtener la cita completa para tener metadata y team_humano_id
      let appointmentQuery = supabase
        .from('wp_citas')
        .select('id, team_humano_id, metadata, estado');
      
      if (typeof appointmentId === 'number') {
        appointmentQuery = appointmentQuery.eq('id', appointmentId);
      } else {
        appointmentQuery = appointmentQuery.eq('event_id', appointmentId);
      }

      const { data: appointment, error: fetchError } = await appointmentQuery.single();

      if (fetchError || !appointment) {
        console.error('[ContactStore] Error fetching appointment for status update:', fetchError);
        return;
      }

      const numericAppointmentId = Number(appointment.id);
      const eventLookupId = typeof appointmentId === 'string' ? appointmentId : appointment.metadata?.nylas_event_id || null;

      // 2. Si el estado es 'cancelada' o 'reagendada', eliminar evento de Nylas
      const SYNC_STATUSES = ['cancelada', 'reagendada'];
      if (SYNC_STATUSES.includes(status.toLowerCase())) {
        const nylasEventId = appointment.metadata?.nylas_event_id;
        
        if (nylasEventId && appointment.team_humano_id) {
          try {
            console.log(`[ContactStore] 🗓️ Syncing ${status} to Nylas: deleting event ${nylasEventId}`);
            
            const deleteResponse = await fetch(
              `/api/nylas/events/${nylasEventId}?appointment_id=${appointment.id}`,
              { method: 'DELETE', credentials: 'include' }
            );

            const deleteResult = await deleteResponse.json();

            if (deleteResponse.ok) {
              console.log(`[ContactStore] ✅ Nylas event deleted: ${nylasEventId}`);
            } else {
              console.warn(`[ContactStore] ⚠️ Nylas delete warning:`, deleteResult);
            }
          } catch (nylasErr) {
            console.error('[ContactStore] Error deleting Nylas event:', nylasErr);
          }
        } else {
          console.log('[ContactStore] No nylas_event_id in metadata, skipping Nylas sync');
        }
      }

      // 3. Actualizar estado en la base de datos
      let updateQuery = supabase.from('wp_citas').update({ estado: status, updated_at: new Date().toISOString() });
      
      if (typeof appointmentId === 'number') {
        updateQuery = updateQuery.eq('id', appointmentId);
      } else {
        updateQuery = updateQuery.eq('event_id', appointmentId);
      }

      const { error } = await updateQuery;

      if (error) {
        console.error('Error updating appointment status:', error);
        return;
      }

      // 4. Update local state
      set(state => ({
        activeContactData: {
          ...state.activeContactData,
          appointments: state.activeContactData.appointments.map(apt => {
            const matchesNumericId = Number(apt.id) === numericAppointmentId;
            const matchesEventId = !!eventLookupId && apt.event_id === eventLookupId;
            return matchesNumericId || matchesEventId ? { ...apt, estado: status } : apt;
          })
        },
        // Also update enterpriseAppointments if it's there
        enterpriseAppointments: state.enterpriseAppointments.map(apt => {
          const matchesNumericId = Number(apt.id) === numericAppointmentId;
          const matchesEventId = !!eventLookupId && apt.event_id === eventLookupId;
          return matchesNumericId || matchesEventId ? { ...apt, estado: status } : apt;
        })
      }));

      // 5. Award XP if completed
      if (status === 'completada' || status === 'realizada') {
        try {
          const { useGamificationStore } = await import('../gamificationStore');
          useGamificationStore.getState().awardXP(
            'appointment_completed',
            'Cita completada',
            typeof appointmentId === 'number' ? appointmentId : undefined,
            'appointment'
          );
        } catch (gamiErr) {
          console.warn('[ContactStore] Non-critical error awarding XP:', gamiErr);
        }
      }

      console.log(`[ContactStore] ✅ Appointment ${appointmentId} status updated to: ${status}`);
    } catch (err) {
      console.error('Error in updateAppointmentStatus:', err);
    }
  },

  updateAppointmentContact: async (appointmentId: number | string, contactId: number) => {
    const { selectedEnterpriseId, isObservationMode, userContext } = get();
    
    // Log when dev team is writing to another enterprise
    if (isObservationMode) {
      logger.info('[ContactStore] 📝 Dev team updating appointment contact in observed enterprise');
    }

    if (!selectedEnterpriseId) {
      console.error('[ContactStore] No enterprise selected for updateAppointmentContact');
      return false;
    }
    
    try {
      const numericId = typeof appointmentId === 'string' ? parseInt(appointmentId, 10) : appointmentId;
      if (isNaN(numericId)) {
        console.error('[ContactStore] Invalid appointment ID:', appointmentId);
        return false;
      }

      logger.debug('[ContactStore] Updating appointment contact:', { appointmentId: numericId, contactId, empresaId: selectedEnterpriseId });

      // Get contact info for optimistic update
      const { data: contactData } = await supabase
        .from('wp_contactos')
        .select('id, nombre, apellido, telefono, email')
        .eq('id', contactId)
        .single();

      // FIX: For role 1 (Dev Team), don't filter by empresa_id since they can work across enterprises
      // For other roles, keep the empresa_id filter for security
      const isDevTeam = userContext?.roleId === 1;
      
      let updateQuery = supabase
        .from('wp_citas')
        .update({ contacto_id: contactId })
        .eq('id', numericId);
      
      // Only apply empresa_id filter for non-dev-team users
      if (!isDevTeam) {
        updateQuery = updateQuery.eq('empresa_id', selectedEnterpriseId);
      }
      
      const { data: updateResult, error } = await updateQuery.select('id, contacto_id, empresa_id');
      
      if (error) {
        console.error('[ContactStore] Error updating appointment contact:', error);
        return false;
      }

      // Verify update was successful
      if (!updateResult || updateResult.length === 0) {
        console.error('[ContactStore] No rows updated - appointment may not exist or belong to different enterprise');
        return false;
      }
      
      // Log if dev team updated appointment in different enterprise
      if (isDevTeam && updateResult[0]?.empresa_id !== selectedEnterpriseId) {
        logger.info('[ContactStore] 📝 Dev team updated appointment in enterprise:', updateResult[0]?.empresa_id);
      }

      logger.info('[ContactStore] ✅ DB update confirmed:', updateResult[0]);

      // Optimistic update in local state
      const { enterpriseAppointments } = get();
      const updatedAppointments = enterpriseAppointments.map(apt => 
        (typeof apt.id === 'number' ? apt.id : parseInt(String(apt.id), 10)) === numericId
          ? { 
              ...apt, 
              contacto_id: contactId,
              contact: contactData ? {
                nombre: contactData.nombre,
                apellido: contactData.apellido,
                telefono: contactData.telefono,
                email: contactData.email
              } : apt.contact
            }
          : apt
      );
      
      set({ enterpriseAppointments: updatedAppointments });
      logger.info('[ContactStore] ✅ Appointment contact updated:', { appointmentId: numericId, contactId });
      return true;
    } catch (err) {
      console.error('Error in updateAppointmentContact:', err);
      return false;
    }
  },
});

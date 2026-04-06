'use client';

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { logger } from '@/lib/logger';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Clock, 
  User, 
  MapPin, 
  Video,
  MoreHorizontal,
  RefreshCw,
  Users,
  FileText,
  Filter,
  Plus,
  Check,
  AlertCircle,
  Info,
  X
} from 'lucide-react';
import { supabase } from '../../lib/supabase-client';
import { 
  useContactStore, 
  selectSelectedEnterpriseId, 
  selectSelectedContactId,
  selectUserContext,
  selectTeamMembers
} from '../../store/contactStore';
import { usePageTracking, useActionTracking } from '@/hooks/useEngagement';
import { useAdminStore, selectGlobalTeamMemberIds, selectIsTeamFilterRestricted } from '../../store/adminStore';
import { Appointment } from '../../types/contact';
import { ContactDetailModal } from './ContactDetailModal';
import { QuickScheduleModal } from './dashboard/QuickScheduleModal';
import { AssignContactToAppointmentModal } from './calendar/AssignContactToAppointmentModal';

// Helper to format date
const formatDate = (date: Date) => {
  return new Intl.DateTimeFormat('es-ES', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long' 
  }).format(date);
};

// Helper to get start/end of week
const getWeekRange = (date: Date) => {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay() + 1); // Monday
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(start);
  end.setDate(end.getDate() + 6); // Sunday
  end.setHours(23, 59, 59, 999);
  
  return { start, end };
};

// Helper to generate hours
const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8:00 to 20:00

const APPOINTMENT_STATUS_COLORS: Record<string, string> = {
  pendiente: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  confirmada: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  realizada: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
  reagendada: 'bg-purple-500/10 border-purple-500/20 text-purple-400',
  cancelada: 'bg-red-500/10 border-red-500/20 text-red-400',
  no_asistio: 'bg-gray-500/10 border-gray-500/20 text-gray-400',
};

const APPOINTMENT_STATUS_INDICATORS: Record<string, string> = {
  pendiente: 'bg-amber-500',
  confirmada: 'bg-emerald-500',
  realizada: 'bg-blue-500',
  reagendada: 'bg-purple-500',
  cancelada: 'bg-red-500',
  no_asistio: 'bg-gray-500',
};

export const CalendarView: React.FC = () => {
  const selectedEnterpriseId = useContactStore(selectSelectedEnterpriseId);
  const selectedContactId = useContactStore(selectSelectedContactId);
  const userContext = useContactStore(selectUserContext);
  const selectContact = useContactStore(state => state.selectContact);
  
  const appointments = useContactStore(state => state.enterpriseAppointments);
  const fetchEnterpriseAppointments = useContactStore(state => state.fetchEnterpriseAppointments);
  const teamMembers = useContactStore(selectTeamMembers);
  const fetchTeamMembers = useContactStore(state => state.fetchTeamMembers);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const isReconcilingRef = useRef(false);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Toast system
  const [toast, setToast] = useState<{
    id: string;
    title: string;
    message: string;
    type: 'success' | 'error' | 'info';
    count: number;
    groupKey?: string;
  } | null>(null);

  const hideToast = useCallback(() => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
    setToast(null);
  }, []);

  const scheduleToastHide = useCallback(() => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }

    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, 4500);
  }, []);

  const showToast = useCallback((
    title: string,
    message: string,
    type: 'success' | 'error' | 'info' = 'info',
    groupKey?: string
  ) => {
    const id = Date.now().toString();

    setToast(prev => {
      if (prev && groupKey && prev.groupKey === groupKey) {
        const nextCount = prev.count + 1;
        return {
          ...prev,
          id,
          type,
          count: nextCount,
          title: 'Cambios recientes en el calendario',
          message: `Se detectaron ${nextCount} cambios realizados por otros usuarios. El calendario ya muestra la versión más reciente.`
        };
      }

      return {
        id,
        title,
        message,
        type,
        count: 1,
        groupKey
      };
    });

    scheduleToastHide();
  }, [scheduleToastHide]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      if (realtimeRefreshTimeoutRef.current) {
        clearTimeout(realtimeRefreshTimeoutRef.current);
      }
    };
  }, []);
  
  // Global team filter from adminStore (array of selected IDs)
  const globalTeamMemberIds = useAdminStore(selectGlobalTeamMemberIds);
  const isTeamFilterRestricted = useAdminStore(selectIsTeamFilterRestricted);
  
  // Check if user is basic role (rol 3) - restricted to own appointments
  const isBasicRole = userContext?.roleId === 3;
  
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // Quick Schedule Modal state
  const [showQuickSchedule, setShowQuickSchedule] = useState(false);
  const [quickScheduleInitial, setQuickScheduleInitial] = useState<{
    date?: string;
    startTime?: string;
    endTime?: string;
    teamMemberId?: number;
  }>({});

  // Assign Contact Modal state (for appointments without contacto_id)
  const [appointmentToAssign, setAppointmentToAssign] = useState<Appointment | null>(null);

  // Handler for clicking on empty calendar slot (Google Calendar style)
  const handleSlotClick = (date: Date, hour?: number, teamMemberId?: number) => {
    const dateStr = date.toISOString().split('T')[0];
    const startHour = hour ?? 9;
    const startTime = `${startHour.toString().padStart(2, '0')}:00`;
    const endTime = `${(startHour + 1).toString().padStart(2, '0')}:00`;
    
    setQuickScheduleInitial({
      date: dateStr,
      startTime,
      endTime,
      teamMemberId: teamMemberId || undefined
    });
    setShowQuickSchedule(true);
    trackAction('calendar.slot_click', { date: dateStr, hour: startHour, teamMemberId });
  };

  // Handler for new appointment button
  const handleNewAppointment = () => {
    setQuickScheduleInitial({});
    setShowQuickSchedule(true);
    trackAction('calendar.new_appointment_button');
  };

  // Engagement tracking
  usePageTracking('calendar');
  const trackAction = useActionTracking('calendar');
  const setAdminActiveView = useAdminStore(state => state.setActiveView);

  const [viewMode, setViewMode] = useState<'day' | 'week'>(() => {
    // Persist view mode preference
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('calendarViewMode') as 'day' | 'week') || 'week';
    }
    return 'week';
  });
  const handleSetViewMode = (mode: 'day' | 'week') => {
    setViewMode(mode);
    localStorage.setItem('calendarViewMode', mode);
  }; 

  const effectiveTeamMemberIds = useMemo(() => {
    if ((isTeamFilterRestricted || isBasicRole) && userContext?.id) {
      return globalTeamMemberIds.length > 0 ? globalTeamMemberIds : [userContext.id];
    }

    return globalTeamMemberIds.length > 0 ? globalTeamMemberIds : null;
  }, [globalTeamMemberIds, isTeamFilterRestricted, isBasicRole, userContext?.id]);
  const effectiveTeamMemberIdsKey = useMemo(
    () => effectiveTeamMemberIds ? [...effectiveTeamMemberIds].sort((a, b) => a - b).join(',') : 'all',
    [effectiveTeamMemberIds]
  );
  const hasActiveTeamFilter = !!(effectiveTeamMemberIds && effectiveTeamMemberIds.length > 0);
  const shouldFetchAllForDayView = viewMode === 'day' && !hasActiveTeamFilter;

  // Calculate fetch range (Monthly buffer)
  // We fetch data for the full month(s) covering the current view to minimize refetches
  // and ensure data persists when switching views.
  const fetchRange = useMemo(() => {
    let start, end;
    
    if (viewMode === 'week') {
      const range = getWeekRange(currentDate);
      start = range.start;
      end = range.end;
    } else {
      start = new Date(currentDate);
      end = new Date(currentDate);
    }

    // Expand to full month coverage
    const fetchStart = new Date(start.getFullYear(), start.getMonth(), 1);
    const fetchEnd = new Date(end.getFullYear(), end.getMonth() + 1, 0, 23, 59, 59);

    return { 
      start: fetchStart.toISOString(), 
      end: fetchEnd.toISOString() 
    };
  }, [currentDate, viewMode]);

  const reconcileRange = useMemo(() => {
    if (hasActiveTeamFilter) {
      return fetchRange;
    }

    const now = new Date();
    const reconcileStart = new Date(now);
    reconcileStart.setDate(reconcileStart.getDate() - 1);
    reconcileStart.setHours(0, 0, 0, 0);

    const reconcileEnd = new Date(now);
    reconcileEnd.setDate(reconcileEnd.getDate() + 1);
    reconcileEnd.setHours(23, 59, 59, 999);

    return {
      start: reconcileStart.toISOString(),
      end: reconcileEnd.toISOString()
    };
  }, [fetchRange, hasActiveTeamFilter]);

  const reconcileCalendar = useCallback(async (options?: { force?: boolean; notifySuccess?: boolean; notifyErrors?: boolean }) => {
    if (!selectedEnterpriseId || isReconcilingRef.current) {
      return { changed: 0, skipped: true };
    }

    const teamFilterForFetch = shouldFetchAllForDayView ? null : effectiveTeamMemberIds;
    const cacheKey = `calendar-reconcile:${selectedEnterpriseId}:${effectiveTeamMemberIdsKey}:${reconcileRange.start}:${reconcileRange.end}`;

    if (!options?.force && typeof window !== 'undefined') {
      const lastRun = Number(localStorage.getItem(cacheKey) || 0);
      if (Number.isFinite(lastRun) && Date.now() - lastRun < 5 * 60 * 1000) {
        return { changed: 0, skipped: true };
      }
    }

    try {
      isReconcilingRef.current = true;
      setIsReconciling(true);

      const { useAuthStore } = await import('../../store/authStore');
      const accessToken = useAuthStore.getState().session?.access_token;
      const response = await fetch('/api/nylas/events/reconcile', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        body: JSON.stringify({
          enterprise_id: selectedEnterpriseId,
          team_member_ids: teamFilterForFetch,
          start: reconcileRange.start,
          end: reconcileRange.end,
          force: !!options?.force
        })
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || 'Error al sincronizar calendario');
      }

      if (typeof window !== 'undefined') {
        localStorage.setItem(cacheKey, String(Date.now()));
      }

      const changed = Number(payload?.changed || 0);
      if (changed > 0) {
        await fetchEnterpriseAppointments(teamFilterForFetch, fetchRange, true);
        if (options?.notifySuccess) {
          showToast(
            'Calendario sincronizado',
            `Se aplicaron ${changed} cambio${changed === 1 ? '' : 's'} al calendario durante la sincronización.`,
            'success'
          );
        }
      } else if (options?.notifySuccess) {
        showToast(
          'Calendario actualizado',
          'No se detectaron cambios pendientes durante la sincronización.',
          'success'
        );
      }

      return { changed, skipped: false };
    } catch (error: any) {
      logger.error('[CalendarView] Reconcile error:', error);
      if (options?.notifyErrors) {
        showToast(
          'Error al sincronizar',
          error?.message || 'No se pudo sincronizar el calendario en este momento.',
          'error'
        );
      }
      return { changed: 0, skipped: false, error };
    } finally {
      isReconcilingRef.current = false;
      setIsReconciling(false);
    }
  }, [selectedEnterpriseId, shouldFetchAllForDayView, effectiveTeamMemberIds, effectiveTeamMemberIdsKey, reconcileRange.start, reconcileRange.end, fetchEnterpriseAppointments, showToast]);

  const queueRealtimeRefresh = useCallback(() => {
    if (realtimeRefreshTimeoutRef.current) {
      clearTimeout(realtimeRefreshTimeoutRef.current);
    }

    realtimeRefreshTimeoutRef.current = setTimeout(() => {
      realtimeRefreshTimeoutRef.current = null;
      void fetchEnterpriseAppointments(shouldFetchAllForDayView ? null : effectiveTeamMemberIds, fetchRange, true);
    }, 180);
  }, [fetchEnterpriseAppointments, shouldFetchAllForDayView, effectiveTeamMemberIds, fetchRange]);

  const shouldRefreshForParticipantChange = useCallback((payload: { new?: any; old?: any }) => {
    const row = payload.new || payload.old;
    if (!row) return false;

    const citaId = Number(row.cita_id);
    const participantTeamId = Number(row.team_humano_id);
    const loadedAppointmentIds = new Set(
      useContactStore.getState().enterpriseAppointments
        .map(appointment => Number(appointment.id))
        .filter(id => Number.isFinite(id))
    );

    if (Number.isFinite(citaId) && loadedAppointmentIds.has(citaId)) {
      return true;
    }

    if (!Number.isFinite(participantTeamId)) {
      return false;
    }

    const currentEnterpriseTeamIds = new Set(teamMembers.map(member => member.id));
    if (!currentEnterpriseTeamIds.has(participantTeamId)) {
      return false;
    }

    if (effectiveTeamMemberIds && effectiveTeamMemberIds.length > 0) {
      return effectiveTeamMemberIds.includes(participantTeamId);
    }

    return true;
  }, [effectiveTeamMemberIds, teamMembers]);

  // Fetch team members when enterprise changes
  useEffect(() => {
    if (selectedEnterpriseId) {
      fetchTeamMembers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEnterpriseId]);

  // Fetch appointments when enterprise, team filter, or date range changes
  useEffect(() => {
    if (!selectedEnterpriseId) return;
    const teamFilterForFetch = shouldFetchAllForDayView ? null : effectiveTeamMemberIds;

    // Only show refreshing spinner if we already have data; otherwise mark initial load
    const hasData = useContactStore.getState().enterpriseAppointments.length > 0;
    if (!hasData) {
      setIsInitialLoad(true);
    }

    fetchEnterpriseAppointments(teamFilterForFetch, fetchRange)
      .then(({ fromCache }) => {
        if (!fromCache) setIsRefreshing(false);
      })
      .finally(() => {
        setIsInitialLoad(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEnterpriseId, effectiveTeamMemberIdsKey, fetchRange.start, fetchRange.end, shouldFetchAllForDayView]);

  // Reconcile calendar separately — runs after data is loaded, debounced, does NOT block UI
  const reconcileTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!selectedEnterpriseId) return;
    // Debounce reconcile to avoid running on every rapid dep change
    if (reconcileTimeoutRef.current) clearTimeout(reconcileTimeoutRef.current);
    reconcileTimeoutRef.current = setTimeout(() => {
      reconcileCalendar({ force: false, notifySuccess: false, notifyErrors: false });
    }, 600);
    return () => {
      if (reconcileTimeoutRef.current) clearTimeout(reconcileTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEnterpriseId, effectiveTeamMemberIdsKey, fetchRange.start, fetchRange.end]);

  // Realtime: refresh appointments when any appointment changes
  useEffect(() => {
    if (!selectedEnterpriseId) return;

    const channel = supabase
      .channel(`calendar-appointments-${selectedEnterpriseId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wp_citas',
          filter: `empresa_id=eq.${selectedEnterpriseId}`
        },
        (payload) => {
          logger.debug('[CalendarView] Realtime event received:', payload.eventType, (payload.new as any)?.id || (payload.old as any)?.id);
          
          const { enterpriseAppointments } = useContactStore.getState();
          
          if (payload.eventType === 'UPDATE' && payload.new) {
            const updatedApt = payload.new as any as Appointment;
            const exists = enterpriseAppointments.some(a => a.id === updatedApt.id);
            if (exists) {
              // Merge only base fields from realtime payload.
              // Preserve expanded participant copy fields (_isParticipantView,
              // _originalTeamHumanoId, _participantRole, team_humano_id, contact).
              const baseFields = ['titulo', 'estado', 'fecha_hora', 'duracion', 'ubicacion', 'contacto_id', 'event_id', 'metadata', 'descripcion', 'timezone_cliente'] as const;
              useContactStore.setState({
                enterpriseAppointments: enterpriseAppointments.map(a => {
                  if (a.id !== updatedApt.id) return a;
                  const patch: Record<string, any> = {};
                  for (const field of baseFields) {
                    if (field in updatedApt) patch[field] = (updatedApt as any)[field];
                  }
                  // Only overwrite team_humano_id on the owner entry, not participant copies
                  if (!a._isParticipantView && updatedApt.team_humano_id !== undefined) {
                    patch.team_humano_id = updatedApt.team_humano_id;
                  }
                  return { ...a, ...patch };
                })
              });
              // Silently updated in store — no toast to avoid notification spam
            } else {
              queueRealtimeRefresh();
            }
          } else if (payload.eventType === 'INSERT' && payload.new) {
            queueRealtimeRefresh();
            const newApt = payload.new as any as Appointment;
            // Silently refreshed — no toast to avoid notification spam
          } else if (payload.eventType === 'DELETE' && payload.old) {
            const deletedId = ((payload.old as any) as Appointment).id;
            useContactStore.setState({
              enterpriseAppointments: enterpriseAppointments.filter(a => a.id !== deletedId)
            });
            // Silently removed from store — no toast to avoid notification spam
          }
        }
      )
      .subscribe();

    // Realtime: refresh when participants change (INSERT/DELETE on wp_citas_participantes)
    const participantsChannel = supabase
      .channel(`calendar-participants-${selectedEnterpriseId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wp_citas_participantes'
        },
        (payload) => {
          logger.debug('[CalendarView] Participant realtime event:', payload.eventType);
          if (!shouldRefreshForParticipantChange(payload as { new?: any; old?: any })) {
            return;
          }

          queueRealtimeRefresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(participantsChannel);
    };
  }, [selectedEnterpriseId, queueRealtimeRefresh, shouldRefreshForParticipantChange, showToast]);

  // Navigation handlers
  const handlePrev = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'day') newDate.setDate(newDate.getDate() - 1);
    else newDate.setDate(newDate.getDate() - 7);
    setCurrentDate(newDate);
    trackAction('calendar.navigate', { direction: 'prev', viewMode });
  };

  const handleNext = () => {
    const newDate = new Date(currentDate);
    if (viewMode === 'day') newDate.setDate(newDate.getDate() + 1);
    else newDate.setDate(newDate.getDate() + 7);
    setCurrentDate(newDate);
    trackAction('calendar.navigate', { direction: 'next', viewMode });
  };

  const handleToday = () => {
    setCurrentDate(new Date());
    trackAction('calendar.navigate', { direction: 'today', viewMode });
  };

  // Filter appointments for current view
  // FIX: Don't mutate currentDate - create new Date objects instead
  const visibleAppointments = useMemo(() => {
    if (!hasActiveTeamFilter || !effectiveTeamMemberIds) {
      return appointments;
    }

    return appointments.filter(apt => {
      if (typeof apt.team_humano_id !== 'number') return false;
      return effectiveTeamMemberIds.includes(apt.team_humano_id);
    });
  }, [appointments, hasActiveTeamFilter, effectiveTeamMemberIds]);

  const currentAppointments = useMemo(() => {
    let start: Date, end: Date;
    
    if (viewMode === 'week') {
      const range = getWeekRange(currentDate);
      start = range.start;
      end = range.end;
    } else {
      // Day view - create new Date objects to avoid mutating state
      start = new Date(currentDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(currentDate);
      end.setHours(23, 59, 59, 999);
    }

    return visibleAppointments.filter(apt => {
      if (!apt.fecha_hora) return false;
      const aptDate = new Date(apt.fecha_hora);
      return aptDate >= start && aptDate <= end;
    });
  }, [visibleAppointments, currentDate, viewMode]);

  const teamMembersById = useMemo(
    () => new Map(teamMembers.map(member => [member.id, member])),
    [teamMembers]
  );

  // Group appointments by day for week view
  // DEDUP: In week view, show each cita.id only once (skip expanded participant copies)
  const appointmentsByDay = useMemo(() => {
    const groups: Record<string, Appointment[]> = {};
    const seenByDay: Record<string, Set<number | string>> = {};
    currentAppointments.forEach(apt => {
      if (!apt.fecha_hora) return;
      const dateKey = new Date(apt.fecha_hora).toDateString();
      if (!groups[dateKey]) { groups[dateKey] = []; seenByDay[dateKey] = new Set(); }
      // In week view, deduplicate by appointment id
      if (viewMode === 'week') {
        if (seenByDay[dateKey].has(apt.id)) return;
        seenByDay[dateKey].add(apt.id);
      }
      groups[dateKey].push(apt);
    });
    return groups;
  }, [currentAppointments, viewMode]);

  // Count appointments per day across the full fetched range (for week header badges)
  // DEDUP: Count unique cita.id per day (don't inflate with participant copies)
  const appointmentsCountByDay = useMemo(() => {
    const counts: Record<string, number> = {};
    const seen: Record<string, Set<number | string>> = {};
    visibleAppointments.forEach(apt => {
      if (!apt.fecha_hora) return;
      const dateKey = new Date(apt.fecha_hora).toDateString();
      if (!seen[dateKey]) seen[dateKey] = new Set();
      if (seen[dateKey].has(apt.id)) return;
      seen[dateKey].add(apt.id);
      counts[dateKey] = (counts[dateKey] || 0) + 1;
    });
    return counts;
  }, [visibleAppointments]);

  // For day view: determine which team members to show as columns
  const dayViewMembers = useMemo(() => {
    const activeMembers = teamMembers.filter(m => m.is_active);
    
    // If specific team members are selected in the global filter, show only those columns
    if (hasActiveTeamFilter && effectiveTeamMemberIds) {
      const filtered = activeMembers.filter(m => effectiveTeamMemberIds.includes(m.id));
      return filtered.length > 0 ? filtered : activeMembers;
    }
    
    return activeMembers;
  }, [teamMembers, hasActiveTeamFilter, effectiveTeamMemberIds]);

  // Group appointments by team member for day view
  const appointmentsByMember = useMemo(() => {
    const groups: Record<number, Appointment[]> = {};
    
    // Initialize groups for all visible members
    dayViewMembers.forEach(member => {
      groups[member.id] = [];
    });
    
    // Add "Sin asignar" group (id = 0)
    groups[0] = [];
    
    currentAppointments.forEach(apt => {
      const memberId = apt.team_humano_id || 0;
      if (groups[memberId] !== undefined) {
        groups[memberId].push(apt);
      } else if (!hasActiveTeamFilter && (memberId === 0 || !dayViewMembers.find(m => m.id === memberId))) {
        // Appointment belongs to unassigned or to a member not in visible list
        groups[0].push(apt);
      }
    });
    
    return groups;
  }, [currentAppointments, dayViewMembers, hasActiveTeamFilter]);
  const showUnassignedColumn = !hasActiveTeamFilter && (appointmentsByMember[0]?.length > 0 || globalTeamMemberIds.length === 0);
  const dayGridMinWidth = dayViewMembers.length > 0
    ? `${80 + dayViewMembers.length * 180 + (showUnassignedColumn ? 180 : 0)}px`
    : 'auto';

  const getAppointmentAssistantIds = useCallback((appointment: Appointment) => {
    return Array.from(new Set(
      appointments
        .filter(candidate => candidate.id === appointment.id && candidate._isParticipantView && typeof candidate.team_humano_id === 'number')
        .map(candidate => candidate.team_humano_id as number)
    )).sort((a, b) => a - b);
  }, [appointments]);

  // Helper to render an appointment card
  const renderAppointmentCard = (apt: Appointment, isCompact = false) => {
    const startTime = new Date(apt.fecha_hora!).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const contactName = [apt.contact?.nombre, apt.contact?.apellido].filter(Boolean).join(' ') || 'Sin nombre';
    const isParticipantView = !!apt._isParticipantView;
    const isInternalMeeting = apt.metadata?.is_internal === true || apt.metadata?.meeting_kind === 'internal';
    const participantRoleLabel = apt._participantRole === 'equipo' ? 'Equipo' : 'Invitado';
    const compactParticipantRoleLabel = apt._participantRole === 'equipo' ? 'Eq' : 'Inv';
    // For participant views, show the original owner's avatar; otherwise show current team_humano_id
    const displayOwnerId = isParticipantView && apt._originalTeamHumanoId
      ? apt._originalTeamHumanoId
      : apt.team_humano_id;
    const owner = typeof displayOwnerId === 'number' ? teamMembersById.get(displayOwnerId) : null;
    const ownerName = owner ? [owner.nombre, owner.apellido].filter(Boolean).join(' ') : null;
    const ownerInitials = owner
      ? `${owner.nombre?.trim()?.[0] || ''}${owner.apellido?.trim()?.[0] || ''}`.toUpperCase() || owner.nombre?.trim()?.[0]?.toUpperCase() || '?'
      : '?';
    const ownerTone = owner
      ? [
          'bg-cyan-500/20 text-cyan-300 border-cyan-400/25',
          'bg-emerald-500/20 text-emerald-300 border-emerald-400/25',
          'bg-violet-500/20 text-violet-300 border-violet-400/25',
          'bg-amber-500/20 text-amber-300 border-amber-400/25',
          'bg-rose-500/20 text-rose-300 border-rose-400/25',
          'bg-sky-500/20 text-sky-300 border-sky-400/25'
        ][owner.id % 6]
      : 'bg-zinc-700/60 text-zinc-300 border-white/10';
    
    const handleCardClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      logger.debug('[CalendarView] Card clicked:', apt.id);
      trackAction('calendar.appointment_click', { appointmentId: apt.id, contactId: apt.contacto_id });
      
      if (apt.contacto_id && !isInternalMeeting) {
        // Pass partial contact info to avoid loading state if contact not in list
        selectContact(apt.contacto_id, apt.contact ? {
          nombre: apt.contact.nombre,
          apellido: apt.contact.apellido,
          email: apt.contact.email,
          telefono: apt.contact.telefono
        } : undefined);
      } else {
        // Open assign contact modal for appointments without contact
        setAppointmentToAssign(apt);
      }
    };

    // Unique key: include team_humano_id for expanded participant copies to avoid React key collisions
    const cardKey = isParticipantView ? `${apt.id}-p${apt.team_humano_id}` : apt.id;

    // Compact View (Week)
    if (isCompact) {
      const statusIndicator = APPOINTMENT_STATUS_INDICATORS[apt.estado?.toLowerCase() || ''] || 'bg-zinc-500';
      
      return (
        <div 
          key={cardKey}
          onClick={handleCardClick}
          className={`bg-zinc-800/90 border rounded pl-2.5 pr-2 py-1.5 hover:border-primary-500/30 hover:bg-zinc-800 transition-all cursor-pointer group relative overflow-hidden shadow-sm ${isParticipantView ? 'border-sky-500/15' : 'border-white/5'}`}
          title={`${startTime} - ${contactName}\n${apt.titulo || 'Cita'}${isParticipantView ? `\n(${participantRoleLabel})` : ''}\nEstado: ${apt.estado}`}
        >
          {/* Status Indicator Bar */}
          <div className={`absolute left-0 top-0 bottom-0 w-1 ${statusIndicator}`} />

          <div className="flex flex-col gap-0.5">
            {/* Header: Time and optional icons */}
            <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono leading-none mb-0.5 md:mb-1">
              <span>{startTime}</span>
              <div className="flex items-center gap-1">
                {isInternalMeeting && (
                  <span className="text-[7px] font-semibold uppercase tracking-wider text-sky-300 bg-sky-500/15 px-1 py-px rounded">Int</span>
                )}
                {isParticipantView && (
                  <span className="text-[7px] font-semibold uppercase tracking-wider text-sky-400/80 bg-sky-500/10 px-1 py-px rounded">{compactParticipantRoleLabel}</span>
                )}
                {ownerName && (
                  <div
                    className={`w-4 h-4 rounded-full border inline-flex items-center justify-center text-[8px] font-semibold tracking-tight ${ownerTone}`}
                    title={`Asesor dueño: ${ownerName}`}
                  >
                    {ownerInitials}
                  </div>
                )}
                {apt.ubicacion && (
                  <div className="opacity-60">
                    {apt.ubicacion.includes('meet') || apt.ubicacion.includes('zoom') ? (
                      <Video className="w-2.5 h-2.5" />
                    ) : (
                      <MapPin className="w-2.5 h-2.5" />
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Contact Name - Primary Info */}
            <div className={`font-medium text-[11px] truncate leading-tight group-hover:text-white flex items-center gap-1 ${!apt.contacto_id && !isInternalMeeting ? 'text-amber-400/80' : isInternalMeeting ? 'text-sky-300' : 'text-zinc-200'}`}>
              {!apt.contacto_id && !isInternalMeeting && <User className="w-2.5 h-2.5 shrink-0" />}
              {isInternalMeeting ? 'Reunión interna' : apt.contacto_id ? contactName : 'Sin contacto'}
            </div>

            {/* Title - Secondary Info */}
            {apt.titulo && (
              <div className="text-[9px] text-zinc-500 truncate leading-none opacity-80">
                {apt.titulo}
              </div>
            )}
          </div>
        </div>
      );
    }

    // Standard View (Day)
    const endTime = new Date(new Date(apt.fecha_hora!).getTime() + (apt.duracion || 30) * 60000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const statusColor = APPOINTMENT_STATUS_COLORS[apt.estado?.toLowerCase() || ''] || 'bg-zinc-500/10 border-zinc-500/20 text-zinc-400';

    return (
      <div 
        key={cardKey}
        onClick={handleCardClick}
        className={`bg-zinc-800/80 border rounded-lg p-2 md:p-3 hover:border-primary-500/30 transition-colors cursor-pointer group active:scale-[0.98] text-xs md:text-sm ${isParticipantView ? 'border-sky-500/15' : 'border-white/5'}`}
      >
        <div className="flex items-start justify-between gap-1.5 md:gap-2 mb-1.5 md:mb-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1 mb-0.5 md:mb-1">
              <div className={`inline-flex items-center px-1 md:px-1.5 py-0.5 rounded text-[9px] md:text-[10px] font-medium border ${statusColor}`}>
                {apt.estado}
              </div>
              {isInternalMeeting && (
                <span className="text-[8px] font-semibold uppercase tracking-wider text-sky-300 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/15">Interna</span>
              )}
              {isParticipantView && (
                <span className="text-[8px] font-semibold uppercase tracking-wider text-sky-400/80 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/15">{participantRoleLabel}</span>
              )}
            </div>
            <div className="font-medium text-zinc-200 truncate text-[11px] md:text-sm" title={apt.titulo || 'Sin título'}>
              {apt.titulo || 'Cita'}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {ownerName && (
              <div
                className={`w-5 h-5 rounded-full border inline-flex items-center justify-center text-[9px] font-semibold tracking-tight shrink-0 ${ownerTone}`}
                title={`Asesor dueño: ${ownerName}`}
              >
                {ownerInitials}
              </div>
            )}
            <span className="text-[9px] md:text-[10px] font-mono text-zinc-500 whitespace-nowrap bg-zinc-900/50 px-1 md:px-1.5 py-0.5 rounded">
              {startTime}
            </span>
          </div>
        </div>

        {isInternalMeeting ? (
          <div className="flex items-center gap-1.5 md:gap-2 text-sky-300 mb-1 md:mb-1.5 bg-sky-500/5 border border-sky-500/10 rounded px-1.5 py-0.5">
            <Users className="w-2.5 h-2.5 md:w-3 md:h-3 shrink-0" />
            <span className="text-[10px] md:text-xs">
              Click para gestionar reunión interna
            </span>
          </div>
        ) : apt.contacto_id ? (
          <div className="flex items-center gap-1.5 md:gap-2 text-zinc-400 mb-1 md:mb-1.5">
            <User className="w-2.5 h-2.5 md:w-3 md:h-3 shrink-0" />
            <span className="truncate text-[10px] md:text-xs">
              {contactName}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 md:gap-2 text-amber-400/80 mb-1 md:mb-1.5 bg-amber-500/5 border border-amber-500/10 rounded px-1.5 py-0.5">
            <User className="w-2.5 h-2.5 md:w-3 md:h-3 shrink-0" />
            <span className="text-[10px] md:text-xs">
              Click para asignar contacto
            </span>
          </div>
        )}

        {apt.ubicacion && (
          <div className="flex items-center gap-1.5 md:gap-2 text-zinc-500">
            {apt.ubicacion.includes('meet') || apt.ubicacion.includes('zoom') ? (
              <Video className="w-2.5 h-2.5 md:w-3 md:h-3 shrink-0" />
            ) : (
              <MapPin className="w-2.5 h-2.5 md:w-3 md:h-3 shrink-0" />
            )}
            <a 
              href={apt.ubicacion} 
              target="_blank" 
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="truncate text-[9px] md:text-[10px] hover:text-primary-400 hover:underline"
            >
              {apt.ubicacion}
            </a>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-[#0c0c0e] pb-20 md:pb-0">
      {/* Toolbar */}
      <div className="shrink-0 p-3 md:p-4 border-b border-white/5 flex flex-col sm:flex-row sm:items-center sm:flex-wrap justify-between gap-3 md:gap-4">
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          <div className="flex items-center bg-zinc-900 rounded-lg border border-white/5 p-0.5 md:p-1">
            <button 
              onClick={handlePrev}
              className="p-1 md:p-1.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-md transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button 
              onClick={handleToday}
              className="px-2 md:px-3 py-1 text-[10px] md:text-xs font-medium text-zinc-300 hover:text-white transition-colors"
            >
              Hoy
            </button>
            <button 
              onClick={handleNext}
              className="p-1 md:p-1.5 text-zinc-400 hover:text-white hover:bg-white/5 rounded-md transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          
          <div className="flex items-center gap-2">
            <h2 className="text-sm md:text-lg font-medium text-zinc-200 capitalize truncate max-w-[150px] sm:max-w-none">
              {viewMode === 'day' 
                ? formatDate(currentDate)
                : (() => {
                    const { start, end } = getWeekRange(currentDate);
                    const startMonth = start.toLocaleDateString('es-ES', { month: 'short' });
                    const endMonth = end.toLocaleDateString('es-ES', { month: 'short' });
                    return `${start.getDate()} ${startMonth !== endMonth ? startMonth : ''} - ${end.getDate()} ${endMonth} ${end.getFullYear()}`;
                  })()
              }
            </h2>
            {currentAppointments.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-white/[0.04] border border-white/6 text-[10px] md:text-xs tabular-nums backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-400/80 shadow-[0_0_8px_rgba(34,211,238,0.35)]" />
                <span className="font-semibold text-zinc-200">{new Set(currentAppointments.map(a => a.id)).size}</span>
                <span className="text-zinc-500">citas</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 md:gap-2">
          {/* Team Filter indicator - now global in header */}
          <div className="flex items-center justify-center px-2 py-1 bg-zinc-900/40 border border-white/5 rounded-lg text-[10px] md:text-xs text-zinc-500 min-w-[32px]">
            <Users className="w-3.5 h-3.5" />
            {globalTeamMemberIds.length > 0 && (
              <span className="ml-1 text-zinc-400">{globalTeamMemberIds.length}</span>
            )}
          </div>

          <div className="flex bg-zinc-900 rounded-lg border border-white/5 p-0.5 md:p-1">
            <button
              onClick={() => handleSetViewMode('day')}
              className={`px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-medium rounded-md transition-all ${
                viewMode === 'day' 
                  ? 'bg-primary-500/20 text-primary-400 shadow-sm' 
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Día
            </button>
            <button
              onClick={() => handleSetViewMode('week')}
              className={`px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-medium rounded-md transition-all ${
                viewMode === 'week' 
                  ? 'bg-primary-500/20 text-primary-400 shadow-sm' 
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <span className="hidden sm:inline">Semana</span>
              <span className="sm:hidden">Sem</span>
            </button>
            <button
              onClick={() => {
                trackAction('calendar.open_transcripciones');
                setAdminActiveView('transcripciones');
              }}
              className="flex items-center justify-center gap-1.5 px-2 md:px-3 py-1 md:py-1.5 text-[10px] md:text-xs font-medium rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-all"
              title="Abrir Transcripciones"
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Transcripciones</span>
            </button>
          </div>
          
          <button
            onClick={async () => {
              setIsRefreshing(true);
              try {
                await fetchEnterpriseAppointments(shouldFetchAllForDayView ? null : effectiveTeamMemberIds, fetchRange, true);
                await reconcileCalendar({ force: true, notifySuccess: true, notifyErrors: true });
              } catch {
                showToast(
                  'Actualización fallida',
                  'No se pudo actualizar el calendario. Intenta nuevamente en unos segundos.',
                  'error'
                );
              } finally {
                setIsRefreshing(false);
              }
            }}
            className="p-1.5 md:p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 rounded-lg transition-colors border border-transparent hover:border-white/5"
            title="Recargar"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing || isReconciling ? 'animate-spin' : ''}`} />
          </button>

          {/* New Appointment Button - Minimalist (All Roles) */}
          <button
            onClick={handleNewAppointment}
            className="p-1.5 md:p-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-all shadow-sm shadow-primary-500/20 active:scale-95"
            title="Nueva Cita"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Empty State for Role 3 with no appointments */}
      {isBasicRole && !isInitialLoad && appointments.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
          <CalendarIcon className="w-16 h-16 text-zinc-700 mb-4" />
          <h3 className="text-lg font-medium text-zinc-400 mb-2">Sin citas asignadas</h3>
          <p className="text-sm text-zinc-500 max-w-sm">
            No tienes citas programadas. Las citas aparecerán aquí cuando te sean asignadas.
          </p>
        </div>
      )}

      {/* Calendar Grid — never opaque; shows stale data while refreshing */}
      {(!isBasicRole || appointments.length > 0 || isInitialLoad) && (
      <div className="flex-1 overflow-y-auto">
        {viewMode === 'week' ? (
          <div className="relative">
            {/* Scroll indicator for mobile */}
            <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-[#0c0c0e] to-transparent pointer-events-none z-10 md:hidden" />
            <div className="overflow-x-auto scrollbar-hide">
            {/* Week Header */}
            <div className="grid grid-cols-7 border-b border-white/5 sticky top-0 bg-[#0c0c0e] z-20 shadow-sm shadow-black/50">
              {Array.from({ length: 7 }).map((_, i) => {
                const { start } = getWeekRange(currentDate);
                const day = new Date(start);
                day.setDate(day.getDate() + i);
                const isToday = day.toDateString() === new Date().toDateString();
                
                const dayCount = appointmentsCountByDay[day.toDateString()] || 0;
                return (
                  <div key={i} className={`relative p-2 md:p-3 text-center border-r border-white/5 last:border-r-0 ${isToday ? 'bg-primary-500/5' : ''}`}>
                    {dayCount > 0 && (
                      <span className={`absolute right-2 top-2 md:right-3 md:top-3 inline-flex min-w-[20px] md:min-w-[24px] items-center justify-center px-1 py-0.5 rounded-md text-[9px] leading-none font-semibold tabular-nums border ${
                        isToday
                          ? 'bg-primary-500/10 border-primary-500/20 text-primary-400'
                          : 'bg-zinc-800/60 border-white/5 text-zinc-500'
                      }`}>
                        {dayCount}
                      </span>
                    )}
                    <div className={`text-[10px] md:text-xs font-medium uppercase mb-0.5 md:mb-1 ${isToday ? 'text-primary-400' : 'text-zinc-500'}`}>
                      {day.toLocaleDateString('es-ES', { weekday: 'short' }).slice(0, 3)}
                    </div>
                    <div className={`text-base md:text-xl font-semibold ${isToday ? 'text-primary-400' : 'text-zinc-300'}`}>
                      {day.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Week Content */}
            <div className="grid grid-cols-7 min-h-[400px] md:min-h-[500px]">
              {Array.from({ length: 7 }).map((_, i) => {
                const { start } = getWeekRange(currentDate);
                const day = new Date(start);
                day.setDate(day.getDate() + i);
                const dateKey = day.toDateString();
                const dayApts = appointmentsByDay[dateKey] || [];
                const isToday = dateKey === new Date().toDateString();

                return (
                  <div 
                    key={i} 
                    onClick={() => handleSlotClick(day)}
                    className={`border-r border-white/5 last:border-r-0 min-h-[400px] md:min-h-[500px] p-1.5 md:p-2 space-y-1.5 md:space-y-2 relative cursor-pointer hover:bg-white/[0.02] transition-colors ${
                      isToday ? 'bg-gradient-to-b from-primary-500/5 to-transparent' : ''
                    }`}
                  >
                    {/* Hour Lines Background */}
                    <div className="absolute inset-0 pointer-events-none opacity-20 z-0">
                      {HOURS.map(hour => (
                        <div key={hour} className="border-t border-zinc-700 h-[60px]" style={{ top: `${(hour - 8) * 60}px` }} />
                      ))}
                    </div>

                    {/* Appointments */}
                    <div className="relative z-10 space-y-2">
                      {dayApts.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-zinc-800 pt-20">
                           {/* Empty state visual if needed */}
                        </div>
                      ) : (
                        dayApts.map(apt => renderAppointmentCard(apt, true))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            </div>
          </div>
        ) : (
          /* Day View with Team Member Columns */
          <div className="h-full overflow-hidden">
            {/* Scroll container */}
            <div className="h-full overflow-x-auto overflow-y-auto">
              {/* Grid Layout: Hour column + Member columns */}
              <div className="min-w-fit">
                {/* Header Row with Member Names */}
                <div 
                  className="sticky top-0 z-20 bg-[#0c0c0e] border-b border-white/5 flex"
                  style={{ minWidth: dayGridMinWidth }}
                >
                  {/* Empty corner for hour column */}
                  <div className="w-16 md:w-20 shrink-0 p-2 md:p-3 border-r border-white/5" />
                  
                  {/* Member Headers */}
                  {dayViewMembers.map(member => {
                    const memberCount = (appointmentsByMember[member.id] || []).length;
                    return (
                      <div 
                        key={member.id}
                        className="w-[160px] md:w-[180px] shrink-0 p-2 md:p-3 border-r border-white/5 text-center"
                      >
                        <div className="flex items-center justify-center gap-2">
                          <div className="relative">
                            <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-gradient-to-br from-primary-500/30 to-primary-600/20 border border-primary-500/20 flex items-center justify-center">
                              <span className="text-[10px] md:text-xs font-semibold text-primary-400">
                                {member.nombre?.charAt(0)}{member.apellido?.charAt(0)}
                              </span>
                            </div>
                            {memberCount > 0 && (
                              <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-primary-500/20 border border-primary-500/30 text-[8px] font-bold text-primary-400 tabular-nums">
                                {memberCount}
                              </span>
                            )}
                          </div>
                          <div className="text-left min-w-0">
                            <div className="text-xs md:text-sm font-medium text-zinc-200 truncate">
                              {member.nombre}
                            </div>
                            <div className="text-[9px] md:text-[10px] text-zinc-500 truncate">
                              {member.apellido}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* "Sin asignar" column header */}
                  {showUnassignedColumn && (
                    <div className="w-[160px] md:w-[180px] shrink-0 p-2 md:p-3 text-center border-r border-white/5 last:border-r-0">
                      <div className="flex items-center justify-center gap-2">
                        <div className="relative">
                          <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                            <User className="w-3 h-3 md:w-4 md:h-4 text-zinc-500" />
                          </div>
                          {(appointmentsByMember[0]?.length || 0) > 0 && (
                            <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-zinc-700/80 border border-zinc-600/50 text-[8px] font-bold text-zinc-400 tabular-nums">
                              {appointmentsByMember[0].length}
                            </span>
                          )}
                        </div>
                        <span className="text-xs md:text-sm font-medium text-zinc-500">Sin asignar</span>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Hour Rows */}
                <div 
                  className="flex flex-col"
                  style={{ minWidth: dayGridMinWidth }}
                >
                  {HOURS.map(hour => (
                    <div key={hour} className="flex border-b border-white/5 last:border-b-0">
                      {/* Hour Label */}
                      <div className="w-16 md:w-20 shrink-0 p-2 md:p-3 text-right border-r border-white/5">
                        <span className="text-xs md:text-sm font-medium text-zinc-500 font-mono">
                          {hour.toString().padStart(2, '0')}:00
                        </span>
                      </div>
                      
                      {/* Member Cells */}
                      {dayViewMembers.map(member => {
                        const memberApts = (appointmentsByMember[member.id] || []).filter(apt => {
                          const d = new Date(apt.fecha_hora!);
                          return d.getHours() === hour;
                        });
                        
                        return (
                          <div 
                            key={member.id}
                            onClick={() => handleSlotClick(currentDate, hour, member.id)}
                            className="w-[160px] md:w-[180px] shrink-0 min-h-[70px] md:min-h-[80px] p-1.5 md:p-2 border-r border-white/5 hover:bg-white/[0.03] cursor-pointer transition-colors"
                          >
                            <div className="space-y-1.5">
                              {memberApts.map(apt => renderAppointmentCard(apt, true))}
                            </div>
                          </div>
                        );
                      })}
                      
                      {/* "Sin asignar" Cell */}
                      {showUnassignedColumn && (
                        <div 
                          onClick={() => handleSlotClick(currentDate, hour)}
                          className="w-[160px] md:w-[180px] shrink-0 min-h-[70px] md:min-h-[80px] p-1.5 md:p-2 border-r border-white/5 last:border-r-0 hover:bg-white/[0.03] cursor-pointer transition-colors"
                        >
                          <div className="space-y-1.5">
                            {(appointmentsByMember[0] || []).filter(apt => {
                              const d = new Date(apt.fecha_hora!);
                              return d.getHours() === hour;
                            }).map(apt => renderAppointmentCard(apt, true))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Contact Detail Modal - Abre directo en Citas desde el calendario */}
      {selectedContactId && (
        <ContactDetailModal 
          contactId={selectedContactId} 
          onClose={() => selectContact(null)}
          initialTab="appointments"
        />
      )}

      {/* Quick Schedule Modal - from calendar slot click or new button */}
      {showQuickSchedule && (
        <QuickScheduleModal 
          onClose={() => {
            setShowQuickSchedule(false);
            setQuickScheduleInitial({});
          }}
          initialDate={quickScheduleInitial.date}
          initialStartTime={quickScheduleInitial.startTime}
          initialEndTime={quickScheduleInitial.endTime}
          initialTeamMemberId={quickScheduleInitial.teamMemberId}
        />
      )}

      {/* Assign Contact Modal - for appointments without contact */}
      {appointmentToAssign && (
        <AssignContactToAppointmentModal
          appointment={appointmentToAssign}
          initialInvitedIds={getAppointmentAssistantIds(appointmentToAssign)}
          onClose={() => setAppointmentToAssign(null)}
          onAssigned={() => {
            // Refresh appointments after assignment
            fetchEnterpriseAppointments(
              shouldFetchAllForDayView ? null : effectiveTeamMemberIds,
              fetchRange, 
              true
            );
          }}
        />
      )}
      {/* Toast Container */}
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 pointer-events-none w-full max-w-[min(92vw,36rem)] px-4">
          <div
            key={toast.id}
            className={`pointer-events-auto mx-auto flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg shadow-black/50 border backdrop-blur-md animate-in slide-in-from-top-2 fade-in duration-200 ${
              toast.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
              toast.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
              'bg-blue-500/10 border-blue-500/20 text-blue-400'
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {toast.type === 'success' ? <Check className="w-4 h-4" /> :
               toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> :
               <Info className="w-4 h-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-zinc-100">{toast.title}</p>
                {toast.count > 1 && (
                  <span className="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-zinc-200">
                    {toast.count} eventos
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-300">{toast.message}</p>
            </div>
            <button
              onClick={hideToast}
              className="shrink-0 rounded-lg p-1 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
              aria-label="Cerrar notificación"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase-client';
import { useAuthStore } from '../store/authStore';
import { useContactStore } from '../store/contactStore';
import { useNotificationsStore } from '../store/notificationsStore';
import { logger } from '../lib/logger';

// Delay before checking (ms) - doesn't block initial load
const STARTUP_DELAY_MS = 3000;

// How far ahead to check for upcoming appointments (24 hours)
const UPCOMING_HOURS = 24;

// How many hours before appointment to notify
const NOTIFY_BEFORE_HOURS = 2;

/**
 * Hook that generates automatic notifications for:
 * - Upcoming appointments (next 24h)
 * - Overdue tasks
 * - Tasks due soon (next 24h)
 * 
 * Runs with a delay to not affect initial load time.
 */
export const useStartupNotifications = () => {
  const hasRun = useRef(false);
  const userId = useAuthStore(state => state.user?.id);
  const selectedEnterpriseId = useContactStore(state => state.selectedEnterpriseId);
  const createNotification = useNotificationsStore(state => state.createNotification);
  const fetchNotifications = useNotificationsStore(state => state.fetchNotifications);

  useEffect(() => {
    // Only run once per session
    if (hasRun.current || !userId || !selectedEnterpriseId) return;

    const timeoutId = setTimeout(async () => {
      hasRun.current = true;
      logger.debug('[StartupNotifications] Starting delayed notification check...');
      
      try {
        // Get user's team_humano_id
        const { data: teamData, error: teamError } = await supabase
          .from('wp_team_humano')
          .select('id, nombre, apellido')
          .eq('auth_uid', userId)
          .maybeSingle();

        if (teamError || !teamData) {
          logger.warn('[StartupNotifications] Could not get team data:', teamError);
          return;
        }

        const teamHumanoId = teamData.id;
        const now = new Date();
        const in24Hours = new Date(now.getTime() + UPCOMING_HOURS * 60 * 60 * 1000);
        const in2Hours = new Date(now.getTime() + NOTIFY_BEFORE_HOURS * 60 * 60 * 1000);

        // Check both appointments and tasks in parallel
        await Promise.all([
          checkUpcomingAppointments(selectedEnterpriseId, teamHumanoId, now, in24Hours, in2Hours, createNotification),
          checkTasksForNotifications(selectedEnterpriseId, teamHumanoId, now, in24Hours, createNotification)
        ]);

        // Refresh notifications to show the new ones
        await fetchNotifications(true);
        
        logger.debug('[StartupNotifications] Notification check completed');
      } catch (error) {
        logger.error('[StartupNotifications] Error:', error);
      }
    }, STARTUP_DELAY_MS);

    return () => clearTimeout(timeoutId);
  }, [userId, selectedEnterpriseId, createNotification, fetchNotifications]);
};

/**
 * Check for upcoming appointments and create notifications
 */
async function checkUpcomingAppointments(
  empresaId: number,
  teamHumanoId: number,
  now: Date,
  in24Hours: Date,
  in2Hours: Date,
  createNotification: (notification: any) => Promise<void>
) {
  try {
    // Get appointments in the next 24 hours for this user
    const { data: appointments, error } = await supabase
      .from('wp_citas')
      .select(`
        id, titulo, fecha_hora, estado, contacto_id,
        contact:wp_contactos(id, nombre, apellido, telefono)
      `)
      .eq('empresa_id', empresaId)
      .eq('team_humano_id', teamHumanoId)
      .in('estado', ['pendiente', 'confirmada'])
      .gte('fecha_hora', now.toISOString())
      .lte('fecha_hora', in24Hours.toISOString())
      .order('fecha_hora', { ascending: true });

    if (error) {
      logger.error('[StartupNotifications] Error fetching appointments:', error);
      return;
    }

    if (!appointments || appointments.length === 0) {
      logger.debug('[StartupNotifications] No upcoming appointments found');
      return;
    }

    logger.debug(`[StartupNotifications] Found ${appointments.length} upcoming appointments`);

    // Check which appointments already have a recent notification (last 12 hours)
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    const appointmentIds = appointments.map(a => a.id);
    
    const { data: existingNotifs } = await supabase
      .from('wp_notificaciones_team')
      .select('metadata')
      .eq('empresa_id', empresaId)
      .eq('tipo', 'nueva_cita')
      .gte('created_at', twelveHoursAgo.toISOString())
      .not('metadata', 'is', null);

    // Extract already-notified appointment IDs from metadata
    const notifiedIds = new Set<number>();
    existingNotifs?.forEach(n => {
      if (n.metadata?.cita_id) {
        notifiedIds.add(n.metadata.cita_id);
      }
    });

    // Create notifications for appointments not yet notified
    for (const cita of appointments) {
      if (notifiedIds.has(cita.id)) {
        continue; // Already notified recently
      }

      const citaDate = new Date(cita.fecha_hora);
      // Handle contact - may be array from join
      const contact = Array.isArray(cita.contact) ? cita.contact[0] : cita.contact;
      const contactName = contact 
        ? `${contact.nombre || ''} ${contact.apellido || ''}`.trim() || 'Contacto'
        : 'Contacto';

      // Determine urgency based on time until appointment
      const isVeryUrgent = citaDate <= in2Hours;
      const hoursUntil = Math.round((citaDate.getTime() - now.getTime()) / (60 * 60 * 1000));
      
      const timeLabel = hoursUntil < 1 
        ? 'en menos de 1 hora'
        : hoursUntil === 1 
          ? 'en 1 hora'
          : `en ${hoursUntil} horas`;

      const mensaje = isVeryUrgent
        ? `⏰ Cita próxima ${timeLabel}: "${cita.titulo || 'Sin título'}" con ${contactName}`
        : `📅 Recordatorio: Tienes una cita ${timeLabel} - "${cita.titulo || 'Sin título'}" con ${contactName}`;

      await createNotification({
        tipo: 'nueva_cita',
        mensaje,
        contacto_id: cita.contacto_id,
        empresa_id: empresaId,
        asesor_id: teamHumanoId,
        requiere_respuesta: false,
        metadata: {
          cita_id: cita.id,
          fecha_hora: cita.fecha_hora,
          auto_generated: true,
          urgency: isVeryUrgent ? 'high' : 'normal'
        }
      });

      logger.debug(`[StartupNotifications] Created notification for appointment ${cita.id}`);
    }
  } catch (error) {
    logger.error('[StartupNotifications] Error in checkUpcomingAppointments:', error);
  }
}

/**
 * Check for overdue and upcoming tasks, create notifications
 */
async function checkTasksForNotifications(
  empresaId: number,
  teamHumanoId: number,
  now: Date,
  in24Hours: Date,
  createNotification: (notification: any) => Promise<void>
) {
  try {
    // Get tasks assigned to user that are:
    // 1. Overdue (fecha_vencimiento < now AND not completed)
    // 2. Due soon (fecha_vencimiento within 24h AND not completed)
    const { data: tasks, error } = await supabase
      .from('wp_tareas')
      .select(`
        id, titulo, fecha_vencimiento, estado, prioridad, contacto_id,
        contact:wp_contactos(id, nombre, apellido)
      `)
      .eq('empresa_id', empresaId)
      .eq('asignado_a', teamHumanoId)
      .in('estado', ['pendiente', 'en_progreso'])
      .not('fecha_vencimiento', 'is', null)
      .lte('fecha_vencimiento', in24Hours.toISOString())
      .order('fecha_vencimiento', { ascending: true });

    if (error) {
      logger.error('[StartupNotifications] Error fetching tasks:', error);
      return;
    }

    if (!tasks || tasks.length === 0) {
      logger.debug('[StartupNotifications] No urgent tasks found');
      return;
    }

    logger.debug(`[StartupNotifications] Found ${tasks.length} tasks needing attention`);

    // Check which tasks already have a recent notification (last 6 hours)
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    
    const { data: existingNotifs } = await supabase
      .from('wp_notificaciones_team')
      .select('metadata')
      .eq('empresa_id', empresaId)
      .in('tipo', ['tarea_vencida', 'tarea_vencimiento_proximo'])
      .gte('created_at', sixHoursAgo.toISOString())
      .not('metadata', 'is', null);

    const notifiedTaskIds = new Set<number>();
    existingNotifs?.forEach(n => {
      if (n.metadata?.tarea_id) {
        notifiedTaskIds.add(n.metadata.tarea_id);
      }
    });

    // Create notifications
    for (const task of tasks) {
      if (notifiedTaskIds.has(task.id)) {
        continue; // Already notified recently
      }

      const dueDate = new Date(task.fecha_vencimiento);
      const isOverdue = dueDate < now;
      const hoursUntil = Math.round((dueDate.getTime() - now.getTime()) / (60 * 60 * 1000));
      
      // Handle contact - may be array from join
      const contact = Array.isArray(task.contact) ? task.contact[0] : task.contact;

      const tipo = isOverdue ? 'tarea_vencida' : 'tarea_vencimiento_proximo';
      const prioridadLabel = task.prioridad === 4 ? '🔴 Urgente' 
        : task.prioridad === 3 ? '🟠 Alta' 
        : '';

      let mensaje: string;
      if (isOverdue) {
        const hoursOverdue = Math.abs(hoursUntil);
        const overdueLabel = hoursOverdue < 24 
          ? `hace ${hoursOverdue}h`
          : `hace ${Math.floor(hoursOverdue / 24)} días`;
        mensaje = `⚠️ Tarea vencida ${overdueLabel}: "${task.titulo}" ${prioridadLabel}`.trim();
      } else {
        const timeLabel = hoursUntil < 1 
          ? 'en menos de 1 hora'
          : hoursUntil === 1 
            ? 'en 1 hora'
            : `en ${hoursUntil} horas`;
        mensaje = `⏳ Tarea vence ${timeLabel}: "${task.titulo}" ${prioridadLabel}`.trim();
      }

      await createNotification({
        tipo,
        mensaje,
        contacto_id: task.contacto_id,
        empresa_id: empresaId,
        asesor_id: teamHumanoId,
        requiere_respuesta: false,
        metadata: {
          tarea_id: task.id,
          fecha_vencimiento: task.fecha_vencimiento,
          prioridad: task.prioridad,
          auto_generated: true,
          is_overdue: isOverdue
        }
      });

      logger.debug(`[StartupNotifications] Created ${tipo} notification for task ${task.id}`);
    }
  } catch (error) {
    logger.error('[StartupNotifications] Error in checkTasksForNotifications:', error);
  }
}

'use client';

import React, { useMemo } from 'react';
import { 
  User, 
  Clock, 
  MessageSquare, 
  Trash2, 
  ExternalLink,
  UserPlus,
  AtSign,
  RefreshCw,
  AlertTriangle,
  CheckSquare,
  DollarSign,
  Calendar,
  Bell,
  Info,
  Lock,
  Search,
  Zap,
  ArrowRight
} from 'lucide-react';
import { logger } from '@/lib/logger';
import { sanitizeHtml } from '../../lib/sanitize-html';
import { Notification, getNotificationTypeLabel, getNotificationTypeColor, getRelativeTime, formatContactName, NotificationType, isHumanInTheLoopNotification } from '../../types/notification';
import { useNotificationsStore } from '../../store/notificationsStore';
import { useContactStore } from '../../store/contactStore';

// Helper: Check if contact is within 24-hour messaging window
const isWithin24Hours = (ultimaInteraccion: string | null | undefined): boolean => {
  if (!ultimaInteraccion) return false;
  const lastInteraction = new Date(ultimaInteraccion);
  const now = new Date();
  const diffMs = now.getTime() - lastInteraction.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  return diffHours <= 24;
};

// Helper: Get time remaining in window
const getTimeRemaining = (ultimaInteraccion: string | null | undefined): string => {
  if (!ultimaInteraccion) return '';
  const lastInteraction = new Date(ultimaInteraccion);
  const windowEnd = new Date(lastInteraction.getTime() + 24 * 60 * 60 * 1000);
  const now = new Date();
  const diffMs = windowEnd.getTime() - now.getTime();
  
  if (diffMs <= 0) return 'Ventana cerrada';
  
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

interface NotificationItemProps {
  notification: Notification;
}

const getNotificationIcon = (type: NotificationType) => {
  switch (type) {
    case 'nueva_cita': return <Calendar className="w-4 h-4 text-blue-400" />;
    case 'human_in_the_loop': return <User className="w-4 h-4 text-amber-400" />;
    case 'mensaje_urgente': return <MessageSquare className="w-4 h-4 text-red-400" />;
    case 'tarea_asignada': return <UserPlus className="w-4 h-4 text-purple-400" />;
    case 'recordatorio': return <Bell className="w-4 h-4 text-cyan-400" />;
    case 'sistema': return <Info className="w-4 h-4 text-zinc-400" />;
    case 'tarea_mencion': return <AtSign className="w-4 h-4 text-pink-400" />;
    case 'tarea_estado': return <RefreshCw className="w-4 h-4 text-blue-400" />;
    case 'tarea_vencimiento_proximo': return <Clock className="w-4 h-4 text-amber-400" />;
    case 'tarea_vencida': return <AlertTriangle className="w-4 h-4 text-rose-400" />;
    case 'tarea_comentario': return <MessageSquare className="w-4 h-4 text-indigo-400" />;
    case 'tarea_item_completado': return <CheckSquare className="w-4 h-4 text-emerald-400" />;
    case 'proyecto_costo': return <DollarSign className="w-4 h-4 text-emerald-400" />;
    case 'deep_research': return <Search className="w-4 h-4 text-violet-400" />;
    default: return <Bell className="w-4 h-4 text-zinc-400" />;
  }
};


export const NotificationItem: React.FC<NotificationItemProps> = ({ notification }) => {
  const markAsRead = useNotificationsStore(state => state.markAsRead);
  const deleteNotification = useNotificationsStore(state => state.deleteNotification);
  const selectContact = useContactStore(state => state.selectContact);

  // Check 24-hour window based on metadata or contact ultima_interaccion
  const windowStatus = useMemo(() => {
    const ultimaInteraccion = notification.metadata?.ultima_interaccion || notification.metadata?.contact_ultima_interaccion;
    const within24h = isWithin24Hours(ultimaInteraccion);
    const timeRemaining = getTimeRemaining(ultimaInteraccion);
    return { within24h, timeRemaining, ultimaInteraccion };
  }, [notification.metadata]);

  const isHITL = isHumanInTheLoopNotification(notification);

  const handleMarkAsRead = async () => {
    if (!notification.visto) {
      try {
        await markAsRead(notification.id);
      } catch (err) {
        logger.error('[NotificationItem] Error marking as read:', err);
      }
    }
  };

  // Navigate to contact chat
  const handleGoToChat = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleMarkAsRead();
    if (!notification.contacto_id) return;
    selectContact(notification.contacto_id);
  };

  const handleViewContactClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleMarkAsRead();
    handleViewContact();
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleDelete();
  };

  const handleDelete = async () => {
    if (confirm('¿Eliminar esta notificación?')) {
      await deleteNotification(notification.id);
    }
  };

  const handleViewContact = () => {
    if (!notification.contacto_id) return;
    selectContact(notification.contacto_id);
  };

  const contactName = formatContactName(notification.contact);
  const typeLabel = getNotificationTypeLabel(notification.tipo);
  const typeColor = isHITL ? 'text-amber-400' : getNotificationTypeColor(notification.tipo);
  const relativeTime = getRelativeTime(notification.fecha_envio);

  return (
    <div
      className={`
        relative p-3 rounded-lg border transition-all duration-200 cursor-pointer
        ${!notification.visto 
          ? 'border-primary-500/30 bg-primary-500/5 shadow-[0_0_20px_rgb(var(--primary-500)/0.1)]' 
          : 'border-white/10 bg-white/[0.02]'
        }
        ${notification.requiere_respuesta && !notification.respuesta
          ? 'shadow-[0_0_15px_rgb(var(--warning-500)/0.15)]'
          : ''
        }
        hover:border-white/20
      `}
      onClick={handleMarkAsRead}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-full bg-zinc-800 border border-white/10 flex items-center justify-center shrink-0">
            {isHITL ? <User className="w-4 h-4 text-amber-400" /> : getNotificationIcon(notification.tipo)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-zinc-100 truncate">{contactName}</p>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span className={typeColor}>{typeLabel}</span>
              <span>•</span>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{relativeTime}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleViewContactClick}
            className="p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-primary-400 transition-colors"
            title="Ver contacto"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDeleteClick}
            className="p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-red-400 transition-colors"
            title="Eliminar"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Message */}
      <p className="text-sm text-zinc-300 mb-3 leading-relaxed">
        {sanitizeHtml(notification.mensaje)}
      </p>

      {/* Go to chat action (pending response) */}
      {notification.requiere_respuesta && !notification.respuesta && (
        <div className="mt-3 pt-3 border-t border-white/10">
          {/* 24-hour window indicator (HITL only) */}
          {isHITL && windowStatus.ultimaInteraccion && (
            <div className={`flex items-center gap-2 mb-2 text-xs ${
              windowStatus.within24h ? 'text-emerald-400' : 'text-amber-400'
            }`}>
              {windowStatus.within24h ? (
                <>
                  <Clock className="w-3 h-3" />
                  <span>Ventana 24h activa • {windowStatus.timeRemaining} restantes</span>
                </>
              ) : (
                <>
                  <Lock className="w-3 h-3" />
                  <span>Ventana de 24h cerrada</span>
                </>
              )}
            </div>
          )}
          <button
            onClick={handleGoToChat}
            className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
              isHITL 
                ? 'bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20' 
                : 'bg-primary-500/10 border border-primary-500/20 text-primary-400 hover:bg-primary-500/20'
            }`}
          >
            <ArrowRight className="w-4 h-4" />
            Ir al chat para responder
          </button>
        </div>
      )}

      {/* Already responded */}
      {notification.requiere_respuesta && notification.respuesta && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2">
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare className="w-3.5 h-3.5 text-green-400" />
              <span className="text-xs font-medium text-green-400">Respondido</span>
              {notification.fecha_respuesta && (
                <span className="text-xs text-zinc-500">
                  {getRelativeTime(notification.fecha_respuesta)}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-300">{sanitizeHtml(notification.respuesta)}</p>
          </div>
        </div>
      )}

      {/* Unread indicator */}
      {!notification.visto && (
        <div className="absolute top-3 left-0 w-1 h-8 bg-primary-500 rounded-r-full" />
      )}
    </div>
  );
};

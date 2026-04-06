'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Volume2, VolumeX, Bell, User, AlertTriangle, Clock } from 'lucide-react';
import { useNotificationsStore, selectToastQueue, selectSoundEnabled } from '../../store/notificationsStore';
import { Notification, getNotificationTypeLabel, getRelativeTime, formatContactName } from '../../types/notification';

// Duration by notification priority (ms)
const TOAST_DURATION: Record<string, number> = {
  human_in_the_loop: 10000,
  mensaje_urgente: 8000,
  tarea_vencida: 8000,
  default: 5000
};

// Get icon for notification type (compact version)
const getToastIcon = (tipo: string) => {
  switch (tipo) {
    case 'human_in_the_loop': return <User className="w-4 h-4 text-amber-400" />;
    case 'mensaje_urgente': return <AlertTriangle className="w-4 h-4 text-red-400" />;
    case 'tarea_vencida': return <Clock className="w-4 h-4 text-rose-400" />;
    default: return <Bell className="w-4 h-4 text-primary-400" />;
  }
};

// Single toast item component
const ToastItem: React.FC<{
  notification: Notification;
  onClose: () => void;
  index: number;
}> = ({ notification, onClose, index }) => {
  const [progress, setProgress] = useState(100);
  const duration = TOAST_DURATION[notification.tipo] || TOAST_DURATION.default;

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      
      if (remaining <= 0) {
        clearInterval(interval);
        onClose();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [duration, onClose]);

  const isUrgent = ['human_in_the_loop', 'mensaje_urgente', 'tarea_vencida'].includes(notification.tipo);
  const contactName = formatContactName(notification.contact);

  return (
    <div 
      className={`
        relative bg-[#0c0c0e] border rounded-xl shadow-2xl shadow-black/50 overflow-hidden
        animate-in fade-in slide-in-from-right-5 duration-300
        ${isUrgent ? 'border-amber-500/30 shadow-amber-500/10' : 'border-white/10'}
      `}
      style={{ 
        transform: `translateY(${index * 8}px) scale(${1 - index * 0.02})`,
        zIndex: 100 - index,
        opacity: 1 - index * 0.1
      }}
    >
      {/* Urgent indicator pulse */}
      {isUrgent && (
        <div className="absolute inset-0 bg-amber-500/5 animate-pulse pointer-events-none" />
      )}

      {/* Header with close button */}
      <div className="flex items-center justify-between p-3 pb-0">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center ${isUrgent ? 'bg-amber-500/20' : 'bg-zinc-800'}`}>
            {getToastIcon(notification.tipo)}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-zinc-100 truncate max-w-[180px]">{contactName}</p>
            <p className="text-[10px] text-zinc-500">{getNotificationTypeLabel(notification.tipo)}</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 rounded-lg transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Message preview */}
      <div className="px-3 py-2">
        <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
          {notification.mensaje}
        </p>
      </div>

      {/* Action hint for HITL */}
      {notification.tipo === 'human_in_the_loop' && notification.requiere_respuesta && (
        <div className="mx-3 mb-2 px-2 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <p className="text-[10px] text-amber-400 font-medium">
            💬 Ve al chat del contacto para responder
          </p>
        </div>
      )}

      {/* Progress bar */}
      <div className="h-0.5 bg-zinc-800 w-full">
        <div 
          className={`h-full transition-all duration-100 ${isUrgent ? 'bg-amber-500/70' : 'bg-primary-500/50'}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

// Sound toggle button
const SoundToggle: React.FC = () => {
  const soundEnabled = useNotificationsStore(selectSoundEnabled);
  const setSoundEnabled = useNotificationsStore(state => state.setSoundEnabled);

  return (
    <button
      onClick={() => setSoundEnabled(!soundEnabled)}
      className="fixed top-4 right-[340px] z-[99] p-2 bg-zinc-900/90 border border-white/10 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
      title={soundEnabled ? 'Silenciar notificaciones' : 'Activar sonido'}
    >
      {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
    </button>
  );
};

export const NotificationToast = () => {
  const toastQueue = useNotificationsStore(selectToastQueue);
  const removeFromToastQueue = useNotificationsStore(state => state.removeFromToastQueue);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleClose = useCallback((notificationId: number) => {
    removeFromToastQueue(notificationId);
  }, [removeFromToastQueue]);

  if (!mounted || typeof document === 'undefined') return null;
  if (toastQueue.length === 0) return null;

  return createPortal(
    <>
      {/* Sound toggle - only show when there are toasts */}
      <SoundToggle />
      
      {/* Toast stack */}
      <div className="fixed top-4 right-4 z-[100] w-80 space-y-2">
        {toastQueue.map((notification, index) => (
          <ToastItem
            key={notification.id}
            notification={notification}
            onClose={() => handleClose(notification.id)}
            index={index}
          />
        ))}
      </div>
    </>,
    document.body
  );
};

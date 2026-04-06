'use client';

import React, { useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useNotificationsStore, selectUnreadCount } from '../../store/notificationsStore';

interface NotificationButtonProps {
  onClick: () => void;
  isActive?: boolean;
  className?: string;
}

export const NotificationButton: React.FC<NotificationButtonProps> = ({ 
  onClick, 
  isActive = false,
  className = ''
}) => {
  const unreadCount = useNotificationsStore(selectUnreadCount);
  const fetchNotifications = useNotificationsStore(state => state.fetchNotifications);

  // Fetch notifications on mount
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const hasUnread = unreadCount > 0;
  const hasAnyIndicator = hasUnread && !isActive;

  return (
    <button
      onClick={onClick}
      className={`
        relative w-10 h-10 md:w-9 md:h-9 rounded-lg flex items-center justify-center
        transition-all duration-200 group active:scale-95
        ${isActive 
          ? 'bg-primary-500/20 text-primary-400 shadow-lg shadow-primary-500/10' 
          : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
        }
        ${className}
      `}
      title="Centro de Actividad"
    >
      <Bell className={`w-4 h-4 md:w-4 md:h-4 ${hasAnyIndicator ? 'animate-pulse' : ''}`} />
      
      {/* Active indicator */}
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-primary-400 rounded-r-full" />
      )}
    </button>
  );
};

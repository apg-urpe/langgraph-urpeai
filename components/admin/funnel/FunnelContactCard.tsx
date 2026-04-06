'use client';

import React, { memo } from 'react';
import { Phone, Mail, PowerOff, Clock, Star, GripVertical, User } from 'lucide-react';
import { Contact } from '../../../types/contact';
import { getStatusColor, getInitials } from './funnel-shared';
import { useNotificationsStore, selectContactsWithPendingHITL } from '../../../store/notificationsStore';

interface FunnelContactCardProps {
  contact: Contact;
  isDragging: boolean;
  stageColor: string;
  onDragStart: (e: React.DragEvent, contactId: number) => void;
  onClick: (contactId: number) => void;
}

export const FunnelContactCard = memo<FunnelContactCardProps>(({
  contact,
  isDragging,
  stageColor,
  onDragStart,
  onClick
}) => {
  const isPaused = contact.is_active === false && !!contact.paused_until && new Date(contact.paused_until) > new Date();
  const isDeactivated = contact.is_active === false && !contact.paused_until;
  const isQualified = contact.es_calificado?.toLowerCase() === 'si';
  const contactsWithHITL = useNotificationsStore(selectContactsWithPendingHITL);
  const hasPendingHITL = contactsWithHITL.has(contact.id);
  
  const fullName = [contact.nombre, contact.apellido].filter(Boolean).join(' ') || 'Sin nombre';

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, contact.id)}
      onClick={() => onClick(contact.id)}
      className={`
        group relative bg-[#18181b] rounded-lg border overflow-hidden
        cursor-grab active:cursor-grabbing
        transition-all duration-150
        ${isDragging 
          ? 'opacity-40 scale-[0.95] border-primary-500/50 shadow-lg shadow-primary-500/20' 
          : 'border-white/[0.06] hover:border-white/15 hover:shadow-lg hover:shadow-black/30 hover:translate-y-[-1px]'
        }
      `}
      style={{ 
        borderColor: isDragging ? stageColor : undefined,
        boxShadow: isDragging ? `0 8px 25px ${stageColor}30` : undefined
      } as React.CSSProperties}
    >
      {/* Drag handle indicator - shows on hover */}
      <div className={`
        absolute left-0 top-0 bottom-0 w-1 rounded-l-lg transition-all duration-150
        ${isDragging ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
      `} style={{ backgroundColor: stageColor }} />
      {/* Card Content - Compact */}
      <div className="p-2.5">
        {/* Header: Avatar + Name + Status */}
        <div className="flex items-center gap-2">
          {/* Avatar - Smaller */}
          <div 
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0"
            style={{ background: `linear-gradient(135deg, ${stageColor}, ${stageColor}99)` }}
          >
            {getInitials(fullName)}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <h3 className="text-xs font-medium text-zinc-100 truncate">
                {fullName}
              </h3>
              {isQualified && (
                <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
              )}
              {/* HITL Pending Badge */}
              {hasPendingHITL && (
                <div 
                  className="w-4 h-4 rounded flex items-center justify-center shrink-0 bg-amber-500/20 text-amber-400 animate-pulse"
                  title="Intervención requerida"
                >
                  <User className="w-2.5 h-2.5" />
                </div>
              )}
              {/* Pause/Deactivated - Inline small */}
              {(isPaused || isDeactivated) && (
                <div 
                  className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${isDeactivated ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}`}
                  title={isDeactivated ? 'Desactivado' : 'Pausado'}
                >
                  {isDeactivated ? <PowerOff className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
                </div>
              )}
            </div>
            {/* Status Badge - Inline */}
            <span className={`inline-flex text-[9px] px-1.5 py-0.5 rounded font-medium mt-0.5 ${getStatusColor(contact.estado || undefined)}`}>
              {contact.estado || 'Sin estado'}
            </span>
          </div>
        </div>
      </div>

      {/* Footer - Compact */}
      <div className="px-2.5 py-1.5 border-t border-white/[0.04] bg-white/[0.01] flex items-center gap-2 text-[10px] text-zinc-500">
        {contact.telefono && (
          <span className="flex items-center gap-1 truncate">
            <Phone className="w-2.5 h-2.5 shrink-0 text-zinc-500" />
            <span className="truncate max-w-[60px]">{contact.telefono}</span>
          </span>
        )}
        {contact.email && (
          <span className="flex items-center gap-1 truncate">
            <Mail className="w-2.5 h-2.5 shrink-0 text-zinc-500" />
            <span className="truncate max-w-[50px]">{contact.email.split('@')[0]}</span>
          </span>
        )}
      </div>
    </div>
  );
});

FunnelContactCard.displayName = 'FunnelContactCard';

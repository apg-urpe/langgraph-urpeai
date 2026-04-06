import React, { memo, useMemo } from 'react';
import { 
  Phone,
  Mail,
  Zap,
  TrendingUp,
  Clock,
  Activity,
  Calendar,
  PowerOff,
  ChevronRight,
  MessageSquare,
  Database,
  User
} from 'lucide-react';
import { ContactDisplayData, ContactContext } from '../../../types/contact';
import { useContactStore, selectFilters } from '../../../store/contactStore';
import { useNotificationsStore, selectContactsWithPendingHITL } from '../../../store/notificationsStore';

// Helper to highlight text
const HighlightedText = ({ text, term }: { text: string; term: string }) => {
  if (!term || !text) return <>{text}</>;
  
  const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  
  return (
    <>
      {parts.map((part, i) => 
        part.toLowerCase() === term.toLowerCase() ? (
          <span key={i} className="bg-primary-500/30 text-primary-200 font-medium px-0.5 rounded-sm">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  );
};

// Square UI Style: Status badge configurations with light/dark variants
const statusConfig: Record<string, { label: string; className: string }> = {
  prospecto: {
    label: 'Prospecto',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-400 border-blue-200 dark:border-blue-800/50'
  },
  cliente: {
    label: 'Cliente',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50'
  },
  calificado: {
    label: 'Calificado',
    className: 'bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-400 border-purple-200 dark:border-purple-800/50'
  },
  no_calificado: {
    label: 'No Calif.',
    className: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-400 border-rose-200 dark:border-rose-800/50'
  },
  evaluando: {
    label: 'Evaluando',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-400 border-amber-200 dark:border-amber-800/50'
  }
};

export const getStatusConfig = (status?: string) => {
  const key = status?.toLowerCase() || '';
  return statusConfig[key] || { label: status || 'Sin estado', className: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800/50' };
};

// Square UI Style: Score bar styles with gradients
const scoreBarStyles = [
  { borderColor: 'border-rose-500', bgGradient: 'bg-gradient-to-r from-rose-500/50 via-rose-500/25 to-transparent', isDashed: false },
  { borderColor: 'border-amber-400', bgGradient: 'bg-gradient-to-r from-amber-400/40 via-amber-400/20 to-transparent', isDashed: true },
  { borderColor: 'border-zinc-600', bgGradient: 'bg-gradient-to-r from-zinc-600/30 via-zinc-600/15 to-transparent', isDashed: true }
];

const getScoreBarStyle = (level: string) => {
  switch (level) {
    case 'hot': return scoreBarStyles[0];
    case 'warm': return scoreBarStyles[1];
    default: return scoreBarStyles[2];
  }
};

interface ContactCardProps {
  contact: ContactDisplayData;
  context: ContactContext;
  isSelected: boolean;
  onClick: () => void;
}

export const ContactCard: React.FC<ContactCardProps> = memo(({ 
  contact, 
  context, 
  isSelected, 
  onClick 
}) => {
  const filters = useContactStore(selectFilters);
  const searchTerm = filters.search || '';
  const contactsWithHITL = useNotificationsStore(selectContactsWithPendingHITL);
  const hasPendingHITL = contactsWithHITL.has(contact.id);
  
  // Square UI: Get score bar style based on level
  const scoreBarStyle = getScoreBarStyle(context.leadScore.level);
  const statusCfg = getStatusConfig(context.status.label);

  return (
    <div 
      onClick={onClick}
      className={`
        group relative p-3 cursor-pointer transition-all duration-200 rounded-xl border
        ${isSelected 
          ? 'bg-primary-500/10 border-primary-500/50 shadow-[0_0_20px_rgba(var(--primary-500),0.15)]' 
          : 'bg-zinc-900/50 border-white/5 hover:bg-zinc-800/50 hover:border-white/10 hover:shadow-lg'
        }
      `}
    >
      <div className="flex items-start gap-3">
        {/* Avatar Square UI style */}
        <div className="relative shrink-0">
          <div className={`
            w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold transition-all
            ${isSelected 
              ? 'bg-primary-500 text-black shadow-[0_0_15px_rgba(var(--primary-500),0.5)]' 
              : `${context.avatar.color} text-white/90 shadow-lg`
            }
          `}>
            {context.avatar.initial}
          </div>
          
          {/* Qualified badge - top left */}
          {context.avatar.qualified && (
            <div className="absolute -top-1 -left-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center shadow-[0_0_8px_rgba(245,158,11,0.6)] ring-2 ring-zinc-900">
              <Zap className="w-2.5 h-2.5 text-black fill-black" />
            </div>
          )}
          
          {/* HITL Pending Badge - bottom left */}
          {hasPendingHITL && (
            <div className="absolute -bottom-1 -left-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center shadow-[0_0_8px_rgba(245,158,11,0.6)] ring-2 ring-zinc-900 animate-pulse">
              <User className="w-2.5 h-2.5 text-black" />
            </div>
          )}
          
          {/* Pause/Deactivated Status Indicator - top right */}
          {(context.pauseStatus?.isPaused || context.pauseStatus?.isDeactivated) && (
            <div className={`
              absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center shadow-lg ring-2 ring-zinc-900
              ${context.pauseStatus.isDeactivated ? 'bg-rose-500' : 'bg-amber-500'}
            `}>
              {context.pauseStatus.isDeactivated ? (
                <PowerOff className="w-2.5 h-2.5 text-white" />
              ) : (
                <Clock className="w-2.5 h-2.5 text-black" />
              )}
            </div>
          )}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Row 1: Name + Status badge */}
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <h3 className={`text-sm font-medium truncate ${isSelected ? 'text-white' : 'text-zinc-100 group-hover:text-white'}`}>
              {context.displayName}
            </h3>
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Status badge - Square UI style */}
              <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium border ${statusCfg.className}`}>
                {statusCfg.label}
              </span>
              {context.quickActions.nextAppointment && (
                <div className="relative group/apt">
                  <div className={`p-1 rounded-md border cursor-pointer transition-all ${
                    context.quickActions.nextAppointment.isToday 
                      ? 'bg-emerald-500/20 border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.3)]' 
                      : context.quickActions.nextAppointment.isTomorrow
                      ? 'bg-amber-500/15 border-amber-500/30'
                      : 'bg-blue-500/10 border-blue-500/20'
                  }`}>
                    <Calendar className={`w-3 h-3 ${
                      context.quickActions.nextAppointment.isToday 
                        ? 'text-emerald-400' 
                        : context.quickActions.nextAppointment.isTomorrow
                        ? 'text-amber-400'
                        : 'text-blue-400'
                    }`} />
                  </div>
                  {/* Tooltip */}
                  <div className="absolute z-[100] top-1/2 -translate-y-1/2 right-full mr-2 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-white/10 shadow-2xl opacity-0 invisible group-hover/apt:opacity-100 group-hover/apt:visible transition-all duration-200 pointer-events-none whitespace-nowrap">
                    <div className="flex items-center gap-2 text-[10px]">
                      <Calendar className="w-3 h-3 text-blue-400 shrink-0" />
                      <div className="flex flex-col">
                        <span className={`font-semibold ${
                          context.quickActions.nextAppointment.isToday 
                            ? 'text-emerald-400' 
                            : context.quickActions.nextAppointment.isTomorrow
                            ? 'text-amber-400'
                            : 'text-zinc-200'
                        }`}>
                          {context.quickActions.nextAppointment.isToday 
                            ? 'Hoy' 
                            : context.quickActions.nextAppointment.isTomorrow 
                            ? 'Mañana' 
                            : context.quickActions.nextAppointment.date}
                          {' · '}
                          {context.quickActions.nextAppointment.time}
                        </span>
                        {context.quickActions.nextAppointment.title && (
                          <span className="text-zinc-400 truncate max-w-[180px]">
                            {context.quickActions.nextAppointment.title}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Arrow pointing right */}
                    <div className="absolute top-1/2 -translate-y-1/2 left-full border-4 border-transparent border-l-zinc-900" />
                  </div>
                </div>
              )}
              {context.quickActions.hasAppointment && !context.quickActions.nextAppointment && (
                <div className="p-1 rounded-md bg-zinc-500/10 border border-zinc-500/20" title="Citas pasadas">
                  <Calendar className="w-3 h-3 text-zinc-500" />
                </div>
              )}
              {context.leadScore.level === 'hot' && (
                <div className="p-1 rounded-md bg-rose-500/10 border border-rose-500/20">
                  <TrendingUp className="w-3 h-3 text-rose-400" />
                </div>
              )}
            </div>
          </div>
          
          {/* Row 2: Contact info */}
          <div className="flex items-center gap-3 text-xs text-zinc-400 mb-2">
            {context.contactMethods.phone && (
              <span className="flex items-center gap-1.5 truncate">
                <Phone className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
                <span className="truncate">{context.contactMethods.phone}</span>
              </span>
            )}
            {context.contactMethods.email && (
              <span className="flex items-center gap-1.5 truncate">
                <Mail className="w-3.5 h-3.5 shrink-0 text-zinc-500" />
                <span className="truncate max-w-[120px]">{context.contactMethods.email}</span>
              </span>
            )}
          </div>

          {/* Row 3: Lead Score Bar - Square UI style with inner container */}
          <div className="bg-zinc-800/50 border border-white/5 rounded-lg p-2">
            {/* Match Preview - Modern search feature with highlighting */}
            {contact.matchPreview && contact.matchSource !== 'basic' && (
              <div className="mb-2 px-2 py-1.5 bg-black/30 rounded-md border border-white/5 overflow-hidden">
                <p className="text-[10px] text-zinc-300 line-clamp-2 italic leading-relaxed">
                  &ldquo;...
                  <HighlightedText 
                    text={contact.matchPreview.length > 120 ? contact.matchPreview.substring(0, 120) + '...' : contact.matchPreview} 
                    term={searchTerm} 
                  />
                  &rdquo;
                </p>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              {/* Score bar with gradient */}
              <div className="flex-1 relative">
                <div className={`
                  relative h-6 rounded-md border overflow-hidden
                  ${scoreBarStyle.borderColor}
                  ${scoreBarStyle.isDashed ? 'border-dashed' : 'border-solid'}
                `}>
                  <div 
                    className={`absolute inset-0 transition-all duration-300 ${scoreBarStyle.bgGradient}`}
                    style={{ width: `${Math.max(context.leadScore.value, 20)}%` }}
                  />
                  {/* Score badge inside bar */}
                  <div className="absolute left-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-zinc-900/90 border border-white/10 rounded px-1.5 py-0.5">
                    <Activity className="w-3 h-3 text-zinc-400" />
                    <span className={`text-xs font-bold ${
                      context.leadScore.level === 'hot' ? 'text-rose-400' :
                      context.leadScore.level === 'warm' ? 'text-amber-400' : 'text-zinc-400'
                    }`} style={{
                      textShadow: context.leadScore.level === 'hot' 
                        ? '0 1px 6px rgba(244, 63, 94, 0.4)' 
                        : context.leadScore.level === 'warm'
                        ? '0 1px 6px rgba(251, 191, 36, 0.3)'
                        : 'none'
                    }}>
                      {context.leadScore.value}
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Tags/Origin on right side */}
              <div className="shrink-0 flex items-center gap-1">
                {contact.matchSource && (
                  <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-bold uppercase tracking-wider ${
                    contact.matchSource === 'messages' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                    contact.matchSource === 'metadata' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                    contact.matchSource === 'notes' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                    contact.matchSource === 'conversation' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                    'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                  }`}>
                    {contact.matchSource === 'messages' ? <MessageSquare className="w-2.5 h-2.5" /> : 
                     contact.matchSource === 'metadata' ? <Database className="w-2.5 h-2.5" /> :
                     contact.matchSource === 'notes' ? <Activity className="w-2.5 h-2.5" /> :
                     contact.matchSource === 'conversation' ? <MessageSquare className="w-2.5 h-2.5" /> :
                     <Activity className="w-2.5 h-2.5" />}
                    <span>{
                      contact.matchSource === 'messages' ? 'Mensaje' :
                      contact.matchSource === 'metadata' ? 'Data' :
                      contact.matchSource === 'notes' ? 'Nota' :
                      contact.matchSource === 'conversation' ? 'Resumen' :
                      'Match'
                    }</span>
                  </div>
                )}

                {context.tags.length > 0 ? (
                  <>
                    {context.tags.slice(0, 1).map((tag, idx) => (
                      <span key={idx} className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-700/50 text-zinc-300 border border-white/5 truncate max-w-[60px]">
                        {tag}
                      </span>
                    ))}
                    {context.tags.length > 1 && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-zinc-700/30 text-zinc-500">+{context.tags.length - 1}</span>
                    )}
                  </>
                ) : context.origin !== '-' ? (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-700/30 text-zinc-500">
                    {context.origin}
                  </span>
                ) : null}
                
                {context.assignedAgent && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary-500/10 text-primary-400 border border-primary-500/20 truncate max-w-[70px]">
                    {context.assignedAgent}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation arrow */}
        <ChevronRight className={`w-5 h-5 shrink-0 mt-2 transition-all ${isSelected ? 'text-primary-400' : 'text-zinc-600 group-hover:text-zinc-400'}`} />
      </div>
    </div>
  );
});

ContactCard.displayName = 'ContactCard';

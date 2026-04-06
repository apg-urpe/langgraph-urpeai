/**
 * Componente de resumen del perfil de contacto
 * 
 * Muestra una vista compacta y enriquecida del contacto utilizando
 * el contexto generado por generateContactProfileContext.
 */

import React from 'react';
import { 
  User, 
  Phone, 
  Mail, 
  Calendar, 
  MessageSquare, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  TrendingUp,
  Star,
  Users,
  Tag,
  Activity,
  Target,
  Zap,
  Eye
} from 'lucide-react';
import { useContactProfileContext, useContactPauseStatus, useContactEngagementMetrics } from '../../../hooks/useContactProfileContext';

interface ContactProfileSummaryProps {
  contactId: number;
  compact?: boolean;
  showActions?: boolean;
}

export const ContactProfileSummary: React.FC<ContactProfileSummaryProps> = ({ 
  contactId, 
  compact = false, 
  showActions = true 
}) => {
  const context = useContactProfileContext(contactId);
  const pauseStatus = useContactPauseStatus(contactId);
  const engagementMetrics = useContactEngagementMetrics(contactId);

  if (!context) {
    return (
      <div className="animate-pulse">
        <div className="h-4 bg-zinc-800 rounded mb-2"></div>
        <div className="h-3 bg-zinc-800 rounded w-3/4"></div>
      </div>
    );
  }

  const { identity, status, assignment, activity, intelligence, quickActions } = context;

  return (
    <div className={`space-y-4 ${compact ? 'p-3' : 'p-4'}`}>
      {/* === HEADER CON IDENTIDAD === */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className={`
          relative w-12 h-12 rounded-full flex items-center justify-center 
          text-white font-bold text-lg border-2 shrink-0
          ${identity.avatar.color} ${identity.avatar.gradient}
          border-white/20
        `}>
          {identity.initials}
          {identity.avatar.qualified && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center">
              <Star className="w-2 h-2 text-white" />
            </div>
          )}
        </div>

        {/* Información principal */}
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-zinc-100 text-sm truncate">
            {identity.displayName}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs px-2 py-0.5 rounded-full ${status.state.color} bg-opacity-10 border border-opacity-20`}>
              {status.state.label}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${status.qualification.color}`}>
              {status.qualification.icon} {status.qualification.label}
            </span>
          </div>
          
          {/* Indicador de pausa */}
          {(pauseStatus.isPaused || pauseStatus.isDeactivated) && (
            <div className={`flex items-center gap-1 mt-2 text-xs ${pauseStatus.statusColor}`}>
              {pauseStatus.isPaused ? <Clock className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
              <span>{pauseStatus.statusText}</span>
            </div>
          )}
        </div>
      </div>

      {/* === MÉTRICAS DE INTELIGENCIA === */}
      {!compact && (
        <div className="grid grid-cols-2 gap-3">
          {/* Lead Score */}
          <div className="bg-zinc-900/50 rounded-lg p-3 border border-white/5">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-zinc-400" />
              <span className="text-xs text-zinc-500">Lead Score</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-lg font-bold ${intelligence.leadScore.color}`}>
                {intelligence.leadScore.value}
              </span>
              <span className="text-xs text-zinc-400">
                {intelligence.leadScore.level === 'hot' ? '🔥' : 
                 intelligence.leadScore.level === 'warm' ? '🌡️' : '❄️'}
              </span>
            </div>
            <div className="mt-1">
              <div className="w-full bg-zinc-800 rounded-full h-1">
                <div 
                  className={`h-1 rounded-full ${
                    intelligence.leadScore.level === 'hot' ? 'bg-emerald-500' :
                    intelligence.leadScore.level === 'warm' ? 'bg-amber-500' : 'bg-zinc-500'
                  }`}
                  style={{ width: `${intelligence.leadScore.value}%` }}
                />
              </div>
            </div>
          </div>

          {/* Engagement */}
          <div className="bg-zinc-900/50 rounded-lg p-3 border border-white/5">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-zinc-400" />
              <span className="text-xs text-zinc-500">Engagement</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold text-primary-400">
                {engagementMetrics.activityScore}
              </span>
              <span className="text-xs text-zinc-400">pts</span>
            </div>
            <div className="text-xs text-zinc-400 mt-1">
              {engagementMetrics.engagementLevel === 'high' ? 'Alto' :
               engagementMetrics.engagementLevel === 'medium' ? 'Medio' : 'Bajo'}
            </div>
          </div>
        </div>
      )}

      {/* === INFORMACIÓN DE CONTACTO === */}
      <div className="space-y-2">
        {context.contactInfo.phone && (
          <div className="flex items-center gap-2 group">
            <Phone className="w-4 h-4 text-zinc-500 shrink-0" />
            <a 
              href={`tel:${context.contactInfo.phone}`}
              className="text-sm text-zinc-300 hover:text-primary-400 transition-colors"
            >
              {context.contactInfo.phone}
            </a>
            {context.contactInfo.preferredMethod === 'phone' && (
              <Zap className="w-3 h-3 text-amber-400" />
            )}
          </div>
        )}

        {context.contactInfo.email && (
          <div className="flex items-center gap-2 group">
            <Mail className="w-4 h-4 text-zinc-500 shrink-0" />
            <a 
              href={`mailto:${context.contactInfo.email}`}
              className="text-sm text-zinc-300 hover:text-primary-400 transition-colors truncate"
            >
              {context.contactInfo.email}
            </a>
            {context.contactInfo.preferredMethod === 'email' && (
              <Zap className="w-3 h-3 text-amber-400" />
            )}
          </div>
        )}

        {assignment.assignedAgent && (
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary-400 shrink-0" />
            <span className="text-sm text-zinc-300">
              {assignment.assignedAgent.fullName}
            </span>
          </div>
        )}
      </div>

      {/* === ACTIVIDAD RECIENTE === */}
      {!compact && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-zinc-500" />
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Actividad</span>
          </div>
          
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-zinc-900/30 rounded p-2">
              <MessageSquare className="w-4 h-4 text-blue-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-zinc-200">
                {activity.metrics.conversationCount}
              </div>
              <div className="text-xs text-zinc-500">Chats</div>
            </div>
            
            <div className="bg-zinc-900/30 rounded p-2">
              <Calendar className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-zinc-200">
                {activity.metrics.appointmentCount}
              </div>
              <div className="text-xs text-zinc-500">Citas</div>
            </div>
            
            <div className="bg-zinc-900/30 rounded p-2">
              <CheckCircle className="w-4 h-4 text-amber-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-zinc-200">
                {activity.metrics.noteCount}
              </div>
              <div className="text-xs text-zinc-500">Notas</div>
            </div>
          </div>

          {/* Última interacción */}
          <div className={`flex items-center gap-2 text-xs ${activity.lastInteraction.color}`}>
            <Eye className="w-3 h-3" />
            <span>Última actividad: {activity.lastInteraction.relativeTime}</span>
          </div>
        </div>
      )}

      {/* === ETIQUETAS === */}
      {context.metadata.tags.length > 0 && !compact && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-zinc-500" />
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Etiquetas</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {context.metadata.tags.slice(0, 3).map((tag, index) => (
              <span 
                key={index}
                className="text-xs px-2 py-1 bg-primary-500/10 text-primary-400 rounded-full border border-primary-500/20"
              >
                {tag}
              </span>
            ))}
            {context.metadata.tags.length > 3 && (
              <span className="text-xs px-2 py-1 bg-zinc-800 text-zinc-400 rounded-full">
                +{context.metadata.tags.length - 3}
              </span>
            )}
          </div>
        </div>
      )}

      {/* === ACCIONES RÁPIDAS === */}
      {showActions && !compact && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-zinc-500" />
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Acciones Rápidas</span>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            {quickActions.canCall && (
              <button className="flex items-center gap-2 px-3 py-2 bg-zinc-900/50 hover:bg-zinc-900/70 border border-white/5 rounded-lg transition-colors">
                <Phone className="w-4 h-4 text-zinc-400" />
                <span className="text-xs text-zinc-300">Llamar</span>
              </button>
            )}
            
            {quickActions.canEmail && (
              <button className="flex items-center gap-2 px-3 py-2 bg-zinc-900/50 hover:bg-zinc-900/70 border border-white/5 rounded-lg transition-colors">
                <Mail className="w-4 h-4 text-zinc-400" />
                <span className="text-xs text-zinc-300">Email</span>
              </button>
            )}
            
            {quickActions.isIn24hWindow && (
              <button className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg transition-colors">
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-emerald-300">WhatsApp</span>
              </button>
            )}
            
            {quickActions.canSchedule && (
              <button className="flex items-center gap-2 px-3 py-2 bg-zinc-900/50 hover:bg-zinc-900/70 border border-white/5 rounded-lg transition-colors">
                <Calendar className="w-4 h-4 text-zinc-400" />
                <span className="text-xs text-zinc-300">Agendar</span>
              </button>
            )}
          </div>
          
          {quickActions.isIn24hWindow && (
            <div className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">
              ⚡ Ventana de 24h activa - {quickActions.windowTimeRemaining}
            </div>
          )}
        </div>
      )}

      {/* === RESUMEN EJECUTIVO === */}
      {!compact && context.executiveSummary.headline && (
        <div className="bg-zinc-900/30 rounded-lg p-3 border border-white/5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-zinc-400" />
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Resumen</span>
          </div>
          <p className="text-sm text-zinc-200 leading-relaxed">
            {context.executiveSummary.headline}
          </p>
          
          {context.executiveSummary.keyPoints.length > 0 && (
            <div className="mt-2 space-y-1">
              {context.executiveSummary.keyPoints.slice(0, 2).map((point, index) => (
                <div key={index} className="flex items-start gap-2">
                  <CheckCircle className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />
                  <span className="text-xs text-zinc-300">{point}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ContactProfileSummary;

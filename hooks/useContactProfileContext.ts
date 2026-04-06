/**
 * Hook para el contexto del perfil de contacto
 * 
 * Proporciona acceso optimizado al contexto enriquecido del contacto
 * para la vista de detalles, con caché y actualizaciones reactivas.
 */

import { useMemo } from 'react';
import { useContactStore } from '../store/contactStore';
import { generateContactProfileContext, ContactProfileContext } from '../lib/contact-profile-context';
import { Contact } from '../types/contact';

interface UseContactProfileContextOptions {
  includeExecutiveSummary?: boolean;
  refreshOnDataChange?: boolean;
}

export const useContactProfileContext = (
  contactId: number,
  options: UseContactProfileContextOptions = {}
): ContactProfileContext | null => {
  const {
    includeExecutiveSummary = true,
    refreshOnDataChange = true
  } = options;

  // Obtener datos del store
  const contact = useContactStore(state => 
    state.contacts.find(c => c.id === contactId)
  );
  const activeContact = useContactStore(state => state.activeContact);
  const activeContactData = useContactStore(state => state.activeContactData);
  const teamMembers = useContactStore(state => state.teamMembers);
  const funnelStages = useContactStore(state => state.funnelStages);

  // Determinar qué contacto usar (active o del array)
  const targetContact = activeContact?.id === contactId ? activeContact : contact;

  // Generar contexto con useMemo para optimización
  const context = useMemo(() => {
    if (!targetContact) return null;

    try {
      return generateContactProfileContext(
        targetContact,
        activeContactData.conversations,
        activeContactData.appointments,
        activeContactData.notes,
        activeContactData.transcripciones,
        activeContactData.funnelStatus,
        funnelStages,
        teamMembers
      );
    } catch (error) {
      console.error('Error generating contact profile context:', error);
      return null;
    }
  }, [
    targetContact,
    activeContactData.conversations,
    activeContactData.appointments,
    activeContactData.notes,
    activeContactData.transcripciones,
    activeContactData.funnelStatus,
    funnelStages,
    teamMembers,
    refreshOnDataChange // Forzar recálculo si los datos cambian
  ]);

  return context;
};

// Hook adicional para obtener solo el resumen ejecutivo
export const useContactExecutiveSummary = (contactId: number): string => {
  const context = useContactProfileContext(contactId, { 
    includeExecutiveSummary: true 
  });
  
  return context?.executiveSummary.headline || '';
};

// Hook para obtener el estado de pausa del contacto
export const useContactPauseStatus = (contactId: number) => {
  const context = useContactProfileContext(contactId);
  
  return {
    isPaused: context?.status.pauseStatus.isPaused || false,
    isDeactivated: context?.status.pauseStatus.isDeactivated || false,
    pausedUntil: context?.status.pauseStatus.pausedUntil,
    timeRemaining: context?.status.pauseStatus.timeRemaining,
    statusText: context?.status.pauseStatus.statusText,
    statusColor: context?.status.pauseStatus.statusColor,
    statusIcon: context?.status.pauseStatus.statusIcon
  };
};

// Hook para obtener métricas de engagement
export const useContactEngagementMetrics = (contactId: number) => {
  const context = useContactProfileContext(contactId);
  
  return {
    activityScore: context?.activity.metrics.activityScore || 0,
    engagementLevel: context?.activity.metrics.engagementLevel || 'low',
    conversationCount: context?.activity.metrics.conversationCount || 0,
    appointmentCount: context?.activity.metrics.appointmentCount || 0,
    noteCount: context?.activity.metrics.noteCount || 0,
    lastInteraction: context?.activity.lastInteraction,
    canMessage: context?.quickActions.isIn24hWindow || false,
    windowTimeRemaining: context?.quickActions.windowTimeRemaining
  };
};

// Hook para obtener información de inteligencia de negocio
export const useContactBusinessIntelligence = (contactId: number) => {
  const context = useContactProfileContext(contactId);
  
  return {
    leadScore: context?.intelligence.leadScore,
    conversionProbability: context?.intelligence.conversionProbability,
    funnelStage: context?.intelligence.funnelStage,
    qualification: context?.status.qualification,
    state: context?.status.state,
    tags: context?.metadata.tags || [],
    hasHighPotential: context?.intelligence.leadScore.level === 'hot',
    shouldPrioritize: (context?.intelligence.leadScore.value ?? 0) >= 60
  };
};

// Hook para obtener acciones rápidas disponibles
export const useContactQuickActions = (contactId: number) => {
  const context = useContactProfileContext(contactId);
  
  return {
    canCall: context?.quickActions.canCall || false,
    canEmail: context?.quickActions.canEmail || false,
    canMessage: context?.quickActions.canMessage || false,
    canSchedule: context?.quickActions.canSchedule || false,
    hasUpcomingAppointment: context?.quickActions.hasUpcomingAppointment || false,
    isIn24hWindow: context?.quickActions.isIn24hWindow || false,
    windowTimeRemaining: context?.quickActions.windowTimeRemaining,
    phone: context?.contactInfo.phone,
    email: context?.contactInfo.email,
    preferredMethod: context?.contactInfo.preferredMethod
  };
};

export default useContactProfileContext;

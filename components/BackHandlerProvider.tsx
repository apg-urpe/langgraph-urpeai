'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useAdminStore } from '@/store/adminStore';
import { useContactStore } from '@/store/contactStore';
import { useChatStore } from '@/store/chatStore';

/**
 * BackHandlerProvider - Maneja el botón "atrás" del navegador/dispositivo móvil.
 * 
 * Evita que la PWA se cierre inesperadamente al presionar "atrás" cuando hay
 * paneles, modales o vistas de detalle abiertas.
 * 
 * Prioridad de cierre (de más específico a más general):
 * 1. ArtifactPanel (panel de artefactos - chatStore legacy)
 * 2. ContactDetail (detalle de contacto)
 * 3. MobileMenu (menú móvil)
 * 4. AdminPanel (panel administrativo)
 * 5. Permitir navegación normal
 */
export function BackHandlerProvider({ children }: { children: React.ReactNode }) {
  // Admin Store
  const isAdminPanelOpen = useAdminStore(state => state.isAdminPanelOpen);
  const closeAdminPanel = useAdminStore(state => state.closeAdminPanel);
  const isMobileMenuOpen = useAdminStore(state => state.isMobileMenuOpen);
  const closeMobileMenu = useAdminStore(state => state.closeMobileMenu);
  
  // Contact Store
  const selectedContactId = useContactStore(state => state.selectedContactId);
  const selectContact = useContactStore(state => state.selectContact);
  
  // Chat Store - Artifact (legacy, usado por algunos componentes)
  const isArtifactOpen = useChatStore(state => state.isArtifactOpen);
  const closeArtifact = useChatStore(state => state.closeArtifact);
  
  // Ref para evitar múltiples pushState y procesamiento duplicado
  const hasInitializedRef = useRef(false);
  const isHandlingBackRef = useRef(false);

  // Determinar si hay algo interceptable abierto
  const hasInterceptableState = useCallback(() => {
    return isArtifactOpen || 
           selectedContactId !== null || 
           isMobileMenuOpen || 
           isAdminPanelOpen;
  }, [isArtifactOpen, selectedContactId, isMobileMenuOpen, isAdminPanelOpen]);

  const handleBack = useCallback((e: PopStateEvent) => {
    // Evitar procesamiento duplicado
    if (isHandlingBackRef.current) return;
    
    // Prioridad 1: Cerrar ArtifactPanel
    if (isArtifactOpen) {
      isHandlingBackRef.current = true;
      closeArtifact();
      window.history.pushState({ backHandler: true }, '', window.location.href);
      setTimeout(() => { isHandlingBackRef.current = false; }, 100);
      return;
    }
    
    // Prioridad 2: Cerrar ContactDetail
    if (selectedContactId !== null) {
      isHandlingBackRef.current = true;
      selectContact(null);
      window.history.pushState({ backHandler: true }, '', window.location.href);
      setTimeout(() => { isHandlingBackRef.current = false; }, 100);
      return;
    }
    
    // Prioridad 3: Cerrar MobileMenu
    if (isMobileMenuOpen) {
      isHandlingBackRef.current = true;
      closeMobileMenu();
      window.history.pushState({ backHandler: true }, '', window.location.href);
      setTimeout(() => { isHandlingBackRef.current = false; }, 100);
      return;
    }
    
    // Prioridad 4: Cerrar AdminPanel (volver al chat)
    if (isAdminPanelOpen) {
      isHandlingBackRef.current = true;
      closeAdminPanel();
      window.history.pushState({ backHandler: true }, '', window.location.href);
      setTimeout(() => { isHandlingBackRef.current = false; }, 100);
      return;
    }
    
    // Si no hay nada abierto, permitir navegación normal
  }, [
    isArtifactOpen, closeArtifact,
    selectedContactId, selectContact,
    isMobileMenuOpen, closeMobileMenu,
    isAdminPanelOpen, closeAdminPanel
  ]);

  useEffect(() => {
    // Solo insertar estado inicial una vez
    if (!hasInitializedRef.current) {
      // Verificar si ya tenemos un estado de backHandler
      if (!window.history.state?.backHandler) {
        window.history.pushState({ backHandler: true }, '', window.location.href);
      }
      hasInitializedRef.current = true;
    }

    window.addEventListener('popstate', handleBack);
    
    return () => {
      window.removeEventListener('popstate', handleBack);
    };
  }, [handleBack]);

  // Mantener estado en historial cuando cambia el estado de la app
  useEffect(() => {
    if (hasInterceptableState() && hasInitializedRef.current) {
      // Asegurar que tenemos un estado para interceptar
      if (!window.history.state?.backHandler) {
        window.history.pushState({ backHandler: true }, '', window.location.href);
      }
    }
  }, [hasInterceptableState]);

  return <>{children}</>;
}

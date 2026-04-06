'use client';

import React, { memo } from 'react';
import { Loader2, AlertCircle, Users, PowerOff, Clock, Phone, Mail, Calendar, Info } from 'lucide-react';
import { ContactContext, ContactDisplayData, FunnelStage } from '../../../types/contact';
import { getStatusColor, getQualificationColor } from './funnel-shared';

interface FunnelTableViewProps {
  isLoading: boolean;
  contacts: any[];
  displayContacts: ContactDisplayData[];
  contextMap: Map<number, ContactContext>;
  funnelStages: FunnelStage[];
  userRoleId: number | null;
  error: string | null;
  refreshContacts: () => void;
  handleContactClick: (id: number) => void;
  isBasicRole: boolean;
  searchFilter: string;
}

export const FunnelTableView = memo<FunnelTableViewProps>(({
  isLoading,
  contacts,
  displayContacts,
  contextMap,
  funnelStages,
  userRoleId,
  error,
  refreshContacts,
  handleContactClick,
  isBasicRole,
  searchFilter,
}) => {
  // Helper: obtener nombre de etapa por ID
  const getStageName = (stageId: number | null): string | null => {
    if (!stageId) return null;
    const stage = funnelStages.find(s => s.id === stageId);
    return stage?.nombre_etapa || null;
  };
  return (
    <div className="flex-1 overflow-auto">
      {/* Loading State */}
      {isLoading && contacts.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-zinc-500">
          <Loader2 className="w-8 h-8 animate-spin mb-2" />
          <span className="text-sm">Cargando contactos...</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="flex flex-col items-center justify-center h-48 text-red-400 p-4">
          <AlertCircle className="w-8 h-8 mb-2" />
          <span className="text-sm text-center">{error}</span>
          <button
            onClick={refreshContacts}
            className="mt-3 text-xs text-zinc-400 hover:text-zinc-200 underline"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !error && contacts.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 text-zinc-500 p-4">
          <Users className="w-12 h-12 mb-3 opacity-30" />
          {isBasicRole && !searchFilter ? (
            <>
              <span className="text-sm font-medium text-zinc-400">No tienes contactos asignados</span>
              <span className="text-xs mt-1 text-center max-w-xs">Contacta a tu administrador para que te asigne contactos.</span>
            </>
          ) : (
            <>
              <span className="text-sm">No hay contactos</span>
              {searchFilter && (
                <span className="text-xs mt-1">Prueba con otros términos de búsqueda</span>
              )}
            </>
          )}
        </div>
      )}

      {/* Contacts Table */}
      {(!isLoading || contacts.length > 0) && !error && contacts.length > 0 && (
        <div className={`divide-y divide-white/5 ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}>
          {displayContacts.map((contact) => (
            (() => {
              const context = contextMap.get(contact.id);
              const nextAppointment = context?.quickActions.nextAppointment;
              return (
            <div 
              key={contact.id}
              onClick={() => handleContactClick(contact.id)}
              className="p-2.5 md:p-3 hover:bg-white/[0.02] transition-colors cursor-pointer group active:bg-white/[0.04]"
            >
              {/* Name and Status Row */}
              <div className="flex items-start justify-between mb-1.5 md:mb-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-xs md:text-sm font-medium text-zinc-200 truncate group-hover:text-white transition-colors">
                    {contact.nombreCompleto}
                  </h3>
                </div>
                {/* Badges en esquina superior derecha */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Pause/Deactivated Status Indicator */}
                  {(contact.isPaused || contact.isDeactivated) && (
                    <div className={`
                      w-4 h-4 rounded-full flex items-center justify-center shadow-lg ring-1 ring-black
                      ${contact.isDeactivated ? 'bg-rose-500' : 'bg-amber-500'}
                    `} title={contact.isDeactivated ? 'Desactivado' : 'Pausado temporalmente'}>
                      {contact.isDeactivated ? (
                        <PowerOff className="w-2.5 h-2.5 text-white" />
                      ) : (
                        <Clock className="w-2.5 h-2.5 text-black" />
                      )}
                    </div>
                  )}

                  {nextAppointment && (
                    <div className="relative group/apt">
                      <div className={`p-1 rounded border ${
                        nextAppointment.isToday
                          ? 'bg-emerald-500/20 border-emerald-500/40'
                          : nextAppointment.isTomorrow
                          ? 'bg-amber-500/15 border-amber-500/30'
                          : 'bg-blue-500/10 border-blue-500/20'
                      }`}>
                        <Calendar className={`w-3 h-3 ${
                          nextAppointment.isToday
                            ? 'text-emerald-400'
                            : nextAppointment.isTomorrow
                            ? 'text-amber-400'
                            : 'text-blue-400'
                        }`} />
                      </div>
                      <div className="absolute z-[100] top-1/2 -translate-y-1/2 right-full mr-2 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-white/10 shadow-2xl opacity-0 invisible group-hover/apt:opacity-100 group-hover/apt:visible transition-all duration-200 pointer-events-none whitespace-nowrap">
                        <div className="flex items-center gap-2 text-[10px]">
                          <Calendar className="w-3 h-3 text-blue-400 shrink-0" />
                          <div className="flex flex-col">
                            <span className={`font-semibold ${
                              nextAppointment.isToday
                                ? 'text-emerald-400'
                                : nextAppointment.isTomorrow
                                ? 'text-amber-400'
                                : 'text-zinc-200'
                            }`}>
                              {nextAppointment.isToday
                                ? 'Hoy'
                                : nextAppointment.isTomorrow
                                ? 'Mañana'
                                : nextAppointment.date}
                              {' · '}
                              {nextAppointment.time}
                            </span>
                            {nextAppointment.title && (
                              <span className="text-zinc-400 truncate max-w-[180px]">
                                {nextAppointment.title}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Arrow pointing right */}
                        <div className="absolute top-1/2 -translate-y-1/2 left-full border-4 border-transparent border-l-zinc-900" />
                      </div>
                    </div>
                  )}
                  {/* Info Indicator - Unified context tooltip */}
                  <div className="relative group/info">
                    <div className="p-1 rounded border bg-zinc-500/10 border-zinc-500/20 hover:bg-zinc-500/20 transition-colors">
                      <Info className="w-3 h-3 text-zinc-400" />
                    </div>
                    <div className="absolute z-[100] top-1/2 -translate-y-1/2 right-full mr-2 px-2.5 py-2 rounded-lg bg-zinc-900 border border-white/10 shadow-2xl opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all duration-200 pointer-events-none whitespace-nowrap">
                      <div className="flex flex-col gap-1.5 text-[10px]">
                        {/* Estado y Calificación */}
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500">Estado:</span>
                          <span className="text-zinc-200 font-medium">{contact.estado || 'Desconocido'}</span>
                        </div>
                        {contact.calificacion && contact.calificacion !== '-' && (
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-500">Calificación:</span>
                            <span className="text-zinc-300">{contact.calificacion}</span>
                          </div>
                        )}
                        {/* Último contacto */}
                        {contact.ultimoContacto && contact.ultimoContacto !== '-' && (
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-500">Último contacto:</span>
                            <span className="text-zinc-300">{contact.ultimoContacto}</span>
                          </div>
                        )}
                        {/* Etapa embudo */}
                        {contact.etapaEmbudoId && getStageName(contact.etapaEmbudoId) && (
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-500">Etapa:</span>
                            <span className="text-zinc-300">{getStageName(contact.etapaEmbudoId)}</span>
                          </div>
                        )}
                        {contact.etapaEmocional && (
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-500">Emocional:</span>
                            <span className="text-zinc-300">{contact.etapaEmocional}</span>
                          </div>
                        )}
                        {contact.origen !== '-' && (
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-500">Origen:</span>
                            <span className="text-zinc-300">{contact.origen}</span>
                          </div>
                        )}
                        {context?.assignedAgent && userRoleId !== 3 && (
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-500">Asesor:</span>
                            <span className="text-zinc-300">{context.assignedAgent}</span>
                          </div>
                        )}
                      </div>
                      <div className="absolute top-1/2 -translate-y-1/2 left-full border-4 border-transparent border-l-zinc-900" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact Details - Teléfono y Correo */}
              <div className="flex items-center gap-3 text-[11px] md:text-xs text-zinc-500">
                {contact.telefono !== '-' && (
                  <span className="flex items-center gap-1 truncate">
                    <Phone className="w-3 h-3 shrink-0 text-zinc-600" />
                    <span className="truncate max-w-[100px]">{contact.telefono}</span>
                  </span>
                )}
                {contact.email !== '-' && (
                  <span className="flex items-center gap-1 truncate">
                    <Mail className="w-3 h-3 shrink-0 text-zinc-600" />
                    <span className="truncate max-w-[100px]">{contact.email}</span>
                  </span>
                )}
              </div>
            </div>
              );
            })()
          ))}
        </div>
      )}
    </div>
  );
});

FunnelTableView.displayName = 'FunnelTableView';

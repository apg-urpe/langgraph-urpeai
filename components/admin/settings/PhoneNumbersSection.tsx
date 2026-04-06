'use client';

import React, { useEffect, useCallback } from 'react';
import { AlertTriangle, CheckCircle, Loader2, Phone, Plus, RefreshCw, Shield } from 'lucide-react';
import { useContactStore, selectSelectedEnterpriseId, selectUserContext } from '../../../store/contactStore';
import {
  usePhoneNumbersStore,
  selectPhoneNumbers,
  selectPhoneNumbersError,
  selectPhoneNumbersLoading
} from '../../../store/phoneNumbersStore';
import { useKapsoSetup } from '../../../hooks/useKapsoSetup';

const formatDate = (value: string | null | undefined) => {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(date);
};

const normalizeChannel = (value: string | null | undefined) => {
  if (!value) return 'Sin canal';
  return value.replace(/[_-]+/g, ' ').trim();
};

export const PhoneNumbersSection: React.FC = () => {
  const selectedEnterpriseId = useContactStore(selectSelectedEnterpriseId);
  const userContext = useContactStore(selectUserContext);

  const numbers = usePhoneNumbersStore(selectPhoneNumbers);
  const isLoading = usePhoneNumbersStore(selectPhoneNumbersLoading);
  const error = usePhoneNumbersStore(selectPhoneNumbersError);

  const fetchPhoneNumbers = usePhoneNumbersStore((s) => s.fetchPhoneNumbers);
  const canViewPhoneNumbers = usePhoneNumbersStore((s) => s.canViewPhoneNumbers);
  const clearError = usePhoneNumbersStore((s) => s.clearError);
  const resetStore = usePhoneNumbersStore((s) => s.resetStore);

  const userRoleId = userContext?.roleId;
  const hasAccess = canViewPhoneNumbers(userRoleId);

  const handleKapsoSuccess = useCallback((phoneNumber: string | null) => {
    if (selectedEnterpriseId) {
      fetchPhoneNumbers(selectedEnterpriseId, true);
    }
  }, [selectedEnterpriseId, fetchPhoneNumbers]);

  const kapsoSetup = useKapsoSetup({
    empresaId: selectedEnterpriseId,
    onSuccess: handleKapsoSuccess,
  });

  useEffect(() => {
    if (selectedEnterpriseId && hasAccess) {
      fetchPhoneNumbers(selectedEnterpriseId, true);
      return;
    }

    resetStore();
  }, [selectedEnterpriseId, hasAccess, fetchPhoneNumbers, resetStore]);

  const handleRefresh = () => {
    if (!selectedEnterpriseId || !hasAccess) return;
    fetchPhoneNumbers(selectedEnterpriseId, true);
  };

  if (!hasAccess) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
          <Shield className="w-7 h-7 text-red-400" />
        </div>
        <h3 className="text-lg font-semibold text-zinc-300 mb-2">Acceso restringido</h3>
        <p className="text-sm text-zinc-500 max-w-xs">
          Solo administradores y líderes pueden ver los números telefónicos.
        </p>
      </div>
    );
  }

  if (!selectedEnterpriseId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Phone className="w-12 h-12 text-zinc-600 mb-3" />
        <p className="text-zinc-400">Selecciona una empresa</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
            <Phone className="w-5 h-5 text-sky-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-200">Números telefónicos</h3>
            <p className="text-xs text-zinc-500">
              {numbers.length} número{numbers.length !== 1 ? 's' : ''} registrado{numbers.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={kapsoSetup.startSetup}
            disabled={kapsoSetup.isLoading || !selectedEnterpriseId}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all text-xs font-medium disabled:opacity-50"
            title="Conectar un nuevo número de WhatsApp via Kapso"
          >
            {kapsoSetup.isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Conectar WhatsApp
          </button>

          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-2 rounded-lg border border-white/5 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200 hover:border-white/10 transition-all disabled:opacity-50"
            title="Actualizar"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-400">Error</p>
            <p className="text-xs text-red-400/70 mt-0.5">{error}</p>
          </div>
          <button
            onClick={clearError}
            className="ml-auto text-red-400 hover:text-red-300"
            title="Cerrar"
          >
            ×
          </button>
        </div>
      )}

      {kapsoSetup.success && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-emerald-300">WhatsApp conectado</p>
            <p className="text-xs text-emerald-300/70 mt-0.5">
              {kapsoSetup.newPhoneNumber
                ? `Número ${kapsoSetup.newPhoneNumber} registrado exitosamente`
                : 'Número registrado exitosamente'}
            </p>
          </div>
          <button
            onClick={kapsoSetup.clearState}
            className="ml-auto text-emerald-400 hover:text-emerald-300"
            title="Cerrar"
          >
            ×
          </button>
        </div>
      )}

      {kapsoSetup.error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-400">Error de conexión WhatsApp</p>
            <p className="text-xs text-red-400/70 mt-0.5">{kapsoSetup.error}</p>
          </div>
          <button
            onClick={kapsoSetup.clearState}
            className="ml-auto text-red-400 hover:text-red-300"
            title="Cerrar"
          >
            ×
          </button>
        </div>
      )}

      {isLoading && numbers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-sky-400 animate-spin mb-3" />
          <p className="text-sm text-zinc-400">Cargando números...</p>
        </div>
      )}

      {!isLoading && numbers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 border border-white/5 flex items-center justify-center mb-4">
            <Phone className="w-7 h-7 text-zinc-500" />
          </div>
          <h4 className="text-lg font-semibold text-zinc-300 mb-2">Sin números registrados</h4>
          <p className="text-sm text-zinc-500 max-w-xs">
            Esta empresa aún no tiene números telefónicos configurados en el sistema.
          </p>
        </div>
      )}

      {numbers.length > 0 && (
        <div className="bg-[#131316] border border-white/5 rounded-xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[1.4fr_1fr_0.8fr_1fr_0.8fr_0.9fr_0.9fr] gap-3 px-4 py-3 border-b border-white/5 text-[10px] uppercase tracking-wider font-bold text-zinc-500">
            <div>Número</div>
            <div>Nombre</div>
            <div>Canal</div>
            <div>Agente</div>
            <div>Estado</div>
            <div>Kapso</div>
            <div>Actualizado</div>
          </div>

          <div className="divide-y divide-white/5">
            {numbers.map((item) => (
              <div
                key={item.id}
                className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_0.8fr_1fr_0.8fr_0.9fr_0.9fr] gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors"
              >
                <div className="min-w-0">
                  <div className="md:hidden text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-1">Número</div>
                  <div className="text-sm font-medium text-zinc-200 truncate">{item.telefono || 'Sin número'}</div>
                </div>

                <div className="min-w-0">
                  <div className="md:hidden text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-1">Nombre</div>
                  <div className="text-sm text-zinc-300 truncate">{item.nombre || 'Sin nombre'}</div>
                </div>

                <div className="min-w-0">
                  <div className="md:hidden text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-1">Canal</div>
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-300 border border-white/5 capitalize">
                    {normalizeChannel(item.canal)}
                  </span>
                </div>

                <div className="min-w-0">
                  <div className="md:hidden text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-1">Agente</div>
                  <div className="text-sm text-zinc-300 truncate">{item.agent?.nombre_agente || 'Sin agente'}</div>
                </div>

                <div className="min-w-0">
                  <div className="md:hidden text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-1">Estado</div>
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-medium border ${
                      item.activo
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : 'bg-zinc-800 border-white/5 text-zinc-400'
                    }`}
                  >
                    {item.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>

                <div className="min-w-0">
                  <div className="md:hidden text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-1">Kapso</div>
                  <div className="text-sm text-zinc-400 truncate">{item.id_kapso || '—'}</div>
                </div>

                <div className="min-w-0">
                  <div className="md:hidden text-[10px] uppercase tracking-wider font-bold text-zinc-500 mb-1">Actualizado</div>
                  <div className="text-sm text-zinc-400">{formatDate(item.updated_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

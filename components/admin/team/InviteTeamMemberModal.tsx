'use client';

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Mail, 
  Shield, 
  Send, 
  Loader2,
  AlertCircle,
  CheckCircle2,
  Copy,
  Link2,
  Key
} from 'lucide-react';
import { useTeamStore } from '../../../store/teamStore';
import { useContactStore } from '../../../store/contactStore';
import { GroupSelector } from './GroupSelector';

interface InviteTeamMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InviteTeamMemberModal: React.FC<InviteTeamMemberModalProps> = ({ 
  isOpen, 
  onClose 
}) => {
  const createInvitation = useTeamStore(state => state.createInvitation);
  const isLoading = useTeamStore(state => state.isLoading);
  const systemRoles = useTeamStore(state => state.systemRoles);
  const groups = useTeamStore(state => state.groups);
  const fetchGroups = useTeamStore(state => state.fetchGroups);
  const isLoadingGroups = useTeamStore(state => state.isLoadingGroups);
  const selectedEnterpriseId = useContactStore(state => state.selectedEnterpriseId);
  const userContext = useContactStore(state => state.userContext);

  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<string>('asesor');
  const [roleId, setRoleId] = useState<number>(3);
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isExistingInvite, setIsExistingInvite] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setEmail('');
      setRol('asesor');
      setRoleId(3);
      setError(null);
      setInviteUrl(null);
      setCopied(false);
      setIsExistingInvite(false);
      if (selectedEnterpriseId) fetchGroups(selectedEnterpriseId);
    }
  }, [isOpen, selectedEnterpriseId, fetchGroups]);

  // Sync rol to first available group when groups load
  useEffect(() => {
    if (groups.length > 0 && !groups.some(g => g.slug === rol)) {
      setRol(groups[0].slug);
    }
  }, [groups, rol]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsExistingInvite(false);

    if (!selectedEnterpriseId) {
      setError('No hay empresa seleccionada');
      return;
    }

    if (!email || !email.includes('@')) {
      setError('Por favor ingresa un email válido');
      return;
    }

    if (!userContext?.id) {
      setError('No se pudo identificar al usuario actual');
      return;
    }

    const result = await createInvitation({
      email: email.trim().toLowerCase(),
      rol,
      role_id: roleId,
      empresa_id: selectedEnterpriseId,
      invited_by: userContext.id
    });

    if (result.inviteUrl) {
      // Detectar si fue una invitación existente reutilizada
      const storeError = useTeamStore.getState().error;
      if (!storeError) {
        setInviteUrl(result.inviteUrl);
        // El RPC devuelve 'existente' en el message cuando reutiliza
        setIsExistingInvite(false); // El link se generó exitosamente de cualquier forma
      }
      setInviteUrl(result.inviteUrl);
    } else {
      const currentError = useTeamStore.getState().error;
      setError(currentError || 'No se pudo crear la invitación. Intenta de nuevo.');
    }
  };

  const handleCopyLink = async () => {
    if (inviteUrl) {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleClose = () => {
    setEmail('');
    setRol('asesor');
    setRoleId(3);
    setError(null);
    setInviteUrl(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#0c0c0e] border border-white/10 rounded-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#131316]">
          <div>
            <h2 className="text-lg font-semibold text-zinc-200">
              Invitar Nuevo Miembro
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Envía una invitación por email o comparte el link
            </p>
          </div>
          <button 
            onClick={handleClose}
            className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {inviteUrl ? (
            // Success State - Show invite link
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-emerald-400">¡Invitación enviada!</p>
                  <p className="text-xs text-emerald-400/70 mt-1">
                    Se envió un <strong>Magic Link</strong> a <strong>{email}</strong>
                  </p>
                  <p className="text-xs text-emerald-400/60 mt-1">
                    ✨ El usuario podrá acceder directamente sin necesidad de crear contraseña
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-400">Link de invitación (respaldo)</label>
                <div className="flex gap-2">
                  <div className="flex-1 bg-[#131316] border border-white/10 rounded-lg px-3 py-2.5 text-sm text-zinc-300 truncate">
                    {inviteUrl}
                  </div>
                  <button
                    onClick={handleCopyLink}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                      copied 
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                        : 'bg-primary-500/10 text-primary-400 border border-primary-500/20 hover:bg-primary-500/20'
                    }`}
                  >
                    {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copiado' : 'Copiar'}
                  </button>
                </div>
              </div>

              <div className="pt-2 text-center">
                <p className="text-xs text-zinc-500">
                  El link expira en <strong className="text-zinc-400">7 días</strong>
                </p>
              </div>

              <button
                onClick={handleClose}
                className="w-full px-4 py-2.5 rounded-xl text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors"
              >
                Cerrar
              </button>
            </div>
          ) : (
            // Form State
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Email del nuevo miembro *</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-[#131316] border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-primary-500/50 outline-none transition-colors"
                    placeholder="nuevo.miembro@empresa.com"
                    autoFocus
                  />
                </div>
              </div>

              {/* Grupo */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Grupo *</label>
                <GroupSelector
                  value={rol}
                  onChange={(slug) => setRol(slug)}
                  empresaId={selectedEnterpriseId}
                />
              </div>

              {/* Role ID (Permisos) */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-zinc-400">Nivel de Permisos 🔒 *</label>
                <div className="relative">
                  <Key className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    value={roleId}
                    onChange={(e) => setRoleId(parseInt(e.target.value, 10))}
                    className="w-full bg-[#131316] border border-white/10 rounded-lg pl-10 pr-4 py-2.5 text-sm text-zinc-200 focus:border-primary-500/50 outline-none appearance-none cursor-pointer transition-colors"
                  >
                    {systemRoles.length > 0 ? (
                      systemRoles
                        .filter(role => role.id !== 1) // Exclude dev team role
                        .map(role => (
                          <option key={role.id} value={role.id}>
                            {role.id} - {role.name}
                          </option>
                        ))
                    ) : (
                      <>
                        <option value={2}>2 - Admin</option>
                        <option value={3}>3 - Asesor</option>
                        <option value={4}>4 - Supervisor</option>
                      </>
                    )}
                  </select>
                </div>
                <p className="text-[10px] text-zinc-600">Determina qué puede ver y hacer el usuario</p>
              </div>

              {/* Info Box */}
              <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/10 flex items-start gap-3">
                <Link2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-400/80">
                  Se generará un link único. El invitado completará su nombre y teléfono al registrarse.
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !email}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-primary-500 hover:bg-primary-600 text-black transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Generar Invitación
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

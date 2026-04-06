import React, { useState, useEffect } from 'react';
import { Users, Search, AlertCircle, Check, X } from 'lucide-react';
import { useContactStore } from '../../../store/contactStore';
import { useNotificationsStore } from '../../../store/notificationsStore';
import { Contact } from '../../../types/contact';

interface TransferContactModalProps {
  contact: Contact;
  onClose: () => void;
  onTransfer: () => void;
}

export const TransferContactModal: React.FC<TransferContactModalProps> = ({ 
  contact, 
  onClose, 
  onTransfer 
}) => {
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(contact.team_humano_id || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const teamMembers = useContactStore(state => state.teamMembers);
  const updateContactField = useContactStore(state => state.updateContactField);
  const userContext = useContactStore(state => state.userContext);
  const createNotification = useNotificationsStore(state => state.createNotification);

  // Filter team members based on search
  const filteredMembers = teamMembers.filter(member => {
    const fullName = `${member.nombre || ''} ${member.apellido || ''}`.toLowerCase();
    const email = (member.email || '').toLowerCase();
    const query = searchQuery.toLowerCase();
    return fullName.includes(query) || email.includes(query);
  });

  const handleTransfer = async () => {
    if (selectedMemberId === contact.team_humano_id) {
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      await updateContactField(contact.id, 'team_humano_id', selectedMemberId);
      
      // Send notification to the new assignee
      if (selectedMemberId) {
        // Find member details
        const newAssignee = teamMembers.find(m => m.id === selectedMemberId);
        
        if (newAssignee) {
          await createNotification({
            tipo: 'sistema', // or 'tarea_asignada' if preferred
            contacto_id: contact.id,
            mensaje: `Te han asignado el contacto ${contact.nombre || ''} ${contact.apellido || ''}`,
            asesor_id: selectedMemberId,
            empresa_id: contact.empresa_id || userContext?.empresaId,
            requiere_respuesta: false,
            origen: 'transferencia_contacto'
          });
        }
      }
      
      onTransfer();
      onClose();
    } catch (error) {
      console.error('Error transferring contact:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#0c0c0e] border border-white/10 rounded-xl shadow-2xl flex flex-col max-h-[70vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5 bg-[#0a0a0c] rounded-t-xl">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary-500/10 rounded-lg">
              <Users className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Transferir Contacto</h2>
              <p className="text-xs text-zinc-400">
                Asignar {contact.nombre} {contact.apellido} a otro asesor
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-zinc-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-white/5 bg-[#0c0c0e]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Buscar asesor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-primary-500/50 placeholder:text-zinc-600"
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          <button
            onClick={() => setSelectedMemberId(null)}
            className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all border ${
              selectedMemberId === null
                ? 'bg-primary-500/10 border-primary-500/30'
                : 'hover:bg-white/5 border-transparent'
            }`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${
              selectedMemberId === null
                ? 'bg-primary-500/20 border-primary-500/30 text-primary-400'
                : 'bg-zinc-800 border-white/5 text-zinc-500'
            }`}>
              <Users className="w-5 h-5" />
            </div>
            <div className="text-left flex-1">
              <div className={`font-medium ${selectedMemberId === null ? 'text-primary-400' : 'text-zinc-300'}`}>
                Sin Asignar
              </div>
              <div className="text-xs text-zinc-500">
                Mover a la bolsa general
              </div>
            </div>
            {selectedMemberId === null && (
              <Check className="w-5 h-5 text-primary-400" />
            )}
          </button>

          {filteredMembers.map((member) => {
            const isSelected = selectedMemberId === member.id;
            const isCurrentUser = member.id === userContext?.id;
            
            return (
              <button
                key={member.id}
                onClick={() => setSelectedMemberId(member.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all border ${
                  isSelected
                    ? 'bg-primary-500/10 border-primary-500/30'
                    : 'hover:bg-white/5 border-transparent'
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border ${
                  isSelected
                    ? 'bg-primary-500/20 border-primary-500/30 text-primary-400'
                    : 'bg-zinc-800 border-white/5 text-zinc-400'
                }`}>
                  {member.nombre[0]}{member.apellido[0]}
                </div>
                <div className="text-left flex-1 min-w-0">
                  <div className={`font-medium truncate ${isSelected ? 'text-primary-400' : 'text-zinc-300'}`}>
                    {member.nombre} {member.apellido}
                    {isCurrentUser && <span className="ml-2 text-xs text-zinc-500">(Tú)</span>}
                  </div>
                  <div className="text-xs text-zinc-500 truncate">
                    {member.email}
                  </div>
                </div>
                {isSelected && (
                  <Check className="w-5 h-5 text-primary-400" />
                )}
              </button>
            );
          })}

          {filteredMembers.length === 0 && (
            <div className="text-center py-8 text-zinc-500">
              <p>No se encontraron asesores</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/5 bg-[#0a0a0c] rounded-b-xl flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
            disabled={isSubmitting}
          >
            Cancelar
          </button>
          <button
            onClick={handleTransfer}
            disabled={isSubmitting || selectedMemberId === contact.team_humano_id}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all
              ${isSubmitting || selectedMemberId === contact.team_humano_id
                ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                : 'bg-primary-600 hover:bg-primary-500 text-white shadow-lg shadow-primary-500/20'
              }
            `}
          >
            {isSubmitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Transfiriendo...</span>
              </>
            ) : (
              <>
                <Users className="w-4 h-4" />
                <span>Confirmar Transferencia</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

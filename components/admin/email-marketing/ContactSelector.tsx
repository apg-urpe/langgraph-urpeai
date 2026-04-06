'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  Users, 
  Check, 
  X,
  Loader2,
  User
} from 'lucide-react';
import { supabase } from '../../../lib/supabase-client';
import { useContactStore } from '../../../store/contactStore';

interface Contact {
  id: number;
  nombre: string;
  apellido: string;
  telefono: string | null;
  email: string | null;
}

interface ContactSelectorProps {
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}

export const ContactSelector: React.FC<ContactSelectorProps> = ({
  selectedIds,
  onChange
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const selectedEnterpriseId = useContactStore(state => state.selectedEnterpriseId);

  // Fetch contacts on mount and search
  useEffect(() => {
    if (!selectedEnterpriseId) return;

    const fetchContacts = async () => {
      setIsLoading(true);
      try {
        let query = supabase
          .from('wp_contactos')
          .select('id, nombre, apellido, telefono, email')
          .eq('empresa_id', selectedEnterpriseId)
          .order('nombre', { ascending: true })
          .limit(100);

        if (searchTerm.length >= 2) {
          query = query.or(`nombre.ilike.%${searchTerm}%,apellido.ilike.%${searchTerm}%,telefono.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`);
        }

        const { data, error } = await query;
        
        if (error) throw error;
        setContacts(data || []);
      } catch (err) {
        console.error('Error fetching contacts:', err);
      } finally {
        setIsLoading(false);
      }
    };

    const timer = setTimeout(fetchContacts, 300);
    return () => clearTimeout(timer);
  }, [selectedEnterpriseId, searchTerm]);

  const toggleContact = (contactId: number) => {
    if (selectedIds.includes(contactId)) {
      onChange(selectedIds.filter(id => id !== contactId));
    } else {
      onChange([...selectedIds, contactId]);
    }
  };

  const selectAll = () => {
    const allIds = contacts.map(c => c.id);
    const newIds = [...new Set([...selectedIds, ...allIds])];
    onChange(newIds);
  };

  const clearAll = () => {
    onChange([]);
  };

  // Get selected contacts info
  const selectedContacts = useMemo(() => {
    return contacts.filter(c => selectedIds.includes(c.id));
  }, [contacts, selectedIds]);

  return (
    <div className="space-y-3">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar contactos..."
          className="w-full pl-10 pr-4 py-2.5 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                     text-zinc-100 placeholder-zinc-500
                     focus:outline-none focus:border-violet-500/50"
        />
      </div>

      {/* Selection Summary */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-400">
          {selectedIds.length > 0 ? (
            <span className="text-amber-400 font-medium">
              {selectedIds.length} contacto{selectedIds.length !== 1 ? 's' : ''} seleccionado{selectedIds.length !== 1 ? 's' : ''}
            </span>
          ) : (
            'Selecciona contactos de la lista'
          )}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={selectAll}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Seleccionar todos
          </button>
          {selectedIds.length > 0 && (
            <>
              <span className="text-zinc-700">|</span>
              <button
                onClick={clearAll}
                className="text-zinc-500 hover:text-rose-400 transition-colors"
              >
                Limpiar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Contact List */}
      <div className="max-h-64 overflow-y-auto border border-white/5 rounded-lg divide-y divide-white/5">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Users className="w-8 h-8 text-zinc-600 mb-2" />
            <p className="text-sm text-zinc-500">
              {searchTerm ? 'No se encontraron contactos' : 'No hay contactos disponibles'}
            </p>
          </div>
        ) : (
          contacts.map(contact => {
            const isSelected = selectedIds.includes(contact.id);
            const displayName = `${contact.nombre} ${contact.apellido || ''}`.trim();
            const initial = (contact.nombre?.[0] || '?').toUpperCase();
            
            return (
              <button
                key={contact.id}
                onClick={() => toggleContact(contact.id)}
                className={`
                  w-full flex items-center gap-3 p-3 text-left transition-colors
                  ${isSelected 
                    ? 'bg-amber-500/10 hover:bg-amber-500/15' 
                    : 'hover:bg-white/5'
                  }
                `}
              >
                {/* Selection indicator */}
                <div className={`
                  w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border transition-colors
                  ${isSelected 
                    ? 'bg-amber-500 border-amber-500' 
                    : 'border-white/20 bg-zinc-800/50'
                  }
                `}>
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </div>
                
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 
                                flex items-center justify-center text-xs font-medium text-zinc-300">
                  {initial}
                </div>
                
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200 truncate">
                    {displayName}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">
                    {contact.email || contact.telefono || 'Sin contacto'}
                  </p>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Selected Tags (show first 5) */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedContacts.slice(0, 5).map(contact => (
            <span
              key={contact.id}
              className="inline-flex items-center gap-1 px-2 py-1 text-xs 
                         bg-amber-500/10 text-amber-300 rounded-full border border-amber-500/20"
            >
              {contact.nombre}
              <button
                onClick={() => toggleContact(contact.id)}
                className="hover:text-amber-100"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {selectedIds.length > 5 && (
            <span className="inline-flex items-center px-2 py-1 text-xs text-zinc-500">
              +{selectedIds.length - 5} más
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default ContactSelector;

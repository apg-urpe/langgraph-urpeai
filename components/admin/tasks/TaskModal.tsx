'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { logger } from '@/lib/logger';
import { 
  X, 
  Plus, 
  Trash2, 
  GripVertical,
  Calendar,
  User,
  Users,
  Flag,
  Sparkles,
  Loader2
} from 'lucide-react';
import { 
  Task, 
  TaskPriority,
  TASK_PRIORITY_LABELS,
  CreateTaskPayload,
  Contact
} from '../../../types/contact';
import { useContactStore, selectActiveContactData, selectActiveContact, selectUserContext } from '../../../store/contactStore';
import { useDraftStorage } from '../../../hooks/useDraftStorage';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: CreateTaskPayload) => Promise<void>;
  onUpdate?: (taskId: number, payload: Partial<Task>) => Promise<void>;
  task?: Task | null;
  contactId?: number;
  citaId?: number;
  projectId?: number; // Add projectId
  teamMembers?: Array<{ id: number; nombre: string; apellido: string }>;
}

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onUpdate,
  task,
  contactId,
  citaId,
  projectId, // Destructure projectId
  teamMembers = []
}) => {
  // Generate unique draft key based on context (only for new tasks)
  const draftKey = useMemo(() => {
    if (task) return ''; // No draft for edit mode
    const parts = ['new'];
    if (contactId) parts.push(`c${contactId}`);
    if (citaId) parts.push(`a${citaId}`);
    if (projectId) parts.push(`p${projectId}`);
    return parts.join('_');
  }, [task, contactId, citaId, projectId]);

  // Draft persistence for new tasks only
  const [draftTitulo, setDraftTitulo, clearTituloDraft] = useDraftStorage(
    'task_form',
    `titulo_${draftKey}`,
    ''
  );
  const [draftDescripcion, setDraftDescripcion, clearDescDraft] = useDraftStorage(
    'task_form',
    `desc_${draftKey}`,
    ''
  );

  // Local state (initialized from draft or task)
  const [titulo, setTituloLocal] = useState('');
  const [descripcion, setDescripcionLocal] = useState('');
  const [prioridad, setPrioridad] = useState<TaskPriority>(2);
  const [asignadoA, setAsignadoA] = useState<number | undefined>(undefined);
  const [fechaVencimiento, setFechaVencimiento] = useState('');
  const [items, setItems] = useState<string[]>(['']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Sync setters to also update draft (for new tasks)
  const setTitulo = (val: string) => {
    setTituloLocal(val);
    if (!task && draftKey) setDraftTitulo(val);
  };
  const setDescripcion = (val: string) => {
    setDescripcionLocal(val);
    if (!task && draftKey) setDraftDescripcion(val);
  };

  // Get contact context for AI generation
  // Priority: 1. Contact from prop contactId (find in contacts array), 2. activeContact from store
  const activeContact = useContactStore(selectActiveContact);
  const activeContactData = useContactStore(selectActiveContactData);
  const contacts = useContactStore(state => state.contacts);
  const userContext = useContactStore(selectUserContext);
  
  // Find contact by prop ID, fallback to activeContact
  const contactFromProp = contactId ? contacts.find(c => c.id === contactId) : undefined;
  const targetContact: Contact | null | undefined = contactId ? (contactFromProp || activeContact) : activeContact;
  // Only use activeContactData if it matches the target contact
  const targetContactData = (targetContact?.id === activeContact?.id) ? activeContactData : null;

  // Populate form when editing or restore draft for new task
  useEffect(() => {
    if (task) {
      // Edit mode: populate from task
      setTituloLocal(task.titulo);
      setDescripcionLocal(task.descripcion || '');
      setPrioridad(task.prioridad);
      setAsignadoA(task.asignado_a || undefined);
      setFechaVencimiento(task.fecha_vencimiento?.split('T')[0] || '');
      setItems(task.items?.map(i => i.texto) || ['']);
    } else {
      // New task: restore from draft or reset
      setTituloLocal(draftTitulo || '');
      setDescripcionLocal(draftDescripcion || '');
      setPrioridad(2);
      setAsignadoA(undefined);
      setFechaVencimiento('');
      setItems(['']);
    }
  }, [task, isOpen, draftTitulo, draftDescripcion]);

  const handleGenerateWithAI = async () => {
    if (!targetContact) return;

    setIsGenerating(true);
    try {
      // Prepare context using targetContact (from prop or activeContact)
      const context = {
        contact: targetContact,
        lastInteraction: targetContact.ultima_interaccion,
        status: targetContact.estado,
        funnelStage: targetContact.etapa_embudo,
        notes: targetContactData?.notes?.slice(0, 3) || [], // Last 3 notes (if available)
        lastConversation: targetContactData?.conversations?.[0] // Most recent conversation (if available)
      };

      const response = await fetch('/api/monica/task-suggestion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, userId: userContext?.authUid })
      });

      if (!response.ok) throw new Error('Failed to generate task');

      const suggestion = await response.json();

      if (suggestion) {
        setTitulo(suggestion.titulo);
        setDescripcion(suggestion.descripcion);
        setPrioridad(suggestion.prioridad as TaskPriority);
        if (suggestion.items && Array.isArray(suggestion.items)) {
          setItems(suggestion.items);
        }
      }
    } catch (error) {
      logger.error('[TaskModal] Error generating task:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddItem = () => {
    setItems([...items, '']);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleItemChange = (index: number, value: string) => {
    const newItems = [...items];
    newItems[index] = value;
    setItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) return;

    setIsSubmitting(true);

    try {
      const filteredItems = items.filter(i => i.trim() !== '');
      
      if (task && onUpdate) {
        // Update existing task
        await onUpdate(task.id, {
          titulo: titulo.trim(),
          descripcion: descripcion.trim() || undefined,
          prioridad,
          asignado_a: asignadoA,
          fecha_vencimiento: fechaVencimiento || undefined,
          proyecto_id: projectId // Include projectId in update if provided (though usually project doesn't change here)
        });
      } else {
        // Create new task
        const payload: CreateTaskPayload = {
          titulo: titulo.trim(),
          descripcion: descripcion.trim() || undefined,
          prioridad,
          asignado_a: asignadoA,
          fecha_vencimiento: fechaVencimiento || undefined,
          contacto_id: contactId,
          cita_id: citaId,
          proyecto_id: projectId, // Include projectId
          items: filteredItems.length > 0 ? filteredItems : undefined
        };

        await onSave(payload);
      }

      // Clear drafts on successful save
      if (!task) {
        clearTituloDraft();
        clearDescDraft();
      }

      onClose();
    } catch (error) {
      logger.error('[TaskModal] Error saving task:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-[#0c0c0e] border border-white/10 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h2 className="text-base font-semibold text-zinc-200">
            {task ? 'Editar Tarea' : 'Nueva Tarea'}
          </h2>
          <div className="flex items-center gap-2">
            {!task && targetContact && (
              <button
                onClick={handleGenerateWithAI}
                disabled={isGenerating}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-indigo-500/10 to-purple-500/10 text-indigo-400 border border-indigo-500/20 hover:border-indigo-500/40 transition-all disabled:opacity-50"
              >
                {isGenerating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                {isGenerating ? 'Generando...' : 'Generar con IA'}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-white/5 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-zinc-500" />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto max-h-[calc(90vh-130px)]">
          {/* Título */}
          <div>
            <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">
              Título *
            </label>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="¿Qué necesitas hacer?"
              className="w-full px-3 py-2.5 bg-zinc-900/50 border border-white/10 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-primary-500/50 transition-colors"
              autoFocus
              required
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">
              Descripción
            </label>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Detalles adicionales..."
              rows={2}
              className="w-full px-3 py-2.5 bg-zinc-900/50 border border-white/10 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-primary-500/50 transition-colors resize-none"
            />
          </div>

          {/* Prioridad y Fecha */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">
                <Flag className="w-3 h-3 inline mr-1" />
                Prioridad
              </label>
              <select
                value={prioridad}
                onChange={(e) => setPrioridad(Number(e.target.value) as TaskPriority)}
                className="w-full px-3 py-2.5 bg-zinc-900/50 border border-white/10 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-primary-500/50 transition-colors cursor-pointer"
              >
                <option value={1}>{TASK_PRIORITY_LABELS[1]}</option>
                <option value={2}>{TASK_PRIORITY_LABELS[2]}</option>
                <option value={3}>{TASK_PRIORITY_LABELS[3]}</option>
                <option value={4}>{TASK_PRIORITY_LABELS[4]}</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">
                <Calendar className="w-3 h-3 inline mr-1" />
                Fecha límite
              </label>
              <input
                type="date"
                value={fechaVencimiento}
                onChange={(e) => setFechaVencimiento(e.target.value)}
                className="w-full px-3 py-2.5 bg-zinc-900/50 border border-white/10 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-primary-500/50 transition-colors"
              />
            </div>
          </div>

          {/* Asignar a */}
          {teamMembers.length > 0 && (
            <div>
              <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">
                <Users className="w-3 h-3 inline mr-1" />
                Asignar a
              </label>
              <select
                value={asignadoA || ''}
                onChange={(e) => setAsignadoA(e.target.value ? Number(e.target.value) : undefined)}
                className="w-full px-3 py-2.5 bg-zinc-900/50 border border-white/10 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-primary-500/50 transition-colors cursor-pointer"
              >
                <option value="">Sin asignar</option>
                {teamMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.nombre} {member.apellido}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Checklist Items */}
          {!task && (
            <div>
              <label className="block text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">
                Checklist
              </label>
              <div className="space-y-2">
                {items.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-zinc-700 flex-shrink-0" />
                    <input
                      type="text"
                      value={item}
                      onChange={(e) => handleItemChange(index, e.target.value)}
                      placeholder={`Item ${index + 1}`}
                      className="flex-1 px-3 py-2 bg-zinc-900/50 border border-white/10 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-primary-500/50 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(index)}
                      disabled={items.length === 1}
                      className="p-1.5 hover:bg-white/5 rounded-lg transition-colors disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4 text-zinc-600" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-primary-400 hover:text-primary-300 hover:bg-primary-500/10 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Agregar item
                </button>
              </div>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-white/5 bg-[#0a0a0c]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!titulo.trim() || isSubmitting}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-500 hover:bg-primary-400 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Guardando...' : (task ? 'Guardar cambios' : 'Crear tarea')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default TaskModal;

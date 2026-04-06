'use client';

import React, { useState } from 'react';
import { X, GraduationCap, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTrainingStore } from '../store/trainingStore';
import { useContactStore, selectSelectedEnterpriseId } from '@/store/contactStore';

// ============================================================================
// DIFFICULTY OPTIONS
// ============================================================================

const DIFFICULTY_OPTIONS = [
  { value: 'principiante', label: 'Principiante', color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
  { value: 'intermedio', label: 'Intermedio', color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
  { value: 'avanzado', label: 'Avanzado', color: 'text-rose-400 border-rose-500/30 bg-rose-500/10' },
] as const;

const CATEGORY_SUGGESTIONS = [
  'Ventas',
  'Producto',
  'Objeciones',
  'Cierre',
  'Prospección',
  'Negociación',
  'CRM',
  'Comunicación',
];

// ============================================================================
// CREATE COURSE MODAL
// ============================================================================

interface CreateCourseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const CreateCourseModal: React.FC<CreateCourseModalProps> = ({ 
  isOpen, 
  onClose,
  onSuccess 
}) => {
  const empresaId = useContactStore(selectSelectedEnterpriseId);
  const createCourse = useTrainingStore(state => state.createCourse);
  const fetchCourses = useTrainingStore(state => state.fetchCourses);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [categoria, setCategoria] = useState('');
  const [dificultad, setDificultad] = useState<'principiante' | 'intermedio' | 'avanzado'>('principiante');
  const [colorTema, setColorTema] = useState('#6366f1'); // primary-500

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!empresaId) {
      setError('No hay empresa seleccionada');
      return;
    }

    if (!titulo.trim()) {
      setError('El título es requerido');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const success = await createCourse({
        empresa_id: empresaId,
        titulo: titulo.trim(),
        descripcion: descripcion.trim() || undefined,
        categoria: categoria.trim() || undefined,
        dificultad,
        color_tema: colorTema,
        is_active: true,
      });

      if (success) {
        // Refresh courses list
        await fetchCourses(empresaId);
        
        // Reset form
        setTitulo('');
        setDescripcion('');
        setCategoria('');
        setDificultad('principiante');
        
        onSuccess?.();
        onClose();
      } else {
        setError('Error al crear el curso. Intenta de nuevo.');
      }
    } catch (err) {
      console.error('[CreateCourseModal] Error:', err);
      setError('Error inesperado al crear el curso');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-500/20 flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Crear Nuevo Curso</h2>
              <p className="text-xs text-zinc-500">Urpe Academy</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Error */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Título */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Título del Curso *
            </label>
            <input
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej: Técnicas de Cierre de Ventas"
              className="w-full px-4 py-2.5 bg-zinc-800/50 border border-white/10 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20 transition-all"
              disabled={isSubmitting}
              autoFocus
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Descripción
            </label>
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Describe qué aprenderán en este curso..."
              rows={3}
              className="w-full px-4 py-2.5 bg-zinc-800/50 border border-white/10 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20 transition-all resize-none"
              disabled={isSubmitting}
            />
          </div>

          {/* Categoría */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Categoría
            </label>
            <input
              type="text"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="Ej: Ventas"
              className="w-full px-4 py-2.5 bg-zinc-800/50 border border-white/10 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20 transition-all"
              disabled={isSubmitting}
            />
            {/* Category suggestions */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {CATEGORY_SUGGESTIONS.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoria(cat)}
                  className={cn(
                    "px-2 py-0.5 text-[10px] rounded-md border transition-all",
                    categoria === cat
                      ? "bg-primary-500/20 border-primary-500/30 text-primary-300"
                      : "bg-zinc-800 border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-white/10"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Dificultad */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Nivel de Dificultad
            </label>
            <div className="flex gap-2">
              {DIFFICULTY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDificultad(opt.value)}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-xl border text-xs font-medium transition-all",
                    dificultad === opt.value
                      ? opt.color
                      : "bg-zinc-800/50 border-white/5 text-zinc-500 hover:border-white/10"
                  )}
                  disabled={isSubmitting}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 rounded-xl border border-white/10 text-zinc-400 hover:text-white hover:bg-white/5 transition-all"
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !titulo.trim()}
              className={cn(
                "flex-1 py-2.5 px-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2",
                isSubmitting || !titulo.trim()
                  ? "bg-zinc-700 text-zinc-500 cursor-not-allowed"
                  : "bg-primary-500 hover:bg-primary-400 text-white"
              )}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Crear Curso
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateCourseModal;

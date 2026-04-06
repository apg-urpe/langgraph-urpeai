'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Save, 
  Eye, 
  Code, 
  Maximize2,
  Minimize2,
  Plus,
  Trash2,
  GripVertical,
  Clock,
  Calendar,
  Zap,
  Sparkles,
  Loader2
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  FunnelStage, 
  FunnelStageDescripcion, 
  FunnelSeguimientoConfig,
  DEFAULT_SEGUIMIENTO_CONFIG,
  DEFAULT_STAGE_DESCRIPCION
} from '../../../types/contact';

type EditorTab = 'basico' | 'instrucciones' | 'json';

interface FunnelStageEditorProps {
  stage: FunnelStage | null;
  isNew?: boolean;
  onClose: () => void;
  onSave: (data: {
    nombre_etapa: string;
    descripcion: FunnelStageDescripcion;
    configuracion_seguimiento: FunnelSeguimientoConfig;
  }) => void;
  canEdit: boolean;
}

const COLORS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#f43f5e', // Rose
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#10b981', // Emerald
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
];

const WEEKDAYS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mié' },
  { value: 4, label: 'Jue' },
  { value: 5, label: 'Vie' },
  { value: 6, label: 'Sáb' },
  { value: 0, label: 'Dom' },
];

export const FunnelStageEditor: React.FC<FunnelStageEditorProps> = ({
  stage,
  isNew = false,
  onClose,
  onSave,
  canEdit
}) => {
  const [activeTab, setActiveTab] = useState<EditorTab>('basico');
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Form state
  const [nombre, setNombre] = useState(stage?.nombre_etapa || '');
  const [descripcion, setDescripcion] = useState<FunnelStageDescripcion>(
    stage?.descripcion || { ...DEFAULT_STAGE_DESCRIPCION }
  );
  const [seguimiento, setSeguimiento] = useState<FunnelSeguimientoConfig>(() => ({
    ...DEFAULT_SEGUIMIENTO_CONFIG,
    ...(stage?.configuracion_seguimiento || {})
  }));
  
  // JSON editor state
  const [jsonDescripcion, setJsonDescripcion] = useState('');
  const [jsonSeguimiento, setJsonSeguimiento] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  
  // AI Parser state
  const [rawInput, setRawInput] = useState('');
  const [isParsingWithAI, setIsParsingWithAI] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  
  // Sync JSON when switching to JSON tab
  useEffect(() => {
    if (activeTab === 'json') {
      setJsonDescripcion(JSON.stringify(descripcion, null, 2));
      setJsonSeguimiento(JSON.stringify(seguimiento, null, 2));
    }
  }, [activeTab, descripcion, seguimiento]);
  
  const hasChanges = useMemo(() => {
    if (isNew) return nombre.trim().length > 0;
    
    const originalDesc = stage?.descripcion || {};
    const originalSeg = stage?.configuracion_seguimiento || {};
    
    return (
      nombre !== stage?.nombre_etapa ||
      JSON.stringify(descripcion) !== JSON.stringify(originalDesc) ||
      JSON.stringify(seguimiento) !== JSON.stringify(originalSeg)
    );
  }, [nombre, descripcion, seguimiento, stage, isNew]);
  
  const handleSave = () => {
    if (!nombre.trim()) return;
    
    // If on JSON tab, parse and apply JSON
    if (activeTab === 'json') {
      try {
        const parsedDesc = JSON.parse(jsonDescripcion);
        const parsedSeg = JSON.parse(jsonSeguimiento);
        onSave({
          nombre_etapa: nombre.trim(),
          descripcion: parsedDesc,
          configuracion_seguimiento: parsedSeg
        });
      } catch (e: any) {
        setJsonError(e.message);
        return;
      }
    } else {
      onSave({
        nombre_etapa: nombre.trim(),
        descripcion,
        configuracion_seguimiento: seguimiento
      });
    }
  };
  
  const handleClose = () => {
    if (hasChanges && canEdit) {
      if (confirm('¿Descartar cambios sin guardar?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };
  
  // AI Parser function
  const handleParseWithAI = async () => {
    if (!rawInput.trim()) {
      setAiError('Ingresa texto para procesar');
      return;
    }
    
    setIsParsingWithAI(true);
    setAiError(null);
    
    try {
      const response = await fetch('/api/funnel/parse-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: rawInput })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error procesando texto');
      }
      
      const result = await response.json();
      
      // Aplicar la descripción parseada
      if (result.descripcion) {
        setDescripcion(prev => ({
          ...prev,
          ...result.descripcion
        }));
        setJsonDescripcion(JSON.stringify(result.descripcion, null, 2));
      }
      
      // Aplicar configuración de seguimiento si existe
      if (result.configuracion_seguimiento) {
        setSeguimiento(prev => ({
          ...prev,
          ...result.configuracion_seguimiento
        }));
        setJsonSeguimiento(JSON.stringify(result.configuracion_seguimiento, null, 2));
      }
      
      // Limpiar el input raw después de procesar
      setRawInput('');
      
    } catch (error: any) {
      console.error('[FunnelStageEditor] AI Parse error:', error);
      setAiError(error.message || 'Error al procesar con IA');
    } finally {
      setIsParsingWithAI(false);
    }
  };
  
  // Helper to update descripcion fields
  const updateDescripcion = <K extends keyof FunnelStageDescripcion>(
    key: K, 
    value: FunnelStageDescripcion[K]
  ) => {
    setDescripcion(prev => ({ ...prev, [key]: value }));
  };
  
  // Helper to update seguimiento fields
  const updateSeguimiento = <K extends keyof FunnelSeguimientoConfig>(
    key: K, 
    value: FunnelSeguimientoConfig[K]
  ) => {
    setSeguimiento(prev => ({ ...prev, [key]: value }));
  };
  
  // Add/remove action
  const addAction = () => {
    updateDescripcion('acciones_agente', [...(descripcion.acciones_agente || []), '']);
  };
  
  const removeAction = (index: number) => {
    updateDescripcion('acciones_agente', 
      (descripcion.acciones_agente || []).filter((_, i) => i !== index)
    );
  };
  
  const updateAction = (index: number, value: string) => {
    const actions = [...(descripcion.acciones_agente || [])];
    actions[index] = value;
    updateDescripcion('acciones_agente', actions);
  };
  
  // Add/remove criterio
  const addCriterio = () => {
    updateDescripcion('criterios_avance', [...(descripcion.criterios_avance || []), '']);
  };
  
  const removeCriterio = (index: number) => {
    updateDescripcion('criterios_avance', 
      (descripcion.criterios_avance || []).filter((_, i) => i !== index)
    );
  };
  
  const updateCriterio = (index: number, value: string) => {
    const criterios = [...(descripcion.criterios_avance || [])];
    criterios[index] = value;
    updateDescripcion('criterios_avance', criterios);
  };
  
  // Add/remove seguimiento step
  const addSeguimientoStep = () => {
    const steps = [...(seguimiento.seguimientos || [])];
    steps.push({
      numero: steps.length + 1,
      horas_espera: 4,
      mensaje_template: 'seguimiento'
    });
    updateSeguimiento('seguimientos', steps);
  };
  
  const removeSeguimientoStep = (index: number) => {
    const steps = (seguimiento.seguimientos || []).filter((_, i) => i !== index);
    // Renumber
    steps.forEach((s, i) => s.numero = i + 1);
    updateSeguimiento('seguimientos', steps);
  };
  
  const updateSeguimientoStep = (index: number, field: string, value: any) => {
    const steps = [...(seguimiento.seguimientos || [])];
    (steps[index] as any)[field] = value;
    updateSeguimiento('seguimientos', steps);
  };
  
  // Toggle weekday
  const toggleWeekday = (day: number) => {
    const baseHorario = seguimiento.horario || DEFAULT_SEGUIMIENTO_CONFIG.horario!;
    const days = [...baseHorario.dias_permitidos];
    const index = days.indexOf(day);
    if (index >= 0) {
      days.splice(index, 1);
    } else {
      days.push(day);
      days.sort((a, b) => a - b);
    }
    updateSeguimiento('horario', { ...baseHorario, dias_permitidos: days });
  };

  const horario = seguimiento.horario || DEFAULT_SEGUIMIENTO_CONFIG.horario!;
  const seguimientoSteps = seguimiento.seguimientos || [];
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div 
        className={`
          bg-[#0a0a0c] border border-white/10 rounded-2xl shadow-2xl flex flex-col
          ${isFullscreen 
            ? 'w-full h-full rounded-none' 
            : 'w-full max-w-4xl h-[90vh] mx-4'
          }
        `}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">
              {isNew ? 'Nueva Etapa' : `Editar: ${stage?.nombre_etapa}`}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Configura el comportamiento del agente IA en esta etapa
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Tabs */}
            <div className="flex items-center bg-zinc-900/50 rounded-lg p-1 mr-2">
              {(['basico', 'instrucciones', 'json'] as EditorTab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`
                    px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all
                    ${activeTab === tab 
                      ? 'bg-primary-500/20 text-primary-400' 
                      : 'text-zinc-500 hover:text-zinc-300'
                    }
                  `}
                >
                  {tab === 'basico' && 'Básico'}
                  {tab === 'instrucciones' && 'Instrucciones'}
                  {tab === 'json' && 'JSON'}
                </button>
              ))}
            </div>
            
            {/* Fullscreen toggle */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 rounded-lg border border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-white/10 transition-all"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            
            {/* Close */}
            <button
              onClick={handleClose}
              className="p-2 rounded-lg border border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-white/10 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6">
          {/* Tab: Básico */}
          {activeTab === 'basico' && (
            <div className="space-y-6">
              {/* Nombre */}
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold block mb-1.5">
                  Nombre de la Etapa *
                </label>
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  disabled={!canEdit}
                  placeholder="Ej: Lead Calificado"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-primary-500/50 outline-none disabled:opacity-60"
                />
              </div>
              
              {/* Color e Icono */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold block mb-1.5">
                    Color
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {COLORS.map(color => (
                      <button
                        key={color}
                        onClick={() => updateDescripcion('color', color)}
                        disabled={!canEdit}
                        className={`
                          w-8 h-8 rounded-lg transition-all
                          ${descripcion.color === color ? 'ring-2 ring-white ring-offset-2 ring-offset-[#0a0a0c]' : ''}
                        `}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
                
                <div>
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold block mb-1.5">
                    Icono (Emoji)
                  </label>
                  <input
                    type="text"
                    value={descripcion.icono || ''}
                    onChange={(e) => updateDescripcion('icono', e.target.value)}
                    disabled={!canEdit}
                    placeholder="📌"
                    maxLength={4}
                    className="w-20 bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-xl text-center focus:border-primary-500/50 outline-none disabled:opacity-60"
                  />
                </div>
              </div>
              
              {/* Qué es */}
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold block mb-1.5">
                  ¿Qué es esta etapa?
                </label>
                <textarea
                  value={descripcion.que_es || ''}
                  onChange={(e) => updateDescripcion('que_es', e.target.value)}
                  disabled={!canEdit}
                  placeholder="Describe brevemente qué significa que un contacto esté en esta etapa..."
                  rows={3}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-primary-500/50 outline-none resize-y disabled:opacity-60"
                />
              </div>
              
              {/* Nota Importante */}
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold block mb-1.5">
                  Nota Importante (opcional)
                </label>
                <textarea
                  value={descripcion.nota_importante || ''}
                  onChange={(e) => updateDescripcion('nota_importante', e.target.value)}
                  disabled={!canEdit}
                  placeholder="Advertencias o notas clave para el equipo..."
                  rows={2}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-primary-500/50 outline-none resize-y disabled:opacity-60"
                />
              </div>
            </div>
          )}
          
          {/* Tab: Instrucciones */}
          {activeTab === 'instrucciones' && (
            <div className="space-y-6">
              {/* Instrucciones del Agente */}
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold block mb-1.5">
                  Instrucciones para el Agente IA
                </label>
                <textarea
                  value={typeof descripcion.instrucciones_agente === 'string' 
                    ? descripcion.instrucciones_agente 
                    : ''
                  }
                  onChange={(e) => updateDescripcion('instrucciones_agente', e.target.value)}
                  disabled={!canEdit}
                  placeholder="Describe cómo debe comportarse el agente cuando un contacto está en esta etapa..."
                  rows={6}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-primary-500/50 outline-none resize-y font-mono disabled:opacity-60"
                />
              </div>
              
              {/* Acciones del Agente */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">
                    Acciones del Agente
                  </label>
                  {canEdit && (
                    <button
                      onClick={addAction}
                      className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary-500/10 text-primary-400 text-[10px] hover:bg-primary-500/20"
                    >
                      <Plus className="w-3 h-3" />
                      Agregar
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {(descripcion.acciones_agente || []).map((action, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <GripVertical className="w-4 h-4 text-zinc-600" />
                      <input
                        type="text"
                        value={action}
                        onChange={(e) => updateAction(index, e.target.value)}
                        disabled={!canEdit}
                        placeholder={`Acción ${index + 1}...`}
                        className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-primary-500/50 outline-none disabled:opacity-60"
                      />
                      {canEdit && (
                        <button
                          onClick={() => removeAction(index)}
                          className="p-2 text-zinc-500 hover:text-red-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {(!descripcion.acciones_agente || descripcion.acciones_agente.length === 0) && (
                    <p className="text-xs text-zinc-600 italic">Sin acciones definidas</p>
                  )}
                </div>
              </div>
              
              {/* Criterios de Avance */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">
                    Criterios de Avance
                  </label>
                  {canEdit && (
                    <button
                      onClick={addCriterio}
                      className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 text-[10px] hover:bg-emerald-500/20"
                    >
                      <Plus className="w-3 h-3" />
                      Agregar
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {(descripcion.criterios_avance || []).map((criterio, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <GripVertical className="w-4 h-4 text-zinc-600" />
                      <input
                        type="text"
                        value={criterio}
                        onChange={(e) => updateCriterio(index, e.target.value)}
                        disabled={!canEdit}
                        placeholder={`Criterio ${index + 1}...`}
                        className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:border-primary-500/50 outline-none disabled:opacity-60"
                      />
                      {canEdit && (
                        <button
                          onClick={() => removeCriterio(index)}
                          className="p-2 text-zinc-500 hover:text-red-400"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  {(!descripcion.criterios_avance || descripcion.criterios_avance.length === 0) && (
                    <p className="text-xs text-zinc-600 italic">Sin criterios definidos</p>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* Tab: JSON */}
          {activeTab === 'json' && (
            <div className="space-y-4">
              {/* AI Parser Section */}
              <div className="p-4 bg-gradient-to-br from-violet-500/10 to-primary-500/10 rounded-xl border border-violet-500/20">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-violet-400" />
                  <label className="text-[10px] text-violet-300 uppercase tracking-wider font-bold">
                    Organizar con IA
                  </label>
                </div>
                <p className="text-xs text-zinc-400 mb-3">
                  Pega cualquier texto (JSON, Markdown, texto plano) y la IA lo organizará automáticamente en el formato de configuración.
                </p>
                <textarea
                  value={rawInput}
                  onChange={(e) => {
                    setRawInput(e.target.value);
                    setAiError(null);
                  }}
                  disabled={!canEdit || isParsingWithAI}
                  placeholder="Pega aquí tu JSON, Markdown o texto plano con las instrucciones de la etapa..."
                  rows={6}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/50 outline-none resize-y disabled:opacity-60 mb-3"
                />
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    {aiError && (
                      <p className="text-xs text-red-400">{aiError}</p>
                    )}
                  </div>
                  <button
                    onClick={handleParseWithAI}
                    disabled={!canEdit || isParsingWithAI || !rawInput.trim()}
                    className={`
                      flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                      ${rawInput.trim() && !isParsingWithAI
                        ? 'bg-violet-500/20 border border-violet-500/30 text-violet-400 hover:bg-violet-500/30'
                        : 'bg-zinc-900/50 border border-white/5 text-zinc-600 cursor-not-allowed'
                      }
                    `}
                  >
                    {isParsingWithAI ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Procesando...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Organizar
                      </>
                    )}
                  </button>
                </div>
              </div>
              
              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-white/5" />
                <span className="text-[10px] text-zinc-600 uppercase tracking-wider">Resultado / Edición Manual</span>
                <div className="flex-1 h-px bg-white/5" />
              </div>
              
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold block mb-1.5">
                  Descripción (JSON)
                </label>
                <textarea
                  value={jsonDescripcion}
                  onChange={(e) => {
                    setJsonDescripcion(e.target.value);
                    setJsonError(null);
                  }}
                  disabled={!canEdit}
                  rows={12}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-zinc-200 font-mono focus:border-primary-500/50 outline-none resize-y disabled:opacity-60"
                />
              </div>
              
              <div>
                <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold block mb-1.5">
                  Configuración de Seguimiento (JSON)
                </label>
                <textarea
                  value={jsonSeguimiento}
                  onChange={(e) => {
                    setJsonSeguimiento(e.target.value);
                    setJsonError(null);
                  }}
                  disabled={!canEdit}
                  rows={8}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-zinc-200 font-mono focus:border-primary-500/50 outline-none resize-y disabled:opacity-60"
                />
              </div>
              
              {jsonError && (
                <p className="text-xs text-red-400">JSON inválido: {jsonError}</p>
              )}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/5">
          <div className="text-xs text-zinc-600">
            {hasChanges && canEdit && (
              <span className="text-amber-400">● Cambios sin guardar</span>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 rounded-lg border border-white/10 text-zinc-400 hover:text-zinc-200 text-sm"
            >
              {hasChanges && canEdit ? 'Descartar' : 'Cerrar'}
            </button>
            
            {canEdit && (
              <button
                onClick={handleSave}
                disabled={!hasChanges || !nombre.trim()}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                  ${hasChanges && nombre.trim()
                    ? 'bg-primary-500/20 border border-primary-500/30 text-primary-400 hover:bg-primary-500/30'
                    : 'bg-zinc-900/50 border border-white/5 text-zinc-600 cursor-not-allowed'
                  }
                `}
              >
                <Save className="w-4 h-4" />
                {isNew ? 'Crear Etapa' : 'Guardar'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

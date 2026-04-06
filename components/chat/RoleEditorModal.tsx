'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Sparkles,
  TrendingUp,
  Headphones,
  Megaphone,
  BarChart3,
  Wand2,
  Save,
  Loader2,
  ChevronDown,
  Check,
  Trash2,
  Plus,
  Users
} from 'lucide-react';
import { useMonicaRolesStore } from '../../store/monicaRolesStore';
import {
  MonicaRole,
  MonicaRoleCategory,
  MonicaRoleColorTheme,
  MonicaToolName,
  ALL_MONICA_TOOLS,
  CreateMonicaRolePayload,
  getRoleColorClasses
} from '../../types/monica';

// =====================================================
// CONSTANTS
// =====================================================

const CATEGORY_OPTIONS: { value: MonicaRoleCategory; label: string; icon: React.ElementType }[] = [
  { value: 'general', label: 'General', icon: Sparkles },
  { value: 'ventas', label: 'Ventas', icon: TrendingUp },
  { value: 'soporte', label: 'Soporte', icon: Headphones },
  { value: 'marketing', label: 'Marketing', icon: Megaphone },
  { value: 'analisis', label: 'Análisis', icon: BarChart3 },
  { value: 'custom', label: 'Personalizado', icon: Wand2 }
];

const COLOR_OPTIONS: MonicaRoleColorTheme[] = [
  'cyan', 'emerald', 'violet', 'amber', 'rose', 'blue', 'indigo', 'pink'
];

const TOOL_LABELS: Record<MonicaToolName, string> = {
  search_crm: 'Buscar en CRM',
  get_contact_360: 'Vista 360°',
  get_contacts: 'Listar Contactos',
  create_note: 'Crear Notas',
  get_portfolio: 'Cartera',
  get_collection_queue: 'Cola de Cobranza',
  register_payment: 'Registrar Pago',
  attach_payment_receipt: 'Adjuntar Comprobante',
  update_service_commitment: 'Ajustar Compromiso',
  get_pipeline: 'Pipeline',
  get_business_metrics: 'Métricas',
  get_conversational_intelligence: 'Inteligencia Conversacional',
  get_appointments: 'Citas',
  update_appointment_status: 'Actualizar Estado de Cita',
  get_tasks: 'Tareas',
  get_projects: 'Proyectos',
  get_team_members: 'Equipo',
  get_funnel_stages: 'Etapas del Embudo',
  get_funnel_stats: 'Embudo',
  update_contact_stage: 'Cambiar Etapa',
  search_emails: 'Buscar Correos',
  get_email_detail: 'Detalle de Correo',
  get_contact_assignments: 'Ver Asignaciones',
  manage_contact_assignments: 'Gestionar Asignaciones',
  search_documentation: 'Documentación',
  create_template_draft: 'Crear Plantilla'
};

// =====================================================
// INTERFACES
// =====================================================

interface RoleEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingRole?: MonicaRole | null;
}

// =====================================================
// COMPONENT
// =====================================================

export const RoleEditorModal: React.FC<RoleEditorModalProps> = ({
  isOpen,
  onClose,
  editingRole
}) => {
  // Store
  const roles = useMonicaRolesStore(state => state.roles);
  const createRole = useMonicaRolesStore(state => state.createRole);
  const updateRole = useMonicaRolesStore(state => state.updateRole);
  const deleteRole = useMonicaRolesStore(state => state.deleteRole);
  const isCreating = useMonicaRolesStore(state => state.isCreating);
  const isUpdating = useMonicaRolesStore(state => state.isUpdating);
  const setActiveRole = useMonicaRolesStore(state => state.setActiveRole);
  const fetchRoles = useMonicaRolesStore(state => state.fetchRoles);

  // Selected role state (for the role selector dropdown)
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [isRoleSelectorOpen, setIsRoleSelectorOpen] = useState(false);

  // Form state
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [categoria, setCategoria] = useState<MonicaRoleCategory>('custom');
  const [colorTheme, setColorTheme] = useState<MonicaRoleColorTheme>('cyan');
  const [toolsEnabled, setToolsEnabled] = useState<MonicaToolName[]>([...ALL_MONICA_TOOLS]);
  const [temperatura, setTemperatura] = useState(0.7);

  // UI state
  const [activeTab, setActiveTab] = useState<'basic' | 'prompt' | 'tools'>('basic');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Get the current role being edited (from selector or prop)
  const currentRole = isCreatingNew 
    ? null 
    : selectedRoleId 
      ? roles.find(r => r.id === selectedRoleId) 
      : editingRole;

  const isEditing = !!currentRole && !isCreatingNew;
  const isSaving = isCreating || isUpdating;

  // Fetch roles on mount
  useEffect(() => {
    if (isOpen) {
      fetchRoles();
    }
  }, [isOpen, fetchRoles]);

  // Initialize selected role when modal opens
  useEffect(() => {
    if (isOpen && editingRole && !selectedRoleId) {
      setSelectedRoleId(editingRole.id);
    }
  }, [isOpen, editingRole, selectedRoleId]);

  // Initialize form when role changes
  useEffect(() => {
    if (currentRole && !isCreatingNew) {
      setNombre(currentRole.nombre);
      setDescripcion(currentRole.descripcion || '');
      setSystemPrompt(currentRole.system_prompt);
      setWelcomeMessage(currentRole.welcome_message || '');
      setCategoria(currentRole.categoria);
      setColorTheme(currentRole.color_theme);
      setToolsEnabled(currentRole.tools_enabled || [...ALL_MONICA_TOOLS]);
      setTemperatura(currentRole.temperatura);
    } else if (isCreatingNew || !currentRole) {
      // Reset for new role
      setNombre('');
      setDescripcion('');
      setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
      setWelcomeMessage('');
      setCategoria('custom');
      setColorTheme('cyan');
      setToolsEnabled([...ALL_MONICA_TOOLS]);
      setTemperatura(0.7);
    }
    setActiveTab('basic');
    setShowDeleteConfirm(false);
  }, [currentRole, isCreatingNew]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsCreatingNew(false);
      setSelectedRoleId(null);
      setIsRoleSelectorOpen(false);
    }
  }, [isOpen]);

  // Handle create new
  const handleCreateNew = () => {
    setIsCreatingNew(true);
    setSelectedRoleId(null);
    setNombre('');
    setDescripcion('');
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT);
    setWelcomeMessage('');
    setCategoria('custom');
    setColorTheme('cyan');
    setToolsEnabled([...ALL_MONICA_TOOLS]);
    setTemperatura(0.7);
    setActiveTab('basic');
  };

  // Handle role selection from dropdown
  const handleSelectRole = (roleId: string) => {
    setSelectedRoleId(roleId);
    setIsCreatingNew(false);
    setIsRoleSelectorOpen(false);
  };

  // Handle save
  const handleSave = async () => {
    if (!nombre.trim() || !systemPrompt.trim()) return;

    if (isEditing && currentRole) {
      const success = await updateRole(currentRole.id, {
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || undefined,
        system_prompt: systemPrompt,
        welcome_message: welcomeMessage.trim() || undefined,
        categoria,
        color_theme: colorTheme,
        tools_enabled: toolsEnabled,
        temperatura
      });
      if (success) onClose();
    } else {
      const payload: CreateMonicaRolePayload = {
        nombre: nombre.trim(),
        descripcion: descripcion.trim() || undefined,
        system_prompt: systemPrompt,
        welcome_message: welcomeMessage.trim() || undefined,
        categoria,
        color_theme: colorTheme,
        tools_enabled: toolsEnabled,
        temperatura
      };
      const newRole = await createRole(payload);
      if (newRole) {
        setActiveRole(newRole.id);
        onClose();
      }
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!currentRole) return;
    const success = await deleteRole(currentRole.id);
    if (success) {
      // Select another role or reset
      const remainingRoles = roles.filter(r => r.id !== currentRole.id);
      if (remainingRoles.length > 0) {
        setSelectedRoleId(remainingRoles[0].id);
      } else {
        setIsCreatingNew(true);
      }
    }
  };

  // Toggle tool
  const toggleTool = (tool: MonicaToolName) => {
    setToolsEnabled(prev =>
      prev.includes(tool)
        ? prev.filter(t => t !== tool)
        : [...prev, tool]
    );
  };

  // Toggle all tools
  const toggleAllTools = () => {
    if (toolsEnabled.length === ALL_MONICA_TOOLS.length) {
      setToolsEnabled([]);
    } else {
      setToolsEnabled([...ALL_MONICA_TOOLS]);
    }
  };

  if (!isOpen) return null;

  const colorClasses = getRoleColorClasses(colorTheme);
  const CategoryIcon = CATEGORY_OPTIONS.find(c => c.value === categoria)?.icon || Sparkles;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center p-4 pt-[10vh] overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-[#0a0a0c] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-pop-in my-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${colorClasses.bg} ${colorClasses.border} border flex items-center justify-center`}>
              <CategoryIcon className={`w-5 h-5 ${colorClasses.text}`} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">
                {isCreatingNew ? 'Crear Nuevo Agente' : 'Gestionar Agentes'}
              </h2>
              <p className="text-xs text-zinc-500">
                {isCreatingNew ? 'Personaliza cómo responde Monica' : 'Edita o crea agentes de Monica AI'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Role Selector Bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-white/[0.02]">
          {/* Role Dropdown */}
          <div className="relative flex-1">
            <button
              onClick={() => setIsRoleSelectorOpen(!isRoleSelectorOpen)}
              className="w-full flex items-center justify-between px-3 py-2 bg-white/5 border border-white/10 rounded-lg hover:border-white/20 transition-all"
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-zinc-500" />
                <span className="text-sm text-zinc-300">
                  {isCreatingNew ? 'Nuevo Agente' : currentRole?.nombre || 'Seleccionar agente...'}
                </span>
              </div>
              <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${isRoleSelectorOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown */}
            {isRoleSelectorOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-[#0a0a0c] border border-white/10 rounded-lg shadow-xl overflow-hidden z-10">
                <div className="max-h-48 overflow-y-auto">
                  {roles.map(role => {
                    const RoleIcon = CATEGORY_OPTIONS.find(c => c.value === role.categoria)?.icon || Sparkles;
                    const isSelected = role.id === selectedRoleId;
                    return (
                      <button
                        key={role.id}
                        onClick={() => handleSelectRole(role.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-all hover:bg-white/5 ${
                          isSelected ? 'bg-primary-500/10 text-primary-400' : 'text-zinc-300'
                        }`}
                      >
                        <RoleIcon className="w-4 h-4" />
                        <span className="text-sm flex-1 truncate">{role.nombre}</span>
                        {role.is_default && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-primary-500/20 text-primary-400 rounded">DEFAULT</span>
                        )}
                        {isSelected && <Check className="w-4 h-4 text-primary-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Create New Button */}
          <button
            onClick={handleCreateNew}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-all ${
              isCreatingNew
                ? 'bg-primary-500 text-white'
                : 'text-primary-400 bg-primary-500/10 hover:bg-primary-500/20'
            }`}
          >
            <Plus className="w-4 h-4" />
            Nuevo
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/5">
          {[
            { id: 'basic', label: 'Básico' },
            { id: 'prompt', label: 'Instrucciones' },
            { id: 'tools', label: 'Herramientas' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'text-primary-400 border-b-2 border-primary-400 bg-primary-500/5'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {/* Tab: Basic */}
          {activeTab === 'basic' && (
            <>
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Nombre del Agente *
                </label>
                <input
                  type="text"
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  placeholder="Ej: Asistente de Ventas"
                  className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Descripción
                </label>
                <input
                  type="text"
                  value={descripcion}
                  onChange={e => setDescripcion(e.target.value)}
                  placeholder="Breve descripción del agente"
                  className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Categoría
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORY_OPTIONS.map(cat => {
                    const Icon = cat.icon;
                    const isSelected = categoria === cat.value;
                    return (
                      <button
                        key={cat.value}
                        onClick={() => setCategoria(cat.value)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                          isSelected
                            ? 'border-primary-500/50 bg-primary-500/10 text-primary-400'
                            : 'border-white/10 bg-white/5 text-zinc-400 hover:border-white/20'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="text-xs font-medium">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Color
                </label>
                <div className="flex gap-2 flex-wrap">
                  {COLOR_OPTIONS.map(color => {
                    const classes = getRoleColorClasses(color);
                    const isSelected = colorTheme === color;
                    return (
                      <button
                        key={color}
                        onClick={() => setColorTheme(color)}
                        className={`w-8 h-8 rounded-lg ${classes.bg} border-2 transition-all flex items-center justify-center ${
                          isSelected ? `${classes.border} scale-110` : 'border-transparent'
                        }`}
                      >
                        {isSelected && <Check className={`w-4 h-4 ${classes.text}`} />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Temperature */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Creatividad: {temperatura.toFixed(1)}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={temperatura}
                  onChange={e => setTemperatura(parseFloat(e.target.value))}
                  className="w-full accent-primary-500"
                />
                <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
                  <span>Preciso</span>
                  <span>Creativo</span>
                </div>
              </div>
            </>
          )}

          {/* Tab: Prompt */}
          {activeTab === 'prompt' && (
            <>
              {/* System Prompt */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Instrucciones del Sistema *
                </label>
                <p className="text-[10px] text-zinc-600 mb-2">
                  Define cómo debe comportarse el agente. Incluye su personalidad, conocimientos y restricciones.
                </p>
                <textarea
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  placeholder="Eres un asistente especializado en..."
                  rows={12}
                  className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20 resize-none font-mono"
                />
              </div>

              {/* Welcome Message */}
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Mensaje de Bienvenida
                </label>
                <input
                  type="text"
                  value={welcomeMessage}
                  onChange={e => setWelcomeMessage(e.target.value)}
                  placeholder="¡Hola! Soy tu asistente de..."
                  className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/20"
                />
              </div>
            </>
          )}

          {/* Tab: Tools */}
          {activeTab === 'tools' && (
            <>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-zinc-500">
                  Selecciona las herramientas que puede usar el agente
                </p>
                <button
                  onClick={toggleAllTools}
                  className="text-xs text-primary-400 hover:text-primary-300"
                >
                  {toolsEnabled.length === ALL_MONICA_TOOLS.length ? 'Desmarcar todas' : 'Marcar todas'}
                </button>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ALL_MONICA_TOOLS.map(tool => {
                  const isEnabled = toolsEnabled.includes(tool);
                  return (
                    <button
                      key={tool}
                      onClick={() => toggleTool(tool)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left ${
                        isEnabled
                          ? 'border-primary-500/30 bg-primary-500/10 text-zinc-200'
                          : 'border-white/10 bg-white/5 text-zinc-500 hover:border-white/20'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                        isEnabled ? 'bg-primary-500 border-primary-500' : 'border-zinc-600'
                      }`}>
                        {isEnabled && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span className="text-xs font-medium">{TOOL_LABELS[tool]}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-white/5 bg-white/[0.02]">
          {/* Delete (only for editing non-default roles) */}
          <div>
            {isEditing && !currentRole?.is_default && (
              showDeleteConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">¿Eliminar?</span>
                  <button
                    onClick={handleDelete}
                    className="px-3 py-1.5 text-xs font-medium text-rose-400 bg-rose-500/10 rounded-lg hover:bg-rose-500/20"
                  >
                    Sí, eliminar
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-300"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-rose-400 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                  Eliminar
                </button>
              )
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={!nombre.trim() || !systemPrompt.trim() || isSaving}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isEditing ? 'Guardar Cambios' : 'Crear Agente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Use portal to render outside of parent container
  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};

// =====================================================
// DEFAULT PROMPT
// =====================================================

const DEFAULT_SYSTEM_PROMPT = `Eres un asistente IA especializado.

## Tu Rol
- Define aquí la personalidad y rol del agente
- Describe su área de expertise

## Instrucciones
- Lista las instrucciones específicas
- Define cómo debe responder

## Restricciones
- Define qué NO debe hacer
- Límites de su comportamiento`;

export default RoleEditorModal;

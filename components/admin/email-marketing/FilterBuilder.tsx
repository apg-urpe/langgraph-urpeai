'use client';

import React, { useEffect, useState } from 'react';
import { 
  Plus, 
  Trash2, 
  Filter,
  Calendar,
  User,
  Tag,
  MessageSquare,
  Database,
  Loader2,
  Wallet,
  CalendarCheck,
  Users
} from 'lucide-react';
import { supabase } from '../../../lib/supabase-client';
import { 
  useEmailMarketingStore, 
  FilterCondition, 
  AudienceFilters,
  FilterField,
  FilterOperator,
  selectIsLoadingPreview
} from '../../../store/emailMarketingStore';
import { useContactStore } from '../../../store/contactStore';

interface FilterBuilderProps {
  filters: AudienceFilters;
  onChange: (filters: AudienceFilters) => void;
  previewCount: number | null;
}

// Filter field options with metadata
const FIELD_OPTIONS: { value: FilterField; label: string; icon: React.ElementType; operators: FilterOperator[] }[] = [
  { 
    value: 'created_at', 
    label: 'Fecha de creación', 
    icon: Calendar,
    operators: ['gt', 'lt', 'gte', 'lte']
  },
  { 
    value: 'ultima_interaccion', 
    label: 'Última interacción', 
    icon: MessageSquare,
    operators: ['gt', 'lt', 'gte', 'lte', 'is_null', 'is_not_null']
  },
  { 
    value: 'estado', 
    label: 'Estado', 
    icon: Tag,
    operators: ['eq', 'neq']
  },
  { 
    value: 'etapa_embudo', 
    label: 'Etapa del embudo', 
    icon: Filter,
    operators: ['eq', 'neq', 'is_null']
  },
  { 
    value: 'es_calificado', 
    label: 'Es calificado', 
    icon: User,
    operators: ['eq', 'neq']
  },
  { 
    value: 'origen', 
    label: 'Origen', 
    icon: Tag,
    operators: ['eq', 'neq', 'contains']
  },
  { 
    value: 'team_humano_id', 
    label: 'Asesor asignado', 
    icon: User,
    operators: ['eq', 'neq', 'is_null', 'is_not_null']
  },
  { 
    value: 'metadata', 
    label: 'Metadata (tags)', 
    icon: Database,
    operators: ['contains']
  },
  { 
    value: 'appointment_status', 
    label: 'Estado de Cita', 
    icon: CalendarCheck,
    operators: ['eq']
  },
  { 
    value: 'portfolio_status', 
    label: 'Estado de Cartera', 
    icon: Wallet,
    operators: ['eq']
  },
  { 
    value: 'last_payment_date', 
    label: 'Fecha de último pago', 
    icon: Calendar,
    operators: ['eq', 'gt', 'lt', 'gte', 'lte']
  },
  { 
    value: 'total_paid', 
    label: 'Total Pagado', 
    icon: Wallet,
    operators: ['eq', 'gt', 'lt', 'gte', 'lte']
  },
  { 
    value: 'total_pending', 
    label: 'Saldo Pendiente', 
    icon: Wallet,
    operators: ['eq', 'gt', 'lt', 'gte', 'lte']
  },
  { 
    value: 'service_type', 
    label: 'Tipo de Servicio', 
    icon: Database,
    operators: ['eq', 'neq']
  },
];

const OPERATOR_LABELS: Record<FilterOperator, string> = {
  'eq': 'es igual a',
  'neq': 'no es igual a',
  'gt': 'es después de',
  'lt': 'es antes de',
  'gte': 'es igual o después de',
  'lte': 'es igual o antes de',
  'contains': 'contiene',
  'is_null': 'está vacío',
  'is_not_null': 'no está vacío',
};

// Estado options (sin 'calificado' - usar campo es_calificado para eso)
const ESTADO_OPTIONS = ['prospecto', 'cliente', 'perdido', 'inactivo'];
const CALIFICADO_OPTIONS = [
  { value: 'si', label: 'Sí' },
  { value: 'no', label: 'No' },
  { value: 'evaluando', label: 'Evaluando' },
];

const APPOINTMENT_STATUS_OPTIONS = [
  { value: 'realizadas', label: 'Con Citas Completadas' },
  { value: 'programadas', label: 'Con Citas Programadas' },
  { value: 'confirmadas', label: 'Con Citas Confirmadas' },
  { value: 'canceladas', label: 'Con Citas Canceladas' },
  { value: 'sin_cita', label: 'Sin Ninguna Cita' },
];

const PORTFOLIO_STATUS_OPTIONS = [
  { value: 'con_deuda', label: 'Con Saldo Pendiente' },
  { value: 'al_dia', label: 'Al Día (Pagado)' },
  { value: 'sin_servicios', label: 'Sin Servicios' },
];

export const FilterBuilder: React.FC<FilterBuilderProps> = ({
  filters,
  onChange,
  previewCount
}) => {
  const isLoadingPreview = useEmailMarketingStore(selectIsLoadingPreview);
  const previewAudienceCount = useEmailMarketingStore(state => state.previewAudienceCount);
  const selectedEnterpriseId = useContactStore(state => state.selectedEnterpriseId);
  const teamMembers = useContactStore(state => state.teamMembers);
  const funnelStages = useContactStore(state => state.funnelStages);
  const fetchFunnelStages = useContactStore(state => state.fetchFunnelStages);
  const fetchTeamMembers = useContactStore(state => state.fetchTeamMembers);
  
  // Estado para orígenes dinámicos
  const [availableOrigins, setAvailableOrigins] = useState<string[]>([]);
  
  // Asegurar que funnelStages y teamMembers estén cargados
  useEffect(() => {
    if (!selectedEnterpriseId) return;
    if (funnelStages.length === 0) fetchFunnelStages();
    if (teamMembers.length === 0) fetchTeamMembers();
  }, [selectedEnterpriseId, funnelStages.length, teamMembers.length, fetchFunnelStages, fetchTeamMembers]);
  
  // Cargar orígenes únicos de la empresa
  useEffect(() => {
    if (!selectedEnterpriseId) return;
    
    const fetchOrigins = async () => {
      const { data } = await supabase
        .from('wp_contactos')
        .select('origen')
        .eq('empresa_id', selectedEnterpriseId)
        .not('origen', 'is', null);
      
      if (data) {
        const uniqueOrigins = Array.from(new Set(data.map(c => c.origen).filter(Boolean))) as string[];
        setAvailableOrigins(uniqueOrigins.sort());
      }
    };
    
    fetchOrigins();
  }, [selectedEnterpriseId]);

  // Debounced preview
  useEffect(() => {
    if (!selectedEnterpriseId || filters.conditions.length === 0) return;

    const timer = setTimeout(() => {
      previewAudienceCount(selectedEnterpriseId, filters);
    }, 500);

    return () => clearTimeout(timer);
  }, [filters, selectedEnterpriseId, previewAudienceCount]);

  const generateId = () => `filter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const addCondition = () => {
    const newCondition: FilterCondition = {
      id: generateId(),
      field: 'created_at',
      operator: 'gte',
      value: new Date().toISOString().split('T')[0]
    };
    
    onChange({
      ...filters,
      conditions: [...filters.conditions, newCondition]
    });
  };

  const updateCondition = (id: string, updates: Partial<FilterCondition>) => {
    onChange({
      ...filters,
      conditions: filters.conditions.map(c => 
        c.id === id ? { ...c, ...updates } : c
      )
    });
  };

  const removeCondition = (id: string) => {
    onChange({
      ...filters,
      conditions: filters.conditions.filter(c => c.id !== id)
    });
  };

  const getFieldConfig = (field: FilterField) => 
    FIELD_OPTIONS.find(f => f.value === field);

  const renderValueInput = (condition: FilterCondition) => {
    const { field, operator, value } = condition;

    // Operators that don't need a value
    if (operator === 'is_null' || operator === 'is_not_null') {
      return null;
    }

    // Date fields
    if (field === 'created_at' || field === 'ultima_interaccion') {
      return (
        <input
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
          className="flex-1 px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                     text-zinc-100 focus:outline-none focus:border-violet-500/50"
        />
      );
    }

    // Estado dropdown
    if (field === 'estado') {
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
          className="flex-1 px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                     text-zinc-100 focus:outline-none focus:border-violet-500/50"
        >
          <option value="">Seleccionar...</option>
          {ESTADO_OPTIONS.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }

    // Es calificado dropdown
    if (field === 'es_calificado') {
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
          className="flex-1 px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                     text-zinc-100 focus:outline-none focus:border-violet-500/50"
        >
          <option value="">Seleccionar...</option>
          {CALIFICADO_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    }

    // Origen dropdown (dinámico desde BD)
    if (field === 'origen' && operator !== 'contains') {
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => updateCondition(condition.id, { value: e.target.value || null })}
          className="flex-1 px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                     text-zinc-100 focus:outline-none focus:border-violet-500/50"
        >
          <option value="">Seleccionar origen...</option>
          {availableOrigins.map(orig => (
            <option key={orig} value={orig}>{orig}</option>
          ))}
        </select>
      );
    }

    // Team member dropdown
    if (field === 'team_humano_id') {
      return (
        <select
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => updateCondition(condition.id, { value: parseInt(e.target.value) || null })}
          className="flex-1 px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                     text-zinc-100 focus:outline-none focus:border-violet-500/50"
        >
          <option value="">Seleccionar...</option>
          {teamMembers.filter(m => m.is_active).map(member => (
            <option key={member.id} value={member.id}>
              {member.nombre} {member.apellido}
            </option>
          ))}
        </select>
      );
    }

    // Appointment status dropdown
    if (field === 'appointment_status') {
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
          className="flex-1 px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                     text-zinc-100 focus:outline-none focus:border-violet-500/50"
        >
          <option value="">Seleccionar...</option>
          {APPOINTMENT_STATUS_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    }

    // Portfolio status dropdown
    if (field === 'portfolio_status') {
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
          className="flex-1 px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                     text-zinc-100 focus:outline-none focus:border-violet-500/50"
        >
          <option value="">Seleccionar...</option>
          {PORTFOLIO_STATUS_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    }

    // Last payment date
    if (field === 'last_payment_date') {
      return (
        <input
          type="date"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
          className="flex-1 px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                     text-zinc-100 focus:outline-none focus:border-violet-500/50"
        />
      );
    }

    // Finance metrics (numbers)
    if (field === 'total_paid' || field === 'total_pending') {
      return (
        <input
          type="number"
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => updateCondition(condition.id, { value: parseFloat(e.target.value) || 0 })}
          placeholder="0.00"
          className="flex-1 px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                     text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500/50"
        />
      );
    }

    // Service type dropdown
    if (field === 'service_type') {
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
          className="flex-1 px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                     text-zinc-100 focus:outline-none focus:border-violet-500/50"
        >
          <option value="">Seleccionar...</option>
          <option value="consultoria">Consultoría</option>
          <option value="suscripcion">Suscripción</option>
          <option value="implementacion">Implementación</option>
          <option value="desarrollo">Desarrollo</option>
          <option value="soporte">Soporte</option>
          <option value="general">General</option>
        </select>
      );
    }

    // Etapa del embudo dropdown
    if (field === 'etapa_embudo') {
      return (
        <select
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => updateCondition(condition.id, { value: parseInt(e.target.value) || null })}
          className="flex-1 px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                     text-zinc-100 focus:outline-none focus:border-violet-500/50"
        >
          <option value="">Seleccionar etapa...</option>
          {funnelStages
            .slice()
            .sort((a, b) => a.orden_etapa - b.orden_etapa)
            .map(stage => (
              <option key={stage.id} value={stage.id}>
                {stage.nombre_etapa}
              </option>
            ))}
        </select>
      );
    }

    // Default text input
    return (
      <input
        type="text"
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => updateCondition(condition.id, { value: e.target.value })}
        placeholder="Valor..."
        className="flex-1 px-3 py-2 text-sm bg-zinc-800/50 border border-white/10 rounded-lg
                   text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-violet-500/50"
      />
    );
  };

  return (
    <div className="space-y-4">
      {/* Add condition button */}
      {filters.conditions.length === 0 && (
        <button
          onClick={addCondition}
          className="w-full p-4 border-2 border-dashed border-white/10 rounded-lg
                     text-zinc-400 hover:text-zinc-200 hover:border-violet-500/30
                     transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Añadir condición
        </button>
      )}

      {/* Conditions list */}
      <div className="space-y-3">
        {filters.conditions.map((condition, index) => {
          const fieldConfig = getFieldConfig(condition.field);
          const Icon = fieldConfig?.icon || Filter;
          
          return (
            <div key={condition.id} className="space-y-2">
              {index > 0 && (
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <div className="flex-1 h-px bg-white/5" />
                  <span className="px-2 py-0.5 bg-violet-500/10 text-violet-400 rounded">Y</span>
                  <div className="flex-1 h-px bg-white/5" />
                </div>
              )}
              
              <div className="bg-zinc-800/30 border border-white/5 rounded-lg p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Field selector */}
                  <div className="flex items-center gap-2 min-w-[180px]">
                    <Icon className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                    <select
                      value={condition.field}
                      onChange={(e) => {
                        const newField = e.target.value as FilterField;
                        const newFieldConfig = FIELD_OPTIONS.find(f => f.value === newField);
                        updateCondition(condition.id, { 
                          field: newField,
                          operator: newFieldConfig?.operators[0] || 'eq',
                          value: null
                        });
                      }}
                      className="flex-1 px-2 py-1.5 text-sm bg-zinc-800/50 border border-white/10 rounded
                                 text-zinc-100 focus:outline-none focus:border-violet-500/50"
                    >
                      {FIELD_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Operator selector */}
                  <select
                    value={condition.operator}
                    onChange={(e) => updateCondition(condition.id, { operator: e.target.value as FilterOperator })}
                    className="px-2 py-1.5 text-sm bg-zinc-800/50 border border-white/10 rounded
                               text-zinc-100 focus:outline-none focus:border-violet-500/50 min-w-[140px]"
                  >
                    {fieldConfig?.operators.map(op => (
                      <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
                    ))}
                  </select>

                  {/* Value input */}
                  {renderValueInput(condition)}

                  {/* Delete button */}
                  <button
                    onClick={() => removeCondition(condition.id)}
                    className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add more button */}
      {filters.conditions.length > 0 && (
        <button
          onClick={addCondition}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                     text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Añadir otra condición
        </button>
      )}

      {/* Preview */}
      {filters.conditions.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
            <Users className="w-4 h-4 text-cyan-400" />
            <span className="text-sm text-cyan-300">
              Vista previa:
            </span>
            {isLoadingPreview ? (
              <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
            ) : (
              <span className="font-medium text-cyan-100">
                {previewCount !== null ? `${previewCount} contactos` : '—'}
              </span>
            )}
            <span className="text-xs text-cyan-400/60">coinciden</span>
          </div>
          <p className="text-[10px] text-zinc-500 px-1">
            Solo contactos con email, activos y suscritos.
          </p>
        </div>
      )}
    </div>
  );
};

export default FilterBuilder;

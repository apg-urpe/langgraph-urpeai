'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { 
  Plus, Trash2, Check, X, GripVertical, 
  Type, Hash, ToggleLeft, Calendar, Link2, 
  List, ChevronDown, ChevronRight, Pencil
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

export type PropertyType = 'text' | 'number' | 'boolean' | 'date' | 'url' | 'array' | 'object';

export interface PropertyValue {
  key: string;
  value: any;
  type: PropertyType;
}

interface PropertyViewerProps {
  data: Record<string, any> | any[];
  compact?: boolean;
}

interface PropertyEditorProps {
  initialData: Record<string, any>;
  onChange: (data: Record<string, any>) => void;
  onCancel?: () => void;
  onSave?: () => void;
}

interface PropertyRowProps {
  propKey: string;
  value: any;
  type: PropertyType;
  isEditing?: boolean;
  onChange?: (key: string, value: any) => void;
  onDelete?: (key: string) => void;
  onKeyChange?: (oldKey: string, newKey: string) => void;
  depth?: number;
  compact?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

const detectType = (value: any): PropertyType => {
  if (value === null || value === undefined) return 'text';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'string') {
    // Check for URL
    if (/^https?:\/\//.test(value)) return 'url';
    // Check for ISO date
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'date';
  }
  return 'text';
};

const getTypeIcon = (type: PropertyType) => {
  switch (type) {
    case 'text': return Type;
    case 'number': return Hash;
    case 'boolean': return ToggleLeft;
    case 'date': return Calendar;
    case 'url': return Link2;
    case 'array': return List;
    case 'object': return ChevronRight;
    default: return Type;
  }
};

const formatDisplayValue = (value: any, type: PropertyType): string => {
  if (value === null || value === undefined) return '—';
  
  switch (type) {
    case 'boolean':
      return value ? 'Sí' : 'No';
    case 'date':
      try {
        return new Date(value).toLocaleDateString('es-ES', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        });
      } catch {
        return String(value);
      }
    case 'array':
      return `${value.length} elementos`;
    case 'object':
      return `${Object.keys(value).length} propiedades`;
    case 'number':
      return typeof value === 'number' ? value.toLocaleString('es-ES') : String(value);
    default:
      return String(value);
  }
};

const formatKeyDisplay = (key: string): string => {
  // Convert camelCase or snake_case to Title Case
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
};

// ============================================================================
// PROPERTY ROW (READ-ONLY)
// ============================================================================

const PropertyRow: React.FC<PropertyRowProps> = ({
  propKey,
  value,
  type,
  depth = 0,
  compact = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(depth < 1);
  const TypeIcon = getTypeIcon(type);
  const isExpandable = type === 'object' || type === 'array';

  const renderValue = () => {
    if (type === 'url') {
      return (
        <a 
          href={value} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-primary-400 hover:text-primary-300 underline underline-offset-2 truncate max-w-[200px] inline-block"
        >
          {value}
        </a>
      );
    }
    
    if (type === 'boolean') {
      return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
          value 
            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
            : 'bg-zinc-700/50 text-zinc-400 border border-zinc-600/50'
        }`}>
          {value ? 'Sí' : 'No'}
        </span>
      );
    }
    
    if (isExpandable) {
      return (
        <span className="text-zinc-500 text-xs">
          {formatDisplayValue(value, type)}
        </span>
      );
    }
    
    return (
      <span className="text-zinc-200">
        {formatDisplayValue(value, type)}
      </span>
    );
  };

  return (
    <div className={`${depth > 0 ? 'ml-4 pl-3 border-l border-zinc-700/50' : ''}`}>
      <div 
        className={`
          flex items-center gap-2 py-1.5 px-2 rounded-md group
          ${isExpandable ? 'cursor-pointer hover:bg-white/5' : ''}
          ${compact ? 'py-1' : 'py-1.5'}
        `}
        onClick={() => isExpandable && setIsExpanded(!isExpanded)}
      >
        {/* Expand/Collapse for nested */}
        {isExpandable ? (
          <button className="p-0.5 text-zinc-500 hover:text-zinc-300 transition-colors">
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
        ) : (
          <span className="w-4.5" />
        )}
        
        {/* Type Icon */}
        <TypeIcon className={`w-3.5 h-3.5 text-zinc-500 shrink-0 ${compact ? 'hidden' : ''}`} />
        
        {/* Key */}
        <span className={`text-zinc-400 font-medium shrink-0 ${compact ? 'text-xs' : 'text-sm'}`}>
          {formatKeyDisplay(propKey)}
        </span>
        
        {/* Separator */}
        <span className="text-zinc-600 mx-1">·</span>
        
        {/* Value */}
        <div className={`flex-1 truncate ${compact ? 'text-xs' : 'text-sm'}`}>
          {renderValue()}
        </div>
      </div>

      {/* Nested Content */}
      {isExpandable && isExpanded && (
        <div className="mt-1">
          {type === 'array' ? (
            (value as any[]).map((item, idx) => {
              const itemType = detectType(item);
              return (
                <PropertyRow
                  key={idx}
                  propKey={`[${idx}]`}
                  value={item}
                  type={itemType}
                  depth={depth + 1}
                  compact={compact}
                />
              );
            })
          ) : (
            Object.entries(value).map(([k, v]) => (
              <PropertyRow
                key={k}
                propKey={k}
                value={v}
                type={detectType(v)}
                depth={depth + 1}
                compact={compact}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// PROPERTY VIEWER (READ-ONLY)
// ============================================================================

export const PropertyViewer: React.FC<PropertyViewerProps> = ({ data, compact = false }) => {
  const entries = useMemo(() => {
    // Defensive: handle null, undefined, and non-object values
    if (data === null || data === undefined) return [];
    
    if (Array.isArray(data)) {
      return data.map((item, idx) => ({
        key: `[${idx}]`,
        value: item,
        type: detectType(item)
      }));
    }
    if (typeof data !== 'object') return [];
    
    try {
      return Object.entries(data).map(([key, value]) => ({
        key,
        value,
        type: detectType(value)
      }));
    } catch {
      // In case Object.entries fails for some reason
      return [];
    }
  }, [data]);

  if (entries.length === 0) {
    return (
      <div className="text-zinc-500 text-xs italic py-2 px-3 bg-zinc-900/30 rounded-lg border border-white/5">
        Sin propiedades
      </div>
    );
  }

  return (
    <div className={`
      bg-zinc-900/30 border border-white/5 rounded-lg overflow-hidden
      ${compact ? 'p-1' : 'p-1.5'}
    `}>
      <div className="space-y-0.5">
        {entries.map((entry) => (
          <PropertyRow
            key={entry.key}
            propKey={entry.key}
            value={entry.value}
            type={entry.type}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// EDITABLE PROPERTY ROW
// ============================================================================

interface EditablePropertyRowProps {
  propKey: string;
  value: any;
  type: PropertyType;
  onChange: (key: string, value: any) => void;
  onDelete: (key: string) => void;
  onKeyChange: (oldKey: string, newKey: string) => void;
}

const EditablePropertyRow: React.FC<EditablePropertyRowProps> = ({
  propKey,
  value,
  type,
  onChange,
  onDelete,
  onKeyChange,
}) => {
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [editedKey, setEditedKey] = useState(propKey);
  const [isExpanded, setIsExpanded] = useState(true);
  const TypeIcon = getTypeIcon(type);
  const isExpandable = type === 'object' || type === 'array';

  const handleKeySubmit = () => {
    if (editedKey.trim() && editedKey !== propKey) {
      onKeyChange(propKey, editedKey.trim());
    }
    setIsEditingKey(false);
  };

  const renderEditor = () => {
    switch (type) {
      case 'boolean':
        return (
          <button
            onClick={() => onChange(propKey, !value)}
            className={`
              inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all
              ${value 
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25' 
                : 'bg-zinc-800 text-zinc-400 border border-zinc-600 hover:bg-zinc-700'
              }
            `}
          >
            <ToggleLeft className={`w-3.5 h-3.5 ${value ? 'text-emerald-400' : ''}`} />
            {value ? 'Sí' : 'No'}
          </button>
        );
      
      case 'number':
        return (
          <input
            type="number"
            value={value ?? ''}
            onChange={(e) => onChange(propKey, e.target.value ? Number(e.target.value) : null)}
            className="flex-1 bg-zinc-800/50 border border-zinc-700 rounded-md px-2.5 py-1 text-sm text-zinc-200 focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/50"
          />
        );
      
      case 'date':
        return (
          <input
            type="date"
            value={value ? value.split('T')[0] : ''}
            onChange={(e) => onChange(propKey, e.target.value)}
            className="flex-1 bg-zinc-800/50 border border-zinc-700 rounded-md px-2.5 py-1 text-sm text-zinc-200 focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/50"
          />
        );
      
      case 'url':
        return (
          <input
            type="url"
            value={value ?? ''}
            onChange={(e) => onChange(propKey, e.target.value)}
            placeholder="https://..."
            className="flex-1 bg-zinc-800/50 border border-zinc-700 rounded-md px-2.5 py-1 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/50"
          />
        );
      
      case 'array':
      case 'object':
        return (
          <span className="text-zinc-500 text-xs">
            {formatDisplayValue(value, type)}
          </span>
        );
      
      default:
        return (
          <input
            type="text"
            value={value ?? ''}
            onChange={(e) => onChange(propKey, e.target.value)}
            className="flex-1 bg-zinc-800/50 border border-zinc-700 rounded-md px-2.5 py-1 text-sm text-zinc-200 focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/50"
          />
        );
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 py-1.5 px-2 rounded-md group hover:bg-white/5 transition-colors">
        {/* Drag Handle */}
        <GripVertical className="w-3.5 h-3.5 text-zinc-600 opacity-0 group-hover:opacity-100 cursor-grab shrink-0" />
        
        {/* Expand/Collapse for nested */}
        {isExpandable ? (
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-0.5 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
        ) : (
          <span className="w-4.5" />
        )}
        
        {/* Type Icon */}
        <TypeIcon className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        
        {/* Key (Editable) */}
        {isEditingKey ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={editedKey}
              onChange={(e) => setEditedKey(e.target.value)}
              onBlur={handleKeySubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleKeySubmit();
                if (e.key === 'Escape') {
                  setEditedKey(propKey);
                  setIsEditingKey(false);
                }
              }}
              className="w-32 bg-zinc-800 border border-primary-500/50 rounded px-1.5 py-0.5 text-sm text-zinc-200 focus:outline-none"
              autoFocus
            />
          </div>
        ) : (
          <button
            onClick={() => setIsEditingKey(true)}
            className="text-zinc-400 font-medium text-sm hover:text-zinc-200 transition-colors flex items-center gap-1 group/key"
          >
            {formatKeyDisplay(propKey)}
            <Pencil className="w-2.5 h-2.5 opacity-0 group-hover/key:opacity-100" />
          </button>
        )}
        
        {/* Separator */}
        <span className="text-zinc-600">·</span>
        
        {/* Value Editor */}
        <div className="flex-1">
          {renderEditor()}
        </div>
        
        {/* Delete Button */}
        <button
          onClick={() => onDelete(propKey)}
          className="p-1 text-zinc-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-all opacity-0 group-hover:opacity-100"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Nested Content (for objects/arrays) */}
      {isExpandable && isExpanded && (
        <div className="ml-8 mt-1 pl-3 border-l border-zinc-700/50">
          {type === 'array' ? (
            (value as any[]).map((item, idx) => (
              <EditablePropertyRow
                key={idx}
                propKey={`${idx}`}
                value={item}
                type={detectType(item)}
                onChange={(_, newValue) => {
                  const newArr = [...value];
                  newArr[idx] = newValue;
                  onChange(propKey, newArr);
                }}
                onDelete={() => {
                  const newArr = value.filter((_: any, i: number) => i !== idx);
                  onChange(propKey, newArr);
                }}
                onKeyChange={() => {}}
              />
            ))
          ) : (
            Object.entries(value).map(([k, v]) => (
              <EditablePropertyRow
                key={k}
                propKey={k}
                value={v}
                type={detectType(v)}
                onChange={(innerKey, newValue) => {
                  onChange(propKey, { ...value, [innerKey]: newValue });
                }}
                onDelete={(innerKey) => {
                  const { [innerKey]: _, ...rest } = value;
                  onChange(propKey, rest);
                }}
                onKeyChange={(oldKey, newKey) => {
                  const { [oldKey]: val, ...rest } = value;
                  onChange(propKey, { ...rest, [newKey]: val });
                }}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// PROPERTY EDITOR (EDITABLE)
// ============================================================================

export const PropertyEditor: React.FC<PropertyEditorProps> = ({
  initialData,
  onChange,
  onCancel,
  onSave,
}) => {
  const [data, setData] = useState<Record<string, any>>(initialData);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newType, setNewType] = useState<PropertyType>('text');

  const handleChange = useCallback((key: string, value: any) => {
    setData(prev => {
      const updated = { ...prev, [key]: value };
      onChange(updated);
      return updated;
    });
  }, [onChange]);

  const handleDelete = useCallback((key: string) => {
    setData(prev => {
      const { [key]: _, ...rest } = prev;
      onChange(rest);
      return rest;
    });
  }, [onChange]);

  const handleKeyChange = useCallback((oldKey: string, newKey: string) => {
    setData(prev => {
      const { [oldKey]: value, ...rest } = prev;
      const updated = { ...rest, [newKey]: value };
      onChange(updated);
      return updated;
    });
  }, [onChange]);

  const handleAddProperty = () => {
    if (!newKey.trim()) return;
    
    let defaultValue: any;
    switch (newType) {
      case 'boolean': defaultValue = false; break;
      case 'number': defaultValue = 0; break;
      case 'array': defaultValue = []; break;
      case 'object': defaultValue = {}; break;
      case 'date': defaultValue = new Date().toISOString().split('T')[0]; break;
      default: defaultValue = '';
    }
    
    handleChange(newKey.trim(), defaultValue);
    setNewKey('');
    setNewType('text');
    setIsAddingNew(false);
  };

  const entries = Object.entries(data);

  return (
    <div className="bg-zinc-900/40 border border-white/5 rounded-xl overflow-hidden">
      {/* Properties List */}
      <div className="p-1.5 space-y-0.5">
        {entries.length === 0 && !isAddingNew ? (
          <div className="text-center py-8 text-zinc-500 text-xs">
            No hay propiedades.
          </div>
        ) : (
          entries.map(([key, value]) => (
            <EditablePropertyRow
              key={key}
              propKey={key}
              value={value}
              type={detectType(value)}
              onChange={handleChange}
              onDelete={handleDelete}
              onKeyChange={handleKeyChange}
            />
          ))
        )}

        {/* Add New Property */}
        {isAddingNew ? (
          <div className="flex items-center gap-2 py-2 px-2 bg-zinc-800/30 rounded-lg mt-1 border border-white/5">
            <input
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="Nombre..."
              className="flex-1 bg-black/20 border border-white/5 rounded-md px-2 py-1 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-primary-500/30"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddProperty();
                if (e.key === 'Escape') setIsAddingNew(false);
              }}
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as PropertyType)}
              className="bg-black/20 border border-white/5 rounded-md px-1.5 py-1 text-[10px] text-zinc-400 focus:outline-none focus:border-primary-500/30 appearance-none cursor-pointer"
            >
              <option value="text">Texto</option>
              <option value="number">Número</option>
              <option value="boolean">Boolean</option>
              <option value="date">Fecha</option>
              <option value="url">URL</option>
            </select>
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={handleAddProperty}
                disabled={!newKey.trim()}
                className="p-1 text-emerald-400/70 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-md transition-colors disabled:opacity-30"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setIsAddingNew(false)}
                className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-white/5 rounded-md transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsAddingNew(true)}
            className="flex items-center gap-2 w-full py-2 px-3 mt-1 text-zinc-500 hover:text-zinc-400 hover:bg-white/5 rounded-lg transition-colors text-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Añadir propiedad</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default PropertyEditor;

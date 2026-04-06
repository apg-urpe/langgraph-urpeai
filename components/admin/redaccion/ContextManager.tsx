'use client';

import React, { useState, useCallback, useRef } from 'react';
import {
  Upload,
  Globe,
  FileText,
  FileSpreadsheet,
  Code2,
  Trash2,
  Loader2,
  Sparkles,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Plus,
  X,
  CheckCircle2,
  Type,
} from 'lucide-react';
import {
  useRedaccionStore,
  selectContextSources,
  selectContextOrganized,
  selectContextPhase,
  selectContextError,
} from '@/store/redaccionStore';
import { useContactStore, selectSelectedEnterpriseId } from '@/store/contactStore';
import type { ContextSource, ContextSourceType } from '@/types/redaccion';
import { CONTEXT_SOURCE_LABELS } from '@/types/redaccion';

// ============================================================================
// ICONS POR TIPO
// ============================================================================

const SOURCE_ICONS: Record<ContextSourceType, React.FC<{ className?: string }>> = {
  text: Type,
  url: Globe,
  json: Code2,
  csv: FileSpreadsheet,
  markdown: FileText,
  excel: FileSpreadsheet,
};

const SOURCE_COLORS: Record<ContextSourceType, string> = {
  text: 'text-zinc-400',
  url: 'text-blue-400',
  json: 'text-amber-400',
  csv: 'text-emerald-400',
  markdown: 'text-purple-400',
  excel: 'text-green-400',
};

// ============================================================================
// HELPER: generar ID único
// ============================================================================

function uid(): string {
  return Math.random().toString(36).substring(2, 10);
}

// ============================================================================
// JSON VIEWER — Vista bonita del JSON organizado
// ============================================================================

const JsonCategoryView: React.FC<{ nombre: string; datos: Record<string, unknown>[] }> = ({ nombre, datos }) => {
  const [open, setOpen] = useState(true);

  return (
    <div className="border border-zinc-800/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors text-left"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />}
        <span className="text-sm font-medium text-zinc-200">{nombre}</span>
        <span className="text-xs text-zinc-600 ml-auto">{datos.length} items</span>
      </button>
      {open && (
        <div className="p-3 space-y-2 max-h-60 overflow-y-auto">
          {datos.map((item, idx) => (
            <div key={idx} className="text-xs bg-zinc-900/60 rounded p-2 space-y-0.5">
              {Object.entries(item).map(([k, v]) => (
                <div key={k} className="flex gap-2">
                  <span className="text-zinc-500 shrink-0 font-mono">{k}:</span>
                  <span className="text-zinc-300 break-all">
                    {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// CONTEXT MANAGER — Componente principal
// ============================================================================

export const ContextManager: React.FC = () => {
  const enterpriseId = useContactStore(selectSelectedEnterpriseId);
  const sources = useRedaccionStore(selectContextSources);
  const organized = useRedaccionStore(selectContextOrganized);
  const phase = useRedaccionStore(selectContextPhase);
  const contextError = useRedaccionStore(selectContextError);

  const addSource = useRedaccionStore(state => state.addContextSource);
  const removeSource = useRedaccionStore(state => state.removeContextSource);
  const processContext = useRedaccionStore(state => state.processContext);
  const clearContext = useRedaccionStore(state => state.clearContext);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState('');
  const [textInput, setTextInput] = useState('');
  const [textName, setTextName] = useState('');
  const [showAddText, setShowAddText] = useState(false);
  const [showAddUrl, setShowAddUrl] = useState(false);

  // --- File upload handler ---
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      let type: ContextSourceType = 'text';
      if (ext === 'json') type = 'json';
      else if (ext === 'csv') type = 'csv';
      else if (ext === 'md') type = 'markdown';
      else if (ext === 'xlsx' || ext === 'xls') type = 'excel';

      let rawContent = '';
      if (type === 'excel') {
        // Read as base64 for later processing, but we'll read as text for the API
        // Actually, for the API we send via FormData, but for the store we need the text
        // Let's read as text for display and the API will re-parse from FormData
        // For Excel, we read the array buffer and convert sheets to JSON client-side
        try {
          const XLSX = await import('xlsx');
          const buffer = await file.arrayBuffer();
          const workbook = XLSX.read(buffer, { type: 'array' });
          const allData: Record<string, unknown>[] = [];
          for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
            allData.push({ _hoja: sheetName, _filas: jsonData.length, datos: (jsonData as unknown[]).slice(0, 200) });
          }
          rawContent = JSON.stringify(allData, null, 2);
        } catch {
          rawContent = '[Error leyendo Excel]';
        }
      } else {
        rawContent = await file.text();
      }

      addSource({
        id: uid(),
        type,
        name: file.name,
        rawContent: rawContent.substring(0, 100000),
        addedAt: Date.now(),
      });
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [addSource]);

  // --- Add URL ---
  const handleAddUrl = useCallback(() => {
    const url = urlInput.trim();
    if (!url) return;
    // Basic URL validation
    if (!url.startsWith('http://') && !url.startsWith('https://')) return;

    addSource({
      id: uid(),
      type: 'url',
      name: url,
      rawContent: url,
      addedAt: Date.now(),
    });
    setUrlInput('');
    setShowAddUrl(false);
  }, [urlInput, addSource]);

  // --- Add text ---
  const handleAddText = useCallback(() => {
    const text = textInput.trim();
    if (!text) return;

    addSource({
      id: uid(),
      type: 'text',
      name: textName.trim() || `Texto ${sources.length + 1}`,
      rawContent: text,
      addedAt: Date.now(),
    });
    setTextInput('');
    setTextName('');
    setShowAddText(false);
  }, [textInput, textName, sources.length, addSource]);

  // --- Process ---
  const handleProcess = useCallback(() => {
    if (!enterpriseId || sources.length === 0) return;
    processContext(enterpriseId);
  }, [enterpriseId, sources.length, processContext]);

  const isProcessing = phase === 'processing';
  const isReady = phase === 'ready' && organized !== null;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">
          Fuentes de Contexto
        </h4>
        {sources.length > 0 && (
          <button
            onClick={clearContext}
            className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
          >
            Limpiar todo
          </button>
        )}
      </div>

      {/* Source list */}
      {sources.length > 0 && (
        <div className="space-y-1.5">
          {sources.map(source => {
            const Icon = SOURCE_ICONS[source.type];
            const color = SOURCE_COLORS[source.type];
            return (
              <div
                key={source.id}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-zinc-800/30 border border-zinc-800/40 group"
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
                <span className="text-xs text-zinc-300 truncate flex-1">{source.name}</span>
                <span className="text-[10px] text-zinc-600">{CONTEXT_SOURCE_LABELS[source.type]}</span>
                <button
                  onClick={() => removeSource(source.id)}
                  className="p-0.5 rounded opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add buttons */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-zinc-800/40 border border-zinc-700/30 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
        >
          <Upload className="w-3 h-3" />
          Archivo
        </button>
        <button
          onClick={() => { setShowAddUrl(!showAddUrl); setShowAddText(false); }}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-zinc-800/40 border border-zinc-700/30 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
        >
          <Globe className="w-3 h-3" />
          URL
        </button>
        <button
          onClick={() => { setShowAddText(!showAddText); setShowAddUrl(false); }}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-zinc-800/40 border border-zinc-700/30 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Texto
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept=".txt,.md,.json,.csv,.xlsx,.xls"
          onChange={handleFileUpload}
        />
      </div>

      {/* URL input */}
      {showAddUrl && (
        <div className="flex gap-1.5">
          <input
            type="url"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            placeholder="https://ejemplo.com/datos"
            className="flex-1 px-2.5 py-1.5 text-xs rounded bg-zinc-900/60 border border-zinc-700/50 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            onKeyDown={e => e.key === 'Enter' && handleAddUrl()}
          />
          <button onClick={handleAddUrl} className="px-2 py-1.5 rounded bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs hover:bg-blue-500/30 transition-colors">
            Añadir
          </button>
          <button onClick={() => setShowAddUrl(false)} className="p-1.5 rounded text-zinc-600 hover:text-zinc-300">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Text input */}
      {showAddText && (
        <div className="space-y-1.5">
          <input
            type="text"
            value={textName}
            onChange={e => setTextName(e.target.value)}
            placeholder="Nombre (opcional)"
            className="w-full px-2.5 py-1.5 text-xs rounded bg-zinc-900/60 border border-zinc-700/50 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-primary-500/50"
          />
          <textarea
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            placeholder="Pega texto, datos, notas..."
            rows={3}
            className="w-full px-2.5 py-1.5 text-xs rounded bg-zinc-900/60 border border-zinc-700/50 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-primary-500/50 resize-none"
          />
          <div className="flex gap-1.5 justify-end">
            <button onClick={() => setShowAddText(false)} className="px-2 py-1 rounded text-xs text-zinc-500 hover:text-zinc-300">
              Cancelar
            </button>
            <button
              onClick={handleAddText}
              disabled={!textInput.trim()}
              className="px-2 py-1 rounded bg-primary-500/20 border border-primary-500/30 text-primary-300 text-xs hover:bg-primary-500/30 transition-colors disabled:opacity-40"
            >
              Añadir texto
            </button>
          </div>
        </div>
      )}

      {/* Process button */}
      {sources.length > 0 && !isReady && (
        <button
          onClick={handleProcess}
          disabled={isProcessing}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 hover:bg-amber-500/20 transition-colors text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Organizando con IA...
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              Organizar {sources.length} fuente{sources.length > 1 ? 's' : ''} con IA
            </>
          )}
        </button>
      )}

      {/* Error */}
      {phase === 'error' && contextError && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
          <p className="text-xs text-red-300">{contextError}</p>
        </div>
      )}

      {/* Organized JSON result */}
      {isReady && organized && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-medium text-emerald-300">Contexto organizado</span>
            <button
              onClick={handleProcess}
              className="ml-auto text-[10px] text-zinc-600 hover:text-amber-400 transition-colors"
            >
              Re-procesar
            </button>
          </div>

          {/* Resumen */}
          <div className="p-2.5 rounded-lg bg-zinc-800/30 border border-zinc-700/30">
            <p className="text-xs text-zinc-300 leading-relaxed">{organized.resumen}</p>
          </div>

          {/* Puntos clave */}
          {organized.puntos_clave && organized.puntos_clave.length > 0 && (
            <div className="p-2.5 rounded-lg bg-zinc-800/20 border border-zinc-800/40">
              <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider mb-1.5">Puntos clave</p>
              <ul className="space-y-1">
                {organized.puntos_clave.map((p, i) => (
                  <li key={i} className="text-xs text-zinc-400 flex gap-1.5">
                    <span className="text-amber-500 shrink-0">•</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Categorías */}
          {organized.categorias.map((cat, idx) => (
            <JsonCategoryView key={idx} nombre={cat.nombre} datos={cat.datos} />
          ))}

          {/* Metadata */}
          <p className="text-[10px] text-zinc-600 text-right">
            {organized.metadata.totalSources} fuentes · {new Date(organized.metadata.processedAt).toLocaleTimeString()}
          </p>
        </div>
      )}
    </div>
  );
};

export default ContextManager;

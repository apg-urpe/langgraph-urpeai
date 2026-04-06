'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Send, Sparkles, MessageSquare, Calendar, FileText, CheckSquare, Wallet, ExternalLink } from 'lucide-react';
import { Contact } from '../../../types/contact';
import { useChatStore } from '../../../store/chatStore';
import { useAdminStore } from '../../../store/adminStore';

interface ContactAIChatProps {
  contact: Contact;
  contactData?: any;
  onClose?: () => void;
}

// ============================================================================
// CONTEXT BUILDER: Arma texto estructurado con toda la info del contacto
// ============================================================================

const buildContactContextMessage = (contact: Contact, contactData: any, question: string): string => {
  const nombre = `${contact.nombre || ''} ${contact.apellido || ''}`.trim() || 'Sin nombre';
  const parts: string[] = [];

  parts.push(`[CONTEXTO DEL CONTACTO: ${nombre} (ID: ${contact.id})]`);

  // Datos base
  const datos: string[] = [];
  if (contact.estado) datos.push(contact.estado);
  if (contact.es_calificado) datos.push(contact.es_calificado);
  if (contact.origen) datos.push(`Origen: ${contact.origen}`);
  if (datos.length > 0) parts.push(`Datos: ${datos.join(' | ')}`);

  if (contact.telefono) parts.push(`Tel: ${contact.telefono}`);
  if (contact.email) parts.push(`Email: ${contact.email}`);

  // Asesor y embudo
  if (contactData?.assignedAdvisor) {
    const a = contactData.assignedAdvisor;
    parts.push(`Asesor: ${a.nombre} ${a.apellido || ''}`.trim());
  }
  if (contactData?.funnelStage) {
    parts.push(`Embudo: ${contactData.funnelStage.nombre_etapa}`);
  }

  // Fechas
  if (contact.created_at) parts.push(`Creado: ${new Date(contact.created_at).toLocaleDateString('es-ES')}`);
  if (contact.ultima_interaccion) parts.push(`Última interacción: ${new Date(contact.ultima_interaccion).toLocaleDateString('es-ES')}`);

  // Conversaciones con mensajes
  const conversations = contactData?.conversations?.slice(0, 5);
  if (conversations?.length > 0) {
    parts.push('');
    parts.push(`--- CONVERSACIONES (${conversations.length}) ---`);
    for (const c of conversations) {
      parts.push(`[${c.canal || 'chat'}] ${c.resumen || 'Sin resumen'} (${c.fecha_inicio ? new Date(c.fecha_inicio).toLocaleDateString('es-ES') : ''})`);
      const msgs = contactData?.messages
        ?.filter((m: any) => m.conversacion_id === c.id)
        ?.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        ?.slice(0, 10);
      if (msgs?.length > 0) {
        for (const m of msgs) {
          const contenido = (m.cuerpo || m.mensaje || m.contenido || m.content || m.texto || '').slice(0, 500);
          if (contenido) parts.push(`  ${m.remitente || '?'}: ${contenido}`);
        }
      }
    }
  }

  // Citas
  const citas = contactData?.appointments?.slice(0, 10);
  if (citas?.length > 0) {
    parts.push('');
    parts.push(`--- CITAS (${citas.length}) ---`);
    for (const a of citas) {
      parts.push(`- ${a.titulo || 'Sin título'} — ${a.estado || '?'} (${a.fecha_hora ? new Date(a.fecha_hora).toLocaleDateString('es-ES') : ''})`);
    }
  }

  // Notas
  const notas = contactData?.notes?.slice(0, 15);
  if (notas?.length > 0) {
    parts.push('');
    parts.push(`--- NOTAS (${notas.length}) ---`);
    for (const n of notas) {
      const desc = n.descripcion?.slice(0, 300) || '';
      parts.push(`- ${n.titulo || 'Sin título'}: ${desc}`);
    }
  }

  // Tareas
  const tareas = contactData?.tasks?.slice(0, 15);
  if (tareas?.length > 0) {
    parts.push('');
    parts.push(`--- TAREAS (${tareas.length}) ---`);
    for (const t of tareas) {
      const completados = t.items?.filter((i: any) => i.completado)?.length || 0;
      const total = t.items?.length || 0;
      parts.push(`- ${t.titulo || 'Sin título'} [${t.estado}] ${total > 0 ? `(${completados}/${total})` : ''}`);
    }
  }

  // Cartera / Servicios
  const servicios = contactData?.services;
  if (servicios?.length > 0) {
    const totalContratado = servicios.reduce((s: number, sv: any) => s + (sv.valor_total || 0), 0);
    const totalPagado = servicios.reduce((s: number, sv: any) => s + (sv.saldo_pagado || 0), 0);
    parts.push('');
    parts.push(`--- CARTERA: $${totalContratado.toLocaleString()} contratado, $${totalPagado.toLocaleString()} pagado ---`);
    for (const s of servicios) {
      let serviceLine = `- ${s.nombre_servicio || 'Servicio'}: $${(s.valor_total || 0).toLocaleString()} [${s.estado || '?'}]`;
      if (s.cuota_mensual != null && s.cuota_mensual > 0) {
        serviceLine += ` (Monto mensual propuesto: $${s.cuota_mensual.toLocaleString()})`;
      }
      parts.push(serviceLine);
    }
  }

  // Transcripciones
  const transcripciones = contactData?.transcripciones?.slice(0, 3);
  if (transcripciones?.length > 0) {
    parts.push('');
    parts.push(`--- TRANSCRIPCIONES (${transcripciones.length}) ---`);
    for (const t of transcripciones) {
      const titulo = t.cita?.titulo || 'Sin título';
      parts.push(`- ${titulo} (${t.duracion || '?'}min)`);
      if (t.resumen_cita) parts.push(`  Resumen: ${t.resumen_cita.slice(0, 500)}`);
      if (t.transcripcion) parts.push(`  Transcripción: ${t.transcripcion.slice(0, 2000)}`);
    }
  }

  parts.push('');
  parts.push('[FIN CONTEXTO]');
  parts.push('');
  parts.push(question);

  return parts.join('\n');
};

// ============================================================================
// COMPONENT: Prompt de envío a Monica principal
// ============================================================================

export const ContactAIChat: React.FC<ContactAIChatProps> = ({ contact, contactData, onClose }) => {
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Context stats for UI indicators
  const contextStats = {
    conversaciones: contactData?.conversations?.length || 0,
    citas: contactData?.appointments?.length || 0,
    transcripciones: contactData?.transcripciones?.length || 0,
    notas: contactData?.notes?.length || 0,
    tareas: contactData?.tasks?.length || 0,
    servicios: contactData?.services?.length || 0,
  };
  const totalContextItems = Object.values(contextStats).reduce((a, b) => a + b, 0);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isSending) return;

    setIsSending(true);
    try {
      const message = buildContactContextMessage(contact, contactData, text);
      await useChatStore.getState().createNewSession();
      useChatStore.getState().setPendingMessage(message);
      onClose?.();
      useAdminStore.getState().closeAdminPanel();
    } catch (err) {
      console.error('[ContactAIChat] Error sending to Monica:', err);
      setIsSending(false);
    }
  }, [input, isSending, contact, contactData, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const contactName = contact.nombre || 'este contacto';

  const contextBadges = [
    { count: contextStats.conversaciones, label: 'chats',          icon: MessageSquare, color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    { count: contextStats.citas,          label: 'citas',          icon: Calendar,      color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    { count: contextStats.notas,          label: 'notas',          icon: FileText,      color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
    { count: contextStats.tareas,         label: 'tareas',         icon: CheckSquare,   color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
    { count: contextStats.servicios,      label: 'servicios',      icon: Wallet,        color: 'bg-green-500/10 text-green-400 border-green-500/20' },
    { count: contextStats.transcripciones,label: 'transcripciones',icon: FileText,      color: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
  ].filter(b => b.count > 0);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0c] relative overflow-hidden">

      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
        <div className="absolute -top-20 -left-20 w-64 h-64 bg-primary-500/8 rounded-full blur-[80px]" />
        <div className="absolute -bottom-16 -right-16 w-56 h-56 bg-primary-600/6 rounded-full blur-[70px]" />
      </div>

      {/* Header */}
      <div className="relative shrink-0 flex items-center justify-between px-4 py-3 border-b border-white/[0.06] bg-black/20 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-primary-500/15 border border-primary-500/25 flex items-center justify-center shadow-[0_0_12px_rgba(var(--primary-500),0.2)]">
            <Sparkles className="w-3.5 h-3.5 text-primary-400" />
          </div>
          <div>
            <span className="text-sm font-semibold text-zinc-100 tracking-tight">Monica</span>
            <span className="ml-2 text-[9px] font-bold uppercase tracking-widest text-primary-500/70 border border-primary-500/20 px-1.5 py-0.5 rounded bg-primary-500/5">[AI]</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06]">
          <ExternalLink className="w-3 h-3 text-zinc-500" />
          <span className="text-[10px] text-zinc-500">Chat principal</span>
        </div>
      </div>

      {/* Body */}
      <div className="relative flex-1 flex flex-col items-center justify-center p-6 text-center gap-5">

        {/* Avatar glow ring */}
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary-500/20 blur-xl scale-150" />
          <div className="relative w-16 h-16 rounded-2xl bg-black/40 border border-primary-500/20 flex items-center justify-center shadow-[0_0_30px_rgba(var(--primary-500),0.15)] backdrop-blur-sm">
            <Sparkles className="w-7 h-7 text-primary-400 drop-shadow-[0_0_8px_rgba(var(--primary-400),0.8)]" />
          </div>
        </div>

        {/* Copy */}
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-zinc-200">
            Pregunta sobre{' '}
            <span className="text-primary-400 font-semibold">{contactName}</span>
          </p>
          <p className="text-[11px] text-zinc-500 max-w-[260px] leading-relaxed">
            Monica recibirá todo el contexto disponible de este contacto de forma automática
          </p>
        </div>

        {/* Context badges */}
        {contextBadges.length > 0 && (
          <div className="w-full max-w-[300px]">
            <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-600 mb-2.5">Contexto disponible</p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {contextBadges.map(({ count, label, icon: Icon, color }) => (
                <span
                  key={label}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-medium ${color} backdrop-blur-sm`}
                >
                  <Icon className="w-3 h-3" />
                  {count} {label}
                </span>
              ))}
            </div>
          </div>
        )}

        {contextBadges.length === 0 && (
          <div className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[10px] text-zinc-600 max-w-[240px]">
            Los datos del contacto se cargarán con tu pregunta
          </div>
        )}
      </div>

      {/* Input */}
      <div className="relative shrink-0 p-3 border-t border-white/[0.06] bg-black/20 backdrop-blur-sm">
        <div className="flex gap-2 items-center">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Pregunta sobre ${contactName}...`}
            disabled={isSending}
            className="flex-1 h-10 bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-primary-500/40 focus:ring-1 focus:ring-primary-500/20 transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className="w-10 h-10 shrink-0 rounded-xl bg-primary-500 hover:bg-primary-400 text-white flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:scale-105 hover:shadow-[0_0_16px_rgba(var(--primary-500),0.4)] active:scale-95"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-center text-[10px] text-zinc-700 mt-2">Enter para enviar · Abre el chat principal</p>
      </div>
    </div>
  );
};

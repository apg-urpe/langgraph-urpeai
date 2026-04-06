/**
 * Transcripcion Types — Tipos para el módulo de Transcripciones
 * 
 * Extiende el tipo base `Transcripcion` de types/contact.ts con datos
 * de contexto (cita, asesor) para la vista independiente.
 * 
 * @module types/transcripcion
 */

import { Transcripcion } from './contact';

// ============================================================================
// EXTENDED TYPES FOR TRANSCRIPCIONES VIEW
// ============================================================================

export interface TranscripcionWithContext extends Transcripcion {
  // Joined from wp_citas
  cita_titulo?: string | null;
  cita_fecha?: string | null;
  cita_estado?: string | null;
  cita_empresa_id?: number | null;
  cita_team_humano_id?: number | null;
  cita_contacto_id?: number | null;
  cita_ubicacion?: string | null;
  // Joined from wp_team_humano (asesor)
  asesor_nombre?: string | null;
  asesor_apellido?: string | null;
  // Joined contact name
  contacto_nombre?: string | null;
  contacto_apellido?: string | null;
}

// ============================================================================
// FILTERS
// ============================================================================

export interface TranscripcionFilters {
  search: string;
  teamMemberId: number | null; // null = todos
  dateRange: {
    from: string | null; // ISO date
    to: string | null;
  };
}

export const DEFAULT_TRANSCRIPCION_FILTERS: TranscripcionFilters = {
  search: '',
  teamMemberId: null,
  dateRange: { from: null, to: null },
};

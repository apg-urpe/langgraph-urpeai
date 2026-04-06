/**
 * Create Note Tool
 * 
 * Crea una nota en un contacto del CRM.
 * Herramienta de ESCRITURA.
 * 
 * @module lib/ai/toolsets/crm/tools/create-note
 */

import { z } from 'zod';
import type { BaseTool, ToolContext, ToolResult } from '../../types';

// ============================================================================
// INPUT SCHEMA
// ============================================================================

export const CreateNoteInputSchema = z.object({
  contact_id: z.number()
    .describe('ID del contacto donde crear la nota'),
  
  titulo: z.string()
    .optional()
    .describe('Título breve de la nota (opcional)'),
  
  descripcion: z.string()
    .min(1)
    .describe('Contenido de la nota'),
  
  etiquetas: z.array(z.string()).optional()
    .describe('Tags para categorizar la nota (opcional)')
});

export type CreateNoteInput = z.infer<typeof CreateNoteInputSchema>;

// ============================================================================
// OUTPUT SCHEMA
// ============================================================================

export const CreateNoteOutputSchema = z.object({
  note: z.object({
    id: z.number(),
    contacto_id: z.number(),
    titulo: z.string().nullable(),
    descripcion: z.string(),
    etiquetas: z.array(z.string()).nullable(),
    created_at: z.string()
  }),
  message: z.string()
});

export type CreateNoteOutput = z.infer<typeof CreateNoteOutputSchema>;

// ============================================================================
// TOOL IMPLEMENTATION
// ============================================================================

export const createNoteTool: BaseTool<CreateNoteInput, CreateNoteOutput> = {
  name: 'create_note',
  description: `📝 CREAR NOTA EN UN CONTACTO

Guarda información importante en la ficha del contacto.

CUÁNDO USAR:
- "Anota que Juan llamó preguntando por el servicio X"
- "Registra que el cliente pidió cotización"
- "Guarda que mencionó que viaja en enero"

REQUIERE: contact_id (obténlo con search_crm)`,
  
  category: 'crm',
  readOnly: false,
  requiresConfirmation: false,
  tags: ['note', 'write', 'contact'],
  
  inputSchema: CreateNoteInputSchema,
  outputSchema: CreateNoteOutputSchema,
  
  async execute(input, context): Promise<ToolResult<CreateNoteOutput>> {
    const { supabase, logger } = context.services;
    const startTime = Date.now();
    
    try {
      const { contact_id, titulo, descripcion, etiquetas } = input;
      
      // Verificar que el contacto existe y pertenece a la empresa
      const { data: contact, error: contactError } = await supabase
        .from('wp_contactos')
        .select('id, nombre')
        .eq('id', contact_id)
        .eq('empresa_id', context.enterpriseId)
        .single();
      
      if (contactError || !contact) {
        return {
          success: false,
          error: 'Contacto no encontrado o sin acceso'
        };
      }

      // Crear la nota
      const { data: note, error: insertError } = await supabase
        .from('wp_contactos_nota')
        .insert({
          contacto_id: contact_id,
          titulo: titulo || null,
          descripcion: descripcion,
          etiquetas: etiquetas || [],
          team_humano_id: context.userId || null
        })
        .select('id, contacto_id, titulo, descripcion, etiquetas, created_at')
        .single();

      if (insertError) {
        logger.error('Error creating note:', insertError);
        return {
          success: false,
          error: `Error al crear nota: ${insertError.message}`
        };
      }

      const durationMs = Date.now() - startTime;

      return {
        success: true,
        data: {
          note: {
            id: note.id,
            contacto_id: note.contacto_id,
            titulo: note.titulo,
            descripcion: note.descripcion,
            etiquetas: note.etiquetas,
            created_at: note.created_at
          },
          message: `Nota creada exitosamente para ${contact.nombre}`
        },
        metadata: {
          durationMs,
          dbQueriesCount: 2
        }
      };
      
    } catch (err: any) {
      logger.error('Exception in create_note:', err);
      return { 
        success: false, 
        error: err.message || 'Error al crear la nota' 
      };
    }
  }
};

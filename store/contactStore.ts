/**
 * Contact Store - Barrel re-export
 * 
 * Este archivo re-exporta todo desde store/contact/ para mantener
 * backward-compatibility con los 87+ archivos que importan desde aqui.
 * 
 * La implementacion real esta dividida en slices dentro de store/contact/:
 *   - types.ts       -- Interface ContactState, tipos, initial state
 *   - constants.ts   -- Constantes, helpers (normalizePhone, removeAccents, etc.)
 *   - selectors.ts   -- Selectores simples + derivados
 *   - authSlice.ts   -- fetchUserContext, enterprise profile, setSelectedEnterprise
 *   - searchSlice.ts -- fetchContacts (Super Search), filtros, paginacion
 *   - detailsSlice.ts -- fetchContactDetails, CRUD contacto, pause/reactivate
 *   - appointmentsSlice.ts -- Appointments empresa + CRUD
 *   - conversationsSlice.ts -- Mensajes, conversaciones recientes
 *   - funnelSlice.ts -- Funnel stages + CRUD
 *   - actionsSlice.ts -- Notes, Multimedia, Assignments, Merge, TeamMembers
 *   - index.ts       -- Ensambla slices, crea store, persist config
 * 
 * @module store/contactStore
 */
export * from './contact';

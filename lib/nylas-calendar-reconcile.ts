import type { SupabaseClient } from '@supabase/supabase-js';

type JsonRecord = Record<string, any>;

interface EnterpriseTeamMember {
  id: number;
  empresa_id: number;
  email: string | null;
  nombre: string | null;
  apellido: string | null;
  grant_id: string | null;
  is_active: boolean;
}

interface ExistingAppointment {
  id: number;
  empresa_id: number | null;
  contacto_id: number | null;
  team_humano_id: number | null;
  titulo: string | null;
  descripcion: string | null;
  fecha_hora: string | null;
  duracion: number | null;
  estado: string | null;
  ubicacion: string | null;
  event_id: string | null;
  metadata: JsonRecord | null;
}

interface ExistingParticipant {
  id: number;
  cita_id: number;
  team_humano_id: number;
  rol: string | null;
  estado_rsvp: string | null;
  email: string | null;
  added_by: string | null;
}

interface NylasEventParticipant {
  email?: string | null;
  name?: string | null;
  status?: string | null;
}

interface NylasEventRecord {
  id: string;
  grant_id?: string | null;
  ical_uid?: string | null;
  title?: string | null;
  description?: string | null;
  location?: string | null;
  status?: string | null;
  participants?: NylasEventParticipant[] | null;
  organizer?: { email?: string | null; name?: string | null } | null;
  creator?: { email?: string | null; name?: string | null } | null;
  conferencing?: JsonRecord | null;
  when?: JsonRecord | null;
}

interface EventGroupEntry {
  sourceMember: EnterpriseTeamMember;
  event: NylasEventRecord;
}

interface ReconcileContext {
  emailToMember: Map<string, EnterpriseTeamMember>;
  memberById: Map<number, EnterpriseTeamMember>;
  contactByEmail: Map<string, number>;
}

export interface ReconcileCalendarInput {
  supabaseAdmin: SupabaseClient;
  enterpriseId: number;
  teamMemberIds?: number[] | null;
  start: string;
  end: string;
  nylasApiKey: string;
  nylasApiUri?: string;
}

export interface ReconcileCalendarResult {
  eventsFetched: number;
  groupsProcessed: number;
  appointmentsCreated: number;
  appointmentsUpdated: number;
  participantsUpserted: number;
  participantsDeleted: number;
  skippedGroups: number;
  errors: string[];
}

const MAX_NYLAS_PAGES = 20;

function normalizeEmail(email?: string | null): string | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  return normalized || null;
}

function getEventGroupKey(event: NylasEventRecord): string {
  const icalUid = typeof event.ical_uid === 'string' ? event.ical_uid.trim().toLowerCase() : '';
  if (icalUid) return `ical:${icalUid}`;
  return `event:${event.id}`;
}

function mapEventStatus(status?: string | null): string {
  const normalized = status?.toLowerCase();
  if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelada';
  if (normalized === 'confirmed') return 'confirmada';
  if (normalized === 'tentative') return 'pendiente';
  return 'pendiente';
}

function mapParticipantStatus(status?: string | null): string {
  const normalized = status?.toLowerCase();
  if (normalized === 'yes' || normalized === 'accepted') return 'aceptado';
  if (normalized === 'no' || normalized === 'declined') return 'rechazado';
  if (normalized === 'maybe' || normalized === 'tentative') return 'tentativo';
  return 'pendiente';
}

function resolveAppointmentStatus(existingAppointment: ExistingAppointment | null, eventStatus?: string | null): string {
  const existingStatus = typeof existingAppointment?.estado === 'string'
    ? existingAppointment.estado.trim()
    : '';

  if (existingStatus) {
    return existingStatus;
  }

  const mappedStatus = mapEventStatus(eventStatus);
  return mappedStatus;
}

function parseDateOnly(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseWhenBounds(when?: JsonRecord | null): { startIso: string | null; endIso: string | null } {
  if (!when || typeof when !== 'object') {
    return { startIso: null, endIso: null };
  }

  if (when.object === 'timespan') {
    const startTime = Number(when.start_time);
    const endTime = Number(when.end_time);
    const startIso = Number.isFinite(startTime) ? new Date(startTime * 1000).toISOString() : null;
    const endIso = Number.isFinite(endTime) ? new Date(endTime * 1000).toISOString() : null;
    return { startIso, endIso };
  }

  if (when.object === 'date') {
    const startIso = parseDateOnly(typeof when.date === 'string' ? when.date : null);
    if (!startIso) return { startIso: null, endIso: null };
    const endIso = new Date(new Date(startIso).getTime() + 30 * 60 * 1000).toISOString();
    return { startIso, endIso };
  }

  if (when.object === 'datespan') {
    const startIso = parseDateOnly(typeof when.start_date === 'string' ? when.start_date : null);
    const endIso = parseDateOnly(typeof when.end_date === 'string' ? when.end_date : null) || startIso;
    return { startIso, endIso };
  }

  return { startIso: null, endIso: null };
}

function getDurationMinutes(startIso: string | null, endIso: string | null, fallback = 30): number {
  if (!startIso || !endIso) return fallback;
  const duration = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  return Number.isFinite(duration) && duration > 0 ? duration : fallback;
}

function extractExistingIcalUid(appointment: ExistingAppointment): string | null {
  const metadata = appointment.metadata || {};
  const icalUid = metadata.nylas_ical_uid || metadata.ical_uid;
  return typeof icalUid === 'string' && icalUid.trim() ? icalUid.trim().toLowerCase() : null;
}

function extractExistingEventId(appointment: ExistingAppointment): string | null {
  if (appointment.event_id) return appointment.event_id;
  const metadata = appointment.metadata || {};
  return typeof metadata.nylas_event_id === 'string' && metadata.nylas_event_id.trim()
    ? metadata.nylas_event_id.trim()
    : null;
}

function pickPrimaryEntry(entries: EventGroupEntry[], ownerId?: number | null): EventGroupEntry {
  const ownerEntry = ownerId ? entries.find(entry => entry.sourceMember.id === ownerId) : null;
  if (ownerEntry) return ownerEntry;

  return [...entries].sort((a, b) => {
    const participantDelta = (b.event.participants?.length || 0) - (a.event.participants?.length || 0);
    if (participantDelta !== 0) return participantDelta;
    return a.sourceMember.id - b.sourceMember.id;
  })[0];
}

function dedupeAppointments(appointments: ExistingAppointment[]): ExistingAppointment[] {
  const seen = new Set<number>();
  return appointments.filter(appointment => {
    if (seen.has(appointment.id)) return false;
    seen.add(appointment.id);
    return true;
  });
}

function resolveOwner(entries: EventGroupEntry[], existingAppointment: ExistingAppointment | null, context: ReconcileContext): EnterpriseTeamMember | null {
  const richestEntry = pickPrimaryEntry(entries, existingAppointment?.team_humano_id ?? null);
  const organizerEmail = normalizeEmail(richestEntry.event.organizer?.email);
  if (organizerEmail && context.emailToMember.has(organizerEmail)) {
    return context.emailToMember.get(organizerEmail) || null;
  }

  const creatorEmail = normalizeEmail(richestEntry.event.creator?.email);
  if (creatorEmail && context.emailToMember.has(creatorEmail)) {
    return context.emailToMember.get(creatorEmail) || null;
  }

  if (existingAppointment?.team_humano_id && context.memberById.has(existingAppointment.team_humano_id)) {
    return context.memberById.get(existingAppointment.team_humano_id) || null;
  }

  const internalParticipantIds = Array.from(new Set(
    entries.flatMap(entry => (entry.event.participants || []).map(participant => {
      const normalizedEmail = normalizeEmail(participant.email);
      if (!normalizedEmail) return null;
      return context.emailToMember.get(normalizedEmail)?.id || null;
    }).filter((value): value is number => typeof value === 'number'))
  )).sort((a, b) => a - b);

  if (internalParticipantIds.length > 0) {
    return context.memberById.get(internalParticipantIds[0]) || null;
  }

  return entries[0]?.sourceMember || null;
}

function resolveContactId(entries: EventGroupEntry[], owner: EnterpriseTeamMember | null, context: ReconcileContext): number | null {
  const ownerEmail = normalizeEmail(owner?.email);

  for (const entry of entries) {
    const candidateEmails = [
      entry.event.organizer?.email,
      entry.event.creator?.email,
      ...(entry.event.participants || []).map(participant => participant.email)
    ];

    for (const candidateEmail of candidateEmails) {
      const normalizedEmail = normalizeEmail(candidateEmail);
      if (!normalizedEmail || normalizedEmail === ownerEmail || context.emailToMember.has(normalizedEmail)) {
        continue;
      }

      const contactId = context.contactByEmail.get(normalizedEmail);
      if (contactId) {
        return contactId;
      }
    }
  }

  return null;
}

function buildMetadata(entries: EventGroupEntry[], primaryEntry: EventGroupEntry, existingMetadata: JsonRecord | null, owner: EnterpriseTeamMember | null, endIso: string | null): JsonRecord {
  const eventIdsByMember = Object.fromEntries(
    entries
      .filter(entry => typeof entry.event.id === 'string' && entry.event.id)
      .map(entry => [String(entry.sourceMember.id), entry.event.id])
  );

  return {
    ...(existingMetadata || {}),
    nylas_event_id: primaryEntry.event.id,
    nylas_ical_uid: primaryEntry.event.ical_uid || existingMetadata?.nylas_ical_uid || null,
    nylas_grant_id: owner?.grant_id || primaryEntry.event.grant_id || existingMetadata?.nylas_grant_id || null,
    nylas_event_ids: eventIdsByMember,
    participants: (primaryEntry.event.participants || []).map(participant => ({
      email: participant.email || null,
      name: participant.name || null,
      status: participant.status || null
    })),
    organizer: primaryEntry.event.organizer || null,
    creator: primaryEntry.event.creator || null,
    conferencing: primaryEntry.event.conferencing || null,
    fecha_fin: endIso,
    nylas_status: primaryEntry.event.status || null,
    sync_source: 'nylas_reconcile'
  };
}

function comparableMetadata(metadata: JsonRecord | null | undefined): string {
  // Only compare stable identity & scheduling fields.
  // Volatile fields (participants, organizer, creator, conferencing) change
  // subtly between Nylas fetches (array order, null vs undefined) and cause
  // massive false-positive UPDATEs that flood realtime with hundreds of events.
  return JSON.stringify({
    nylas_event_id: metadata?.nylas_event_id || null,
    nylas_ical_uid: metadata?.nylas_ical_uid || null,
    nylas_grant_id: metadata?.nylas_grant_id || null,
    nylas_event_ids: metadata?.nylas_event_ids || null,
    fecha_fin: metadata?.fecha_fin || null,
    nylas_status: metadata?.nylas_status || null,
    sync_source: metadata?.sync_source || null,
    tipo: metadata?.tipo || null,
    created_via: metadata?.created_via || null
  });
}

function hasAppointmentChanged(existingAppointment: ExistingAppointment, payload: Record<string, any>): boolean {
  const comparableFields: Array<keyof ExistingAppointment | 'contacto_id'> = [
    'contacto_id',
    'team_humano_id',
    'titulo',
    'descripcion',
    'fecha_hora',
    'duracion',
    'estado',
    'ubicacion',
    'event_id'
  ];

  for (const field of comparableFields) {
    if ((existingAppointment as any)[field] !== payload[field]) {
      return true;
    }
  }

  return comparableMetadata(existingAppointment.metadata) !== comparableMetadata(payload.metadata);
}

async function fetchGrantEvents(grantId: string, start: string, end: string, nylasApiKey: string, nylasApiUri: string): Promise<{ events: NylasEventRecord[]; error?: string }> {
  const events: NylasEventRecord[] = [];
  let pageToken: string | null = null;
  let pageCount = 0;

  do {
    pageCount += 1;
    const url = new URL(`${nylasApiUri}/v3/grants/${grantId}/events`);
    url.searchParams.set('calendar_id', 'primary');
    url.searchParams.set('limit', '100');
    url.searchParams.set('start', Math.floor(new Date(start).getTime() / 1000).toString());
    url.searchParams.set('end', Math.floor(new Date(end).getTime() / 1000).toString());
    if (pageToken) {
      url.searchParams.set('page_token', pageToken);
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${nylasApiKey}`,
        'Content-Type': 'application/json'
      },
      cache: 'no-store'
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        events,
        error: `Error listando eventos para grant ${grantId}: ${response.status} ${errorText.slice(0, 300)}`
      };
    }

    const body = await response.json();
    if (Array.isArray(body?.data)) {
      events.push(...body.data);
    }

    pageToken = typeof body?.next_cursor === 'string' && body.next_cursor ? body.next_cursor : null;
  } while (pageToken && pageCount < MAX_NYLAS_PAGES);

  return { events };
}

export async function reconcileEnterpriseCalendar(input: ReconcileCalendarInput): Promise<ReconcileCalendarResult> {
  const result: ReconcileCalendarResult = {
    eventsFetched: 0,
    groupsProcessed: 0,
    appointmentsCreated: 0,
    appointmentsUpdated: 0,
    participantsUpserted: 0,
    participantsDeleted: 0,
    skippedGroups: 0,
    errors: []
  };

  const nylasApiUri = input.nylasApiUri || 'https://api.us.nylas.com';

  let membersQuery = input.supabaseAdmin
    .from('wp_team_humano')
    .select('id, empresa_id, email, nombre, apellido, grant_id, is_active')
    .eq('empresa_id', input.enterpriseId)
    .eq('is_active', true)
    .not('grant_id', 'is', null);

  if (input.teamMemberIds && input.teamMemberIds.length > 0) {
    membersQuery = membersQuery.in('id', input.teamMemberIds);
  }

  const { data: rawMembers, error: membersError } = await membersQuery;
  if (membersError) {
    throw new Error(`Error cargando miembros del equipo: ${membersError.message}`);
  }

  const teamMembers = (rawMembers || []) as EnterpriseTeamMember[];
  if (teamMembers.length === 0) {
    return result;
  }

  const memberById = new Map<number, EnterpriseTeamMember>(teamMembers.map(member => [member.id, member]));
  const emailToMember = new Map<string, EnterpriseTeamMember>();
  for (const member of teamMembers) {
    const normalizedEmail = normalizeEmail(member.email);
    if (normalizedEmail && !emailToMember.has(normalizedEmail)) {
      emailToMember.set(normalizedEmail, member);
    }
  }

  const { data: rawAppointments, error: appointmentsError } = await input.supabaseAdmin
    .from('wp_citas')
    .select('id, empresa_id, contacto_id, team_humano_id, titulo, descripcion, fecha_hora, duracion, estado, ubicacion, event_id, metadata')
    .eq('empresa_id', input.enterpriseId)
    .gte('fecha_hora', input.start)
    .lte('fecha_hora', input.end);

  if (appointmentsError) {
    throw new Error(`Error cargando citas existentes: ${appointmentsError.message}`);
  }

  const existingAppointments = (rawAppointments || []) as ExistingAppointment[];
  const appointmentIds = existingAppointments.map(appointment => appointment.id);

  let existingParticipants: ExistingParticipant[] = [];
  if (appointmentIds.length > 0) {
    const { data: rawParticipants, error: participantsError } = await input.supabaseAdmin
      .from('wp_citas_participantes')
      .select('id, cita_id, team_humano_id, rol, estado_rsvp, email, added_by')
      .in('cita_id', appointmentIds);

    if (participantsError) {
      throw new Error(`Error cargando participantes existentes: ${participantsError.message}`);
    }

    existingParticipants = (rawParticipants || []) as ExistingParticipant[];
  }

  const participantsByAppointmentId = new Map<number, ExistingParticipant[]>();
  for (const participant of existingParticipants) {
    const list = participantsByAppointmentId.get(participant.cita_id) || [];
    list.push(participant);
    participantsByAppointmentId.set(participant.cita_id, list);
  }

  const appointmentsByGroupKey = new Map<string, ExistingAppointment[]>();
  const appointmentsByEventId = new Map<string, ExistingAppointment[]>();
  for (const appointment of existingAppointments) {
    const icalUid = extractExistingIcalUid(appointment);
    if (icalUid) {
      const key = `ical:${icalUid}`;
      appointmentsByGroupKey.set(key, [...(appointmentsByGroupKey.get(key) || []), appointment]);
    }

    const eventId = extractExistingEventId(appointment);
    if (eventId) {
      const key = `event:${eventId}`;
      appointmentsByEventId.set(key, [...(appointmentsByEventId.get(key) || []), appointment]);
    }
  }

  const allEntries: EventGroupEntry[] = [];
  const externalEmailMap = new Map<string, string>();
  const successfulFetchedMemberIds = new Set<number>();
  const successfulFetchedGrantIds = new Set<string>();

  for (const member of teamMembers) {
    if (!member.grant_id) continue;

    const { events, error } = await fetchGrantEvents(member.grant_id, input.start, input.end, input.nylasApiKey, nylasApiUri);
    result.eventsFetched += events.length;
    if (error) {
      result.errors.push(error);
    } else {
      successfulFetchedMemberIds.add(member.id);
      successfulFetchedGrantIds.add(member.grant_id);
    }

    for (const event of events) {
      if (!event?.id) continue;
      allEntries.push({
        sourceMember: member,
        event: {
          ...event,
          grant_id: event.grant_id || member.grant_id
        }
      });

      const candidateEmails = [
        event.organizer?.email,
        event.creator?.email,
        ...(event.participants || []).map(participant => participant.email)
      ];

      for (const candidateEmail of candidateEmails) {
        const normalizedEmail = normalizeEmail(candidateEmail);
        if (!normalizedEmail || emailToMember.has(normalizedEmail) || externalEmailMap.has(normalizedEmail) || !candidateEmail) {
          continue;
        }
        externalEmailMap.set(normalizedEmail, candidateEmail);
      }
    }
  }

  const contactByEmail = new Map<string, number>();
  const externalEmails = Array.from(externalEmailMap.values());
  if (externalEmails.length > 0) {
    const { data: rawContacts, error: contactsError } = await input.supabaseAdmin
      .from('wp_contactos')
      .select('id, email')
      .eq('empresa_id', input.enterpriseId)
      .in('email', externalEmails);

    if (contactsError) {
      result.errors.push(`Error cargando contactos para conciliación: ${contactsError.message}`);
    } else {
      for (const contact of rawContacts || []) {
        const normalizedEmail = normalizeEmail((contact as any).email);
        if (normalizedEmail && !contactByEmail.has(normalizedEmail)) {
          contactByEmail.set(normalizedEmail, Number((contact as any).id));
        }
      }
    }
  }

  const context: ReconcileContext = {
    emailToMember,
    memberById,
    contactByEmail
  };

  const groupedEvents = new Map<string, EventGroupEntry[]>();
  for (const entry of allEntries) {
    const key = getEventGroupKey(entry.event);
    groupedEvents.set(key, [...(groupedEvents.get(key) || []), entry]);
  }
  const matchedAppointmentIds = new Set<number>();

  for (const [groupKey, entries] of groupedEvents.entries()) {
    const eventMatches = entries.flatMap(entry => appointmentsByEventId.get(`event:${entry.event.id}`) || []);
    const existingCandidates = dedupeAppointments([...(appointmentsByGroupKey.get(groupKey) || []), ...eventMatches]).sort((a, b) => a.id - b.id);
    for (const candidate of existingCandidates) {
      matchedAppointmentIds.add(candidate.id);
    }
    const existingAppointment = existingCandidates[0] || null;

    const owner = resolveOwner(entries, existingAppointment, context);
    const primaryEntry = pickPrimaryEntry(entries, owner?.id ?? existingAppointment?.team_humano_id ?? null);
    const { startIso, endIso } = parseWhenBounds(primaryEntry.event.when);

    if (!startIso) {
      result.skippedGroups += 1;
      continue;
    }

    const metadata = buildMetadata(entries, primaryEntry, existingAppointment?.metadata || null, owner, endIso);
    const appointmentPayload = {
      empresa_id: input.enterpriseId,
      contacto_id: resolveContactId(entries, owner, context) ?? existingAppointment?.contacto_id ?? null,
      team_humano_id: owner?.id ?? existingAppointment?.team_humano_id ?? primaryEntry.sourceMember.id,
      titulo: primaryEntry.event.title || existingAppointment?.titulo || 'Cita',
      descripcion: primaryEntry.event.description ?? existingAppointment?.descripcion ?? null,
      fecha_hora: startIso,
      duracion: getDurationMinutes(startIso, endIso, existingAppointment?.duracion ?? 30),
      estado: resolveAppointmentStatus(existingAppointment, primaryEntry.event.status),
      ubicacion: typeof primaryEntry.event.location === 'string' ? primaryEntry.event.location : (existingAppointment?.ubicacion ?? null),
      event_id: primaryEntry.event.id || existingAppointment?.event_id || null,
      metadata
    };

    let appointmentId = existingAppointment?.id || null;

    if (!existingAppointment) {
      const { data: insertedAppointment, error: insertError } = await input.supabaseAdmin
        .from('wp_citas')
        .insert(appointmentPayload)
        .select('id')
        .single();

      if (insertError || !insertedAppointment) {
        result.errors.push(`Error creando cita para ${groupKey}: ${insertError?.message || 'sin respuesta'}`);
        continue;
      }

      appointmentId = insertedAppointment.id;
      result.appointmentsCreated += 1;
    } else if (hasAppointmentChanged(existingAppointment, appointmentPayload)) {
      const { data: updatedAppointment, error: updateError } = await input.supabaseAdmin
        .from('wp_citas')
        .update(appointmentPayload)
        .eq('id', existingAppointment.id)
        .select('id')
        .single();

      if (updateError || !updatedAppointment) {
        result.errors.push(`Error actualizando cita ${existingAppointment.id} para ${groupKey}: ${updateError?.message || 'sin respuesta'}`);
        continue;
      }

      appointmentId = updatedAppointment.id;
      result.appointmentsUpdated += 1;
    }

    if (!appointmentId) {
      result.errors.push(`No se pudo resolver cita local para ${groupKey}`);
      continue;
    }

    const participantMembers = Array.from(new Map(
      (primaryEntry.event.participants || [])
        .map(participant => {
          const normalizedEmail = normalizeEmail(participant.email);
          if (!normalizedEmail) return null;
          const member = emailToMember.get(normalizedEmail);
          if (!member || member.id === appointmentPayload.team_humano_id) return null;
          return [member.id, {
            cita_id: appointmentId,
            team_humano_id: member.id,
            rol: 'equipo',
            estado_rsvp: mapParticipantStatus(participant.status),
            email: member.email || participant.email || null,
            added_by: 'nylas_reconcile'
          }];
        })
        .filter((value): value is [number, { cita_id: number; team_humano_id: number; rol: string; estado_rsvp: string; email: string | null; added_by: string }] => Array.isArray(value))
    ).values());

    if (participantMembers.length > 0) {
      const { error: upsertError } = await input.supabaseAdmin
        .from('wp_citas_participantes')
        .upsert(participantMembers, { onConflict: 'cita_id,team_humano_id' });

      if (upsertError) {
        result.errors.push(`Error sincronizando participantes para cita ${appointmentId}: ${upsertError.message}`);
      } else {
        result.participantsUpserted += participantMembers.length;
      }
    }

    const desiredParticipantIds = new Set(participantMembers.map(participant => participant.team_humano_id));
    const staleParticipants = (participantsByAppointmentId.get(appointmentId) || []).filter(
      participant => !desiredParticipantIds.has(participant.team_humano_id)
    );

    if (staleParticipants.length > 0) {
      const staleParticipantIds = staleParticipants.map(participant => participant.id);
      const { error: deleteError } = await input.supabaseAdmin
        .from('wp_citas_participantes')
        .delete()
        .in('id', staleParticipantIds);

      if (deleteError) {
        result.errors.push(`Error eliminando participantes obsoletos para cita ${appointmentId}: ${deleteError.message}`);
      } else {
        result.participantsDeleted += staleParticipants.length;
      }
    }

    result.groupsProcessed += 1;
  }

  // --- Phase: Cancel appointments missing from Nylas ---
  // Safety: collect candidates first, then apply with a cap to prevent mass false cancellations
  const MAX_AUTO_CANCELLATIONS = 10;
  const cancellationCandidates: ExistingAppointment[] = [];

  for (const existingAppointment of existingAppointments) {
    if (matchedAppointmentIds.has(existingAppointment.id)) {
      continue;
    }

    if (!hasNylasReference(existingAppointment)) {
      continue;
    }

    if (!isAppointmentInReconciledScope(existingAppointment, successfulFetchedMemberIds, successfulFetchedGrantIds)) {
      continue;
    }

    // Skip appointments already cancelled with the same metadata
    const nextMetadata = buildMissingEventMetadata(existingAppointment.metadata);
    const metadataChanged = comparableMetadata(existingAppointment.metadata) !== comparableMetadata(nextMetadata);
    if (existingAppointment.estado === 'cancelada' && !metadataChanged) {
      continue;
    }

    cancellationCandidates.push(existingAppointment);
  }

  if (cancellationCandidates.length > MAX_AUTO_CANCELLATIONS) {
    // Too many cancellations signals a Nylas API issue or range mismatch, not real deletions
    result.errors.push(
      `Cancelación automática omitida: ${cancellationCandidates.length} citas serían canceladas (máx ${MAX_AUTO_CANCELLATIONS}). ` +
      `Esto indica un problema con la API de Nylas o el rango de reconciliación. IDs: ${cancellationCandidates.slice(0, 5).map(a => a.id).join(', ')}...`
    );
  } else {
    for (const existingAppointment of cancellationCandidates) {
      const nextMetadata = buildMissingEventMetadata(existingAppointment.metadata);

      const { data: cancelledAppointment, error: cancelError } = await input.supabaseAdmin
        .from('wp_citas')
        .update({
          estado: 'cancelada',
          metadata: nextMetadata
        })
        .eq('id', existingAppointment.id)
        .select('id')
        .single();

      if (cancelError || !cancelledAppointment) {
        result.errors.push(`Error cancelando cita ${existingAppointment.id} ausente en Nylas: ${cancelError?.message || 'sin respuesta'}`);
        continue;
      }

      result.appointmentsUpdated += 1;
    }
  }

  return result;
}

function hasNylasReference(appointment: ExistingAppointment): boolean {
  const metadata = appointment.metadata || {};
  return Boolean(
    extractExistingEventId(appointment)
    || extractExistingIcalUid(appointment)
    || (typeof metadata.nylas_grant_id === 'string' && metadata.nylas_grant_id.trim())
    || (metadata.nylas_event_ids && typeof metadata.nylas_event_ids === 'object')
  );
}

function isAppointmentInReconciledScope(
  appointment: ExistingAppointment,
  memberIds: Set<number>,
  grantIds: Set<string>
): boolean {
  if (typeof appointment.team_humano_id === 'number' && memberIds.has(appointment.team_humano_id)) {
    return true;
  }

  const metadata = appointment.metadata || {};
  if (typeof metadata.nylas_grant_id === 'string' && grantIds.has(metadata.nylas_grant_id.trim())) {
    return true;
  }

  const eventIdsByMember = metadata.nylas_event_ids;
  if (eventIdsByMember && typeof eventIdsByMember === 'object') {
    for (const memberId of memberIds) {
      if (Object.prototype.hasOwnProperty.call(eventIdsByMember, String(memberId))) {
        return true;
      }
    }
  }

  return false;
}

function buildMissingEventMetadata(existingMetadata: JsonRecord | null): JsonRecord {
  return {
    ...(existingMetadata || {}),
    nylas_status: 'deleted',
    sync_source: 'nylas_reconcile'
  };
}

export interface PhoneNumberAgentRef {
  id: number;
  nombre_agente: string | null;
}

export interface PhoneNumberRecord {
  id: number;
  telefono: string | null;
  nombre: string | null;
  activo: boolean | null;
  created_at: string;
  updated_at: string;
  empresa_id: number | null;
  agente_id: number | null;
  canal: string | null;
  id_kapso: string | null;
  agent?: PhoneNumberAgentRef | null;
}

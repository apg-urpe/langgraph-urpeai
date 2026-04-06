import * as carteraRepo from './cartera-repository';
import { getServiceCommitmentInfoWhatsApp } from './utils/finance-utils';
import { CarteraRecord } from '../../types/whatsapp-templates';

export interface ObtenerRegistrosOptions {
  empresaId: number;
  contactoIds?: number[];
  limit?: number;
  excluirContactoIds?: number[];
}

/**
 * Obtiene y filtra deudores listos para envío basándose en reglas de negocio (mora, vencimiento).
 */
export async function obtenerRegistrosParaEnvio({ 
  empresaId, 
  contactoIds, 
  limit = 100, 
  excluirContactoIds = [] 
}: ObtenerRegistrosOptions) {
  const servicios = await carteraRepo.obtenerServiciosConDeuda({ 
    empresaId, 
    contactoIds, 
    limit, 
    excluirContactoIds 
  });

  const deudores: CarteraRecord[] = servicios
    .map((servicio: any) => {
      // Usar la lógica de finanzas específica para WhatsApp
      const infoMora = getServiceCommitmentInfoWhatsApp(servicio);

      if (!servicio.contacto) return null;

      return {
        id: servicio.contacto.id,
        empresa_id: servicio.empresa_id,
        contacto_id: servicio.contacto.id,
        telefono: servicio.contacto.telefono,
        nombre: `${servicio.contacto.nombre} ${servicio.contacto.apellido || ''}`.trim(),
        cartera: {
          servicio_id: servicio.id,
          nombre_servicio: servicio.nombre_servicio,
          saldo_pendiente: infoMora.saldo_pendiente,
          dias_mora: infoMora.daysOverdue,
          estado_mora: infoMora.status,
          clasificacion_interna: infoMora.clasificacion_interna || `cartera_dias_${infoMora.daysOverdue}`,
          vencimiento: infoMora.dueDate ? infoMora.dueDate.toISOString().split('T')[0] : null,
          cuota_mensual: servicio.cuota_mensual || 0,
        },
      };
    })
    .filter((contacto: any): contacto is CarteraRecord => {
      if (!contacto) return false;
      const estadosValidos = ['en_mora', 'vence_hoy', 'vence_manana'];
      return estadosValidos.includes(contacto.cartera.estado_mora);
    });

  return {
    deudores,
    totalAnalizados: servicios.length
  };
}

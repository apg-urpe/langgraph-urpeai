/**
 * Calcula la información de compromiso de pago de un servicio con clasificaciones para WhatsApp.
 */
export function getServiceCommitmentInfoWhatsApp(service: any) {
  const { dia_compromiso_pago, cuota_mensual, saldo_pendiente, saldo_pagado, pagos, fecha_inicio } = service;

  const hoy = new Date();
  hoy.setHours(12, 0, 0, 0);

  const saldo = parseFloat(saldo_pendiente || 0);
  if (saldo <= 0) {
    return {
      status: 'pagado',
      daysOverdue: 0,
      dueDate: null,
      saldo_pendiente: 0,
      clasificacion_interna: null
    };
  }

  if (!dia_compromiso_pago) {
    return {
      status: 'sin_configurar',
      daysOverdue: 0,
      dueDate: null,
      saldo_pendiente: saldo,
      clasificacion_interna: null
    };
  }

  let primerVencimiento: Date;
  if (fecha_inicio) {
    const inicio = new Date(fecha_inicio);
    inicio.setHours(12, 0, 0, 0);
    const mesInicio = inicio.getMonth();
    const anioInicio = inicio.getFullYear();
    const diaInicio = inicio.getDate();

    if (diaInicio < dia_compromiso_pago) {
      primerVencimiento = new Date(anioInicio, mesInicio, dia_compromiso_pago, 12, 0, 0, 0);
    } else {
      primerVencimiento = new Date(anioInicio, mesInicio + 1, dia_compromiso_pago, 12, 0, 0, 0);
    }
    if (primerVencimiento.getDate() !== dia_compromiso_pago) {
      primerVencimiento = new Date(primerVencimiento.getFullYear(), primerVencimiento.getMonth() + 1, 0, 12, 0, 0, 0);
    }
  } else {
    primerVencimiento = new Date(hoy.getFullYear(), hoy.getMonth(), dia_compromiso_pago, 12, 0, 0, 0);
    if (primerVencimiento.getDate() !== dia_compromiso_pago) {
      primerVencimiento = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 12, 0, 0, 0);
    }
  }

  const cuota = parseFloat(cuota_mensual || 0);
  const pagado = parseFloat(saldo_pagado || 0);
  let cuotasCubiertas = 0;

  if (cuota > 0) {
    cuotasCubiertas = Math.floor(pagado / cuota);
  } else if (Array.isArray(pagos) && pagos.length > 0) {
    cuotasCubiertas = pagos.filter((p: any) => p.estado === 'confirmado').length;
  }

  let vencimiento = new Date(
    primerVencimiento.getFullYear(),
    primerVencimiento.getMonth() + cuotasCubiertas,
    dia_compromiso_pago,
    12, 0, 0, 0
  );
  if (vencimiento.getDate() !== dia_compromiso_pago) {
    vencimiento = new Date(vencimiento.getFullYear(), vencimiento.getMonth() + 1, 0, 12, 0, 0, 0);
  }

  const diffTime = hoy.getTime() - vencimiento.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  const daysDiff = Math.round(diffTime / oneDay);

  let status = 'al_dia';
  let clasificacion_interna = null;
  let daysOverdue = 0;

  if (daysDiff === -1) {
    status = 'vence_manana';
    clasificacion_interna = 'cartera_dias_-1';
  } else if (daysDiff === 0) {
    status = 'vence_hoy';
    clasificacion_interna = 'cartera_dias_0';
  } else if (daysDiff >= 1 && daysDiff <= 2) {
    status = 'en_mora';
    daysOverdue = daysDiff;
    clasificacion_interna = 'cartera_dias_1-2';
  } else if (daysDiff >= 3 && daysDiff <= 10) {
    status = 'en_mora';
    daysOverdue = daysDiff;
    clasificacion_interna = 'cartera_dias_3-10';
  } else if (daysDiff >= 11 && daysDiff <= 14) {
    status = 'en_mora';
    daysOverdue = daysDiff;
    clasificacion_interna = 'cartera_dias_11-14';
  } else if (daysDiff >= 15 && daysDiff <= 20) {
    status = 'en_mora';
    daysOverdue = daysDiff;
    clasificacion_interna = 'cartera_dias_15-20';
  } else if (daysDiff > 20) {
    status = 'en_mora';
    daysOverdue = daysDiff;
    clasificacion_interna = 'cartera_dias_mas_20';
  }

  return {
    status,
    clasificacion_interna,
    daysOverdue,
    dueDate: vencimiento,
    saldo_pendiente: saldo
  };
}

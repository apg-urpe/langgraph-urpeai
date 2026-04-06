---
title: "Plan de Implementación Módulo de Gestión de Cartera y Servicios"
---

## 1. Investigación y Análisis
El sistema actual ("Chat Urpe AI LAB") gestiona contactos, conversaciones, citas y tareas. Falta un componente crítico para la gestión comercial post-cierre o de seguimiento de ventas: **la administración de servicios contratados y pagos (Cartera)**.

Actualmente, `wp_contactos` es la entidad central. La nueva funcionalidad debe orbitar alrededor del contacto, permitiendo registrar qué servicios ha adquirido, el estado de su contrato y el flujo de pagos.

### Requerimientos Identificados:
- **Registro de Servicios**: Qué se vendió, valor, tipo.
- **Contratos**: Documentos asociados.
- **Cartera/Pagos**: Registro de ingresos, saldo restante.
- **Indicadores**: Visualización rápida del estado de cuenta del cliente.

## 2. Estructura de Datos Propuesta

Se propone un nuevo esquema o conjunto de tablas prefijadas con `wp_crm_` o integradas al esquema existente `public`.

### Entidades Nuevas:

#### A. Servicios Contratados (`wp_crm_servicios`)
Representa un contrato o venta específica.
- **Relación**: Pertenece a un Contacto (`wp_contactos`) y una Empresa (`wp_empresa_perfil`).
- **Campos Clave**:
  - `nombre_servicio`: Título descriptivo.
  - `tipo_servicio`: Categoría (Ej: "Consultoría", "Suscripción", "Desarrollo").
  - `valor_total`: Monto total del contrato.
  - `moneda`: Moneda del contrato (USD, PEN, etc.).
  - `estado`: `activo`, `finalizado`, `cancelado`, `pendiente`.
  - `fecha_inicio` / `fecha_fin`: Vigencia.
  - `contrato_url`: Link al archivo (Supabase Storage).
  - `saldo_pagado`: Campo calculado o actualizado por triggers.
  - `saldo_pendiente`: Campo calculado (valor_total - saldo_pagado).

#### B. Pagos / Transacciones (`wp_crm_pagos`)
Representa los abonos realizados a un servicio.
- **Relación**: Pertenece a un Servicio (`wp_crm_servicios`).
- **Campos Clave**:
  - `monto`: Cantidad abonada.
  - `fecha_pago`: Fecha real del pago.
  - `metodo_pago`: Transferencia, Tarjeta, Efectivo, etc.
  - `referencia`: Nro de operación, voucher.
  - `comprobante_url`: Link a la imagen/pdf del comprobante.
  - `estado`: `confirmado`, `pendiente`, `rechazado`.
  - `registrado_por`: Usuario que registró el pago (`wp_team_humano`).

## 3. Plan de Implementación en UI

### A. Tipos TypeScript (`types/finance.ts`)
Definir interfaces para `Service` y `Payment` que reflejen la BD.

### B. Store (`store/financeStore.ts` o integración en `contactStore.ts`)
Dado que está muy ligado al contacto, se puede extender `contactStore` o crear un slice dedicado si crece mucho. Para mantener cohesión, sugeriría integrarlo en `contactStore` al principio o crear un `useFinance` hook que consuma Supabase directamente para estas listas, cacheado por `contactId`.

### C. Componentes UI
1.  **Nuevo Tab en `ContactDetailPanel`**: "Cartera" o "Servicios".
    - Icono: `Wallet` o `CreditCard`.
2.  **Vista de Servicios (`ContactServices.tsx`)**:
    - Lista de tarjetas de servicios.
    - Header con métricas resumen (Total Contratado, Total Pagado, Deuda Total).
3.  **Detalle de Servicio (Modal o Expandible)**:
    - Info del contrato.
    - Barra de progreso de pagos.
    - Lista historial de pagos.
    - Botón "Registrar Pago".
    - Botón "Subir Contrato".

### D. Integración Backend
- **Triggers**: Actualizar `saldo_pagado` en `wp_crm_servicios` automáticamente cuando se inserta/actualiza/borra un registro en `wp_crm_pagos`.
- **Storage**: Bucket `contracts` y `payments` para archivos.

## 4. Diseño SQL

Ver archivo `CARTERA_SCHEMA.sql` adjunto.

# 💰 Módulo: Finanzas

> Gestión de servicios, pagos y cartera

---

## 🎯 Propósito

El módulo de Finanzas proporciona:
- **Servicios contratados**: Registro de servicios vendidos
- **Control de pagos**: Abonos parciales y totales
- **Comprobantes**: Gestión de recibos digitales
- **Cartera**: Seguimiento de saldos pendientes

---

## 🏗️ Componentes

| Componente | Ubicación | Propósito |
|------------|-----------|-----------|
| `FinanceView.tsx` | `/components/admin/` | Vista principal |
| `ServiceModal.tsx` | `/components/admin/` | Crear/editar servicio |
| `PaymentModal.tsx` | `/components/admin/` | Registrar pago |
| `PaymentFormModal.tsx` | `/components/admin/` | Formulario de pago |

---

## 💾 Modelo de Datos

### wp_crm_servicios
```typescript
interface Service {
  id: number;
  empresa_id: number;
  contacto_id: number;
  nombre: string;
  descripcion: string | null;
  valor_total: number;
  saldo_pendiente: number;
  estado: 'activo' | 'completado' | 'cancelado';
  fecha_inicio: string | null;
  fecha_fin: string | null;
  metadata: Record<string, any>;
  created_at: string;
}
```

### wp_crm_pagos
```typescript
interface Payment {
  id: number;
  servicio_id: number;
  monto: number;
  fecha_pago: string;
  metodo_pago: string | null;
  comprobante_url: string | null;
  notas: string | null;
  registrado_por: number;  // team_humano_id
  metadata: Record<string, any>;
  created_at: string;
}
```

---

## 📊 Estados de Servicio

| Estado | Descripción | Color |
|--------|-------------|-------|
| `activo` | Con saldo pendiente | Azul |
| `completado` | Pagado en su totalidad | Verde |
| `cancelado` | Servicio cancelado | Rojo |

---

## 🔄 Flujo de Datos

### Store: `financeStore.ts`

```typescript
// Estado
services: Service[];
payments: Record<number, Payment[]>;
isLoading: boolean;

// Servicios
fetchServices(enterpriseId)
createService(payload)
updateService(serviceId, updates)
deleteService(serviceId)

// Pagos
fetchPayments(serviceId)
createPayment(serviceId, payment)
deletePayment(paymentId)

// Utilidades
getServiceBalance(serviceId)
getTotalRevenue(enterpriseId, dateRange)
```

---

## 📁 Storage: Comprobantes

### Bucket: `comprobantes`
- **Visibilidad**: Público (signed URLs)
- **Formatos**: Imágenes (jpg, png), PDF
- **Max size**: 20MB

### Flujo de Upload
```typescript
// 1. Upload a Storage
const { data } = await supabase.storage
  .from('comprobantes')
  .upload(`${serviceId}/${fileName}`, file);

// 2. Obtener URL pública
const publicUrl = supabase.storage
  .from('comprobantes')
  .getPublicUrl(data.path);

// 3. Guardar en pago
createPayment(serviceId, { 
  monto, 
  comprobante_url: publicUrl 
});
```

---

## 📈 Métricas Disponibles

| Métrica | Descripción |
|---------|-------------|
| Ingresos totales | Suma de pagos en período |
| Cartera pendiente | Suma de saldos pendientes |
| Servicios activos | Count estado='activo' |
| Tasa de cobro | Pagado / Total facturado |

---

## 📚 Documentación Relacionada

- [Plan de Cartera](./CARTERA_MODULE_PLAN.md)
- [Contactos](../contacts/README.md)

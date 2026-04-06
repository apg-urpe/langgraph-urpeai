# 🏢 Guía de Contextos de Empresa (Multi-Tenant)

En Urpe AI Lab, manejamos una distinción técnica fundamental para permitir que el equipo administrativo (Role 1) pueda observar diferentes empresas sin perder su identidad de contratación.

## 🔑 Conceptos Clave

### 1. `empresa_id` (Dueño / Contrato)
- **Qué es**: La empresa a la que pertenece **legalmente** un registro o un usuario.
- **Uso**: 
  - Es el campo físico en las tablas de la DB (`wp_contactos`, `wp_team_humano`, etc.).
  - Se usa para **Políticas de Seguridad (RLS)**.
  - Define quién es el "dueño" del dato.
- **En el código**: Lo verás como propiedad de objetos que vienen de la DB.

### 2. `enterpriseId` / `selectedEnterpriseId` (Lente / Observación)
- **Qué es**: La empresa que el usuario está **viendo actualmente** en su pantalla.
- **Uso**:
  - Para el equipo de desarrollo (Role 1), este ID es **dinámico**. Pueden cambiar su "lente" para ver datos de la Empresa A, luego la B, etc.
  - Para otros roles (2 y 3), este ID suele ser igual a su `empresa_id`.
- **En el código**: Se maneja en `useContactStore` (`selectedEnterpriseId`) y se pasa como contexto a las funciones del `DAL` y el `Tool Executor`.

---

## 🛠️ Reglas de Oro para Desarrolladores

### 1. Queries de Lectura (Selects)
Usa siempre el **`enterpriseId` del contexto** para filtrar. Esto garantiza que el modo observación funcione.
```typescript
// ✅ CORRECTO (Usa el lente de observación)
const { data } = await supabase
  .from('wp_contactos')
  .select('*')
  .eq('empresa_id', context.enterpriseId);
```

### 2. Operaciones de Escritura (Inserts/Updates)
Las operaciones de escritura están generalmente **bloqueadas** en modo observación (`isObservationMode: true`) para evitar que un administrador modifique datos de una empresa ajena por error.
```typescript
// Verificación estándar en Stores
if (get().isObservationMode) {
  logger.warn('Escritura bloqueada en modo observación');
  return;
}
```

### 3. El `DALContext`
Todas las funciones en `lib/dal/` deben recibir un objeto `DALContext` que contiene ambos conceptos si es necesario, pero priorizando el `enterpriseId` para el filtrado.

---

## 🚦 Diagnóstico de Problemas
Si un usuario dice "No encuentro el contacto" pero el contacto existe:
1. Verifica si el usuario está en **Modo Observación**.
2. Compara el `empresa_id` del registro en la DB con el `selectedEnterpriseId` que está enviando el frontend.
3. Si no coinciden, el sistema (correctamente) bloqueará el acceso.

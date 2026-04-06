# Sistema de Storage - Urpe AI Lab

## Arquitectura de Almacenamiento
El proyecto utiliza **Supabase Storage** como motor principal para el manejo de archivos persistentes. La arquitectura está diseñada para ser multi-tenant, organizando los archivos por `empresa_id` y `contacto_id` para garantizar la aislación de datos.

### 🗄️ Buckets de Almacenamiento
Contamos con 5 buckets principales definidos en `lib/storage.ts`:

| Bucket | Uso Principal | Políticas de Acceso |
|--------|---------------|---------------------|
| `comprobantes` | Recibos de pago y facturas | Privado / Solo lectura por equipo |
| `contratos` | Documentos legales y contratos | Privado |
| `avatars` | Fotos de perfil de contactos y equipo | Público |
| `notas` | Adjuntos en notas de seguimiento | Privado |
| `chat-uploads` | Archivos enviados vía chat (Gemini 3) | Privado con URLs firmadas |

### 🚀 Servicios y Helpers

#### 1. Core Storage (`lib/storage.ts`)
Provee funciones genéricas para el manejo de archivos:
- `uploadFile`: Función base con validación de tipo y tamaño (Max 5MB).
- `deleteFile`: Eliminación física de archivos.
- `getThumbnailUrl`: Genera miniaturas usando el motor de transformación de imágenes de Supabase.

#### 2. Chat Storage (`lib/chat-upload.ts`)
Servicio especializado para el sistema de chat y IA (Gemini 3):
- **Formatos Soportados**: Imágenes (JPG, PNG, WebP), Documentos (PDF), Audio (MP3, WAV) y Video (MP4).
- **URLs Firmadas**: Genera URLs temporales (1 hora) para asegurar que los archivos no sean accesibles públicamente sin autorización.
- **Integración IA**: Helpers para preparar adjuntos en el formato esperado por la API de Gemini.

### 🛠️ Flujo de Implementación

Para subir un archivo desde un componente:
1. Validar el archivo usando `validateFile`.
2. Llamar a la función específica (ej: `uploadComprobante`).
3. Guardar la URL pública o el `storagePath` en la base de datos (PostgreSQL).

```typescript
import { uploadComprobante } from '@/lib/storage';

const handleUpload = async (file: File) => {
  const result = await uploadComprobante(file, empresaId, contactoId);
  if (result.success) {
    // Guardar result.url en la tabla de pagos
  }
};
```

### 💾 Almacenamiento Local (Draft System)
Además del almacenamiento persistente en la nube, el sistema utiliza un **Draft Storage System** (`lib/draft-storage.ts`) basado en `localStorage` para mejorar la experiencia de usuario.

- **Propósito**: Persistir borradores de texto, estados de búsqueda y formularios no enviados.
- **Características**:
    - **Debounce**: Evita escrituras excesivas (500ms).
    - **TTL**: Los borradores expiran después de 48 horas.
    - **Namespaces**: Organizados por contexto (`chat_input`, `search_query`, `task_form`, etc.).
    - **Límites**: Máximo 50KB por borrador y 20 borradores por namespace.

### 📝 Uso de Storage en Módulos
- **Tareas**: Los adjuntos se suben al bucket `notas` y se vinculan a través de `wp_tareas_media`.
- **CRM**: Los comprobantes de pago se organizan en `empresa_{id}/contacto_{id}/pago_{id}.ext`.
- **Marketing**: Los assets de campañas se almacenan en el bucket correspondiente para su envío.

### 🔒 Seguridad y Multi-tenancy
- **Estructura de Carpetas**: `empresa_{id}/contacto_{id}/{filename}`.
- **Validación de Roles**: Antes de cada escritura, se verifica que el usuario pertenezca a la empresa (`empresa_id`).
- **Modo Observación**: El `contactStore` bloquea subidas de archivos si el `isObservationMode` está activo (Dev Team viendo clientes).

### 📏 Límites y Restricciones
- **General**: 5MB por archivo.
- **Video (Chat)**: Hasta 50MB.
- **MIME Types**: Restringidos por bucket para evitar archivos maliciosos.


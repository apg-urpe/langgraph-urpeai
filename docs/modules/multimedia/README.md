# Módulo de Multimedia - Chat Uploads

## Overview

Sistema de subida y procesamiento de archivos multimedia para el chat principal con Monica AI. Permite enviar imágenes, PDFs, audio y video que son procesados por Gemini 3.

## Arquitectura

```
Usuario selecciona/arrastra archivos
          ↓
    InputArea.tsx (preview local)
          ↓
    useChatReliable.ts (procesa y sube)
          ↓
    chat-upload.ts → Supabase Storage (bucket: chat-uploads)
          ↓
    /api/chat/route.ts (convierte a formato Gemini)
          ↓
    Gemini 3 API (procesa multimedia)
```

## Archivos Principales

| Archivo | Propósito |
|---------|-----------|
| `lib/chat-upload.ts` | Servicio de upload a Supabase Storage |
| `hooks/useChatReliable.ts` | Hook que maneja el flujo completo |
| `app/api/chat/route.ts` | API que convierte attachments a formato Gemini |
| `components/InputArea.tsx` | UI de selección/drag-drop de archivos |
| `types/chat.ts` | Tipo `Attachment` |
| `scripts/CHAT_UPLOADS_BUCKET.sql` | Configuración del bucket |

## Tipos de Archivo Soportados

### Imágenes
- JPEG (`image/jpeg`)
- PNG (`image/png`)
- GIF (`image/gif`)
- WebP (`image/webp`)

### Documentos
- PDF (`application/pdf`)

### Audio
- MP3 (`audio/mp3`, `audio/mpeg`)
- WAV (`audio/wav`)
- AAC (`audio/aac`)
- OGG (`audio/ogg`)
- FLAC (`audio/flac`)
- WebM Audio (`audio/webm`)

### Video
- MP4 (`video/mp4`)
- MPEG (`video/mpeg`)
- QuickTime/MOV (`video/quicktime`)
- AVI (`video/x-msvideo`)
- WebM (`video/webm`)

## Límites

| Parámetro | Valor |
|-----------|-------|
| Tamaño máximo por archivo | 20MB (50MB para video) |
| Archivos por mensaje | 5 máximo |
| Resolución de imágenes | Auto-resize a 1024px max |
| Compresión de imágenes | JPEG quality 0.7 |

## Flujo de Datos

### 1. Selección de Archivos (InputArea)
```typescript
// Usuario arrastra, pega o selecciona archivos
const processFile = async (file: File): Promise<Attachment> => {
  // Validación de tipo y tamaño
  // Compresión de imágenes
  // Conversión a base64 para preview
  return { name, type, data, file };
};
```

### 2. Upload al Enviar (useChatReliable)
```typescript
const { processed, errors } = await processAttachmentsForUpload(
  attachments,
  userId,
  sessionId
);
// Archivos subidos a: chat-uploads/{userId}/{sessionId}/{timestamp}_{random}_{name}
```

### 3. Conversión para Gemini (API Route)
```typescript
function attachmentToGeminiPart(attachment: Attachment) {
  // Si tiene base64, usa inline_data
  if (attachment.data) {
    return { inline_data: { mime_type, data: base64 } };
  }
  // Si tiene URL, usa file_data
  if (attachment.url) {
    return { file_data: { mime_type, file_uri: url } };
  }
}
```

## Configuración del Bucket

Ejecutar el script SQL en Supabase:

```sql
-- Ver scripts/CHAT_UPLOADS_BUCKET.sql
```

### Políticas de Seguridad
- **INSERT**: Solo usuarios autenticados
- **SELECT**: Público (necesario para que Gemini acceda)
- **UPDATE/DELETE**: Solo el propietario del archivo

### Estructura de Archivos
```
chat-uploads/
  {user_id}/
    {session_id}/
      {timestamp}_{random}_{filename}.{ext}
```

## Interfaz de Usuario

### Formas de Agregar Archivos
1. **Click en 📎**: Abre selector de archivos
2. **Drag & Drop**: Arrastra sobre el input
3. **Pegar (Ctrl+V)**: Pega imágenes del clipboard

### Preview de Archivos
- **Imágenes**: Thumbnail 56x56px con hover para ver nombre
- **Otros archivos**: Card con icono del tipo y nombre

### Estados Visuales
- **Arrastrando**: Overlay azul con icono de upload
- **Cargando**: Indicador de progreso (futuro)
- **Error**: Alerta con mensaje

## Uso con Gemini

Monica puede analizar cualquier archivo soportado:

```
Usuario: [adjunta imagen] "¿Qué ves en esta imagen?"
Monica: "Veo una gráfica de ventas que muestra..."

Usuario: [adjunta PDF] "Resume este documento"
Monica: "El documento contiene 3 secciones principales..."

Usuario: [adjunta audio] "Transcribe este audio"
Monica: "El audio dice: 'Hola, me gustaría...'..."
```

## API de Funciones

### chat-upload.ts

```typescript
// Validar archivo
validateFile(file: File): { valid: boolean; error?: string }

// Subir un archivo
uploadChatFile(file, userId, sessionId): Promise<ChatUploadResult>

// Subir múltiples archivos
uploadChatFiles(files, userId, sessionId): Promise<{ uploaded, errors }>

// Procesar attachments antes de enviar
processAttachmentsForUpload(attachments, userId, sessionId): Promise<{ processed, errors }>

// Convertir para Gemini
prepareAttachmentForGemini(attachment): GeminiPart
```

## Debugging

### Logs Relevantes
```
[ChatUpload] Uploading file: { name, type, size, path }
[ChatUpload] Upload successful: { path, publicUrl }
[Chat] Processing attachments: 2
[Chat API] Received attachments: [{ name, type, hasData, hasUrl }]
[Chat API] Added attachment part: { name, type, hasData, hasUrl }
```

### Errores Comunes
- **"Unsupported file type"**: Archivo no soportado por Gemini
- **"File too large"**: Excede límite de tamaño
- **"Upload failed"**: Error de red o permisos en Supabase

## Próximas Mejoras

- [ ] Indicador de progreso de upload
- [ ] Retry automático en fallas
- [ ] Previsualización de PDFs
- [ ] Reproductor de audio/video inline
- [ ] Limpieza automática de archivos antiguos

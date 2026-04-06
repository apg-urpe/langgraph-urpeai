import { supabase } from './supabase';
import { logger } from './logger';

// ============================================================================
// STORAGE CONFIGURATION
// ============================================================================

export const STORAGE_BUCKETS = {
  COMPROBANTES: 'comprobantes',
  CONTRATOS: 'contratos',
  AVATARS: 'avatars',
  NOTAS: 'notas',
  CHAT_UPLOADS: 'chat-uploads',
  CONTACT_MULTIMEDIA: 'guardado_multimedia',
  LOGOS_EMPRESA: 'logos-empresa'
} as const;

export type StorageBucket = typeof STORAGE_BUCKETS[keyof typeof STORAGE_BUCKETS];

// Allowed file types for receipts
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const ALLOWED_DOCUMENT_TYPES = ['application/pdf'];
export const ALLOWED_RECEIPT_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES];

// Max file size: 5MB
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Contact Multimedia Config (matches bucket config)
export const ALLOWED_MULTIMEDIA_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'application/rtf'
];
export const MAX_MULTIMEDIA_SIZE = 50 * 1024 * 1024; // 50MB

// ============================================================================
// TYPES
// ============================================================================

export interface UploadResult {
  success: boolean;
  url?: string;
  path?: string;
  error?: string;
}

export interface UploadOptions {
  bucket: StorageBucket;
  folder?: string;
  fileName?: string;
  upsert?: boolean;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a unique file name with timestamp and random suffix
 */
export const generateFileName = (originalName: string, prefix?: string): string => {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const extension = originalName.split('.').pop()?.toLowerCase() || 'file';
  const baseName = prefix ? `${prefix}_` : '';
  return `${baseName}${timestamp}_${randomSuffix}.${extension}`;
};

/**
 * Validate file before upload
 */
export const validateFile = (
  file: File, 
  allowedTypes: string[] = ALLOWED_RECEIPT_TYPES,
  maxSize: number = MAX_FILE_SIZE
): { valid: boolean; error?: string } => {
  if (!file) {
    return { valid: false, error: 'No se seleccionó ningún archivo' };
  }

  if (!allowedTypes.includes(file.type)) {
    const friendlyTypes = allowedTypes.map(t => t.split('/')[1]).join(', ');
    return { valid: false, error: `Tipo de archivo no permitido. Usa: ${friendlyTypes}` };
  }

  if (file.size > maxSize) {
    const maxSizeMB = Math.round(maxSize / (1024 * 1024));
    return { valid: false, error: `El archivo es muy grande. Máximo ${maxSizeMB}MB` };
  }

  return { valid: true };
};

/**
 * Get file extension from MIME type
 */
export const getExtensionFromMime = (mimeType: string): string => {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'application/pdf': 'pdf'
  };
  return mimeToExt[mimeType] || 'file';
};

// ============================================================================
// UPLOAD FUNCTIONS
// ============================================================================

/**
 * Upload a file to Supabase Storage
 */
export const uploadFile = async (
  file: File,
  options: UploadOptions
): Promise<UploadResult> => {
  const { bucket, folder = '', fileName, upsert = false } = options;

  // Validate file
  const validation = validateFile(file);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    // Generate file path
    const finalFileName = fileName || generateFileName(file.name);
    const filePath = folder ? `${folder}/${finalFileName}` : finalFileName;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert,
        contentType: file.type
      });

    if (error) {
      logger.error('[Storage] Upload error:', error);
      return { success: false, error: error.message };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path);

    return {
      success: true,
      url: urlData.publicUrl,
      path: data.path
    };

  } catch (err: any) {
    logger.error('[Storage] Unexpected error:', err);
    return { success: false, error: err.message || 'Error al subir archivo' };
  }
};

/**
 * Upload a payment receipt (comprobante)
 */
export const uploadComprobante = async (
  file: File,
  empresaId: number,
  contactoId: number,
  paymentId?: number
): Promise<UploadResult> => {
  const folder = `empresa_${empresaId}/contacto_${contactoId}`;
  const prefix = paymentId ? `pago_${paymentId}` : 'pago';
  
  return uploadFile(file, {
    bucket: STORAGE_BUCKETS.COMPROBANTES,
    folder,
    fileName: generateFileName(file.name, prefix)
  });
};

/**
 * Upload a contract file
 */
export const uploadContrato = async (
  file: File,
  empresaId: number,
  contactoId: number,
  serviceId?: number
): Promise<UploadResult> => {
  const folder = `empresa_${empresaId}/contacto_${contactoId}`;
  const prefix = serviceId ? `servicio_${serviceId}` : 'contrato';
  
  return uploadFile(file, {
    bucket: STORAGE_BUCKETS.CONTRATOS,
    folder,
    fileName: generateFileName(file.name, prefix)
  });
};

/**
 * Upload a note attachment file
 */
export const uploadNotaArchivo = async (
  file: File,
  empresaId: number,
  contactoId: number
): Promise<UploadResult> => {
  const folder = `empresa_${empresaId}/contacto_${contactoId}`;
  const prefix = 'nota';
  
  return uploadFile(file, {
    bucket: STORAGE_BUCKETS.NOTAS,
    folder,
    fileName: generateFileName(file.name, prefix)
  });
};

/**
 * Upload an enterprise logo image
 */
export const uploadEmpresaLogo = async (
  file: File,
  empresaId: number
): Promise<UploadResult> => {
  // Validate image type
  const validation = validateFile(file, ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const folder = `empresa_${empresaId}`;
  const prefix = 'logo';
  
  return uploadFile(file, {
    bucket: STORAGE_BUCKETS.LOGOS_EMPRESA,
    folder,
    fileName: generateFileName(file.name, prefix),
    upsert: true
  });
};

// ============================================================================
// DELETE FUNCTIONS
// ============================================================================

/**
 * Delete a file from Supabase Storage
 */
export const deleteFile = async (
  bucket: StorageBucket,
  filePath: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .remove([filePath]);

    if (error) {
      logger.error('[Storage] Delete error:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    logger.error('[Storage] Unexpected delete error:', err);
    return { success: false, error: err.message || 'Error al eliminar archivo' };
  }
};

/**
 * Extract file path from public URL
 */
export const getPathFromUrl = (url: string, bucket: StorageBucket): string | null => {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split(`/storage/v1/object/public/${bucket}/`);
    return pathParts.length > 1 ? decodeURIComponent(pathParts[1]) : null;
  } catch {
    return null;
  }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a URL is from Supabase Storage
 */
export const isSupabaseStorageUrl = (url: string): boolean => {
  if (!url) return false;
  return url.includes('supabase.co/storage/v1/object/public/');
};

/**
 * Get thumbnail URL (for images)
 */
export const getThumbnailUrl = (
  url: string,
  width: number = 200,
  height: number = 200
): string => {
  if (!isSupabaseStorageUrl(url)) return url;
  
  // Supabase image transformation
  const transformUrl = url.replace(
    '/storage/v1/object/public/',
    `/storage/v1/render/image/public/`
  );
  return `${transformUrl}?width=${width}&height=${height}&resize=contain`;
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// ============================================================================
// CONTACT MULTIMEDIA FUNCTIONS
// ============================================================================

/**
 * Determine multimedia type from MIME type
 */
export const getMultimediaTipo = (mimeType: string): 'imagen' | 'audio' | 'video' | 'documento' => {
  if (mimeType.startsWith('image/')) return 'imagen';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return 'documento';
};

/**
 * Infer multimedia type from URL (file extension) when MIME type is not available
 * Used to transform BD 'multimedia' type to specific type for frontend rendering
 */
export const inferMultimediaTipoFromUrl = (url: string | null | undefined): 'imagen' | 'audio' | 'video' | 'documento' => {
  if (!url) return 'documento';
  
  // Extract extension from URL (handle query params)
  const cleanUrl = url.split('?')[0];
  const ext = cleanUrl.split('.').pop()?.toLowerCase() || '';
  
  // Image extensions
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'heic', 'heif'].includes(ext)) {
    return 'imagen';
  }
  
  // Video extensions
  if (['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', '3gp', 'ogv'].includes(ext)) {
    return 'video';
  }
  
  // Audio extensions
  if (['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'wma', 'opus'].includes(ext)) {
    return 'audio';
  }
  
  return 'documento';
};

/**
 * Normalize message type from BD ('multimedia' | 'texto') to specific type for frontend
 * This bridges the gap between BD schema and frontend expectations
 */
export const normalizeMessageTipo = (
  tipo: string | null | undefined,
  url?: string | null
): 'texto' | 'imagen' | 'audio' | 'video' | 'documento' | 'archivo' | 'plantilla' => {
  // If already specific type, return as-is
  if (tipo && ['texto', 'imagen', 'audio', 'video', 'documento', 'archivo', 'plantilla'].includes(tipo)) {
    return tipo as 'texto' | 'imagen' | 'audio' | 'video' | 'documento' | 'archivo' | 'plantilla';
  }
  
  // If 'multimedia', infer from URL
  if (tipo === 'multimedia') {
    return inferMultimediaTipoFromUrl(url);
  }
  
  // Default to texto
  return 'texto';
};

/**
 * Upload multimedia file for a contact
 */
export const uploadContactMultimedia = async (
  file: File,
  empresaId: number,
  contactoId: number
): Promise<UploadResult> => {
  // Validate file type
  if (!ALLOWED_MULTIMEDIA_TYPES.includes(file.type)) {
    return { success: false, error: 'Tipo de archivo no permitido' };
  }

  // Validate file size
  if (file.size > MAX_MULTIMEDIA_SIZE) {
    const maxSizeMB = Math.round(MAX_MULTIMEDIA_SIZE / (1024 * 1024));
    return { success: false, error: `El archivo es muy grande. Máximo ${maxSizeMB}MB` };
  }

  try {
    const folder = `empresa_${empresaId}/contacto_${contactoId}`;
    const tipo = getMultimediaTipo(file.type);
    const fileName = generateFileName(file.name, tipo);
    const filePath = `${folder}/${fileName}`;

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS.CONTACT_MULTIMEDIA)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type
      });

    if (error) {
      logger.error('[Storage] Upload contact multimedia error:', error);
      return { success: false, error: error.message };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKETS.CONTACT_MULTIMEDIA)
      .getPublicUrl(data.path);

    logger.info(`[Storage] ✅ Uploaded contact multimedia: ${filePath}`);
    return {
      success: true,
      url: urlData.publicUrl,
      path: data.path
    };

  } catch (err: any) {
    logger.error('[Storage] Unexpected error uploading contact multimedia:', err);
    return { success: false, error: err.message || 'Error al subir archivo' };
  }
};

/**
 * Delete multimedia file for a contact
 */
export const deleteContactMultimedia = async (
  filePath: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase.storage
      .from(STORAGE_BUCKETS.CONTACT_MULTIMEDIA)
      .remove([filePath]);

    if (error) {
      logger.error('[Storage] Delete contact multimedia error:', error);
      return { success: false, error: error.message };
    }

    logger.info(`[Storage] ✅ Deleted contact multimedia: ${filePath}`);
    return { success: true };
  } catch (err: any) {
    logger.error('[Storage] Unexpected error deleting contact multimedia:', err);
    return { success: false, error: err.message || 'Error al eliminar archivo' };
  }
};

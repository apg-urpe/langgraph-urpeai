/**
 * Chat Upload Service
 * Handles file uploads to Supabase Storage for the chat system
 * 
 * Supported formats (Gemini 3):
 * - Images: JPEG, PNG, GIF, WebP
 * - Documents: PDF
 * - Audio: MP3, WAV, AAC, OGG, FLAC
 * - Video: MP4, MPEG, MOV, AVI, WebM
 */

import { supabase } from './supabase';
import { logger } from './logger';
import { Attachment } from '@/types/chat';

// ============================================================================
// CONFIGURATION
// ============================================================================

export const CHAT_UPLOADS_BUCKET = 'chat-uploads';

// Gemini 3 supported MIME types
export const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png', 
  'image/gif',
  'image/webp'
];

export const SUPPORTED_DOCUMENT_TYPES = [
  'application/pdf'
];

export const SUPPORTED_AUDIO_TYPES = [
  'audio/mp3',
  'audio/mpeg',
  'audio/wav',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
  'audio/webm'
];

export const SUPPORTED_VIDEO_TYPES = [
  'video/mp4',
  'video/mpeg',
  'video/quicktime', // .mov
  'video/x-msvideo', // .avi
  'video/webm'
];

export const ALL_SUPPORTED_TYPES = [
  ...SUPPORTED_IMAGE_TYPES,
  ...SUPPORTED_DOCUMENT_TYPES,
  ...SUPPORTED_AUDIO_TYPES,
  ...SUPPORTED_VIDEO_TYPES
];

// File size limits (in bytes)
export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB general
export const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB for images
export const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB for video

// ============================================================================
// TYPES
// ============================================================================

export interface ChatUploadResult {
  success: boolean;
  url?: string;
  signedUrl?: string;
  storagePath?: string;
  mimeType?: string;
  fileName?: string;
  error?: string;
}

export interface UploadedFile {
  url: string;
  signedUrl: string;
  storagePath: string;
  mimeType: string;
  fileName: string;
  originalName: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Check if a MIME type is supported by Gemini
 */
export function isSupportedType(mimeType: string): boolean {
  return ALL_SUPPORTED_TYPES.includes(mimeType);
}

/**
 * Get file category from MIME type
 */
export function getFileCategory(mimeType: string): 'image' | 'document' | 'audio' | 'video' | 'unknown' {
  if (SUPPORTED_IMAGE_TYPES.includes(mimeType)) return 'image';
  if (SUPPORTED_DOCUMENT_TYPES.includes(mimeType)) return 'document';
  if (SUPPORTED_AUDIO_TYPES.includes(mimeType)) return 'audio';
  if (SUPPORTED_VIDEO_TYPES.includes(mimeType)) return 'video';
  return 'unknown';
}

/**
 * Get max file size based on MIME type
 */
export function getMaxSizeForType(mimeType: string): number {
  if (SUPPORTED_VIDEO_TYPES.includes(mimeType)) return MAX_VIDEO_SIZE;
  return MAX_FILE_SIZE;
}

/**
 * Generate unique file path for storage
 */
export function generateStoragePath(
  userId: string,
  sessionId: string,
  fileName: string
): string {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const extension = fileName.split('.').pop()?.toLowerCase() || 'file';
  const sanitizedName = fileName
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .substring(0, 50);
  
  // Structure: userId/sessionId/timestamp_random_filename.ext
  return `${userId}/${sessionId}/${timestamp}_${randomSuffix}_${sanitizedName}`;
}

/**
 * Validate file before upload
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  if (!isSupportedType(file.type)) {
    const supportedExtensions = ALL_SUPPORTED_TYPES
      .map(t => t.split('/')[1])
      .join(', ');
    return { 
      valid: false, 
      error: `Unsupported file type: ${file.type}. Supported: ${supportedExtensions}` 
    };
  }

  const maxSize = getMaxSizeForType(file.type);
  if (file.size > maxSize) {
    const maxSizeMB = Math.round(maxSize / (1024 * 1024));
    return { 
      valid: false, 
      error: `File too large (${Math.round(file.size / (1024 * 1024))}MB). Max: ${maxSizeMB}MB` 
    };
  }

  return { valid: true };
}

// ============================================================================
// UPLOAD FUNCTIONS
// ============================================================================

/**
 * Upload a single file to chat-uploads bucket
 */
export async function uploadChatFile(
  file: File,
  userId: string,
  sessionId: string
): Promise<ChatUploadResult> {
  // Validate file
  const validation = validateFile(file);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    const storagePath = generateStoragePath(userId, sessionId, file.name);
    
    logger.debug('[ChatUpload] Uploading file:', {
      name: file.name,
      type: file.type,
      size: file.size,
      path: storagePath
    });

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(CHAT_UPLOADS_BUCKET)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type
      });

    if (error) {
      logger.error('[ChatUpload] Upload error:', error);
      return { success: false, error: error.message };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(CHAT_UPLOADS_BUCKET)
      .getPublicUrl(data.path);

    // Get signed URL (1 hour expiry) for private access
    const { data: signedData, error: signedError } = await supabase.storage
      .from(CHAT_UPLOADS_BUCKET)
      .createSignedUrl(data.path, 3600); // 1 hour

    if (signedError) {
      logger.warn('[ChatUpload] Signed URL error:', signedError);
    }

    logger.debug('[ChatUpload] Upload successful:', {
      path: data.path,
      publicUrl: urlData.publicUrl
    });

    return {
      success: true,
      url: urlData.publicUrl,
      signedUrl: signedData?.signedUrl || urlData.publicUrl,
      storagePath: data.path,
      mimeType: file.type,
      fileName: file.name
    };

  } catch (err: any) {
    logger.error('[ChatUpload] Unexpected error:', err);
    return { success: false, error: err.message || 'Upload failed' };
  }
}

/**
 * Upload multiple files for a chat message
 */
export async function uploadChatFiles(
  files: File[],
  userId: string,
  sessionId: string
): Promise<{ uploaded: UploadedFile[]; errors: string[] }> {
  const uploaded: UploadedFile[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const result = await uploadChatFile(file, userId, sessionId);
    
    if (result.success && result.url && result.storagePath) {
      uploaded.push({
        url: result.url,
        signedUrl: result.signedUrl || result.url,
        storagePath: result.storagePath,
        mimeType: result.mimeType || file.type,
        fileName: result.fileName || file.name,
        originalName: file.name
      });
    } else {
      errors.push(`${file.name}: ${result.error || 'Upload failed'}`);
    }
  }

  return { uploaded, errors };
}

/**
 * Convert Attachment[] to uploadable files and process them
 * Returns updated attachments with URLs
 */
export async function processAttachmentsForUpload(
  attachments: Attachment[],
  userId: string,
  sessionId: string
): Promise<{ processed: Attachment[]; errors: string[] }> {
  const processed: Attachment[] = [];
  const errors: string[] = [];

  for (const attachment of attachments) {
    // If attachment already has a URL (already uploaded), keep it
    if (attachment.url && attachment.storagePath) {
      processed.push(attachment);
      continue;
    }

    // If we have a File object, upload it
    if (attachment.file) {
      const result = await uploadChatFile(attachment.file, userId, sessionId);
      
      if (result.success) {
        processed.push({
          ...attachment,
          url: result.signedUrl || result.url,
          storagePath: result.storagePath,
          // Keep base64 data for preview, but URL is canonical
        });
      } else {
        errors.push(`${attachment.name}: ${result.error}`);
      }
    } else if (attachment.data) {
      // If we only have base64 data (no File), we can still use it directly
      // Gemini supports inline base64 data
      processed.push(attachment);
    }
  }

  return { processed, errors };
}

/**
 * Convert base64 data URL to File object
 */
export function dataUrlToFile(dataUrl: string, fileName: string): File | null {
  try {
    const arr = dataUrl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) return null;
    
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    
    return new File([u8arr], fileName, { type: mime });
  } catch (err) {
    logger.error('[ChatUpload] Error converting data URL to File:', err);
    return null;
  }
}

/**
 * Delete a file from storage
 */
export async function deleteChatFile(storagePath: string): Promise<boolean> {
  try {
    const { error } = await supabase.storage
      .from(CHAT_UPLOADS_BUCKET)
      .remove([storagePath]);

    if (error) {
      logger.error('[ChatUpload] Delete error:', error);
      return false;
    }

    return true;
  } catch (err) {
    logger.error('[ChatUpload] Delete unexpected error:', err);
    return false;
  }
}

// ============================================================================
// GEMINI HELPERS
// ============================================================================

/**
 * Prepare attachment for Gemini API
 * Returns the part format expected by Gemini
 */
export function prepareAttachmentForGemini(attachment: Attachment): any {
  const category = getFileCategory(attachment.type);
  
  // If we have base64 data, use inline_data
  if (attachment.data && attachment.data.startsWith('data:')) {
    const base64Data = attachment.data.split(',')[1];
    return {
      inline_data: {
        mime_type: attachment.type,
        data: base64Data
      }
    };
  }
  
  // If we have a URL, use file_data (for supported types)
  if (attachment.url) {
    return {
      file_data: {
        mime_type: attachment.type,
        file_uri: attachment.url
      }
    };
  }
  
  return null;
}

/**
 * Prepare multiple attachments for Gemini API
 */
export function prepareAttachmentsForGemini(attachments: Attachment[]): any[] {
  const parts: any[] = [];
  
  for (const attachment of attachments) {
    const part = prepareAttachmentForGemini(attachment);
    if (part) {
      parts.push(part);
    }
  }
  
  return parts;
}

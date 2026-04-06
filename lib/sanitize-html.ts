/**
 * HTML Sanitization Utility
 * 
 * Provides safe HTML rendering by escaping dangerous content
 * while preserving allowed formatting tags.
 * 
 * Works in both browser and server environments without jsdom.
 * - Browser: Uses DOMPurify with native window
 * - Server: Uses HTML escape fallback (no DOM parsing)
 */

import DOMPurify from 'dompurify';

// Check if we're in browser environment
const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';

// Initialize DOMPurify only in browser
const purify = isBrowser ? DOMPurify(window) : null;

// Allowed tags and their allowed attributes for DOMPurify
const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'a', 'strong', 'b', 'em', 'i', 'br', 'ul', 'ol', 'li', 'p', 'span', 'div', 
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'thead', 'tbody', 'tr', 'td', 'th',
    'img', 'small', 'pre', 'blockquote'
  ],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'src', 'alt', 'width', 'height'],
  FORCE_BODY: true,
};

// Escape HTML entities (simple fallback)
const escapeHtml = (str: string): string => {
  const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
  };
  return str.replace(/[&<>"']/g, (char) => escapeMap[char] || char);
};

// Validate URL is safe (no javascript:, data:, etc.)
const isSafeUrl = (url: string): boolean => {
  if (!url) return false;
  const trimmedUrl = url.trim().toLowerCase();
  // Only allow http, https, mailto, and tel protocols
  return (
    trimmedUrl.startsWith('http://') ||
    trimmedUrl.startsWith('https://') ||
    trimmedUrl.startsWith('mailto:') ||
    trimmedUrl.startsWith('tel:') ||
    trimmedUrl.startsWith('/') ||
    trimmedUrl.startsWith('#')
  );
};

/**
 * Sanitize HTML string using DOMPurify (browser) or escape fallback (server)
 */
export const sanitizeHtml = (html: string): string => {
  if (!html || typeof html !== 'string') return '';
  
  // In browser, use DOMPurify for proper sanitization
  if (purify) {
    return purify.sanitize(html, PURIFY_CONFIG);
  }
  
  // On server, use simple HTML escape as fallback
  // This is safe because actual rendering happens client-side
  return escapeHtml(html);
};

/**
 * Convert markdown-like syntax to safe HTML
 */
export const markdownToSafeHtml = (input: string): string => {
  if (!input || typeof input !== 'string') return '';
  
  // Convert **bold** to <strong>
  let html = input.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  // Convert markdown links [text](url) to safe anchors
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (match, text, url) => {
      if (!isSafeUrl(url)) {
        return text;
      }
      return `<a class="text-primary-400 underline" href="${url}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    }
  );
  
  // Convert newlines to <br>
  html = html.replace(/(?:\r\n|\r|\n)/g, '<br>');
  
  return sanitizeHtml(html);
};

/**
 * Process content for CardsBlock - sanitize existing HTML
 */
export const sanitizeCardContent = (content: string): string => {
  return sanitizeHtml(content);
};

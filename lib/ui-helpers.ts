/**
 * UI Helpers - Centralized utility functions
 * 
 * This file consolidates commonly used helper functions to avoid duplication
 * across components and stores.
 */

// ============================================================================
// TEXT NORMALIZATION UTILITIES
// ============================================================================

/**
 * Remove accents/diacritics from text for accent-insensitive search
 * e.g. "José" -> "Jose", "María" -> "Maria"
 */
export const removeAccents = (text: string): string => {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};

/**
 * Get search variants for a term (with and without accents)
 * Returns unique variants to search
 */
export const getSearchVariants = (term: string): string[] => {
  const original = term.trim();
  const normalized = removeAccents(original);
  
  // Return unique variants
  if (original.toLowerCase() === normalized.toLowerCase()) {
    return [original];
  }
  return [original, normalized];
};

// ============================================================================
// PHONE NUMBER UTILITIES
// ============================================================================

/**
 * Normalize phone numbers for search/comparison
 * Removes all non-numeric characters
 */
export const normalizePhone = (phone: string): string => {
  return phone.replace(/\D/g, '');
};

/**
 * Check if a search term looks like a phone number
 */
export const looksLikePhone = (term: string): boolean => {
  const digitsOnly = term.replace(/\D/g, '');
  return digitsOnly.length >= 3 && /^\d+$/.test(digitsOnly);
};

/**
 * Format phone number for display (add country code prefix if missing)
 */
export const formatPhoneDisplay = (phone: string, countryCode = '+51'): string => {
  const normalized = normalizePhone(phone);
  if (normalized.startsWith('51') && normalized.length === 11) {
    return `+${normalized}`;
  }
  if (normalized.length === 9) {
    return `${countryCode} ${normalized}`;
  }
  return phone;
};

// ============================================================================
// STATUS & COLOR UTILITIES
// ============================================================================

const STATUS_COLORS: Record<string, string> = {
  prospecto: 'text-blue-400',
  cliente: 'text-emerald-400',
  calificado: 'text-purple-400',
  no_calificado: 'text-rose-400',
  evaluando: 'text-amber-400',
  activo: 'text-emerald-400',
  inactivo: 'text-zinc-400',
  pendiente: 'text-amber-400',
  completado: 'text-emerald-400',
  cancelado: 'text-rose-400',
};

const STATUS_BG_COLORS: Record<string, string> = {
  prospecto: 'bg-blue-500/10 border-blue-500/20',
  cliente: 'bg-emerald-500/10 border-emerald-500/20',
  calificado: 'bg-purple-500/10 border-purple-500/20',
  no_calificado: 'bg-rose-500/10 border-rose-500/20',
  evaluando: 'bg-amber-500/10 border-amber-500/20',
  activo: 'bg-emerald-500/10 border-emerald-500/20',
  inactivo: 'bg-zinc-500/10 border-zinc-500/20',
  pendiente: 'bg-amber-500/10 border-amber-500/20',
  completado: 'bg-emerald-500/10 border-emerald-500/20',
  cancelado: 'bg-rose-500/10 border-rose-500/20',
};

/**
 * Get text color class for a status
 */
export const getStatusColor = (status?: string): string => {
  const key = status?.toLowerCase() || '';
  return STATUS_COLORS[key] || 'text-zinc-400';
};

/**
 * Get background color class for a status badge
 */
export const getStatusBgColor = (status?: string): string => {
  const key = status?.toLowerCase() || '';
  return STATUS_BG_COLORS[key] || 'bg-zinc-500/10 border-zinc-500/20';
};

// ============================================================================
// DATE & TIME UTILITIES
// ============================================================================

/**
 * Format relative time (e.g., "hace 5 min", "hace 2 horas")
 */
export const formatRelativeTime = (date: Date | string | null): string => {
  if (!date) return '-';
  
  const now = new Date();
  const target = new Date(date);
  const diffMs = now.getTime() - target.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return 'ahora';
  if (diffMins < 60) return `hace ${diffMins} min`;
  if (diffHours < 24) return `hace ${diffHours}h`;
  if (diffDays < 7) return `hace ${diffDays}d`;
  if (diffDays < 30) return `hace ${Math.floor(diffDays / 7)} sem`;
  
  return target.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
};

/**
 * Format date for display
 */
export const formatDate = (date: Date | string | null, format: 'short' | 'long' | 'time' = 'short'): string => {
  if (!date) return '-';
  
  const d = new Date(date);
  
  switch (format) {
    case 'long':
      return d.toLocaleDateString('es-PE', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    case 'time':
      return d.toLocaleTimeString('es-PE', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    default:
      return d.toLocaleDateString('es-PE', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric' 
      });
  }
};

// ============================================================================
// CURRENCY & NUMBER UTILITIES
// ============================================================================

/**
 * Format currency for display
 */
export const formatCurrency = (amount: number, currency = 'USD'): string => {
  return new Intl.NumberFormat('es-PE', { 
    style: 'currency', 
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amount);
};

/**
 * Format number with thousands separator
 */
export const formatNumber = (num: number): string => {
  return new Intl.NumberFormat('es-PE').format(num);
};

/**
 * Format percentage
 */
export const formatPercentage = (value: number, decimals = 0): string => {
  return `${value.toFixed(decimals)}%`;
};

// ============================================================================
// STRING UTILITIES
// ============================================================================

/**
 * Get initials from a name (e.g., "Juan Perez" -> "JP")
 */
export const getInitials = (name: string, maxChars = 2): string => {
  if (!name) return '?';
  
  const parts = name.trim().split(/\s+/);
  const initials = parts
    .slice(0, maxChars)
    .map(p => p.charAt(0).toUpperCase())
    .join('');
  
  return initials || name.charAt(0).toUpperCase();
};

/**
 * Truncate text with ellipsis
 */
export const truncate = (text: string, maxLength: number): string => {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
};

/**
 * Capitalize first letter
 */
export const capitalize = (text: string): string => {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

// ============================================================================
// AVATAR COLOR UTILITIES
// ============================================================================

const AVATAR_COLORS = [
  'bg-gradient-to-br from-rose-500 to-pink-600',
  'bg-gradient-to-br from-orange-500 to-amber-600',
  'bg-gradient-to-br from-emerald-500 to-teal-600',
  'bg-gradient-to-br from-blue-500 to-indigo-600',
  'bg-gradient-to-br from-purple-500 to-violet-600',
  'bg-gradient-to-br from-cyan-500 to-blue-600',
  'bg-gradient-to-br from-fuchsia-500 to-pink-600',
];

/**
 * Get consistent avatar color based on name/id
 */
export const getAvatarColor = (identifier: string | number): string => {
  const hash = String(identifier)
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Validate email format
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone format (Peruvian)
 */
export const isValidPhone = (phone: string): boolean => {
  const normalized = normalizePhone(phone);
  return normalized.length >= 9 && normalized.length <= 15 && /^\d+$/.test(normalized);
};

// ============================================================================
// DEBOUNCE UTILITY
// ============================================================================

/**
 * Debounce function for performance optimization
 */
export const debounce = <T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), wait);
  };
};

// ============================================================================
// SEARCH UTILITIES  
// ============================================================================

/**
 * Escape special characters for search queries
 */
export const escapeSearchTerm = (term: string): string => {
  return term.replace(/[,()]/g, ' ').trim();
};

/**
 * Highlight search term in text
 */
export const highlightSearchTerm = (text: string, searchTerm: string): string => {
  if (!searchTerm || !text) return text;
  
  const regex = new RegExp(`(${escapeSearchTerm(searchTerm)})`, 'gi');
  return text.replace(regex, '<mark class="bg-primary-500/30 text-inherit">$1</mark>');
};

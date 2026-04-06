/**
 * Timezone utilities for consistent date/time formatting across the app.
 * Uses the user's timezone from wp_team_humano.timezone
 */

// Default timezone fallback
export const DEFAULT_TIMEZONE = 'America/Lima';

/**
 * Format a date string with the specified timezone
 */
export const formatDateWithTimezone = (
  dateString: string | Date | null | undefined,
  timezone: string = DEFAULT_TIMEZONE,
  options: Intl.DateTimeFormatOptions = {}
): string => {
  if (!dateString) return '-';
  
  try {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    
    if (isNaN(date.getTime())) return '-';
    
    const defaultOptions: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      ...options
    };
    
    return new Intl.DateTimeFormat('es-ES', defaultOptions).format(date);
  } catch (error) {
    console.warn('[Timezone] Error formatting date:', error);
    return '-';
  }
};

/**
 * Format date only (no time)
 */
export const formatDate = (
  dateString: string | Date | null | undefined,
  timezone: string = DEFAULT_TIMEZONE
): string => {
  return formatDateWithTimezone(dateString, timezone, {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

/**
 * Format time only (no date)
 */
export const formatTime = (
  dateString: string | Date | null | undefined,
  timezone: string = DEFAULT_TIMEZONE
): string => {
  return formatDateWithTimezone(dateString, timezone, {
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Format full date and time
 */
export const formatDateTime = (
  dateString: string | Date | null | undefined,
  timezone: string = DEFAULT_TIMEZONE
): string => {
  return formatDateWithTimezone(dateString, timezone, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Format relative date (Hoy, Ayer, etc.)
 */
export const formatRelativeDate = (
  dateString: string | Date | null | undefined,
  timezone: string = DEFAULT_TIMEZONE
): string => {
  if (!dateString) return '-';
  
  try {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
    if (isNaN(date.getTime())) return '-';
    
    const now = new Date();
    const today = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const targetDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
    
    today.setHours(0, 0, 0, 0);
    targetDate.setHours(0, 0, 0, 0);
    
    const diffDays = Math.floor((today.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    
    return formatDate(date, timezone);
  } catch (error) {
    return formatDate(dateString, timezone);
  }
};

/**
 * Format weekday name
 */
export const formatWeekday = (
  dateString: string | Date | null | undefined,
  timezone: string = DEFAULT_TIMEZONE,
  format: 'long' | 'short' = 'long'
): string => {
  return formatDateWithTimezone(dateString, timezone, {
    weekday: format
  });
};

/**
 * Get current time in a specific timezone
 */
export const getCurrentTimeInTimezone = (timezone: string = DEFAULT_TIMEZONE): Date => {
  const now = new Date();
  const tzString = now.toLocaleString('en-US', { timeZone: timezone });
  return new Date(tzString);
};

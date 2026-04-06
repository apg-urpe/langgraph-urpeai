// ============================================================================
// GAMIFICATION TYPES - Urpe AI Lab
// Sistema de gamificación para engagement de usuarios
// ============================================================================

// ---- NIVELES Y EXPERIENCIA ----

export interface LevelConfig {
  level: number;
  name: string;
  minXP: number;
  maxXP: number;
  color: string; // Tailwind color class
  icon: string;  // Lucide icon name
}

// Niveles predefinidos del sistema
export const LEVELS: LevelConfig[] = [
  { level: 1, name: 'Novato', minXP: 0, maxXP: 100, color: 'zinc', icon: 'Sprout' },
  { level: 2, name: 'Aprendiz', minXP: 100, maxXP: 300, color: 'emerald', icon: 'Leaf' },
  { level: 3, name: 'Competente', minXP: 300, maxXP: 600, color: 'cyan', icon: 'Zap' },
  { level: 4, name: 'Experto', minXP: 600, maxXP: 1000, color: 'violet', icon: 'Star' },
  { level: 5, name: 'Maestro', minXP: 1000, maxXP: 1500, color: 'amber', icon: 'Crown' },
  { level: 6, name: 'Leyenda', minXP: 1500, maxXP: Infinity, color: 'rose', icon: 'Trophy' },
];

// ---- MEDALLAS / BADGES ----

export type BadgeCategory = 'velocidad' | 'precision' | 'comunicacion' | 'consistencia' | 'liderazgo' | 'especial';

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;        // Lucide icon name
  category: BadgeCategory;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  requirement: string; // Human-readable requirement
  xpReward: number;
}

export interface EarnedBadge {
  badgeId: string;
  earnedAt: string;    // ISO date
  progress?: number;   // 0-100 for badges in progress
}

// Catálogo de medallas disponibles
export const BADGES_CATALOG: Badge[] = [
  // Velocidad
  { id: 'veloz_1', name: 'Respuesta Rápida', description: 'Responde en menos de 5 minutos', icon: 'Zap', category: 'velocidad', tier: 'bronze', requirement: '10 respuestas < 5min', xpReward: 25 },
  { id: 'veloz_2', name: 'Rayo', description: 'Consistentemente rápido', icon: 'Bolt', category: 'velocidad', tier: 'silver', requirement: '50 respuestas < 5min', xpReward: 50 },
  { id: 'veloz_3', name: 'Flash', description: 'Velocidad legendaria', icon: 'Timer', category: 'velocidad', tier: 'gold', requirement: '200 respuestas < 3min', xpReward: 100 },
  
  // Precisión
  { id: 'preciso_1', name: 'Puntual', description: 'Completa tareas a tiempo', icon: 'Target', category: 'precision', tier: 'bronze', requirement: '10 tareas completadas a tiempo', xpReward: 25 },
  { id: 'preciso_2', name: 'Certero', description: 'Alta tasa de éxito', icon: 'Crosshair', category: 'precision', tier: 'silver', requirement: '90% tareas a tiempo (min 30)', xpReward: 50 },
  { id: 'preciso_3', name: 'Infalible', description: 'Perfección consistente', icon: 'CheckCircle2', category: 'precision', tier: 'gold', requirement: '95% tareas a tiempo (min 100)', xpReward: 100 },
  
  // Comunicación
  { id: 'comunicador_1', name: 'Comunicativo', description: 'Activo en conversaciones', icon: 'MessageSquare', category: 'comunicacion', tier: 'bronze', requirement: '50 mensajes enviados', xpReward: 25 },
  { id: 'comunicador_2', name: 'Conversador', description: 'Gran volumen de interacción', icon: 'MessagesSquare', category: 'comunicacion', tier: 'silver', requirement: '200 mensajes enviados', xpReward: 50 },
  { id: 'comunicador_3', name: 'Orador', description: 'Maestro de la comunicación', icon: 'Megaphone', category: 'comunicacion', tier: 'gold', requirement: '1000 mensajes enviados', xpReward: 100 },
  
  // Consistencia (Rachas)
  { id: 'constante_1', name: 'Constante', description: 'Racha de actividad', icon: 'Flame', category: 'consistencia', tier: 'bronze', requirement: '7 días consecutivos activo', xpReward: 30 },
  { id: 'constante_2', name: 'Dedicado', description: 'Compromiso sostenido', icon: 'Fire', category: 'consistencia', tier: 'silver', requirement: '30 días consecutivos activo', xpReward: 75 },
  { id: 'constante_3', name: 'Imparable', description: 'Compromiso legendario', icon: 'Sparkles', category: 'consistencia', tier: 'gold', requirement: '90 días consecutivos activo', xpReward: 150 },
  
  // Liderazgo
  { id: 'lider_1', name: 'Mentor', description: 'Ayuda al equipo', icon: 'Users', category: 'liderazgo', tier: 'bronze', requirement: 'Asignar 10 tareas', xpReward: 25 },
  { id: 'lider_2', name: 'Capitán', description: 'Lidera proyectos', icon: 'Shield', category: 'liderazgo', tier: 'silver', requirement: 'Completar 5 proyectos de equipo', xpReward: 75 },
  { id: 'lider_3', name: 'Comandante', description: 'Liderazgo excepcional', icon: 'Crown', category: 'liderazgo', tier: 'gold', requirement: 'Top performer 3 meses', xpReward: 150 },
  
  // Especiales
  { id: 'first_login', name: 'Primer Día', description: 'Bienvenido al equipo', icon: 'PartyPopper', category: 'especial', tier: 'bronze', requirement: 'Completar primer login', xpReward: 10 },
  { id: 'first_task', name: 'Primera Tarea', description: 'Completaste tu primera tarea', icon: 'CheckSquare', category: 'especial', tier: 'bronze', requirement: 'Completar primera tarea', xpReward: 15 },
  { id: 'first_sale', name: 'Primera Venta', description: 'Cerraste tu primera venta', icon: 'BadgeDollarSign', category: 'especial', tier: 'silver', requirement: 'Primera conversión', xpReward: 50 },
];

// ---- RACHAS (STREAKS) ----

export interface StreakData {
  currentStreak: number;      // Días consecutivos actual
  longestStreak: number;      // Récord personal
  lastActivityDate: string;   // Última fecha de actividad (ISO)
  streakStartDate: string;    // Inicio de racha actual (ISO)
  isActive: boolean;          // Si la racha está activa hoy
}

// ---- ESTADÍSTICAS DE ACTIVIDAD ----

export interface ActivityStats {
  // Contadores totales
  totalMessages: number;
  totalTasksCompleted: number;
  totalAppointments: number;
  totalContactsCreated: number;
  totalConversions: number;
  
  // Métricas de calidad
  avgResponseTimeMinutes: number;
  tasksOnTimePercent: number;
  conversionRate: number;
  
  // Período actual (este mes)
  monthlyMessages: number;
  monthlyTasks: number;
  monthlyAppointments: number;
  
  // Timestamps
  firstActivityDate: string;
  lastActivityDate: string;
}

// ---- PERFIL DE GAMIFICACIÓN ----

export interface GamificationProfile {
  // Identificación
  teamMemberId: number;
  
  // Experiencia y Nivel
  totalXP: number;
  currentLevel: number;
  xpToNextLevel: number;
  levelProgress: number; // 0-100
  
  // Rachas
  streak: StreakData;
  
  // Medallas
  earnedBadges: EarnedBadge[];
  badgesInProgress: EarnedBadge[]; // Medallas parcialmente completadas
  
  // Estadísticas
  stats: ActivityStats;
  
  // Ranking
  weeklyRank?: number;
  monthlyRank?: number;
  
  // Timestamps
  profileCreatedAt: string;
  lastUpdatedAt: string;
}

// ---- ACCIONES QUE OTORGAN XP ----

export type XPAction = 
  | 'task_completed'
  | 'task_completed_on_time'
  | 'message_sent'
  | 'appointment_scheduled'
  | 'appointment_completed'
  | 'contact_qualified'
  | 'conversion_achieved'
  | 'daily_login'
  | 'streak_milestone'
  | 'badge_earned';

export const XP_REWARDS: Record<XPAction, number> = {
  task_completed: 10,
  task_completed_on_time: 15,
  message_sent: 1,
  appointment_scheduled: 5,
  appointment_completed: 20,
  contact_qualified: 10,
  conversion_achieved: 50,
  daily_login: 5,
  streak_milestone: 25,
  badge_earned: 0, // Variable, defined in badge
};

// ---- HISTORIAL DE XP ----

export interface XPTransaction {
  id: string;
  action: XPAction;
  amount: number;
  description: string;
  timestamp: string;
  relatedEntityId?: number;  // ID de tarea, contacto, etc.
  relatedEntityType?: string;
}

// ---- MISIONES DIARIAS ----

export type MissionType = 'messages' | 'tasks' | 'appointments' | 'contacts' | 'response_time';

export interface DailyMission {
  id: string;
  type: MissionType;
  title: string;
  description: string;
  target: number;           // Meta a alcanzar
  current: number;          // Progreso actual
  xpReward: number;
  isCompleted: boolean;
  expiresAt: string;        // ISO date (fin del día)
}

// ---- LEADERBOARD ----

export interface LeaderboardEntry {
  teamMemberId: number;
  nombre: string;
  apellido: string;
  totalXP: number;
  level: number;
  levelName: string;
  rank: number;
  weeklyXP: number;
  monthlyXP: number;
  streak: number;
  badgeCount: number;
}

// ---- HELPERS ----

export function getLevelFromXP(xp: number): LevelConfig {
  return LEVELS.find(l => xp >= l.minXP && xp < l.maxXP) || LEVELS[LEVELS.length - 1];
}

export function getXPProgress(xp: number): { current: number; max: number; percent: number } {
  const level = getLevelFromXP(xp);
  const xpInLevel = xp - level.minXP;
  const levelRange = level.maxXP === Infinity ? 1000 : level.maxXP - level.minXP;
  return {
    current: xpInLevel,
    max: levelRange,
    percent: Math.min(100, Math.round((xpInLevel / levelRange) * 100))
  };
}

export function getBadgeById(id: string): Badge | undefined {
  return BADGES_CATALOG.find(b => b.id === id);
}

export function getTierColor(tier: Badge['tier']): string {
  const colors = {
    bronze: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    silver: 'text-zinc-300 bg-zinc-500/10 border-zinc-500/20',
    gold: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    platinum: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20'
  };
  return colors[tier];
}

export function getCategoryLabel(category: BadgeCategory): string {
  const labels: Record<BadgeCategory, string> = {
    velocidad: 'Velocidad',
    precision: 'Precisión',
    comunicacion: 'Comunicación',
    consistencia: 'Consistencia',
    liderazgo: 'Liderazgo',
    especial: 'Especial'
  };
  return labels[category];
}

// Default empty profile
export const DEFAULT_GAMIFICATION_PROFILE: Omit<GamificationProfile, 'teamMemberId'> = {
  totalXP: 0,
  currentLevel: 1,
  xpToNextLevel: 100,
  levelProgress: 0,
  streak: {
    currentStreak: 0,
    longestStreak: 0,
    lastActivityDate: '',
    streakStartDate: '',
    isActive: false
  },
  earnedBadges: [],
  badgesInProgress: [],
  stats: {
    totalMessages: 0,
    totalTasksCompleted: 0,
    totalAppointments: 0,
    totalContactsCreated: 0,
    totalConversions: 0,
    avgResponseTimeMinutes: 0,
    tasksOnTimePercent: 0,
    conversionRate: 0,
    monthlyMessages: 0,
    monthlyTasks: 0,
    monthlyAppointments: 0,
    firstActivityDate: '',
    lastActivityDate: ''
  },
  profileCreatedAt: new Date().toISOString(),
  lastUpdatedAt: new Date().toISOString()
};

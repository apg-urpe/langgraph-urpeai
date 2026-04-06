// ============================================================================
// URPE ACADEMY - Training Types
// Sistema de Capacitación Gamificado
// ============================================================================

// ============================================================================
// ENUMS Y TIPOS BASE
// ============================================================================

export type QuestionType = 
  | 'multiple_choice'   // 4 opciones, 1 correcta
  | 'true_false'        // Verdadero/Falso
  | 'order_steps'       // Ordenar secuencia
  | 'fill_blank'        // Completar oración
  | 'roleplay';         // Escenario conversacional (futuro)

export type Difficulty = 'principiante' | 'intermedio' | 'avanzado';

export type LessonStatus = 'not_started' | 'in_progress' | 'completed' | 'failed';

export type SessionState = 'idle' | 'active' | 'paused' | 'reviewing' | 'complete';

// ============================================================================
// INTERFACES DE DATOS (Mapean a tablas SQL)
// ============================================================================

export interface Course {
  id: string;
  empresa_id: number;
  titulo: string;
  descripcion?: string;
  categoria?: string;
  dificultad: Difficulty;
  duracion_estimada_min: number;
  portada_url?: string;
  color_tema: string;
  is_public: boolean;
  is_active: boolean;
  orden: number;
  created_at: string;
  updated_at: string;
  
  // Campos calculados (de vistas)
  lessons_count?: number;
  questions_count?: number;
  total_xp?: number;
  progress_percent?: number;
}

export interface Lesson {
  id: string;
  course_id: string;
  orden: number;
  titulo: string;
  contenido_intro?: string;
  imagen_url?: string;
  tiempo_estimado_seg: number;
  xp_reward: number;
  xp_perfect_bonus: number;
  max_hearts: number;
  is_active: boolean;
  created_at: string;
  
  // Relaciones cargadas
  questions?: Question[];
  course?: Course;
}

export interface Question {
  id: string;
  lesson_id: string;
  tipo: QuestionType;
  pregunta: string;
  opciones?: string[];
  respuesta_correcta: string;
  explicacion?: string;
  hint?: string;
  dificultad: number;
  ai_generated: boolean;
  ai_context?: Record<string, unknown>;
  orden: number;
  is_active: boolean;
  created_at: string;
}

export interface UserProgress {
  id: string;
  team_member_id: number;
  lesson_id: string;
  status: LessonStatus;
  score?: number;
  attempts: number;
  best_score?: number;
  time_spent_sec: number;
  questions_correct: number;
  questions_total: number;
  local_checkpoint?: TrainingSessionCheckpoint;
  last_sync_at?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  
  // Relaciones
  lesson?: Lesson;
}

export interface TrainingStreak {
  id: string;
  team_member_id: number;
  current_streak: number;
  longest_streak: number;
  last_activity_date?: string;
  streak_frozen_until?: string;
  freeze_count_used: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// INTERFACES DE SESIÓN (Estado en memoria/localStorage)
// ============================================================================

export interface TrainingSession {
  id: string;                      // ID único de sesión
  lessonId: string;
  courseId: string;
  courseTitulo: string;
  lessonTitulo: string;
  
  // Estado de la sesión
  state: SessionState;
  startedAt: string;
  pausedAt?: string;
  
  // Progreso actual
  currentQuestionIndex: number;
  totalQuestions: number;
  
  // Respuestas dadas
  answers: QuestionAnswer[];
  
  // Gamificación
  hearts: number;                  // Vidas restantes (máx 5)
  maxHearts: number;
  xpEarned: number;                // XP acumulado en sesión
  xpPotential: number;             // XP máximo posible
  streakMultiplier: number;        // 1.0 o 1.5 si tiene racha
  
  // Métricas
  correctCount: number;
  incorrectCount: number;
  timeSpentSec: number;
}

export interface QuestionAnswer {
  questionId: string;
  questionIndex: number;
  selectedAnswer: string;
  isCorrect: boolean;
  answeredAt: string;
  timeToAnswerSec: number;
}

export interface TrainingSessionCheckpoint {
  sessionId: string;
  currentQuestionIndex: number;
  answers: QuestionAnswer[];
  hearts: number;
  xpEarned: number;
  timeSpentSec: number;
  savedAt: string;
}

// ============================================================================
// INTERFACES DE UI
// ============================================================================

export interface QuestionCardProps {
  question: Question;
  questionNumber: number;
  totalQuestions: number;
  selectedAnswer: string | null;
  isSubmitted: boolean;
  isCorrect: boolean | null;
  onSelectAnswer: (answer: string) => void;
  onSubmit: () => void;
  onContinue: () => void;
  disabled?: boolean;
}

export interface LessonCompleteData {
  lessonId: string;
  courseId: string;
  courseTitulo: string;
  lessonTitulo: string;
  score: number;                   // 0-100
  xpEarned: number;
  xpBonus: number;
  correctCount: number;
  totalQuestions: number;
  timeSpentSec: number;
  isPerfect: boolean;              // Sin errores
  newBestScore: boolean;           // Superó su mejor puntuación
  streakUpdated: boolean;          // Si se actualizó la racha
  currentStreak: number;
}

export interface CourseCardData {
  course: Course;
  userProgress: {
    completedLessons: number;
    totalLessons: number;
    progressPercent: number;
    lastActivity?: string;
  };
}

// ============================================================================
// PAYLOADS DE API
// ============================================================================

export interface GenerateLessonPayload {
  courseId: string;
  topic: string;
  questionCount: number;
  difficulty: Difficulty;
  context?: {
    productos?: unknown[];
    objeciones?: string[];
    casos_exito?: unknown[];
    custom?: Record<string, unknown>;
  };
}

export interface GenerateLessonResponse {
  success: boolean;
  lesson: {
    titulo: string;
    contenido_intro: string;
    questions: Omit<Question, 'id' | 'lesson_id' | 'created_at' | 'is_active'>[];
  };
  tokensUsed?: number;
}

export interface SyncProgressPayload {
  lessonId: string;
  status: LessonStatus;
  score: number;
  timeSpentSec: number;
  questionsCorrect: number;
  questionsTotal: number;
  checkpoint?: TrainingSessionCheckpoint;
}

// ============================================================================
// CONSTANTES
// ============================================================================

export const DEFAULT_MAX_HEARTS = 5;
export const DEFAULT_XP_PER_QUESTION = 10;
export const DEFAULT_XP_PERFECT_BONUS = 25;
export const STREAK_MULTIPLIER = 1.5;
export const HEART_RECOVERY_HOURS = 5;

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado'
};

export const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  principiante: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  intermedio: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  avanzado: 'text-rose-400 bg-rose-500/10 border-rose-500/20'
};

export const STATUS_LABELS: Record<LessonStatus, string> = {
  not_started: 'No iniciada',
  in_progress: 'En progreso',
  completed: 'Completada',
  failed: 'Fallida'
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: 'Opción Múltiple',
  true_false: 'Verdadero/Falso',
  order_steps: 'Ordenar Pasos',
  fill_blank: 'Completar',
  roleplay: 'Roleplay'
};

// ============================================================================
// HELPERS
// ============================================================================

export function createEmptySession(
  lesson: Lesson,
  course: Course,
  streakActive: boolean = false
): TrainingSession {
  const questionsCount = lesson.questions?.length ?? 0;
  
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    lessonId: lesson.id,
    courseId: course.id,
    courseTitulo: course.titulo,
    lessonTitulo: lesson.titulo,
    state: 'idle',
    startedAt: new Date().toISOString(),
    currentQuestionIndex: 0,
    totalQuestions: questionsCount,
    answers: [],
    hearts: lesson.max_hearts,
    maxHearts: lesson.max_hearts,
    xpEarned: 0,
    xpPotential: lesson.xp_reward + (questionsCount * DEFAULT_XP_PER_QUESTION),
    streakMultiplier: streakActive ? STREAK_MULTIPLIER : 1.0,
    correctCount: 0,
    incorrectCount: 0,
    timeSpentSec: 0
  };
}

export function calculateScore(session: TrainingSession): number {
  if (session.totalQuestions === 0) return 0;
  return Math.round((session.correctCount / session.totalQuestions) * 100);
}

export function calculateXP(session: TrainingSession, lesson: Lesson): number {
  let xp = session.correctCount * DEFAULT_XP_PER_QUESTION;
  
  // Bonus por completar sin errores
  if (session.incorrectCount === 0 && session.correctCount === session.totalQuestions) {
    xp += lesson.xp_perfect_bonus;
  }
  
  // Multiplicador de racha
  xp = Math.round(xp * session.streakMultiplier);
  
  return xp;
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

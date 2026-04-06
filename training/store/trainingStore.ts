import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import { useGamificationStore } from '@/store/gamificationStore';
import {
  Course,
  Lesson,
  Question,
  UserProgress,
  TrainingSession,
  TrainingStreak,
  TrainingSessionCheckpoint,
  LessonStatus,
  SessionState,
  QuestionAnswer,
  LessonCompleteData,
  createEmptySession,
  calculateScore,
  calculateXP,
  DEFAULT_XP_PER_QUESTION,
  DEFAULT_XP_PERFECT_BONUS
} from '../types/training';

// ============================================================================
// STORE INTERFACE
// ============================================================================

interface TrainingState {
  // UI State
  isOverlayOpen: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Data
  courses: Course[];
  currentCourse: Course | null;
  activeLesson: Lesson | null;
  currentSession: TrainingSession | null;
  userStreak: TrainingStreak | null;
  
  // Cached progress
  userProgress: Map<string, UserProgress>;
  
  // ========== OVERLAY ACTIONS ==========
  openOverlay: () => void;
  closeOverlay: () => void;
  
  // ========== COURSE ACTIONS ==========
  fetchCourses: (empresaId: number) => Promise<void>;
  fetchCourseDetails: (courseId: string) => Promise<void>;
  createCourse: (courseData: Partial<Course>) => Promise<boolean>;
  
  // ========== LESSON ACTIONS ==========
  fetchLesson: (lessonId: string) => Promise<void>;
  startLesson: (lessonId: string) => void;
  
  // ========== SESSION ACTIONS ==========
  submitAnswer: (questionId: string, answer: string) => void;
  nextQuestion: () => void;
  pauseSession: () => void;
  resumeSession: () => void;
  completeLesson: () => Promise<LessonCompleteData | null>;
  abandonLesson: () => void;
  
  // ========== PROGRESS ACTIONS ==========
  syncProgress: () => Promise<void>;
  fetchUserProgress: (teamMemberId: number) => Promise<void>;
  fetchUserStreak: (teamMemberId: number) => Promise<void>;
  
  // ========== UTILITY ==========
  clearError: () => void;
  reset: () => void;
}

// ============================================================================
// SELECTORS
// ============================================================================

export const selectIsOverlayOpen = (state: TrainingState) => state.isOverlayOpen;
export const selectCurrentSession = (state: TrainingState) => state.currentSession;
export const selectActiveLesson = (state: TrainingState) => state.activeLesson;
export const selectCourses = (state: TrainingState) => state.courses;
export const selectIsLoading = (state: TrainingState) => state.isLoading;
export const selectError = (state: TrainingState) => state.error;
export const selectUserStreak = (state: TrainingState) => state.userStreak;

export const selectCurrentQuestion = (state: TrainingState) => {
  if (!state.activeLesson?.questions || !state.currentSession) return null;
  return state.activeLesson.questions[state.currentSession.currentQuestionIndex] ?? null;
};

export const selectSessionProgress = (state: TrainingState) => {
  if (!state.currentSession) return { current: 0, total: 0, percent: 0 };
  const { currentQuestionIndex, totalQuestions } = state.currentSession;
  return {
    current: currentQuestionIndex + 1,
    total: totalQuestions,
    percent: totalQuestions > 0 ? Math.round((currentQuestionIndex / totalQuestions) * 100) : 0
  };
};

// ============================================================================
// STORE
// ============================================================================

export const useTrainingStore = create<TrainingState>()(
  persist(
    (set, get) => ({
      // Initial State
      isOverlayOpen: false,
      isLoading: false,
      error: null,
      courses: [],
      currentCourse: null,
      activeLesson: null,
      currentSession: null,
      userStreak: null,
      userProgress: new Map(),

      // ========================================================================
      // OVERLAY ACTIONS
      // ========================================================================

      openOverlay: () => {
        set({ isOverlayOpen: true });
        logger.info('[Training] Overlay opened');
      },

      closeOverlay: () => {
        const { currentSession } = get();
        
        // Auto-pause if there's an active session
        if (currentSession && currentSession.state === 'active') {
          get().pauseSession();
        }
        
        set({ isOverlayOpen: false });
        logger.info('[Training] Overlay closed');
      },

      // ========================================================================
      // COURSE ACTIONS
      // ========================================================================

      fetchCourses: async (empresaId: number) => {
        set({ isLoading: true, error: null });
        
        try {
          // Try the view first (if schema was fully executed)
          let { data, error } = await supabase
            .from('vw_training_courses_stats')
            .select('*')
            .or(`empresa_id.eq.${empresaId},is_public.eq.true`)
            .eq('is_active', true)
            .order('orden', { ascending: true });

          // Fallback to base table if view doesn't exist
          if (error && error.code === '42P01') {
            logger.warn('[Training] View not found, using base table');
            const fallback = await supabase
              .from('training_courses')
              .select('*')
              .or(`empresa_id.eq.${empresaId},is_public.eq.true`)
              .eq('is_active', true)
              .order('orden', { ascending: true });
            
            data = fallback.data;
            error = fallback.error;
          }

          if (error) throw error;

          set({ courses: data || [], isLoading: false });
          logger.info('[Training] Courses fetched', { count: data?.length });
          
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al cargar cursos';
          set({ error: message, isLoading: false });
          logger.error('[Training] Error fetching courses', err);
        }
      },

      fetchCourseDetails: async (courseId: string) => {
        set({ isLoading: true, error: null });
        
        try {
          // Fetch course with lessons
          const { data: course, error: courseError } = await supabase
            .from('training_courses')
            .select(`
              *,
              training_lessons (
                id, orden, titulo, contenido_intro, 
                tiempo_estimado_seg, xp_reward, is_active
              )
            `)
            .eq('id', courseId)
            .single();

          if (courseError) throw courseError;

          set({ 
            currentCourse: course,
            isLoading: false 
          });
          
          logger.info('[Training] Course details fetched', { courseId });
          
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al cargar curso';
          set({ error: message, isLoading: false });
          logger.error('[Training] Error fetching course details', err);
        }
      },

      createCourse: async (courseData: Partial<Course>) => {
        set({ isLoading: true, error: null });
        
        try {
          const { data, error } = await supabase
            .from('training_courses')
            .insert({
              empresa_id: courseData.empresa_id,
              titulo: courseData.titulo,
              descripcion: courseData.descripcion || null,
              categoria: courseData.categoria || null,
              dificultad: courseData.dificultad || 'principiante',
              color_tema: courseData.color_tema || '#6366f1',
              is_active: courseData.is_active ?? true,
              orden: 0
            })
            .select()
            .single();

          if (error) throw error;

          set({ isLoading: false });
          logger.info('[Training] Course created', { courseId: data.id, titulo: data.titulo });
          return true;
          
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al crear curso';
          set({ error: message, isLoading: false });
          logger.error('[Training] Error creating course', err);
          return false;
        }
      },

      // ========================================================================
      // LESSON ACTIONS
      // ========================================================================

      fetchLesson: async (lessonId: string) => {
        set({ isLoading: true, error: null });
        
        try {
          // Fetch lesson with questions
          const { data: lesson, error } = await supabase
            .from('training_lessons')
            .select(`
              *,
              training_questions (
                id, tipo, pregunta, opciones, respuesta_correcta,
                explicacion, hint, dificultad, orden, is_active
              ),
              training_courses (
                id, titulo, categoria, color_tema
              )
            `)
            .eq('id', lessonId)
            .single();

          if (error) throw error;

          // Sort questions by orden
          if (lesson.training_questions) {
            lesson.training_questions.sort((a: Question, b: Question) => a.orden - b.orden);
          }

          // Map to expected structure
          const mappedLesson: Lesson = {
            ...lesson,
            questions: lesson.training_questions?.filter((q: Question) => q.is_active) || [],
            course: lesson.training_courses
          };

          set({ 
            activeLesson: mappedLesson,
            currentCourse: lesson.training_courses,
            isLoading: false 
          });
          
          logger.info('[Training] Lesson fetched', { 
            lessonId, 
            questionsCount: mappedLesson.questions?.length 
          });
          
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Error al cargar lección';
          set({ error: message, isLoading: false });
          logger.error('[Training] Error fetching lesson', err);
        }
      },

      startLesson: (lessonId: string) => {
        const { activeLesson, currentCourse, userStreak } = get();
        
        if (!activeLesson || activeLesson.id !== lessonId) {
          logger.warn('[Training] Cannot start lesson - not loaded');
          return;
        }

        if (!currentCourse) {
          logger.warn('[Training] Cannot start lesson - no course context');
          return;
        }

        const streakActive = userStreak 
          ? userStreak.current_streak > 0 
          : false;

        const session = createEmptySession(activeLesson, currentCourse, streakActive);
        session.state = 'active';

        set({ 
          currentSession: session,
          isOverlayOpen: true 
        });

        logger.info('[Training] Lesson started', { 
          lessonId, 
          sessionId: session.id,
          streakMultiplier: session.streakMultiplier 
        });
      },

      // ========================================================================
      // SESSION ACTIONS
      // ========================================================================

      submitAnswer: (questionId: string, answer: string) => {
        const { currentSession, activeLesson } = get();
        
        if (!currentSession || !activeLesson?.questions) return;
        
        const currentQuestion = activeLesson.questions[currentSession.currentQuestionIndex];
        if (!currentQuestion || currentQuestion.id !== questionId) return;

        const isCorrect = answer === currentQuestion.respuesta_correcta;
        const now = new Date().toISOString();
        
        // Calculate time to answer
        const lastAnswerTime = currentSession.answers.length > 0
          ? new Date(currentSession.answers[currentSession.answers.length - 1].answeredAt).getTime()
          : new Date(currentSession.startedAt).getTime();
        const timeToAnswer = Math.round((Date.now() - lastAnswerTime) / 1000);

        const answerRecord: QuestionAnswer = {
          questionId,
          questionIndex: currentSession.currentQuestionIndex,
          selectedAnswer: answer,
          isCorrect,
          answeredAt: now,
          timeToAnswerSec: timeToAnswer
        };

        // Update session
        const updatedSession: TrainingSession = {
          ...currentSession,
          state: 'reviewing',
          answers: [...currentSession.answers, answerRecord],
          hearts: isCorrect ? currentSession.hearts : currentSession.hearts - 1,
          xpEarned: isCorrect 
            ? currentSession.xpEarned + Math.round(DEFAULT_XP_PER_QUESTION * currentSession.streakMultiplier)
            : currentSession.xpEarned,
          correctCount: isCorrect ? currentSession.correctCount + 1 : currentSession.correctCount,
          incorrectCount: isCorrect ? currentSession.incorrectCount : currentSession.incorrectCount + 1,
          timeSpentSec: currentSession.timeSpentSec + timeToAnswer
        };

        set({ currentSession: updatedSession });

        logger.info('[Training] Answer submitted', { 
          questionId, 
          isCorrect,
          heartsRemaining: updatedSession.hearts 
        });

        // Check if out of hearts
        if (updatedSession.hearts <= 0) {
          updatedSession.state = 'complete';
          set({ currentSession: updatedSession });
          logger.info('[Training] Lesson failed - out of hearts');
        }
      },

      nextQuestion: () => {
        const { currentSession, activeLesson } = get();
        
        if (!currentSession || !activeLesson?.questions) return;

        const nextIndex = currentSession.currentQuestionIndex + 1;
        
        // Check if lesson complete
        if (nextIndex >= activeLesson.questions.length) {
          set({
            currentSession: {
              ...currentSession,
              state: 'complete',
              currentQuestionIndex: nextIndex
            }
          });
          logger.info('[Training] All questions answered');
          return;
        }

        // Move to next question
        set({
          currentSession: {
            ...currentSession,
            state: 'active',
            currentQuestionIndex: nextIndex
          }
        });
      },

      pauseSession: () => {
        const { currentSession } = get();
        
        if (!currentSession) return;

        const pausedSession: TrainingSession = {
          ...currentSession,
          state: 'paused',
          pausedAt: new Date().toISOString()
        };

        set({ currentSession: pausedSession });
        
        // Auto-save checkpoint
        get().syncProgress();
        
        logger.info('[Training] Session paused', { sessionId: currentSession.id });
      },

      resumeSession: () => {
        const { currentSession } = get();
        
        if (!currentSession || currentSession.state !== 'paused') return;

        set({
          currentSession: {
            ...currentSession,
            state: 'active',
            pausedAt: undefined
          },
          isOverlayOpen: true
        });

        logger.info('[Training] Session resumed', { sessionId: currentSession.id });
      },

      completeLesson: async (): Promise<LessonCompleteData | null> => {
        const { currentSession, activeLesson, currentCourse, userStreak } = get();
        
        if (!currentSession || !activeLesson || !currentCourse) {
          return null;
        }

        const score = calculateScore(currentSession);
        const xpEarned = calculateXP(currentSession, activeLesson);
        const isPerfect = currentSession.incorrectCount === 0 && 
                          currentSession.correctCount === currentSession.totalQuestions;

        // Prepare completion data
        const completeData: LessonCompleteData = {
          lessonId: activeLesson.id,
          courseId: currentCourse.id,
          courseTitulo: currentCourse.titulo,
          lessonTitulo: activeLesson.titulo,
          score,
          xpEarned,
          xpBonus: isPerfect ? DEFAULT_XP_PERFECT_BONUS : 0,
          correctCount: currentSession.correctCount,
          totalQuestions: currentSession.totalQuestions,
          timeSpentSec: currentSession.timeSpentSec,
          isPerfect,
          newBestScore: false,
          streakUpdated: false,
          currentStreak: userStreak?.current_streak || 0
        };

        try {
          // Award XP via gamification store
          // Note: awardXP uses fixed XP from XP_REWARDS, so we call it for the badge/streak tracking
          const gamificationStore = useGamificationStore.getState();
          await gamificationStore.awardXP('task_completed', `Lección completada: ${activeLesson.titulo}`);

          // Sync progress to Supabase
          await get().syncProgress();

          logger.info('[Training] Lesson completed', { 
            lessonId: activeLesson.id,
            score,
            xpEarned: xpEarned + completeData.xpBonus,
            isPerfect
          });

          return completeData;

        } catch (err) {
          logger.error('[Training] Error completing lesson', err);
          return completeData;
        }
      },

      abandonLesson: () => {
        const { currentSession } = get();
        
        if (currentSession) {
          logger.info('[Training] Lesson abandoned', { sessionId: currentSession.id });
        }

        set({
          currentSession: null,
          activeLesson: null,
          isOverlayOpen: false
        });
      },

      // ========================================================================
      // PROGRESS ACTIONS
      // ========================================================================

      syncProgress: async () => {
        const { currentSession, activeLesson } = get();
        
        if (!currentSession || !activeLesson) return;

        try {
          const score = calculateScore(currentSession);
          const status: LessonStatus = 
            currentSession.state === 'complete' && currentSession.hearts > 0
              ? 'completed'
              : currentSession.state === 'complete'
                ? 'failed'
                : 'in_progress';

          // Create checkpoint for recovery
          const checkpoint: TrainingSessionCheckpoint = {
            sessionId: currentSession.id,
            currentQuestionIndex: currentSession.currentQuestionIndex,
            answers: currentSession.answers,
            hearts: currentSession.hearts,
            xpEarned: currentSession.xpEarned,
            timeSpentSec: currentSession.timeSpentSec,
            savedAt: new Date().toISOString()
          };

          // Upsert progress
          const { error } = await supabase
            .from('training_user_progress')
            .upsert({
              lesson_id: activeLesson.id,
              status,
              score,
              time_spent_sec: currentSession.timeSpentSec,
              questions_correct: currentSession.correctCount,
              questions_total: currentSession.totalQuestions,
              local_checkpoint: status === 'in_progress' ? checkpoint : null,
              last_sync_at: new Date().toISOString(),
              completed_at: status === 'completed' ? new Date().toISOString() : null
            }, {
              onConflict: 'team_member_id,lesson_id'
            });

          if (error) throw error;

          logger.info('[Training] Progress synced', { lessonId: activeLesson.id, status });

        } catch (err) {
          logger.error('[Training] Error syncing progress', err);
        }
      },

      fetchUserProgress: async (teamMemberId: number) => {
        try {
          const { data, error } = await supabase
            .from('training_user_progress')
            .select('*')
            .eq('team_member_id', teamMemberId);

          if (error) throw error;

          const progressMap = new Map<string, UserProgress>();
          data?.forEach(p => progressMap.set(p.lesson_id, p));

          set({ userProgress: progressMap });
          
          logger.info('[Training] User progress fetched', { count: data?.length });

        } catch (err) {
          logger.error('[Training] Error fetching user progress', err);
        }
      },

      fetchUserStreak: async (teamMemberId: number) => {
        try {
          const { data, error } = await supabase
            .from('training_streaks')
            .select('*')
            .eq('team_member_id', teamMemberId)
            .single();

          if (error && error.code !== 'PGRST116') throw error;

          set({ userStreak: data || null });
          
          logger.info('[Training] User streak fetched', { 
            streak: data?.current_streak || 0 
          });

        } catch (err) {
          logger.error('[Training] Error fetching user streak', err);
        }
      },

      // ========================================================================
      // UTILITY
      // ========================================================================

      clearError: () => set({ error: null }),

      reset: () => set({
        isOverlayOpen: false,
        isLoading: false,
        error: null,
        courses: [],
        currentCourse: null,
        activeLesson: null,
        currentSession: null,
        userStreak: null,
        userProgress: new Map()
      })
    }),
    {
      name: 'urpe-training-store',
      partialize: (state) => ({
        currentSession: state.currentSession,
        userStreak: state.userStreak
      })
    }
  )
);

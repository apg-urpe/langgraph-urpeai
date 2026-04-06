'use client';

import React, { useEffect, useState } from 'react';
import { 
  ArrowLeft, 
  BookOpen, 
  Clock, 
  Trophy,
  Play,
  Lock,
  CheckCircle2,
  Loader2,
  Sparkles,
  ChevronRight,
  Plus,
  Wand2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTrainingStore, selectIsLoading, selectIsOverlayOpen } from '../store/trainingStore';
import { Course, Lesson, DIFFICULTY_LABELS, DIFFICULTY_COLORS } from '../types/training';

// ============================================================================
// LESSON CARD
// ============================================================================

interface LessonCardProps {
  lesson: Lesson;
  index: number;
  isLocked: boolean;
  isCompleted: boolean;
  onStart: () => void;
}

const LessonCard: React.FC<LessonCardProps> = ({ 
  lesson, 
  index, 
  isLocked, 
  isCompleted,
  onStart 
}) => {
  return (
    <button
      onClick={onStart}
      disabled={isLocked}
      className={cn(
        "w-full p-4 rounded-xl border text-left transition-all duration-200",
        "flex items-center gap-4 group",
        isLocked 
          ? "bg-zinc-900/30 border-white/5 cursor-not-allowed opacity-50"
          : isCompleted
            ? "bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40"
            : "bg-zinc-900/50 border-white/5 hover:border-primary-500/30 hover:bg-zinc-800/50"
      )}
    >
      {/* Lesson Number */}
      <div className={cn(
        "w-10 h-10 rounded-lg flex items-center justify-center shrink-0 font-bold text-sm",
        isCompleted 
          ? "bg-emerald-500/20 text-emerald-400"
          : isLocked
            ? "bg-zinc-800 text-zinc-600"
            : "bg-primary-500/20 text-primary-400"
      )}>
        {isCompleted ? (
          <CheckCircle2 className="w-5 h-5" />
        ) : isLocked ? (
          <Lock className="w-4 h-4" />
        ) : (
          index + 1
        )}
      </div>

      {/* Lesson Info */}
      <div className="flex-1 min-w-0">
        <h4 className={cn(
          "font-semibold truncate transition-colors",
          isLocked ? "text-zinc-600" : "text-white group-hover:text-primary-300"
        )}>
          {lesson.titulo}
        </h4>
        <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1">
          {lesson.tiempo_estimado_seg && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {Math.ceil(lesson.tiempo_estimado_seg / 60)} min
            </span>
          )}
          {lesson.xp_reward && (
            <span className="flex items-center gap-1 text-amber-500">
              <Trophy className="w-3 h-3" />
              +{lesson.xp_reward} XP
            </span>
          )}
          {lesson.questions?.length && (
            <span>{lesson.questions.length} preguntas</span>
          )}
        </div>
      </div>

      {/* Action */}
      {!isLocked && (
        <div className={cn(
          "shrink-0 transition-all",
          isCompleted ? "text-emerald-400" : "text-zinc-500 group-hover:text-primary-400"
        )}>
          {isCompleted ? (
            <span className="text-xs font-medium">Completado</span>
          ) : (
            <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          )}
        </div>
      )}
    </button>
  );
};

// ============================================================================
// COURSE DETAIL VIEW
// ============================================================================

interface CourseDetailViewProps {
  course: Course;
  onBack: () => void;
  onStartLesson: (lessonId: string) => void;
}

export const CourseDetailView: React.FC<CourseDetailViewProps> = ({ 
  course, 
  onBack,
  onStartLesson 
}) => {
  const isLoading = useTrainingStore(selectIsLoading);
  const fetchCourseDetails = useTrainingStore(state => state.fetchCourseDetails);
  const currentCourse = useTrainingStore(state => state.currentCourse);

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateTopic, setGenerateTopic] = useState('');
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Fetch course details on mount
  useEffect(() => {
    fetchCourseDetails(course.id);
  }, [course.id, fetchCourseDetails]);

  // Update lessons when course details are loaded
  useEffect(() => {
    // training_lessons comes from Supabase join query
    const courseData = currentCourse as Course & { training_lessons?: Lesson[] };
    if (courseData?.training_lessons) {
      setLessons(courseData.training_lessons);
    }
  }, [currentCourse]);

  // Calculate progress
  const completedLessons = 0; // TODO: Get from user progress
  const totalLessons = lessons.length;
  const progressPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  // Generate lesson with AI
  const handleGenerateLesson = async () => {
    if (!generateTopic.trim()) {
      setGenerateError('Ingresa un tema para la lección');
      return;
    }

    setIsGenerating(true);
    setGenerateError(null);

    try {
      const response = await fetch('/api/training/generate-lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: course.id,
          topic: generateTopic.trim(),
          questionCount: 5,
          difficulty: course.dificultad || 'principiante'
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al generar lección');
      }

      // Refresh course details to show new lesson
      await fetchCourseDetails(course.id);
      setShowGenerateModal(false);
      setGenerateTopic('');
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0c0c0e]">
      {/* Header */}
      <div className="shrink-0 p-4 md:p-6 border-b border-white/5">
        {/* Back button */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-zinc-400 hover:text-white mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Volver a cursos</span>
        </button>

        {/* Course header */}
        <div className="flex items-start gap-4">
          <div 
            className="w-16 h-16 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${course.color_tema || '#6366f1'}20` }}
          >
            <BookOpen className="w-8 h-8" style={{ color: course.color_tema || '#6366f1' }} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-white truncate">{course.titulo}</h1>
              <span className={cn(
                "px-2 py-0.5 rounded-full border text-[10px]",
                DIFFICULTY_COLORS[course.dificultad || 'principiante']
              )}>
                {DIFFICULTY_LABELS[course.dificultad || 'principiante']}
              </span>
            </div>
            
            {course.descripcion && (
              <p className="text-sm text-zinc-400 line-clamp-2 mb-3">
                {course.descripcion}
              </p>
            )}

            {/* Progress bar */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary-500 rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-xs text-zinc-500 shrink-0">
                {completedLessons}/{totalLessons} lecciones
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Lessons list */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
          </div>
        ) : lessons.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                <BookOpen className="w-4 h-4" />
                Lecciones del curso
              </h3>
              <button
                onClick={() => setShowGenerateModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary-500/10 hover:bg-primary-500/20 text-primary-400 rounded-lg border border-primary-500/20 transition-all"
              >
                <Wand2 className="w-3.5 h-3.5" />
                Generar con IA
              </button>
            </div>
            {lessons.map((lesson, index) => (
              <LessonCard
                key={lesson.id}
                lesson={lesson}
                index={index}
                isLocked={index > 0 && completedLessons < index} // Lock lessons after first incomplete
                isCompleted={index < completedLessons}
                onStart={() => onStartLesson(lesson.id)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-zinc-600" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-300 mb-2">
              Sin Lecciones
            </h3>
            <p className="text-sm text-zinc-500 max-w-sm mb-4">
              Este curso aún no tiene lecciones.
            </p>
            <button
              onClick={() => setShowGenerateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-500 hover:bg-primary-400 text-white rounded-xl font-medium transition-all"
            >
              <Wand2 className="w-4 h-4" />
              Generar Primera Lección
            </button>
          </div>
        )}
      </div>

      {/* Generate Lesson Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-500/20 flex items-center justify-center">
                  <Wand2 className="w-5 h-5 text-primary-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Generar Lección con IA</h3>
                  <p className="text-xs text-zinc-500">Monica AI creará contenido y preguntas</p>
                </div>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Tema de la lección
                </label>
                <input
                  type="text"
                  value={generateTopic}
                  onChange={(e) => setGenerateTopic(e.target.value)}
                  placeholder="Ej: Técnicas de cierre de ventas"
                  className="w-full px-4 py-3 bg-zinc-800/50 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:border-primary-500/50 transition-colors"
                  disabled={isGenerating}
                />
              </div>

              <div className="bg-zinc-800/30 rounded-xl p-3 text-xs text-zinc-400">
                <p className="font-medium text-zinc-300 mb-1">Se generará:</p>
                <ul className="space-y-1">
                  <li>• Título y descripción de la lección</li>
                  <li>• 5 preguntas de opción múltiple</li>
                  <li>• Explicaciones para cada respuesta</li>
                </ul>
              </div>

              {generateError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                  <p className="text-sm text-rose-400">{generateError}</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-white/5 flex gap-3">
              <button
                onClick={() => {
                  setShowGenerateModal(false);
                  setGenerateTopic('');
                  setGenerateError(null);
                }}
                disabled={isGenerating}
                className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl font-medium transition-all disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleGenerateLesson}
                disabled={isGenerating || !generateTopic.trim()}
                className="flex-1 py-3 bg-primary-500 hover:bg-primary-400 text-white rounded-xl font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generando...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CourseDetailView;

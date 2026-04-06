'use client';

import React, { useEffect, useState } from 'react';
import { 
  GraduationCap, 
  BookOpen, 
  Trophy, 
  Flame, 
  Clock,
  ChevronRight,
  Play,
  Lock,
  CheckCircle2,
  Star,
  Loader2,
  Plus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTrainingStore, selectCourses, selectIsLoading, selectUserStreak, selectIsOverlayOpen, selectActiveLesson, selectCurrentSession } from '../store/trainingStore';
import { useContactStore, selectSelectedEnterpriseId, selectUserContext } from '@/store/contactStore';
import { Course, DIFFICULTY_LABELS, DIFFICULTY_COLORS } from '../types/training';
import { CreateCourseModal } from './CreateCourseModal';
import { CourseDetailView } from './CourseDetailView';
import { FocusTrainingOverlay } from './FocusTrainingOverlay';
import { LessonPlayer } from './LessonPlayer';

// ============================================================================
// COURSE CARD COMPONENT
// ============================================================================

interface CourseCardProps {
  course: Course;
  progress?: number;
  onSelect: () => void;
}

const CourseCard: React.FC<CourseCardProps> = ({ course, progress = 0, onSelect }) => {
  const isCompleted = progress >= 100;
  const isStarted = progress > 0;

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full p-5 rounded-2xl border text-left transition-all duration-300",
        "bg-zinc-900/50 border-white/5 hover:border-white/20 hover:bg-zinc-800/50",
        "group active:scale-[0.98]"
      )}
    >
      <div className="flex items-start gap-4">
        {/* Course Icon/Image */}
        <div 
          className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${course.color_tema}20` }}
        >
          {isCompleted ? (
            <CheckCircle2 className="w-7 h-7 text-emerald-400" />
          ) : (
            <BookOpen className="w-7 h-7" style={{ color: course.color_tema }} />
          )}
        </div>

        {/* Course Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-bold text-white truncate group-hover:text-primary-300 transition-colors">
              {course.titulo}
            </h3>
            {isCompleted && (
              <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />
            )}
          </div>
          
          <p className="text-sm text-zinc-400 line-clamp-2 mb-3">
            {course.descripcion || 'Sin descripción'}
          </p>

          {/* Meta Info */}
          <div className="flex items-center gap-3 text-xs">
            <span className={cn(
              "px-2 py-0.5 rounded-full border",
              DIFFICULTY_COLORS[course.dificultad]
            )}>
              {DIFFICULTY_LABELS[course.dificultad]}
            </span>
            
            {course.lessons_count && (
              <span className="text-zinc-500 flex items-center gap-1">
                <BookOpen className="w-3 h-3" />
                {course.lessons_count} lecciones
              </span>
            )}
            
            {course.duracion_estimada_min && (
              <span className="text-zinc-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {course.duracion_estimada_min} min
              </span>
            )}
          </div>
        </div>

        {/* Action */}
        <div className="shrink-0 flex items-center">
          {isStarted && !isCompleted ? (
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs text-zinc-500">{progress}%</span>
              <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary-500 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-white group-hover:translate-x-1 transition-all" />
          )}
        </div>
      </div>
    </button>
  );
};

// ============================================================================
// STATS CARD COMPONENT
// ============================================================================

interface StatsCardProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}

const StatsCard: React.FC<StatsCardProps> = ({ icon: Icon, label, value, color }) => (
  <div className="p-4 bg-zinc-900/50 rounded-xl border border-white/5">
    <div className="flex items-center gap-3">
      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-xl font-bold text-white">{value}</div>
        <div className="text-xs text-zinc-500">{label}</div>
      </div>
    </div>
  </div>
);

// ============================================================================
// MAIN ACADEMY VIEW
// ============================================================================

export const AcademyView: React.FC = () => {
  const courses = useTrainingStore(selectCourses);
  const isLoading = useTrainingStore(selectIsLoading);
  const userStreak = useTrainingStore(selectUserStreak);
  const fetchCourses = useTrainingStore(state => state.fetchCourses);
  const fetchUserStreak = useTrainingStore(state => state.fetchUserStreak);
  const fetchLesson = useTrainingStore(state => state.fetchLesson);
  const startLesson = useTrainingStore(state => state.startLesson);
  
  const empresaId = useContactStore(selectSelectedEnterpriseId);
  const userContext = useContactStore(selectUserContext);

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  
  // Overlay state
  const isOverlayOpen = useTrainingStore(selectIsOverlayOpen);
  const activeLesson = useTrainingStore(selectActiveLesson);
  const currentSession = useTrainingStore(selectCurrentSession);
  const openOverlay = useTrainingStore(state => state.openOverlay);

  // Fetch courses on mount
  useEffect(() => {
    if (empresaId) {
      fetchCourses(empresaId);
    }
    if (userContext?.id) {
      fetchUserStreak(userContext.id);
    }
  }, [empresaId, userContext?.id, fetchCourses, fetchUserStreak]);

  // Get unique categories
  const categories = Array.from(new Set(courses.map(c => c.categoria).filter(Boolean)));

  // Filter courses by category
  const filteredCourses = selectedCategory 
    ? courses.filter(c => c.categoria === selectedCategory)
    : courses;

  // Handle course selection
  const handleSelectCourse = (course: Course) => {
    setSelectedCourse(course);
  };

  // Handle starting a lesson
  const handleStartLesson = async (lessonId: string) => {
    await fetchLesson(lessonId);
    startLesson(lessonId);
    openOverlay();
  };

  // If a course is selected, show its detail view
  if (selectedCourse) {
    return (
      <CourseDetailView
        course={selectedCourse}
        onBack={() => setSelectedCourse(null)}
        onStartLesson={handleStartLesson}
      />
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#0c0c0e]">
      {/* Header */}
      <div className="shrink-0 p-4 md:p-6 border-b border-white/5">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary-500/20 flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-primary-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Urpe Academy</h1>
              <p className="text-sm text-zinc-500">Capacitación gamificada para tu equipo</p>
            </div>
          </div>

          {/* Create Course Button (Admin only) */}
          {userContext?.roleId && userContext.roleId <= 2 && (
            <button 
              className="flex items-center gap-2 px-4 py-2 bg-primary-500/10 hover:bg-primary-500/20 text-primary-400 rounded-xl border border-primary-500/20 transition-all"
              onClick={() => setIsCreateModalOpen(true)}
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm font-medium">Crear Curso</span>
            </button>
          )}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatsCard 
            icon={Flame}
            label="Racha Actual"
            value={userStreak?.current_streak || 0}
            color="bg-orange-500/20 text-orange-400"
          />
          <StatsCard 
            icon={Trophy}
            label="Mejor Racha"
            value={userStreak?.longest_streak || 0}
            color="bg-amber-500/20 text-amber-400"
          />
          <StatsCard 
            icon={BookOpen}
            label="Cursos"
            value={courses.length}
            color="bg-primary-500/20 text-primary-400"
          />
          <StatsCard 
            icon={CheckCircle2}
            label="Completados"
            value={0}
            color="bg-emerald-500/20 text-emerald-400"
          />
        </div>

        {/* Category Filter */}
        {categories.length > 0 && (
          <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
                !selectedCategory 
                  ? "bg-primary-500/20 text-primary-300 border border-primary-500/30"
                  : "bg-zinc-800 text-zinc-400 border border-white/5 hover:border-white/10"
              )}
            >
              Todos
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat || null)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
                  selectedCategory === cat
                    ? "bg-primary-500/20 text-primary-300 border border-primary-500/30"
                    : "bg-zinc-800 text-zinc-400 border border-white/5 hover:border-white/10"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
          </div>
        ) : filteredCourses.length > 0 ? (
          <div className="space-y-3">
            {filteredCourses.map(course => (
              <CourseCard
                key={course.id}
                course={course}
                progress={course.progress_percent || 0}
                onSelect={() => handleSelectCourse(course)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-20 h-20 rounded-2xl bg-zinc-800/50 flex items-center justify-center mb-4">
              <BookOpen className="w-10 h-10 text-zinc-600" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-300 mb-2">
              Sin Cursos Disponibles
            </h3>
            <p className="text-sm text-zinc-500 max-w-sm mb-6">
              {empresaId 
                ? 'Aún no hay cursos creados para tu empresa. Los administradores pueden crear nuevos cursos.'
                : 'Selecciona una empresa para ver los cursos disponibles.'}
            </p>
            
            {userContext?.roleId && userContext.roleId <= 2 && (
              <button 
                className="flex items-center gap-2 px-6 py-3 bg-primary-500 hover:bg-primary-400 text-white rounded-xl font-bold transition-all"
                onClick={() => setIsCreateModalOpen(true)}
              >
                <Plus className="w-5 h-5" />
                Crear Primer Curso
              </button>
            )}
          </div>
        )}
      </div>

      {/* Create Course Modal */}
      <CreateCourseModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      {/* Training Overlay with LessonPlayer */}
      <FocusTrainingOverlay>
        {activeLesson && currentSession ? (
          <LessonPlayer />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-primary-400 animate-spin mx-auto mb-3" />
              <p className="text-zinc-400">Cargando lección...</p>
            </div>
          </div>
        )}
      </FocusTrainingOverlay>
    </div>
  );
};

export default AcademyView;

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  ChevronRight, 
  Lightbulb,
  Trophy,
  Flame,
  Star,
  RotateCcw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  useTrainingStore, 
  selectCurrentSession, 
  selectActiveLesson,
  selectCurrentQuestion,
  selectSessionProgress
} from '../store/trainingStore';
import { Question, LessonCompleteData, formatTime } from '../types/training';

// ============================================================================
// QUESTION CARD COMPONENT
// ============================================================================

interface QuestionCardProps {
  question: Question;
  questionNumber: number;
  totalQuestions: number;
  selectedAnswer: string | null;
  isSubmitted: boolean;
  isCorrect: boolean | null;
  onSelectAnswer: (answer: string) => void;
  disabled?: boolean;
}

const QuestionCard: React.FC<QuestionCardProps> = ({
  question,
  questionNumber,
  totalQuestions,
  selectedAnswer,
  isSubmitted,
  isCorrect,
  onSelectAnswer,
  disabled = false
}) => {
  const options = question.opciones || [];

  return (
    <div className="flex-1 flex flex-col animate-in slide-in-from-bottom-4 duration-500">
      {/* Question Number */}
      <div className="text-xs text-zinc-500 mb-2">
        Pregunta {questionNumber} de {totalQuestions}
      </div>

      {/* Question Text */}
      <h2 className="text-xl md:text-2xl font-bold text-white mb-8 leading-relaxed">
        {question.pregunta}
      </h2>

      {/* Options */}
      <div className="space-y-3">
        {options.map((option, index) => {
          const optionKey = String(index);
          const isSelected = selectedAnswer === optionKey;
          const isCorrectAnswer = question.respuesta_correcta === optionKey;
          
          let optionStyle = 'bg-zinc-900/50 border-white/10 hover:border-white/20 hover:bg-zinc-800/50';
          
          if (isSubmitted) {
            if (isCorrectAnswer) {
              optionStyle = 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300';
            } else if (isSelected && !isCorrect) {
              optionStyle = 'bg-rose-500/20 border-rose-500/50 text-rose-300 animate-shake';
            } else {
              optionStyle = 'bg-zinc-900/30 border-white/5 opacity-50';
            }
          } else if (isSelected) {
            optionStyle = 'bg-primary-500/20 border-primary-500/50 text-primary-300 ring-2 ring-primary-500/30';
          }

          return (
            <button
              key={index}
              onClick={() => !isSubmitted && !disabled && onSelectAnswer(optionKey)}
              disabled={isSubmitted || disabled}
              className={cn(
                "w-full p-4 rounded-xl border text-left transition-all duration-200",
                "flex items-center gap-4",
                optionStyle,
                !isSubmitted && !disabled && "cursor-pointer active:scale-[0.98]",
                (isSubmitted || disabled) && "cursor-default"
              )}
            >
              {/* Option Letter */}
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shrink-0",
                isSubmitted && isCorrectAnswer 
                  ? "bg-emerald-500 text-white" 
                  : isSubmitted && isSelected && !isCorrect
                    ? "bg-rose-500 text-white"
                    : isSelected
                      ? "bg-primary-500 text-white"
                      : "bg-zinc-800 text-zinc-400"
              )}>
                {String.fromCharCode(65 + index)}
              </div>
              
              {/* Option Text */}
              <span className="flex-1 text-sm md:text-base">{option}</span>

              {/* Feedback Icon */}
              {isSubmitted && isCorrectAnswer && (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              )}
              {isSubmitted && isSelected && !isCorrect && (
                <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
              )}
            </button>
          );
        })}
      </div>

      {/* Hint (if available and not submitted) */}
      {question.hint && !isSubmitted && (
        <button className="mt-6 flex items-center gap-2 text-xs text-amber-400/70 hover:text-amber-400 transition-colors">
          <Lightbulb className="w-4 h-4" />
          <span>Ver pista</span>
        </button>
      )}
    </div>
  );
};

// ============================================================================
// ANSWER FEEDBACK COMPONENT
// ============================================================================

interface AnswerFeedbackProps {
  isCorrect: boolean;
  explanation?: string;
  onContinue: () => void;
}

const AnswerFeedback: React.FC<AnswerFeedbackProps> = ({ 
  isCorrect, 
  explanation,
  onContinue 
}) => {
  return (
    <div className={cn(
      "mt-6 p-4 rounded-xl border animate-in slide-in-from-bottom-2 duration-300",
      isCorrect 
        ? "bg-emerald-500/10 border-emerald-500/30" 
        : "bg-rose-500/10 border-rose-500/30"
    )}>
      <div className="flex items-start gap-3">
        <div className={cn(
          "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
          isCorrect ? "bg-emerald-500/20" : "bg-rose-500/20"
        )}>
          {isCorrect ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          ) : (
            <XCircle className="w-5 h-5 text-rose-400" />
          )}
        </div>
        
        <div className="flex-1">
          <p className={cn(
            "font-bold mb-1",
            isCorrect ? "text-emerald-300" : "text-rose-300"
          )}>
            {isCorrect ? '¡Correcto!' : 'Incorrecto'}
          </p>
          
          {explanation && (
            <p className="text-sm text-zinc-400">{explanation}</p>
          )}
        </div>
      </div>

      <button
        onClick={onContinue}
        className={cn(
          "w-full mt-4 py-3 rounded-xl font-bold transition-all",
          "flex items-center justify-center gap-2",
          isCorrect 
            ? "bg-emerald-500 hover:bg-emerald-400 text-white" 
            : "bg-rose-500 hover:bg-rose-400 text-white"
        )}
      >
        Continuar
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
};

// ============================================================================
// LESSON COMPLETE COMPONENT
// ============================================================================

interface LessonCompleteProps {
  data: LessonCompleteData;
  onClose: () => void;
  onRetry?: () => void;
}

const LessonComplete: React.FC<LessonCompleteProps> = ({ data, onClose, onRetry }) => {
  const isPassed = data.score >= 60;
  
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-500">
      {/* Icon */}
      <div className={cn(
        "w-24 h-24 rounded-3xl flex items-center justify-center mb-6",
        isPassed ? "bg-emerald-500/20" : "bg-rose-500/20"
      )}>
        {isPassed ? (
          <Trophy className="w-12 h-12 text-emerald-400" />
        ) : (
          <RotateCcw className="w-12 h-12 text-rose-400" />
        )}
      </div>

      {/* Title */}
      <h2 className={cn(
        "text-3xl font-bold mb-2",
        isPassed ? "text-emerald-300" : "text-rose-300"
      )}>
        {isPassed ? '¡Lección Completada!' : 'Sigue Practicando'}
      </h2>
      
      <p className="text-zinc-400 mb-8">{data.lessonTitulo}</p>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 w-full max-w-sm mb-8">
        {/* Score */}
        <div className="p-4 bg-zinc-900/50 rounded-xl border border-white/5">
          <div className={cn(
            "text-2xl font-bold",
            data.score >= 80 ? "text-emerald-400" : data.score >= 60 ? "text-amber-400" : "text-rose-400"
          )}>
            {data.score}%
          </div>
          <div className="text-xs text-zinc-500">Puntuación</div>
        </div>

        {/* XP */}
        <div className="p-4 bg-zinc-900/50 rounded-xl border border-white/5">
          <div className="text-2xl font-bold text-amber-400 flex items-center justify-center gap-1">
            +{data.xpEarned + data.xpBonus}
          </div>
          <div className="text-xs text-zinc-500">XP Ganado</div>
        </div>

        {/* Correct */}
        <div className="p-4 bg-zinc-900/50 rounded-xl border border-white/5">
          <div className="text-2xl font-bold text-primary-400">
            {data.correctCount}/{data.totalQuestions}
          </div>
          <div className="text-xs text-zinc-500">Correctas</div>
        </div>
      </div>

      {/* Perfect Bonus */}
      {data.isPerfect && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-full mb-6 animate-in zoom-in duration-300">
          <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
          <span className="text-sm text-amber-300 font-medium">¡Perfecto! +{data.xpBonus} XP bonus</span>
        </div>
      )}

      {/* Streak */}
      {data.currentStreak > 0 && (
        <div className="flex items-center gap-2 text-sm text-orange-400 mb-8">
          <Flame className="w-5 h-5 fill-orange-400" />
          <span>Racha de {data.currentStreak} días</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 w-full max-w-sm">
        {!isPassed && onRetry && (
          <button
            onClick={onRetry}
            className="flex-1 py-3 px-6 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold transition-all"
          >
            Reintentar
          </button>
        )}
        <button
          onClick={onClose}
          className={cn(
            "flex-1 py-3 px-6 rounded-xl font-bold transition-all",
            isPassed 
              ? "bg-emerald-500 hover:bg-emerald-400 text-white"
              : "bg-primary-500 hover:bg-primary-400 text-white"
          )}
        >
          {isPassed ? 'Continuar' : 'Volver al Curso'}
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN LESSON PLAYER COMPONENT
// ============================================================================

export const LessonPlayer: React.FC = () => {
  const currentSession = useTrainingStore(selectCurrentSession);
  const activeLesson = useTrainingStore(selectActiveLesson);
  const currentQuestion = useTrainingStore(selectCurrentQuestion);
  const progress = useTrainingStore(selectSessionProgress);
  
  const submitAnswer = useTrainingStore(state => state.submitAnswer);
  const nextQuestion = useTrainingStore(state => state.nextQuestion);
  const completeLesson = useTrainingStore(state => state.completeLesson);
  const abandonLesson = useTrainingStore(state => state.abandonLesson);
  const closeOverlay = useTrainingStore(state => state.closeOverlay);

  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState<boolean | null>(null);
  const [completionData, setCompletionData] = useState<LessonCompleteData | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Timer
  useEffect(() => {
    if (currentSession?.state === 'active') {
      const interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [currentSession?.state]);

  // Reset state when question changes
  useEffect(() => {
    setSelectedAnswer(null);
    setIsSubmitted(false);
    setLastAnswerCorrect(null);
  }, [currentSession?.currentQuestionIndex]);

  // Handle submit answer
  const handleSubmit = useCallback(() => {
    if (!selectedAnswer || !currentQuestion || isSubmitted) return;
    
    submitAnswer(currentQuestion.id, selectedAnswer);
    setIsSubmitted(true);
    setLastAnswerCorrect(selectedAnswer === currentQuestion.respuesta_correcta);
  }, [selectedAnswer, currentQuestion, isSubmitted, submitAnswer]);

  // Handle continue to next question
  const handleContinue = useCallback(async () => {
    if (!currentSession) return;
    
    // Check if this was the last question
    const isLastQuestion = currentSession.currentQuestionIndex >= currentSession.totalQuestions - 1;
    
    if (isLastQuestion || currentSession.hearts <= 0) {
      // Complete the lesson
      const result = await completeLesson();
      if (result) {
        setCompletionData(result);
      }
    } else {
      nextQuestion();
    }
  }, [currentSession, nextQuestion, completeLesson]);

  // Handle close
  const handleClose = useCallback(() => {
    setCompletionData(null);
    abandonLesson();
  }, [abandonLesson]);

  // Handle retry
  const handleRetry = useCallback(() => {
    setCompletionData(null);
    // TODO: Implement retry logic
    abandonLesson();
  }, [abandonLesson]);

  // No active session
  if (!currentSession || !activeLesson) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-500">Cargando lección...</p>
      </div>
    );
  }

  // Session complete
  if (completionData || currentSession.state === 'complete') {
    return completionData ? (
      <LessonComplete 
        data={completionData} 
        onClose={handleClose}
        onRetry={handleRetry}
      />
    ) : (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-zinc-500">Calculando resultados...</p>
      </div>
    );
  }

  // Out of hearts
  if (currentSession.hearts <= 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <div className="w-20 h-20 rounded-2xl bg-rose-500/20 flex items-center justify-center mb-6">
          <XCircle className="w-10 h-10 text-rose-400" />
        </div>
        <h2 className="text-2xl font-bold text-rose-300 mb-2">Sin Vidas</h2>
        <p className="text-zinc-400 mb-8">Has perdido todas tus vidas. ¡Inténtalo de nuevo!</p>
        <button
          onClick={handleClose}
          className="py-3 px-8 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold transition-all"
        >
          Volver al Curso
        </button>
      </div>
    );
  }

  // Active question
  return (
    <div className="flex-1 flex flex-col">
        {/* Current Question */}
        {currentQuestion && (
          <QuestionCard
            question={currentQuestion}
            questionNumber={progress.current}
            totalQuestions={progress.total}
            selectedAnswer={selectedAnswer}
            isSubmitted={isSubmitted}
            isCorrect={lastAnswerCorrect}
            onSelectAnswer={setSelectedAnswer}
            disabled={isSubmitted}
          />
        )}

        {/* Feedback (shown after submit) */}
        {isSubmitted && lastAnswerCorrect !== null && (
          <AnswerFeedback
            isCorrect={lastAnswerCorrect}
            explanation={currentQuestion?.explicacion}
            onContinue={handleContinue}
          />
        )}

        {/* Submit Button (shown before submit) */}
        {!isSubmitted && (
          <div className="mt-auto pt-6">
            <button
              onClick={handleSubmit}
              disabled={!selectedAnswer}
              className={cn(
                "w-full py-4 rounded-xl font-bold text-lg transition-all",
                selectedAnswer
                  ? "bg-primary-500 hover:bg-primary-400 text-white shadow-lg shadow-primary-500/20"
                  : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
              )}
            >
              Verificar
            </button>
          </div>
        )}
    </div>
  );
};

export default LessonPlayer;

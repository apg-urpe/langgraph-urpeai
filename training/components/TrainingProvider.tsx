'use client';

import React from 'react';
import { FocusTrainingOverlay } from './FocusTrainingOverlay';
import { LessonPlayer } from './LessonPlayer';
import { useTrainingStore, selectIsOverlayOpen, selectActiveLesson, selectCurrentSession } from '../store/trainingStore';

/**
 * TrainingProvider - Wrapper component that provides the training overlay
 * Mount this at the app level (layout.tsx or similar) to enable training mode
 */
export const TrainingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isOverlayOpen = useTrainingStore(selectIsOverlayOpen);
  const activeLesson = useTrainingStore(selectActiveLesson);
  const currentSession = useTrainingStore(selectCurrentSession);

  return (
    <>
      {children}
      
      {/* Training Overlay with LessonPlayer */}
      <FocusTrainingOverlay>
        {activeLesson && currentSession ? (
          <LessonPlayer />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-zinc-400 mb-2">Cargando lección...</p>
              <p className="text-xs text-zinc-600">Si esto persiste, recarga la página</p>
            </div>
          </div>
        )}
      </FocusTrainingOverlay>
    </>
  );
};

export default TrainingProvider;

'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  MessageSquare, 
  CheckSquare, 
  Layout, 
  Paperclip,
  Activity,
  Settings2,
  ChevronLeft
} from 'lucide-react';
import { useTareasStore } from '@/store/tareasStore';
import { TaskV3 } from '@/types/tasks-v3';
import { TaskSidebar } from './TaskSidebar';
import { TaskDescription } from './TaskDescription';
import { TaskChecklist } from './TaskChecklist';
import { TaskComments } from './TaskComments';
import { TaskMediaGallery } from './TaskMedia';
import { TaskHistory } from './TaskHistory';
import { cn } from '@/lib/utils';

interface TaskDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: number;
}

type TabType = 'overview' | 'subtasks' | 'comments' | 'files' | 'history' | 'info';

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  isOpen,
  onClose,
  taskId
}) => {
  const { selectedTask, fetchTaskById, isLoadingDetail } = useTareasStore();
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  useEffect(() => {
    if (isOpen && taskId) {
      fetchTaskById(taskId);
    }
  }, [isOpen, taskId, fetchTaskById]);

  if (!isOpen) return null;

  // Loading state
  if (isLoadingDetail && !selectedTask) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="w-full max-w-4xl mx-4 bg-[#0c0c0e] border border-white/10 rounded-xl h-[80vh] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-zinc-400">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Cargando tarea...</span>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  if (!selectedTask) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center md:p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Container - Fullscreen on mobile */}
      <div className="relative bg-[#0c0c0e] md:border border-white/10 md:rounded-xl shadow-2xl w-full md:max-w-6xl h-full md:h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* HEADER - Mobile optimized */}
        <div className="flex items-center justify-between px-3 md:px-6 py-3 md:py-4 border-b border-white/5 bg-[#0c0c0e] safe-top">
          <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
            {/* Back button on mobile */}
            <button 
              onClick={onClose}
              className="md:hidden p-1.5 -ml-1 text-zinc-400 hover:text-zinc-200 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            
            <div className="flex items-center gap-2 text-xs md:text-sm text-zinc-400 min-w-0">
              <Layout className="w-4 h-4 flex-shrink-0 hidden md:block" />
              <span className="hidden md:inline">{selectedTask.proyecto?.nombre || 'Inbox'}</span>
              <span className="hidden md:inline text-zinc-600">/</span>
              <span className="text-zinc-200 font-medium truncate">
                {selectedTask.titulo}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 md:gap-2">
            {/* Info button on mobile - shows sidebar content */}
            <button 
              onClick={() => setActiveTab(activeTab === 'info' ? 'overview' : 'info')}
              className={cn(
                "md:hidden p-2 rounded-lg transition-colors",
                activeTab === 'info' 
                  ? "text-primary-400 bg-primary-500/10" 
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
              )}
            >
              <Settings2 className="w-4 h-4" />
            </button>
            
            <button 
              onClick={onClose}
              className="hidden md:flex p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* BODY */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* MAIN CONTENT (Scrollable) */}
          <div className={cn(
            "flex-1 overflow-y-auto custom-scrollbar",
            activeTab === 'info' && "hidden md:block"
          )}>
            <div className="max-w-3xl mx-auto px-4 md:px-8 py-4 md:py-8 space-y-6 md:space-y-8 pb-20 md:pb-8">
              
              {/* TABS HEADER - Scrollable on mobile */}
              <div className="flex items-center gap-4 md:gap-6 border-b border-white/5 pb-1 sticky top-0 bg-[#0c0c0e] z-10 pt-2 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
                <TabButton 
                  active={activeTab === 'overview'} 
                  onClick={() => setActiveTab('overview')}
                  icon={<Layout className="w-4 h-4" />}
                  label="Detalles"
                  compact
                />
                <TabButton 
                  active={activeTab === 'subtasks'} 
                  onClick={() => setActiveTab('subtasks')}
                  icon={<CheckSquare className="w-4 h-4" />}
                  label="Subtareas"
                  count={selectedTask.items?.length}
                  compact
                />
                <TabButton 
                  active={activeTab === 'comments'} 
                  onClick={() => setActiveTab('comments')}
                  icon={<MessageSquare className="w-4 h-4" />}
                  label="Comentarios"
                  compact
                />
                <TabButton 
                  active={activeTab === 'files'} 
                  onClick={() => setActiveTab('files')}
                  icon={<Paperclip className="w-4 h-4" />}
                  label="Archivos"
                  count={selectedTask.media?.length}
                  compact
                />
                <TabButton 
                  active={activeTab === 'history'} 
                  onClick={() => setActiveTab('history')}
                  icon={<Activity className="w-4 h-4" />}
                  label="Actividad"
                  compact
                />
              </div>

              {/* CONTENT AREA */}
              <div className="min-h-[300px] md:min-h-[400px]">
                {activeTab === 'overview' && (
                  <div className="space-y-6 md:space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <TaskDescription task={selectedTask} />
                    <TaskChecklist task={selectedTask} />
                  </div>
                )}
                
                {activeTab === 'subtasks' && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <TaskChecklist task={selectedTask} expanded />
                  </div>
                )}

                {activeTab === 'comments' && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 h-full">
                    <TaskComments task={selectedTask} />
                  </div>
                )}

                {activeTab === 'files' && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <TaskMediaGallery task={selectedTask} />
                  </div>
                )}

                {activeTab === 'history' && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <TaskHistory task={selectedTask} />
                  </div>
                )}
              </div>

            </div>
          </div>

          {/* SIDEBAR - Hidden on mobile unless info tab is active */}
          <div className={cn(
            "w-full md:w-[350px] md:border-l border-white/5 bg-[#0a0a0c] overflow-y-auto custom-scrollbar",
            activeTab === 'info' ? "block" : "hidden md:block"
          )}>
            <TaskSidebar task={selectedTask} />
          </div>

        </div>
      </div>
    </div>,
    document.body
  );
};

const TabButton = ({ active, onClick, icon, label, count, compact }: any) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-1.5 md:gap-2 pb-3 text-xs md:text-sm font-medium transition-all relative whitespace-nowrap flex-shrink-0",
      active 
        ? "text-primary-400" 
        : "text-zinc-500 hover:text-zinc-300"
    )}
  >
    {icon}
    <span className={compact ? "hidden sm:inline" : ""}>{label}</span>
    {count !== undefined && count > 0 && (
      <span className={cn(
        "text-[10px] px-1.5 py-0.5 rounded-full",
        active ? "bg-primary-500/10 text-primary-400" : "bg-zinc-800 text-zinc-500"
      )}>
        {count}
      </span>
    )}
    {active && (
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary-500 rounded-t-full" />
    )}
  </button>
);

'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  Layout, 
  DollarSign, 
  PieChart, 
  Calendar,
  Briefcase,
  User,
  Package,
  Settings,
  CheckSquare
} from 'lucide-react';
import { useProyectosStore } from '@/store/proyectosStore';
import { ProjectV3 } from '@/types/tasks-v3';
import { ProjectCosts } from './ProjectCosts';
import { ProjectFinanceSummary } from './ProjectFinanceSummary';
import { ProjectTasks } from './ProjectTasks';
import { cn } from '@/lib/utils';

interface ProjectDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
}

type TabType = 'details' | 'tasks' | 'costs' | 'finance' | 'settings';

export const ProjectDetailModal: React.FC<ProjectDetailModalProps> = ({
  isOpen,
  onClose,
  projectId
}) => {
  const { fetchProjectWithDetails, selectedProject, isLoadingDetail, updateProject } = useProyectosStore();
  const [activeTab, setActiveTab] = useState<TabType>('details');

  useEffect(() => {
    if (isOpen && projectId) {
      fetchProjectWithDetails(projectId);
    }
  }, [isOpen, projectId, fetchProjectWithDetails]);

  if (!isOpen) return null;

  // Loading state
  if (isLoadingDetail && !selectedProject) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="w-full max-w-4xl bg-[#0c0c0e] border border-white/10 rounded-xl h-[600px] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-zinc-400">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Cargando proyecto...</span>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  if (!selectedProject) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative bg-[#0c0c0e] border border-white/10 rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* HEADER */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#0c0c0e]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${selectedProject.color}20` }}>
              <Briefcase className="w-4 h-4" style={{ color: selectedProject.color }} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
                {selectedProject.nombre}
                <span className={cn(
                  "text-[10px] px-2 py-0.5 rounded-full border",
                  selectedProject.estado === 'activo' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                  selectedProject.estado === 'completado' ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                  "bg-zinc-800 text-zinc-400 border-zinc-700"
                )}>
                  {selectedProject.estado.toUpperCase()}
                </span>
              </h2>
              <p className="text-xs text-zinc-500 truncate max-w-[400px]">
                {selectedProject.descripcion || 'Sin descripción'}
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* BODY */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* SIDEBAR NAVIGATION */}
          <div className="w-64 border-r border-white/5 bg-[#0a0a0c] p-4 flex flex-col gap-1">
            <NavButton 
              active={activeTab === 'details'} 
              onClick={() => setActiveTab('details')}
              icon={<Layout className="w-4 h-4" />}
              label="Detalles Generales"
            />
            <NavButton 
              active={activeTab === 'tasks'} 
              onClick={() => setActiveTab('tasks')}
              icon={<CheckSquare className="w-4 h-4" />}
              label="Tareas"
              count={selectedProject._tareas_total}
            />
            <NavButton 
              active={activeTab === 'costs'} 
              onClick={() => setActiveTab('costs')}
              icon={<DollarSign className="w-4 h-4" />}
              label="Registro de Costos"
              count={selectedProject.costos?.length}
            />
            <NavButton 
              active={activeTab === 'finance'} 
              onClick={() => setActiveTab('finance')}
              icon={<PieChart className="w-4 h-4" />}
              label="Resumen Financiero"
            />
            <div className="h-px bg-white/5 my-2" />
            <NavButton 
              active={activeTab === 'settings'} 
              onClick={() => setActiveTab('settings')}
              icon={<Settings className="w-4 h-4" />}
              label="Configuración"
            />
          </div>

          {/* MAIN CONTENT AREA */}
          <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#0c0c0e]">
            <div className="max-w-4xl mx-auto p-8">
              
              {activeTab === 'details' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {/* Grid de Información */}
                  <div className="grid grid-cols-2 gap-6">
                    {/* Cliente */}
                    <div className="p-4 bg-[#1a1a1c] border border-white/5 rounded-xl space-y-3">
                      <h3 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                        <User className="w-4 h-4" /> Cliente / Contacto
                      </h3>
                      {selectedProject.contacto ? (
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 font-medium">
                            {selectedProject.contacto.nombre[0]}{selectedProject.contacto.apellido[0]}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-zinc-200">
                              {selectedProject.contacto.nombre} {selectedProject.contacto.apellido}
                            </p>
                            <p className="text-xs text-zinc-500">{selectedProject.contacto.email}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-zinc-500 italic">No asignado</p>
                      )}
                    </div>

                    {/* Servicio */}
                    <div className="p-4 bg-[#1a1a1c] border border-white/5 rounded-xl space-y-3">
                      <h3 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                        <Package className="w-4 h-4" /> Servicio Asociado
                      </h3>
                      {selectedProject.servicio ? (
                        <div>
                          <p className="text-sm font-medium text-zinc-200">
                            {selectedProject.servicio.nombre_servicio}
                          </p>
                          <p className="text-xs text-zinc-500 mt-1">
                            Valor: {selectedProject.moneda} {selectedProject.servicio.valor_total?.toLocaleString()}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-zinc-500 italic">No asignado</p>
                      )}
                    </div>

                    {/* Fechas */}
                    <div className="p-4 bg-[#1a1a1c] border border-white/5 rounded-xl space-y-3">
                      <h3 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                        <Calendar className="w-4 h-4" /> Fechas
                      </h3>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-zinc-500">Inicio:</span>
                          <span className="text-zinc-300">
                            {selectedProject.fecha_inicio ? new Date(selectedProject.fecha_inicio).toLocaleDateString() : '-'}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-zinc-500">Estimado Fin:</span>
                          <span className="text-zinc-300">
                            {selectedProject.fecha_fin_estimada ? new Date(selectedProject.fecha_fin_estimada).toLocaleDateString() : '-'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Métricas Rápidas */}
                    <div className="p-4 bg-[#1a1a1c] border border-white/5 rounded-xl space-y-3">
                      <h3 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                        <PieChart className="w-4 h-4" /> Progreso
                      </h3>
                      <div className="flex items-center gap-4">
                        <div className="flex-1">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-zinc-500">Tareas</span>
                            <span className="text-zinc-300">
                              {selectedProject._tareas_completadas}/{selectedProject._tareas_total}
                            </span>
                          </div>
                          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary-500" 
                              style={{ width: `${selectedProject._porcentaje_completado}%` }} 
                            />
                          </div>
                        </div>
                        <span className="text-xl font-bold text-primary-400">
                          {selectedProject._porcentaje_completado}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'tasks' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <ProjectTasks 
                    projectId={selectedProject.id} 
                    projectName={selectedProject.nombre} 
                  />
                </div>
              )}

              {activeTab === 'costs' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <ProjectCosts project={selectedProject} />
                </div>
              )}

              {activeTab === 'finance' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <ProjectFinanceSummary project={selectedProject} />
                </div>
              )}

              {activeTab === 'settings' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 py-12 text-center text-zinc-500">
                  <Settings className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>Configuración del proyecto próximamente</p>
                </div>
              )}

            </div>
          </div>

        </div>
      </div>
    </div>,
    document.body
  );
};

const NavButton = ({ active, onClick, icon, label, count }: any) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all w-full",
      active 
        ? "bg-primary-500/10 text-primary-400 border border-primary-500/20" 
        : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5 border border-transparent"
    )}
  >
    {icon}
    <span className="flex-1 text-left">{label}</span>
    {count !== undefined && count > 0 && (
      <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded-full">
        {count}
      </span>
    )}
  </button>
);

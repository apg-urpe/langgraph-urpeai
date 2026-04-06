'use client';

import React, { useEffect, useState } from 'react';
import { 
  Users, 
  Mail, 
  Send, 
  BarChart3, 
  Plus,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { useEmailMarketingStore, selectActiveTab, selectIsLoading } from '../../../store/emailMarketingStore';
import { useContactStore } from '../../../store/contactStore';
import { useAdminStore, selectIsMaximized, DASHBOARD_CONTENT_MIN_WIDTH, DASHBOARD_CONTENT_MAX_WIDTH_NORMAL, DASHBOARD_CONTENT_MAX_WIDTH_MAXIMIZED } from '../../../store/adminStore';
import { AudiencesTab } from './AudiencesTab';
import { CampaignsTab } from './CampaignsTab';
import { SendsTab } from './SendsTab';
import { AnalyticsTab } from './AnalyticsTab';
import { CreateAudienceModal } from './CreateAudienceModal';

type TabId = 'audiences' | 'campaigns' | 'sends' | 'analytics';

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.ElementType;
  disabled?: boolean;
}

const tabs: TabConfig[] = [
  { id: 'analytics', label: 'Analíticas', icon: BarChart3 },
  { id: 'audiences', label: 'Audiencias', icon: Users },
  { id: 'campaigns', label: 'Campañas', icon: Mail },
  { id: 'sends', label: 'Envíos', icon: Send },
];

export const EmailMarketingView: React.FC = () => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  // Store state
  const activeTab = useEmailMarketingStore(selectActiveTab);
  const isLoading = useEmailMarketingStore(selectIsLoading);
  const setActiveTab = useEmailMarketingStore(state => state.setActiveTab);
  const fetchAudiences = useEmailMarketingStore(state => state.fetchAudiences);
  const fetchCampaigns = useEmailMarketingStore(state => state.fetchCampaigns);
  
  const selectedEnterpriseId = useContactStore(state => state.selectedEnterpriseId);
  const isMaximized = useAdminStore(selectIsMaximized);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fetch data on mount
  useEffect(() => {
    if (selectedEnterpriseId) {
      fetchAudiences(selectedEnterpriseId);
      fetchCampaigns(selectedEnterpriseId);
    }
  }, [selectedEnterpriseId, fetchAudiences, fetchCampaigns]);

  const handleRefresh = () => {
    if (selectedEnterpriseId) {
      fetchAudiences(selectedEnterpriseId, true);
      fetchCampaigns(selectedEnterpriseId);
    }
  };

  const containerMaxWidth = isMaximized || isMobile ? DASHBOARD_CONTENT_MAX_WIDTH_MAXIMIZED : DASHBOARD_CONTENT_MAX_WIDTH_NORMAL;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'audiences':
        return <AudiencesTab onCreateNew={() => setShowCreateModal(true)} />;
      case 'campaigns':
        return <CampaignsTab />;
      case 'sends':
        return <SendsTab />;
      case 'analytics':
        return <AnalyticsTab />;
      default:
        return null;
    }
  };

  return (
    <div 
      className="h-full flex flex-col bg-[#0c0c0e] overflow-hidden"
    >
      <div 
        className={`flex-1 flex flex-col mx-auto w-full overflow-hidden ${isMobile ? 'pb-20' : ''}`}
        style={{ maxWidth: containerMaxWidth }}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-4 md:px-6 pt-4 md:pt-6 pb-3 border-b border-white/5">
          <div className="flex flex-col gap-3">
            {/* Title Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="p-1.5 md:p-2 bg-violet-500/10 rounded-lg">
                  <Mail className="w-4 h-4 md:w-5 md:h-5 text-violet-400" />
                </div>
                <div>
                  <h1 className="text-sm md:text-xl font-semibold text-zinc-100">
                    Email Marketing
                  </h1>
                </div>
              </div>
              
              <div className="flex items-center gap-1.5 md:gap-2">
                <button
                  onClick={handleRefresh}
                  disabled={isLoading}
                  className="p-1.5 md:p-2 text-zinc-400 hover:text-zinc-200 hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
                  title="Actualizar"
                >
                  {isLoading ? (
                    <Loader2 className="w-3.5 h-3.5 md:w-4 md:h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  )}
                </button>
                
                {activeTab === 'audiences' && (
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1.5 text-[11px] md:text-sm font-medium rounded-lg
                               bg-violet-500 text-white hover:bg-violet-600 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    <span>Audiencia</span>
                  </button>
                )}
              </div>
            </div>

            {/* Tabs Row */}
            <div className="flex items-center gap-1 overflow-x-auto pb-2 -mb-2 scrollbar-none snap-x snap-mandatory">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                
                return (
                  <button
                    key={tab.id}
                    onClick={() => !tab.disabled && setActiveTab(tab.id)}
                    disabled={tab.disabled}
                    className={`
                      flex items-center gap-2 px-3 md:px-3 py-2 text-[11px] md:text-sm font-medium rounded-lg
                      transition-all whitespace-nowrap snap-start
                      ${isActive 
                        ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30 shadow-[0_0_15px_rgba(139,92,246,0.1)]' 
                        : tab.disabled
                          ? 'text-zinc-600 cursor-not-allowed'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                      }
                    `}
                  >
                    <Icon className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    <span>{tab.label}</span>
                    {tab.disabled && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-500 rounded">
                        Soon
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
          {renderTabContent()}
        </div>
      </div>

      {/* Create Audience Modal */}
      {showCreateModal && (
        <CreateAudienceModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
};

export default EmailMarketingView;

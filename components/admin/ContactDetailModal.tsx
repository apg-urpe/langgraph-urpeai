import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ContactDetailPanel } from './ContactDetailPanel';

interface ContactDetailModalProps {
  contactId: number;
  onClose: () => void;
  initialTab?: 'info' | 'conversations' | 'appointments' | 'multimedia' | 'notes' | 'monica' | 'tasks' | 'cartera' | 'marketing' | 'consultas' | 'whatsapp_templates' | 'historial';
}

export const ContactDetailModal: React.FC<ContactDetailModalProps> = ({ contactId, onClose, initialTab }) => {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center md:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="w-full md:max-w-4xl h-full md:h-[85vh] flex flex-col overflow-hidden animate-slide-in-bottom md:animate-pop-in">
        <ContactDetailPanel
          contactId={contactId}
          onClose={onClose}
          isModal={true}
          initialTab={initialTab}
        />
      </div>
    </div>,
    document.body
  );
};

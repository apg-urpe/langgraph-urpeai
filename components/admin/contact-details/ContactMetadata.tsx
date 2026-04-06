import React from 'react';
import { Tag } from 'lucide-react';
import { sanitizeHtml } from '@/lib/sanitize-html';

interface MetadataViewerProps {
  data: any;
  level?: number;
}

const MetadataViewer: React.FC<MetadataViewerProps> = ({ data, level = 0 }) => {
  if (typeof data === 'object' && data !== null) {
    return (
      <div className={`flex flex-col gap-1 ${level > 0 ? 'ml-3 border-l border-white/5 pl-2' : ''}`}>
        {Object.entries(data).map(([key, val], i) => (
          <div key={i} className="text-[10px] md:text-xs">
            <span className="text-zinc-500 font-medium mr-2">{sanitizeHtml(key)}:</span>
            {typeof val === 'object' && val !== null ? (
              <div className="mt-1">
                <MetadataViewer data={val} level={level + 1} />
              </div>
            ) : (
              <span className="text-zinc-300 break-words">{sanitizeHtml(String(val))}</span>
            )}
          </div>
        ))}
      </div>
    );
  }
  return <span className="text-zinc-300 text-[10px] md:text-xs break-words">{sanitizeHtml(String(data))}</span>;
};

interface ContactMetadataProps {
  metadata: any;
}

export const ContactMetadata: React.FC<ContactMetadataProps> = React.memo(({ metadata }) => {
  if (!metadata || Object.keys(metadata).length === 0) return null;

  return (
    <div className="space-y-2 md:space-y-3">
      <h3 className="text-[10px] md:text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
        <Tag className="w-3 h-3" />
        Etiquetas / Meta
      </h3>
      <div className="flex flex-col gap-2">
        {Object.entries(metadata).map(([key, val], i) => (
          <div key={i} className="bg-zinc-900/30 rounded border border-white/5 overflow-hidden">
            <div className="px-2 py-1.5 bg-zinc-900/50 border-b border-white/5 flex items-center gap-2">
              <Tag className="w-3 h-3 text-zinc-500" />
              <span className="font-medium text-zinc-400 text-xs truncate">{key}</span>
            </div>
            <div className="p-2 overflow-x-auto">
               <MetadataViewer data={val} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

ContactMetadata.displayName = 'ContactMetadata';

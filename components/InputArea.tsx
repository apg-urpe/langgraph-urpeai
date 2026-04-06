'use client';

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Send, Sparkles, Paperclip, X, FileText, Upload, Square, Maximize2, Minimize2, Mic, Loader2 } from 'lucide-react';
import { Attachment } from '../types/chat';
import { useLanguageStore } from '../store/languageStore';
import { translations } from '../lib/i18n';
import { logger } from '@/lib/logger';
import { useDraftStorage } from '../hooks/useDraftStorage';
import { useChatStore } from '../store/chatStore';
import { useVoiceTranscription } from '../hooks/useVoiceTranscription';

interface InputAreaProps {
  onSendMessage: (text: string, attachments?: Attachment[]) => void;
  onStop?: () => void;
  isThinking?: boolean;
  isStreaming?: boolean;
}

export const InputArea: React.FC<InputAreaProps> = ({ onSendMessage, onStop, isThinking, isStreaming }) => {
  // Get active session for draft key
  const activeSessionId = useChatStore(state => state.activeSessionId);
  
  // Persist input across view changes
  const [input, setInput, clearInputDraft] = useDraftStorage(
    'chat_input',
    `monica_${activeSessionId}`,
    ''
  );
  const [selectedFiles, setSelectedFiles] = useState<Attachment[]>([]);
  const [isExpanded, setIsExpanded] = useState(false); // Focus Mode State
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const expandedTextareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Ref to track if user explicitly minimized the window to prevent auto-reopening loop
  const manualMinimizeRef = useRef(false);
  
  const [isFocused, setIsFocused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  const { language } = useLanguageStore();
  const t = translations[language].input;
  const t_chat = translations[language].chat;

  // Voice transcription
  const { state: voiceState, toggleRecording, error: voiceError } = useVoiceTranscription({
    language: language === 'es' ? 'es' : 'en',
    onTranscript: (text) => {
      setInput(input.trim() ? input + ' ' + text : text);
    },
    onError: (err) => {
      logger.error('[InputArea] Voice transcription error:', err);
    },
  });

  const isProcessing = isThinking || isStreaming;
  const MAX_FILES = 5;
  const AUTO_EXPAND_THRESHOLD_PX = 140; // Approx 5-6 lines

  // --- Auto-Resize & Auto-Expand Logic ---
  useEffect(() => {
    // Reset manual minimize flag if input is cleared
    if (input.length === 0) {
        manualMinimizeRef.current = false;
    }

    const textarea = textareaRef.current;
    if (textarea && !isExpanded) {
      textarea.style.height = 'auto';
      const newHeight = textarea.scrollHeight;
      
      // Auto-Expand Logic: 
      // 1. Content exceeds threshold
      // 2. User has NOT manually minimized this specific session of writing
      // 3. Input has some substance (> 20 chars) to avoid jarring jumps on simple pastes
      if (newHeight > AUTO_EXPAND_THRESHOLD_PX && input.length > 20 && !manualMinimizeRef.current) {
         setIsExpanded(true);
         // Reset height after expanding so it looks normal when minimizing back
         textarea.style.height = 'auto'; 
      } else {
         textarea.style.height = `${Math.min(newHeight, AUTO_EXPAND_THRESHOLD_PX)}px`;
      }
    }
  }, [input, isExpanded]);

  // Focus management when switching modes
  useEffect(() => {
    if (isExpanded && expandedTextareaRef.current) {
        // Slight delay to ensure render
        setTimeout(() => {
            expandedTextareaRef.current?.focus();
        }, 50);
        document.body.style.overflow = 'hidden'; // Lock body scroll
    } else if (!isExpanded && textareaRef.current) {
        textareaRef.current.focus();
        document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isExpanded]); // Removed input.length dependency to prevent cursor jumps during typing

  const handleManualExpand = () => {
    manualMinimizeRef.current = false;
    setIsExpanded(true);
  };

  const handleManualMinimize = () => {
    manualMinimizeRef.current = true; // Set flag to prevent auto-reopen
    setIsExpanded(false);
  };

  const handleSend = () => {
    let textToSend = input.trim();
    if (!textToSend && selectedFiles.length > 0) {
        textToSend = language === 'es' ? "Analiza este archivo adjunto." : "Analyze this attachment.";
    }

    if ((textToSend || selectedFiles.length > 0) && !isProcessing) {
      onSendMessage(textToSend, selectedFiles.length > 0 ? selectedFiles : undefined);
      clearInputDraft(); // Clear draft after sending
      setSelectedFiles([]);
      setIsExpanded(false); // Close expanded mode on send
      manualMinimizeRef.current = false; // Reset flag for next message
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleStop = () => {
    if (onStop && isProcessing) {
      onStop();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // In expanded mode, Enter creates a new line by default, Cmd/Ctrl+Enter sends
    if (isExpanded) {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSend();
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            handleManualMinimize();
        }
    } else {
        // In compact mode, Enter sends, Shift+Enter creates new line
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }
  };

  const processFile = async (file: File): Promise<Attachment | null> => {
    try {
      if (file.size > 20 * 1024 * 1024) {
        alert(`${file.name}: ${t.alert_large}`);
        return null;
      }

      let processedData: string;

      if (file.type.startsWith('image/')) {
          processedData = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              let width = img.width;
              let height = img.height;
              const MAX_SIZE = 1024;
              
              if (width > height) {
                if (width > MAX_SIZE) {
                  height *= MAX_SIZE / width;
                  width = MAX_SIZE;
                }
              } else {
                if (height > MAX_SIZE) {
                  width *= MAX_SIZE / height;
                  height = MAX_SIZE;
                }
              }
              
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(img, 0, 0, width, height);
              resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.src = event.target?.result as string;
          };
          reader.readAsDataURL(file);
        });
      } else if (file.type === 'application/pdf') {
          processedData = '';
      } else {
          processedData = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (event) => {
              resolve(event.target?.result as string);
            };
            reader.readAsDataURL(file);
          });
      }

      return {
        name: file.name,
        type: file.type,
        data: processedData,
        file: file 
      };

    } catch (err) {
      logger.error('[InputArea] Error processing file:', err);
      return null;
    }
  };

  const addFiles = async (files: File[]) => {
    if (selectedFiles.length >= MAX_FILES) {
      alert(t.alert_limit);
      return;
    }
    const filesToAdd = files.slice(0, MAX_FILES - selectedFiles.length);
    
    const newAttachments: Attachment[] = [];
    for (const file of filesToAdd) {
      const attachment = await processFile(file);
      if (attachment) newAttachments.push(attachment);
    }
    setSelectedFiles(prev => [...prev, ...newAttachments]);
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList) return;
    await addFiles(Array.from(fileList));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const filesToPaste: File[] = [];

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) filesToPaste.push(file);
      }
    }

    if (filesToPaste.length > 0) {
      e.preventDefault();
      await addFiles(filesToPaste);
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFiles(e.dataTransfer.files);
    }
  };

  const hasContent = input.trim().length > 0 || selectedFiles.length > 0;

  return (
    <>
      {/* --- EXPANDED MODE OVERLAY (FOCUS MODE) via Portal --- */}
      {isExpanded && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] bg-zinc-950/90 backdrop-blur-xl flex items-center justify-center p-0 md:p-6 animate-in fade-in duration-300">
           {/* Close on background click */}
           <div className="absolute inset-0" onClick={handleManualMinimize}></div>

           <div className="w-full max-w-5xl h-full md:h-[85vh] flex flex-col bg-[#09090b] md:border border-white/10 md:rounded-2xl shadow-2xl relative overflow-hidden ring-1 ring-white/5 animate-pop-in">
              
              {/* Overlay Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-zinc-900/50 backdrop-blur-sm z-10">
                 <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded bg-primary-500/10 text-primary-400 border border-primary-500/20">
                       <FileText className="w-4 h-4" />
                    </div>
                    <div>
                        <span className="block text-xs font-bold text-zinc-200 uppercase tracking-widest leading-none">Focus Mode</span>
                        <span className="block text-[10px] text-zinc-500 font-mono mt-0.5">Distraction-free Editor</span>
                    </div>
                 </div>
                 
                 <button 
                    onClick={handleManualMinimize}
                    className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors flex items-center gap-2 group"
                    title="Minimize (Esc)"
                 >
                    <span className="text-[10px] font-medium hidden sm:inline uppercase tracking-wider group-hover:text-zinc-200">Minimize</span>
                    <Minimize2 className="w-5 h-5" />
                 </button>
              </div>

              {/* Expanded Text Area */}
              <div className="flex-1 relative bg-zinc-950/20 flex flex-col">
                 <textarea
                    ref={expandedTextareaRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder="Type your detailed request here..."
                    className="flex-1 w-full bg-transparent border-none focus:ring-0 text-zinc-200 placeholder-zinc-700 resize-none text-lg md:text-xl leading-relaxed outline-none scrollbar-thin scrollbar-thumb-zinc-800 p-6 md:p-10 font-light"
                    autoFocus
                 />
                 
                 {/* Footer Info inside Textarea area */}
                 <div className="px-6 md:px-10 pb-4 flex items-center justify-end gap-6 text-zinc-600">
                    <span className="text-xs font-mono">{input.split(/\s+/).filter(Boolean).length} words</span>
                    <span className="text-xs font-mono">{input.length} chars</span>
                 </div>
              </div>

              {/* Overlay Footer */}
              <div className="px-6 py-5 border-t border-white/5 bg-zinc-900/50 backdrop-blur-sm flex items-center justify-between z-10">
                 <div className="hidden sm:flex items-center gap-6 text-[10px] text-zinc-500 font-medium">
                    <span className="flex items-center gap-1.5"><kbd className="bg-white/5 border border-white/10 px-1.5 rounded text-zinc-400 font-sans">Enter</kbd> to newline</span>
                    <span className="flex items-center gap-1.5"><kbd className="bg-white/5 border border-white/10 px-1.5 rounded text-zinc-400 font-sans">⌘ + Enter</kbd> to send</span>
                    <span className="flex items-center gap-1.5"><kbd className="bg-white/5 border border-white/10 px-1.5 rounded text-zinc-400 font-sans">Esc</kbd> to minimize</span>
                 </div>
                 
                 <button
                    onClick={handleSend}
                    disabled={!hasContent || isProcessing}
                    className={`ml-auto flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-sm transition-all shadow-lg ${
                       hasContent 
                        ? 'bg-primary-600 hover:bg-primary-500 text-white shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_30px_rgba(6,182,212,0.4)] transform hover:-translate-y-0.5' 
                        : 'bg-zinc-800 text-zinc-500 cursor-not-allowed border border-white/5'
                    }`}
                 >
                    {isProcessing ? 'Processing...' : t.send_message}
                    {!isProcessing && <Send className="w-4 h-4" />}
                 </button>
              </div>
           </div>
        </div>,
        document.body
      )}

      {/* --- STANDARD COMPACT MODE --- */}
      <div className={`w-full max-w-4xl mx-auto px-2 md:px-4 pb-2 md:pb-6 transition-all duration-300 ${isExpanded ? 'opacity-0 pointer-events-none translate-y-4' : 'opacity-100 translate-y-0'}`}>
        
        {/* File Preview List */}
        {selectedFiles.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-3 px-4 mb-0 scrollbar-hide animate-slide-up">
            {selectedFiles.map((file, idx) => {
              const isImage = file.type.startsWith('image/');
              
              return (
                <div key={idx} className="relative group/file shrink-0">
                  {isImage ? (
                    <div className="h-14 w-14 rounded-lg border border-white/10 overflow-hidden relative shadow-lg bg-black/40">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={file.data} alt="Selected" className="h-full w-full object-cover opacity-80 group-hover/file:opacity-100 transition-opacity" />
                    </div>
                  ) : (
                    <div className="h-14 w-14 flex flex-col items-center justify-center rounded-lg border border-white/10 bg-zinc-900 text-center shadow-lg p-1">
                      <FileText className="w-5 h-5 text-primary-400 mb-1" />
                      <span className="text-[7px] uppercase w-full truncate text-zinc-400">FILE</span>
                    </div>
                  )}
                  <button onClick={() => removeFile(idx)} className="absolute -top-1.5 -right-1.5 bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-700 rounded-full p-0.5 shadow-md z-10 transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Voice Error Banner */}
        {voiceError && (
          <div className="flex items-center gap-2 px-4 py-2 mb-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium animate-slide-up">
            <Mic className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1">{voiceError}</span>
            <button onClick={() => toggleRecording()} className="text-red-300 hover:text-white text-[10px] uppercase tracking-wider font-bold shrink-0">
              {t.voice_record}
            </button>
          </div>
        )}

        <div 
          className={`relative group transition-all duration-300 ease-out rounded-[26px] ${
            isFocused || isDragging || hasContent
              ? 'shadow-[0_0_40px_rgba(0,0,0,0.6)]' 
              : 'shadow-[0_0_20px_rgba(0,0,0,0.3)]'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className={`absolute -inset-[1px] rounded-[26px] bg-gradient-to-r transition-all duration-500 ${
            isFocused ? 'from-primary-500/30 via-primary-300/20 to-primary-500/30 opacity-80' : 'from-white/5 via-white/10 to-white/5 opacity-50'
          }`}></div>

          <div className={`relative flex items-end gap-2 p-1.5 rounded-[26px] bg-[#09090b] border border-white/5 backdrop-blur-xl transition-colors duration-300 ${
            isDragging ? 'bg-primary-500/5' : ''
          }`}>
            
            {/* Drag Overlay */}
            {isDragging && (
              <div className="absolute inset-0 z-20 rounded-[26px] bg-black/90 flex items-center justify-center backdrop-blur-sm animate-fade-in border-2 border-primary-500 border-dashed">
                  <div className="flex flex-col items-center gap-2 text-primary-400">
                    <Upload className="w-8 h-8 animate-bounce" />
                    <span className="font-bold text-sm tracking-widest uppercase">{t.drop_files}</span>
                  </div>
              </div>
            )}

            {/* Attach Button */}
            <div className="flex items-center justify-center h-[44px] w-[44px] shrink-0 mb-0.5">
              <input 
                  type="file" 
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,audio/mp3,audio/mpeg,audio/wav,audio/aac,audio/ogg,audio/flac,video/mp4,video/mpeg,video/quicktime,video/webm"
                  multiple
                  onChange={handleFileSelect}
                />
              <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={selectedFiles.length >= MAX_FILES}
                  className={`w-9 h-9 flex items-center justify-center rounded-full transition-all duration-200 active:scale-90 ${
                    selectedFiles.length > 0
                      ? 'text-primary-400 bg-primary-500/10' 
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                  }`}
                  title={t.upload_file}
                >
                  <Paperclip className="w-4 h-4 transform -rotate-45" />
                </button>
            </div>

            {/* Voice Record Button */}
            <div className="flex items-center justify-center h-[44px] w-[44px] shrink-0 mb-0.5">
              <button
                onClick={toggleRecording}
                disabled={voiceState === 'transcribing'}
                className={`w-9 h-9 flex items-center justify-center rounded-full transition-all duration-200 active:scale-90 ${
                  voiceState === 'recording'
                    ? 'text-red-400 bg-red-500/15 animate-pulse ring-2 ring-red-500/30'
                    : voiceState === 'transcribing'
                      ? 'text-primary-400 bg-primary-500/10 cursor-wait'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                }`}
                title={
                  voiceState === 'recording' ? t.voice_stop
                    : voiceState === 'transcribing' ? t.voice_transcribing
                    : t.voice_record
                }
              >
                {voiceState === 'transcribing' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Mic className={`w-4 h-4 ${voiceState === 'recording' ? 'text-red-400' : ''}`} />
                )}
              </button>
            </div>

            {/* Main Textarea Wrapper */}
            <div className="relative flex-1 min-w-0 py-2.5">
               <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={isProcessing ? t.placeholder_processing : t.placeholder_default}
                className="w-full bg-transparent border-none text-zinc-200 placeholder-zinc-500 resize-none px-2 max-h-[140px] overflow-y-auto text-[15px] leading-relaxed scrollbar-hide font-normal pr-8 focus:outline-none focus:ring-0 focus:border-none outline-none ring-0"
                rows={1}
                style={{ minHeight: '24px' }} 
              />
              
              {/* Expand Button (Manual Trigger) */}
              <button 
                 onClick={handleManualExpand}
                 className={`absolute right-0 top-2.5 p-1 text-zinc-600 hover:text-primary-400 transition-all duration-300 ${input.length > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                 title="Expand (Focus Mode)"
              >
                 <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
            
            {/* Send Button */}
            <div className="flex items-center justify-center h-[44px] w-[44px] shrink-0 mb-0.5">
              <button
                onClick={isProcessing ? handleStop : handleSend}
                disabled={!isProcessing && !hasContent}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg active:scale-90 ${
                  !isProcessing && !hasContent
                    ? 'bg-zinc-800 text-zinc-600'
                    : isProcessing 
                      ? 'bg-zinc-800 text-zinc-200 border border-white/10 animate-pulse'
                      : 'bg-primary-600 hover:bg-primary-500 text-white shadow-[0_0_15px_rgba(var(--primary-600),0.4)]'
                }`}
              >
                {isProcessing ? (
                  <Square className="w-3 h-3 fill-current" />
                ) : (
                  <Send className={`w-4 h-4 ml-0.5 ${hasContent ? 'text-white' : 'text-zinc-500'}`} />
                )}
              </button>
            </div>

          </div>
        </div>
        
        <div className="mt-2 text-center flex items-center justify-center gap-1.5 opacity-30 hover:opacity-70 transition-opacity select-none">
          <Sparkles className="w-3 h-3 text-primary-500" />
          <p className="text-[10px] text-zinc-500 font-mono tracking-wide">
            {t_chat.version}
          </p>
        </div>
      </div>
    </>
  );
};


'use client';

import React, { useEffect } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastProps {
  toast: ToastMessage | null;
  onClose: () => void;
}

export default function Toast({ toast, onClose }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      onClose();
    }, 4500);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  const isSuccess = toast.type === 'success';
  const isError = toast.type === 'error';

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-slide-up">
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-2xl border shadow-2xl backdrop-blur-xl transition-all max-w-md ${
          isSuccess
            ? 'bg-slate-900/95 border-emerald-500/30 text-emerald-300 shadow-emerald-950/40'
            : isError
            ? 'bg-slate-900/95 border-rose-500/30 text-rose-300 shadow-rose-950/40'
            : 'bg-slate-900/95 border-indigo-500/30 text-indigo-300 shadow-indigo-950/40'
        }`}
      >
        <div className="shrink-0">
          {isSuccess && <CheckCircle className="w-5 h-5 text-emerald-400" />}
          {isError && <AlertCircle className="w-5 h-5 text-rose-400" />}
          {!isSuccess && !isError && <Info className="w-5 h-5 text-indigo-400" />}
        </div>

        <div className="flex-1 text-xs font-medium text-slate-100 pr-2">
          {toast.message}
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

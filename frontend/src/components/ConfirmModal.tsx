'use client';

import React, { useEffect } from 'react';
import { Trash2, AlertCircle, X, Loader2, Search, XCircle } from 'lucide-react';

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  itemName?: string;
  itemType?: 'dataset' | 'job' | 'general';
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  description,
  itemName,
  itemType = 'dataset',
  confirmText = 'Delete Dataset',
  cancelText = 'Cancel',
  isDestructive = true,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  // Handle ESC key to dismiss
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity"
        onClick={() => {
          if (!isLoading) onCancel();
        }}
      />

      {/* Modal Dialog Box */}
      <div className="relative w-full max-w-md bg-slate-900/95 border border-slate-800 rounded-2xl shadow-2xl p-6 overflow-hidden z-10 animate-scale-in">
        {/* Ambient Gradient Glows */}
        <div className="absolute -top-12 -right-12 w-36 h-36 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-36 h-36 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-lg ${
                isDestructive
                  ? 'bg-rose-500/15 border border-rose-500/30 text-rose-400 shadow-rose-950/40'
                  : 'bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 shadow-indigo-950/40'
              }`}
            >
              {itemType === 'job' ? (
                <XCircle className="w-5 h-5" />
              ) : (
                <Trash2 className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight leading-snug">
                {title}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Confirmation required
              </p>
            </div>
          </div>

          <button
            onClick={onCancel}
            disabled={isLoading}
            className="p-1.5 text-slate-400 hover:text-slate-200 bg-slate-800/60 hover:bg-slate-800 rounded-lg transition-all disabled:opacity-40"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Item Target Highlight */}
        {itemName && (
          <div className="mt-4 p-3 bg-slate-950/70 border border-slate-800/90 rounded-xl flex items-center gap-2.5">
            <Search className="w-4 h-4 text-indigo-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="text-[10px] uppercase font-bold text-slate-500 block tracking-wider">
                Target Query
              </span>
              <span className="text-sm font-semibold text-slate-100 font-mono truncate block">
                &ldquo;{itemName}&rdquo;
              </span>
            </div>
          </div>
        )}

        {/* Description Text */}
        {description && (
          <p className="text-xs text-slate-300 leading-relaxed mt-3.5">
            {description}
          </p>
        )}

        {/* Destructive Warning Note */}
        {isDestructive && (
          <div className="mt-4 p-3 rounded-xl bg-rose-950/30 border border-rose-500/25 flex items-start gap-2.5 text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span className="text-xs leading-relaxed">
              This action cannot be undone. All extracted leads, AI evaluations, and exported Excel files will be permanently deleted.
            </span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-800">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 hover:text-white transition-all disabled:opacity-50"
          >
            {cancelText}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-5 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-2 transition-all disabled:opacity-50 shadow-lg ${
              isDestructive
                ? 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 shadow-rose-950/50 border border-rose-500/30'
                : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-indigo-950/50 border border-indigo-500/30'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                {isDestructive ? (
                  <Trash2 className="w-3.5 h-3.5" />
                ) : (
                  <XCircle className="w-3.5 h-3.5" />
                )}
                <span>{confirmText}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

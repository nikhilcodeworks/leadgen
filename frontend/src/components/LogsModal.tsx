'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Terminal,
  X,
  RefreshCw,
  Copy,
  Check,
  Trash2,
  ArrowDown,
  Search,
  Activity,
  Server,
  Cloud,
  CheckCircle,
  AlertCircle,
  Clock,
  Maximize2,
  Minimize2
} from 'lucide-react';

interface LogResponse {
  jobId: string | null;
  query: string | null;
  status: 'active' | 'completed' | 'failed' | 'idle' | 'unknown';
  stage: string;
  progress: number;
  statusMessage: string;
  lines: string[];
  error?: string;
}

interface RunOption {
  jobId: string | null;
  query: string;
  status: string;
}

interface LogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  backendUrl: string;
  activeJobId?: string | null;
  availableRuns?: RunOption[];
}

export default function LogsModal({
  isOpen,
  onClose,
  backendUrl,
  activeJobId,
  availableRuns = []
}: LogsModalProps) {
  const [selectedJobId, setSelectedJobId] = useState<string>(activeJobId || '');
  const [logs, setLogs] = useState<string[]>([]);
  const [jobInfo, setJobInfo] = useState<Partial<LogResponse>>({});
  const [loading, setLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filterText, setFilterText] = useState('');
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync selectedJobId if activeJobId prop changes
  useEffect(() => {
    if (activeJobId && (!selectedJobId || selectedJobId === 'latest')) {
      setSelectedJobId(activeJobId);
    }
  }, [activeJobId]);

  // Fetch logs function
  const fetchLogs = async (silent = false) => {
    if (!isOpen) return;
    if (!silent) setLoading(true);

    try {
      const url = new URL('/api/logs', window.location.origin);
      if (selectedJobId && selectedJobId !== 'latest') {
        url.searchParams.set('jobId', selectedJobId);
      }
      url.searchParams.set('tail', '250');

      const headers: Record<string, string> = {};
      if (backendUrl) {
        headers['x-backend-url'] = backendUrl;
      }

      const res = await fetch(url.toString(), { headers });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data: LogResponse = await res.json();
      if (data.lines) {
        setLogs(data.lines);
      }
      setJobInfo({
        jobId: data.jobId,
        query: data.query,
        status: data.status,
        stage: data.stage,
        progress: data.progress,
        statusMessage: data.statusMessage
      });
      if (data.jobId && !selectedJobId) {
        setSelectedJobId(data.jobId);
      }
    } catch (err: any) {
      if (!silent) {
        setLogs(prev => [
          ...prev,
          `[Connection Error] Could not fetch logs from backend: ${err.message}`
        ]);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Trigger on open & when job changes
  useEffect(() => {
    if (isOpen) {
      fetchLogs(false);
    }
  }, [isOpen, selectedJobId, backendUrl]);

  // Polling loop
  useEffect(() => {
    if (!isOpen || !isPolling) return;

    const interval = setInterval(() => {
      fetchLogs(true);
    }, 1500);

    return () => clearInterval(interval);
  }, [isOpen, isPolling, selectedJobId, backendUrl]);

  // Auto-scroll to bottom when logs update
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // Handle manual scroll check
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 60;
    setAutoScroll(isAtBottom);
  };

  // Copy to clipboard
  const handleCopyLogs = () => {
    const text = logs.join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Clear display
  const handleClearLogs = () => {
    setLogs(['[System] Terminal view cleared locally. New logs will appear below.']);
  };

  if (!isOpen) return null;

  // Filtered log lines
  const filteredLines = filterText.trim()
    ? logs.filter(line => line.toLowerCase().includes(filterText.toLowerCase()))
    : logs;

  // Syntax highlighting helper for terminal lines
  const formatLogLine = (line: string) => {
    const lower = line.toLowerCase();

    if (
      lower.includes('error') ||
      lower.includes('failed') ||
      lower.includes('exception') ||
      lower.includes('503 unavailable')
    ) {
      return 'text-rose-400 font-medium bg-rose-950/20 px-1 rounded';
    }
    if (
      lower.includes('scraped:') ||
      lower.includes('successfully') ||
      lower.includes('finished') ||
      lower.includes('saved to') ||
      lower.includes('100%')
    ) {
      return 'text-emerald-400 font-medium';
    }
    if (
      lower.includes('gemini') ||
      lower.includes('hugging face') ||
      lower.includes('qwen') ||
      lower.includes('llama') ||
      lower.includes('lead analysis')
    ) {
      return 'text-purple-300';
    }
    if (
      lower.includes('navigating') ||
      lower.includes('launching') ||
      lower.includes('scroll') ||
      lower.includes('playwright') ||
      lower.includes('cookie')
    ) {
      return 'text-amber-300';
    }
    if (line.startsWith('[====') || line.includes('% |')) {
      return 'text-cyan-300 font-mono font-bold';
    }
    if (lower.startsWith('[system]') || lower.startsWith('starting scraper')) {
      return 'text-blue-300 font-semibold';
    }
    return 'text-slate-300';
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200">
      <div
        className={`bg-[#0b0f19] border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-200 ${
          isFullscreen
            ? 'w-full h-full rounded-none'
            : 'w-full max-w-5xl h-[88vh] max-h-[900px]'
        }`}
      >
        {/* Terminal Header Bar */}
        <div className="px-4 py-3 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 select-none">
          {/* Left Title & Window Controls */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-rose-500/90 inline-block hover:opacity-80 transition cursor-pointer" onClick={onClose} />
              <span className="w-3 h-3 rounded-full bg-amber-500/90 inline-block hover:opacity-80 transition cursor-pointer" onClick={() => setIsFullscreen(!isFullscreen)} />
              <span className="w-3 h-3 rounded-full bg-emerald-500/90 inline-block hover:opacity-80 transition cursor-pointer" onClick={() => setAutoScroll(!autoScroll)} />
            </div>

            <div className="flex items-center gap-2 border-l border-slate-700/60 pl-3">
              <Terminal className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span className="text-sm font-semibold text-slate-100 font-mono tracking-wide">
                Live Terminal & System Logs
              </span>
            </div>

            {/* Backend Location Badge */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border bg-slate-800/80 border-slate-700 text-slate-300">
              {backendUrl ? (
                <>
                  <Cloud className="w-3 h-3 text-cyan-400" />
                  <span className="truncate max-w-[140px]" title={backendUrl}>
                    Colab Cloud
                  </span>
                </>
              ) : (
                <>
                  <Server className="w-3 h-3 text-emerald-400" />
                  <span>Local PC Backend</span>
                </>
              )}
            </div>

            {/* Active Status Badge */}
            {jobInfo.status && (
              <div
                className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                  jobInfo.status === 'active'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : jobInfo.status === 'failed'
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                    : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                }`}
              >
                {jobInfo.status === 'active' ? (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                ) : jobInfo.status === 'failed' ? (
                  <AlertCircle className="w-3 h-3" />
                ) : (
                  <CheckCircle className="w-3 h-3" />
                )}
                <span>{jobInfo.status}</span>
              </div>
            )}
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2">
            {/* Live Polling Toggle */}
            <button
              onClick={() => setIsPolling(!isPolling)}
              title={isPolling ? 'Pause live polling' : 'Resume live polling'}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1.5 border ${
                isPolling
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
              }`}
            >
              <Activity className={`w-3.5 h-3.5 ${isPolling ? 'animate-pulse text-emerald-400' : ''}`} />
              <span>{isPolling ? 'Live' : 'Paused'}</span>
            </button>

            {/* Manual Refresh */}
            <button
              onClick={() => fetchLogs(false)}
              disabled={loading}
              title="Refresh logs now"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>

            {/* Copy Logs */}
            <button
              onClick={handleCopyLogs}
              title="Copy all logs to clipboard"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition flex items-center gap-1"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            {/* Clear Screen */}
            <button
              onClick={handleClearLogs}
              title="Clear terminal view"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-rose-400 border border-slate-700 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            {/* Toggle Fullscreen */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition hidden sm:block"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              title="Close modal"
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 transition ml-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status Bar & Job Selector Subheader */}
        <div className="px-4 py-2.5 bg-slate-950/80 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Job Selection Dropdown */}
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <span className="text-slate-400 font-medium">Job:</span>
            <select
              value={selectedJobId}
              onChange={e => setSelectedJobId(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-indigo-500 font-mono flex-1 max-w-sm"
            >
              <option value="">⚡ Latest Active / Recent Job</option>
              {availableRuns.map((r, idx) => (
                <option key={r.jobId || idx} value={r.jobId || ''}>
                  {r.jobId ? `[${r.jobId}]` : ''} {r.query.slice(0, 30)} ({r.status})
                </option>
              ))}
            </select>
          </div>

          {/* Search / Filter logs input */}
          <div className="relative flex items-center min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Filter logs..."
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-2.5 py-1 text-slate-200 text-xs placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
            />
            {filterText && (
              <button
                onClick={() => setFilterText('')}
                className="absolute right-2 text-slate-400 hover:text-slate-200"
              >
                ×
              </button>
            )}
          </div>

          {/* Auto-scroll Status Button */}
          <button
            onClick={() => {
              setAutoScroll(true);
              if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition border ${
              autoScroll
                ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowDown className={`w-3 h-3 ${autoScroll ? 'text-indigo-400' : ''}`} />
            <span>Auto-Scroll: {autoScroll ? 'ON' : 'OFF'}</span>
          </button>
        </div>

        {/* Live Progress Banner (if active) */}
        {jobInfo.status === 'active' && (
          <div className="bg-emerald-950/20 border-b border-emerald-900/40 px-4 py-2 flex items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2 text-emerald-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="font-semibold capitalize">{jobInfo.stage || 'Scraping in progress'}</span>
              {jobInfo.statusMessage && (
                <span className="text-emerald-400/80 truncate max-w-md hidden md:inline">
                  — {jobInfo.statusMessage}
                </span>
              )}
            </div>
            {jobInfo.progress !== undefined && (
              <div className="flex items-center gap-2">
                <div className="w-28 bg-slate-800 h-2 rounded-full overflow-hidden border border-slate-700">
                  <div
                    className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full transition-all duration-300"
                    style={{ width: `${Math.max(5, Math.min(100, jobInfo.progress))}%` }}
                  />
                </div>
                <span className="font-mono font-bold text-emerald-400">{jobInfo.progress}%</span>
              </div>
            )}
          </div>
        )}

        {/* Terminal Content Screen */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed bg-[#070b13] text-slate-300 space-y-1 select-text scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent"
        >
          {filteredLines.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 py-16 space-y-3">
              <Terminal className="w-10 h-10 text-slate-700 stroke-1" />
              <p className="text-sm">No log output matching current filter.</p>
              <p className="text-xs text-slate-600">
                Start a scrape job or check your Google Colab terminal.
              </p>
            </div>
          ) : (
            filteredLines.map((line, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-3 hover:bg-slate-900/40 px-1 py-0.5 rounded transition ${formatLogLine(
                  line
                )}`}
              >
                <span className="text-slate-600 select-none text-[10px] w-7 text-right shrink-0 pt-0.5">
                  {idx + 1}
                </span>
                <span className="break-all whitespace-pre-wrap flex-1">{line}</span>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>

        {/* Terminal Footer Bar */}
        <div className="px-4 py-2 bg-slate-950 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-[11px] text-slate-400 select-none">
          <div className="flex items-center gap-4">
            <span>
              Lines: <strong className="text-slate-200">{filteredLines.length}</strong>
            </span>
            {jobInfo.jobId && (
              <span className="font-mono text-slate-400">
                ID: <span className="text-indigo-400">{jobInfo.jobId}</span>
              </span>
            )}
            {jobInfo.query && (
              <span className="truncate max-w-[220px] text-slate-400 hidden sm:inline">
                Query: &quot;{jobInfo.query}&quot;
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 text-slate-500">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>Auto-refresh: 1.5s</span>
            </span>
            <span className="hidden md:inline">|</span>
            <span className="hidden md:inline">Colab Output synced with stdout</span>
          </div>
        </div>
      </div>
    </div>
  );
}

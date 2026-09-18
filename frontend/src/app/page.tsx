'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Search,
  Database,
  Key,
  Play,
  Trash2,
  Download,
  CheckCircle,
  XCircle,
  Loader2,
  ArrowLeft,
  RefreshCw,
  FolderOpen,
  Check,
  AlertCircle,
  Info,
  ExternalLink,
  Sparkles,
  Compass,
  FileSpreadsheet,
  FileText,
  Edit,
  Layers,
  Activity,
  Phone,
  MessageSquare,
  Globe
} from 'lucide-react';
import ConfirmModal from '@/components/ConfirmModal';
import EditLeadModal from '@/components/EditLeadModal';
import Toast, { ToastMessage } from '@/components/Toast';

interface LeadRun {
  filename: string | null;
  jobId: string | null;
  query: string;
  limit: number;
  status: 'active' | 'completed' | 'failed';
  size: number;
  timestamp: string;
  progress?: number;
  statusMessage?: string;
  stage?: string;
  current?: number;
  total?: number;
}

export interface LeadRecord {
  "S.No"?: number | string;
  "Lead ID"?: string;
  "Business Name": string;
  "City": string | null;
  "Zone": string | null;
  "Locality": string | null;
  "Full Address": string | null;
  "Google Maps URL": string | null;
  "Google Rating": number | null;
  "Review Count": number | null;
  "Phone": string | null;
  "Website": string | null;
  "Website Quality": string | null;
  "Mobile Website": string | null;
  "Online Booking": string | null;
  "WhatsApp": string | null;
  "Instagram": string | null;
  "Instagram Activity": string | null;
  "Facebook": string | null;
  "Contact Person": string | null;
  "Problem Found": string | null;
  "Problem Evidence": string | null;
  "Recommended Service": string | null;
  "Pitch Angle": string | null;
  "Lead Score": number | null;
  "Lead Tier": string | null;
  "Contact Method": string | null;
  "Outreach Status": string | null;
  "Follow-up Date": string | null;
  "Response": string | null;
  "Notes": string | null;
  "Category"?: string | null;
  "Social Media Links"?: string | null;
  [key: string]: any;
  "Web Results"?: string | null;
}

export function extractFallbackLocation(address?: string | null) {
  if (!address || typeof address !== 'string') return { locality: 'Unknown', city: 'Unknown', zone: 'Unknown' };
  const clean = address.replace(/^[\s\uE000-\uF8FF]+/, '').replace(/,\s*India\s*$/i, '').replace(/,\s*\d{5,6}\s*$/, '').trim();
  const parts = clean.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return { locality: 'Unknown', city: 'Unknown', zone: 'Unknown' };

  const knownCities = [
    'New Delhi', 'Delhi', 'Noida', 'Greater Noida', 'Gurgaon', 'Gurugram', 'Faridabad', 'Ghaziabad',
    'Mumbai', 'Navi Mumbai', 'Thane', 'Pune', 'Bengaluru', 'Bangalore', 'Hyderabad', 'Secunderabad',
    'Chennai', 'Kolkata', 'Ahmedabad', 'Surat', 'Jaipur', 'Lucknow', 'Kanpur', 'Nagpur', 'Indore',
    'Chandigarh', 'Goa', 'Dehradun', 'Kochi'
  ];

  let foundCity = 'Unknown';
  for (const c of knownCities) {
    if (parts.some(p => new RegExp(`\\b${c}\\b`, 'i').test(p))) {
      foundCity = c;
      break;
    }
  }
  if (foundCity === 'Unknown' && parts.length >= 2) {
    foundCity = parts[parts.length - 1];
  }

  const zoneParts = parts.filter(p => /\b(sector\s*\d+[a-z]?|pocket\s*\d+[a-z]?|block\s*[a-z0-9]+|phase\s*\d+)\b/i.test(p));
  const foundZone = zoneParts.length > 0 ? zoneParts.slice(0, 2).join(', ') : 'Unknown';

  const locParts = parts.filter(p =>
    !new RegExp(`\\b${foundCity}\\b`, 'i').test(p) &&
    !/\b(sector\s*\d+|pocket\s*\d+|block\s*[a-z0-9]+|phase\s*\d+)\b/i.test(p) &&
    !/^(shop|plot|kothi|flat|floor|road|samridhi|h\s*no|near|c-|g-|d-)\b/i.test(p) &&
    p.length > 2
  );
  const foundLocality = locParts.length > 0 ? locParts[locParts.length - 1] : (foundZone !== 'Unknown' ? foundZone : foundCity);

  return { locality: foundLocality, city: foundCity, zone: foundZone };
}

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Navigation & View State
  const [activeTab, setActiveTab] = useState<'scrape' | 'manager'>('scrape');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedRunQuery, setSelectedRunQuery] = useState<string | null>(null);
  const [fileLeads, setFileLeads] = useState<LeadRecord[]>([]);
  const [loadingFile, setLoadingFile] = useState(false);
  const [runs, setRuns] = useState<LeadRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [runsFilter, setRunsFilter] = useState<'all' | 'active' | 'completed' | 'failed'>('all');
  const [selectedLead, setSelectedLead] = useState<LeadRecord | null>(null);
  const [websiteFilter, setWebsiteFilter] = useState<'all' | 'website' | 'no_website'>('all');
  const [tierFilter, setTierFilter] = useState<'all' | 'hot' | 'good' | 'medium' | 'skip'>('all');
  const [leadSearchTerm, setLeadSearchTerm] = useState('');

  // Scraper Input State
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(50);
  const [isCustomLimit, setIsCustomLimit] = useState(false);
  const [customLimitInput, setCustomLimitInput] = useState('5');
  const [headless, setHeadless] = useState(true);
  const [mergeExisting, setMergeExisting] = useState(true);
  
  // AI Provider & Model Configuration
  const [aiProvider, setAiProvider] = useState<'huggingface'>('huggingface');
  const [aiModel, setAiModel] = useState<string>('Qwen/Qwen2.5-72B-Instruct');
  const [isCustomModel, setIsCustomModel] = useState(false);
  const [customModelInput, setCustomModelInput] = useState('');
  const [enableFallback, setEnableFallback] = useState(true);

  // API Keys (Gemini & Hugging Face)
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [hasEnvApiKey, setHasEnvApiKey] = useState(false);
  const [hfApiKey, setHfApiKey] = useState('');
  const [hasEnvHfKey, setHasEnvHfKey] = useState(false);
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  
  // Job Running Notification State
  const [scraping, setScraping] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  // Confirm Modal state for deletion / cancellation
  const [deleteConfirmRun, setDeleteConfirmRun] = useState<LeadRun | null>(null);
  const [isDeletingRun, setIsDeletingRun] = useState(false);

  // Edit Lead Modal state
  const [editingLead, setEditingLead] = useState<LeadRecord | null>(null);
  const [isSavingLead, setIsSavingLead] = useState(false);

  // Floating Toast notification state
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ id: Date.now().toString(), message, type });
  };

  // Load configuration from localStorage on mount
  useEffect(() => {
    const savedGeminiKey = localStorage.getItem('gemini_api_key');
    if (savedGeminiKey) setGeminiApiKey(savedGeminiKey);
    
    const savedHfKey = localStorage.getItem('hf_api_key');
    if (savedHfKey) setHfApiKey(savedHfKey);

    const savedProvider = localStorage.getItem('ai_provider');
    if (savedProvider && ['auto', 'gemini', 'huggingface'].includes(savedProvider)) {
      setAiProvider(savedProvider as any);
    }

    const savedModel = localStorage.getItem('ai_model');
    if (savedModel) setAiModel(savedModel);
  }, []);

  // Fetch runs list
  const fetchRuns = async (silent = false) => {
    if (!silent) setLoadingRuns(true);
    try {
      const res = await fetch('/api/leads');
      if (!res.ok) return;
      const data = await res.json();
      if (data.runs) {
        setRuns(data.runs);
      }
      if (data.hasEnvApiKey !== undefined) {
        setHasEnvApiKey(Boolean(data.hasEnvApiKey));
      }
      if (data.hasEnvHfKey !== undefined) {
        setHasEnvHfKey(Boolean(data.hasEnvHfKey));
      }
    } catch (e) {
      if (!silent) {
        console.warn('Notice: Could not fetch lead runs:', e);
      }
    } finally {
      if (!silent) setLoadingRuns(false);
    }
  };

  // Initial fetch of runs
  useEffect(() => {
    fetchRuns();
  }, []);

  // Poll active runs status: 2s when a job is active, else 10s
  const hasActiveJobs = runs.some(run => run.status === 'active');
  useEffect(() => {
    const intervalMs = hasActiveJobs || scraping ? 2000 : 10000;
    const interval = setInterval(() => {
      fetchRuns(true);
    }, intervalMs);

    return () => clearInterval(interval);
  }, [hasActiveJobs, scraping]);

  // Handle API Key Save
  const saveApiKeys = (geminiKey: string, hfKey: string) => {
    setGeminiApiKey(geminiKey);
    localStorage.setItem('gemini_api_key', geminiKey);
    setHfApiKey(hfKey);
    localStorage.setItem('hf_api_key', hfKey);
    setShowApiKeyInput(false);
    showToast('AI API configurations saved successfully', 'success');
  };

  // Handle Form Scrape Submit
  const handleStartScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setScraping(true);
    try {
      const chosenModel = isCustomModel ? customModelInput.trim() : aiModel;
      const finalLimit = isCustomLimit ? (parseInt(customLimitInput) || 5) : limit;
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          limit: finalLimit,
          headless,
          gemini_api_key: geminiApiKey || null,
          hf_api_key: hfApiKey || null,
          ai_provider: aiProvider,
          ai_model: chosenModel || null,
          enable_fallback: enableFallback,
          merge_existing: mergeExisting
        })
      });
      const data = await res.json();
      if (data.success) {
        setCurrentJobId(data.jobId);
        setQuery('');
        showToast('Lead scraping job initiated successfully', 'success');
        // Switch to manager view to see job progress
        setActiveTab('manager');
        fetchRuns();
      } else {
        showToast(`Error starting job: ${data.error}`, 'error');
      }
    } catch (e: any) {
      showToast(`Error starting scrape job: ${e.message}`, 'error');
    } finally {
      setScraping(false);
    }
  };

  // Open Lead File details
  const handleOpenFile = async (run: LeadRun) => {
    const targetFile = run.filename || runs.find(r => r.filename && r.query === run.query)?.filename;
    if (!targetFile) {
      showToast('No spreadsheet file found for this job', 'info');
      return;
    }
    setSelectedFile(targetFile);
    setSelectedRunQuery(run.query);
    setWebsiteFilter('all');
    setLoadingFile(true);
    try {
      const res = await fetch(`/api/leads?file=${encodeURIComponent(targetFile)}`);
      const data = await res.json();
      if (data.data) {
        setFileLeads(data.data);
      } else {
        showToast(data.error || 'Failed to load lead details', 'error');
      }
    } catch (e) {
      console.error('Error opening file:', e);
      showToast('Error loading file contents', 'error');
    } finally {
      setLoadingFile(false);
    }
  };

  const handleOpenLeadDetail = (lead: LeadRecord) => {
    if (!selectedFile) return;
    const identifier = lead["Lead ID"] || lead["S.No"] || lead["Business Name"];
    router.push(`/lead-detail?file=${encodeURIComponent(selectedFile)}&leadId=${encodeURIComponent(String(identifier))}`);
  };

  // Save Lead Updates to Excel via PUT /api/leads
  const handleSaveLead = async (updatedLead: LeadRecord, updates: Record<string, any>) => {
    if (!selectedFile) {
      showToast('No spreadsheet file is currently open', 'error');
      return;
    }
    setIsSavingLead(true);
    const leadIdentifier = updatedLead["Lead ID"] || updatedLead["S.No"] || updatedLead["Business Name"];

    try {
      const res = await fetch('/api/leads', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file: selectedFile,
          leadId: leadIdentifier,
          updates
        })
      });
      const data = await res.json();
      if (data.success) {
        // Update local fileLeads list
        setFileLeads(prev => prev.map(l => {
          const id = l["Lead ID"] || l["S.No"] || l["Business Name"];
          if (
            (id && leadIdentifier && String(id) === String(leadIdentifier)) ||
            (l["Business Name"] && updatedLead["Business Name"] && String(l["Business Name"]).trim().toLowerCase() === String(updatedLead["Business Name"]).trim().toLowerCase())
          ) {
            return { ...l, ...updates };
          }
          return l;
        }));

        // If currently viewing lead in drawer, update drawer as well
        if (selectedLead && (
          (selectedLead["Lead ID"] && leadIdentifier && String(selectedLead["Lead ID"]) === String(leadIdentifier)) ||
          (selectedLead["S.No"] && leadIdentifier && String(selectedLead["S.No"]) === String(leadIdentifier)) ||
          (selectedLead["Business Name"] && updatedLead["Business Name"] && String(selectedLead["Business Name"]).trim().toLowerCase() === String(updatedLead["Business Name"]).trim().toLowerCase())
        )) {
          setSelectedLead(prev => prev ? { ...prev, ...updates } : null);
        }

        showToast(`Saved changes for "${updates['Business Name'] || updatedLead['Business Name']}" to Excel`, 'success');
        setEditingLead(null);
      } else {
        showToast(data.error || 'Failed to save changes to Excel', 'error');
      }
    } catch (e: any) {
      console.error('Error updating lead:', e);
      showToast(e.message || 'Failed to update lead', 'error');
    } finally {
      setIsSavingLead(false);
    }
  };

  // Load query params on mount
  useEffect(() => {
    const tab = searchParams.get('tab');
    const fileParam = searchParams.get('file');
    
    if (tab === 'manager') {
      setActiveTab('manager');
    }
    
    if (fileParam && runs.length > 0) {
      const matchedRun = runs.find(r => r.filename === fileParam);
      if (matchedRun) {
        handleOpenFile(matchedRun);
      } else {
        // Fallback synthetic run
        handleOpenFile({
          filename: fileParam,
          jobId: null,
          query: fileParam.replace('.xlsx', '').replace(/_/g, ' '),
          limit: 100,
          status: 'completed',
          size: 0,
          timestamp: new Date().toISOString()
        });
      }
      
      // Clear query params so manual refresh doesn't force re-opening
      router.replace('/');
    }
  }, [searchParams, runs]);

  // Prompt Delete or Cancel Modal
  const handlePromptDeleteRun = (run: LeadRun) => {
    setDeleteConfirmRun(run);
  };

  // Confirm Delete or Cancel execution
  const handleConfirmDeleteRun = async () => {
    if (!deleteConfirmRun) return;
    setIsDeletingRun(true);
    const run = deleteConfirmRun;

    try {
      // If cancelling an active job, NEVER pass file param so existing spreadsheet isn't deleted!
      const fileParam = run.status !== 'active' && run.filename ? `file=${encodeURIComponent(run.filename)}` : '';
      const jobParam = run.jobId ? `jobId=${encodeURIComponent(run.jobId)}` : '';
      const separator = fileParam && jobParam ? '&' : '';
      
      const res = await fetch(`/api/leads?${fileParam}${separator}${jobParam}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        fetchRuns();
        if (selectedFile === run.filename) {
          setSelectedFile(null);
        }
        showToast(
          run.status === 'active'
            ? 'Scraping job cancelled successfully'
            : `Lead data for "${run.query}" deleted successfully`,
          'success'
        );
        setDeleteConfirmRun(null);
      } else {
        showToast(data.error || 'Failed to delete lead data', 'error');
      }
    } catch (e) {
      console.error('Error deleting run:', e);
      showToast('Failed to delete lead data', 'error');
    } finally {
      setIsDeletingRun(false);
    }
  };

  // Download File (Excel or CSV)
  const handleDownloadFile = (filename?: string | null, format: 'xlsx' | 'csv' = 'xlsx') => {
    const target = filename || selectedFile || runs.find(r => r.filename)?.filename;
    if (!target) {
      showToast('No file available to download yet', 'info');
      return;
    }
    const downloadFilename = format === 'csv' ? target.replace(/\.xlsx$/i, '') + '.csv' : target;
    const downloadUrl = `/api/leads?file=${encodeURIComponent(target)}&download=true&format=${format}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', downloadFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Downloading ${downloadFilename}...`, 'success');
  };

  // Filter runs list
  const filteredRuns = runs.filter(run => {
    if (runsFilter === 'all') return true;
    return run.status === runsFilter;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Premium Navbar */}
      <header className="sticky top-0 z-40 bg-slate-900/60 backdrop-blur-md border-b border-slate-800/80 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-lg shadow-lg shadow-indigo-500/20">
            <Database className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
              LeadGen Pro
            </h1>
            <p className="text-xs text-slate-400">Scrape, Analyse, Convert</p>
          </div>
        </div>

        {/* AI API Keys & Provider Settings in top-right */}
        <div className="relative">
          <button
            onClick={() => setShowApiKeyInput(!showApiKeyInput)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              hfApiKey || hasEnvHfKey
                ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30 hover:bg-emerald-900/40'
                : 'bg-amber-950/40 text-amber-400 border-amber-500/30 hover:bg-amber-900/40'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>
              {hfApiKey || hasEnvHfKey
                ? 'Hugging Face AI Active'
                : 'Configure HF Token'}
            </span>
            <span className={`w-2 h-2 rounded-full ${hfApiKey || hasEnvHfKey ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          </button>

          {/* AI Keys Modal dropdown */}
          {showApiKeyInput && (
            <div className="absolute right-0 mt-2 w-96 p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl shadow-black/90 z-50">
              <div className="flex items-center justify-between mb-3 border-b border-slate-800/80 pb-2">
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Key className="w-4 h-4 text-indigo-400" />
                  <span>Hugging Face AI Credentials</span>
                </h3>
                <button
                  onClick={() => setShowApiKeyInput(false)}
                  className="text-slate-400 hover:text-slate-200 text-xs"
                >
                  ✕
                </button>
              </div>

              {/* Hugging Face Access Token */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-200">Hugging Face Token (HF_TOKEN)</label>
                  {(hfApiKey || hasEnvHfKey) && (
                    <span className="text-[10px] text-emerald-400 bg-emerald-950/50 border border-emerald-500/30 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Active
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mb-1.5 leading-relaxed">
                  Used for Qwen 2.5 72B & Llama 3.3 models. Free token at{' '}
                  <a
                    href="https://huggingface.co/settings/tokens"
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-400 hover:underline font-medium"
                  >
                    huggingface.co/settings/tokens
                  </a>
                </p>
                {hasEnvHfKey && !hfApiKey && (
                  <p className="text-[11px] text-emerald-400/90 mb-1.5">
                    Found in <code className="bg-slate-950 px-1 py-0.5 rounded text-emerald-300">.env</code>
                  </p>
                )}
                <input
                  type="password"
                  placeholder="Paste your Hugging Face token (hf_...)..."
                  defaultValue={hfApiKey}
                  id="hf-key-input"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-between items-center text-xs pt-2 border-t border-slate-800/80">
                <button
                  onClick={() => {
                    saveApiKeys('', '');
                  }}
                  className="text-rose-400 hover:text-rose-300 text-[11px]"
                >
                  Clear Custom Token
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowApiKeyInput(false)}
                    className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const hEl = document.getElementById('hf-key-input') as HTMLInputElement;
                      saveApiKeys('', hEl?.value || '');
                    }}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold text-xs transition-all shadow-md shadow-indigo-600/30"
                  >
                    Save Token
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Workspace Panel layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar Menu */}
        <aside className="w-64 bg-slate-900/40 border-r border-slate-800/40 p-4 flex flex-col gap-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-3 mb-2">NAVIGATION</p>
          
          <button
            onClick={() => {
              setActiveTab('scrape');
              setSelectedFile(null);
              setSelectedLead(null);
            }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all font-semibold ${
              activeTab === 'scrape' && !selectedFile
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10'
                : 'text-slate-400 hover:bg-slate-900/50 hover:text-slate-200'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>New Scrape Job</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('manager');
              setSelectedFile(null);
              setSelectedLead(null);
            }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all font-semibold ${
              activeTab === 'manager' && !selectedFile
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10'
                : 'text-slate-400 hover:bg-slate-900/50 hover:text-slate-200'
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            <span>Leads Manager</span>
            {runs.filter(r => r.status === 'active').length > 0 && (
              <span className="ml-auto w-2 h-2 bg-indigo-400 rounded-full animate-ping" />
            )}
          </button>

          <div className="mt-auto border-t border-slate-800/60 pt-4">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-3 mb-2">SYSTEM STATUS</p>
            <div className="px-3 text-xs text-slate-400 flex flex-col gap-1.5">
              <div className="flex justify-between">
                <span>Active Jobs:</span>
                <span className="font-semibold text-slate-200">{runs.filter(r => r.status === 'active').length}</span>
              </div>
              <div className="flex justify-between">
                <span>Completed Scrapes:</span>
                <span className="font-semibold text-slate-200">{runs.filter(r => r.status === 'completed').length}</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-8 bg-slate-950">
          
          {/* VIEW 1: SELECT LEAD RUN FILE DETAILS */}
          {selectedFile ? (
            <div className="flex flex-col gap-6">
              {/* Detail Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setSelectedFile(null)}
                    className="p-2 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-855 transition-all text-slate-400 hover:text-slate-200"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Leads Viewer</span>
                    <h2 className="text-2xl font-bold mt-0.5">{selectedRunQuery || 'Leads List'}</h2>
                    <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                      File: <code className="text-slate-300 font-mono">{selectedFile}</code>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Download Excel (.xlsx) */}
                  <a
                    href={selectedFile ? `/api/leads?file=${encodeURIComponent(selectedFile)}&download=true&format=xlsx` : '#'}
                    download={selectedFile || 'leads.xlsx'}
                    onClick={(e) => {
                      if (!selectedFile) {
                        e.preventDefault();
                        showToast('No spreadsheet file selected to download', 'info');
                      } else {
                        showToast(`Downloading ${selectedFile}...`, 'success');
                      }
                    }}
                    className="flex items-center gap-2 px-3.5 py-2 bg-emerald-600/10 hover:bg-emerald-600 hover:text-white border border-emerald-500/30 text-emerald-400 rounded-xl text-sm font-semibold transition-all cursor-pointer shadow-sm"
                    title="Download Excel (.xlsx)"
                  >
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>Excel (.xlsx)</span>
                  </a>

                  {/* Download CSV (.csv) */}
                  <a
                    href={selectedFile ? `/api/leads?file=${encodeURIComponent(selectedFile)}&download=true&format=csv` : '#'}
                    download={(selectedFile ? selectedFile.replace(/\.xlsx$/i, '') : 'leads') + '.csv'}
                    onClick={(e) => {
                      if (!selectedFile) {
                        e.preventDefault();
                        showToast('No file selected to download', 'info');
                      } else {
                        showToast(`Downloading ${(selectedFile.replace(/\.xlsx$/i, ''))}.csv...`, 'success');
                      }
                    }}
                    className="flex items-center gap-2 px-3.5 py-2 bg-cyan-600/10 hover:bg-cyan-600 hover:text-white border border-cyan-500/30 text-cyan-400 rounded-xl text-sm font-semibold transition-all cursor-pointer shadow-sm"
                    title="Download CSV (.csv)"
                  >
                    <FileText className="w-4 h-4" />
                    <span>CSV (.csv)</span>
                  </a>

                  <button
                    onClick={() => setSelectedFile(null)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all shadow-sm"
                  >
                    Done
                  </button>
                </div>
              </div>              {/* Leads Filters & Search Toolbar */}
              {fileLeads.length > 0 && !loadingFile && (
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-slate-900/50 border border-slate-800/80 p-4 rounded-2xl backdrop-blur-md mb-2">
                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Search bar */}
                    <div className="relative min-w-[220px]">
                      <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 transform -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search name, locality, phone..."
                        value={leadSearchTerm}
                        onChange={(e) => setLeadSearchTerm(e.target.value)}
                        className="bg-slate-950/80 border border-slate-800 focus:border-indigo-500 text-slate-200 text-xs rounded-xl pl-9 pr-3 py-2 outline-none w-full placeholder:text-slate-600 transition-all font-medium"
                      />
                      {leadSearchTerm && (
                        <button
                          onClick={() => setLeadSearchTerm('')}
                          className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Website Filters */}
                    <div className="flex items-center gap-1.5 bg-slate-950/60 border border-slate-800/80 p-1 rounded-xl">
                      <button
                        onClick={() => setWebsiteFilter('all')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          websiteFilter === 'all'
                            ? 'bg-indigo-600 text-white shadow shadow-indigo-500/20'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        All ({fileLeads.length})
                      </button>
                      <button
                        onClick={() => setWebsiteFilter('website')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          websiteFilter === 'website'
                            ? 'bg-indigo-600 text-white shadow shadow-indigo-500/20'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        With Site ({fileLeads.filter(l => l["Website"] && !['', 'nan', 'not found', 'none'].includes(l["Website"].toString().trim().toLowerCase())).length})
                      </button>
                      <button
                        onClick={() => setWebsiteFilter('no_website')}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                          websiteFilter === 'no_website'
                            ? 'bg-indigo-600 text-white shadow shadow-indigo-500/20'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        No Site ({fileLeads.filter(l => !l["Website"] || ['', 'nan', 'not found', 'none'].includes(l["Website"].toString().trim().toLowerCase())).length})
                      </button>
                    </div>

                    {/* Tier Filters */}
                    <div className="flex items-center gap-1 bg-slate-950/60 border border-slate-800/80 p-1 rounded-xl">
                      <button
                        onClick={() => setTierFilter('all')}
                        className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                          tierFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        All Tiers
                      </button>
                      <button
                        onClick={() => setTierFilter('hot')}
                        className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                          tierFilter === 'hot' ? 'bg-amber-950 text-amber-300 border border-amber-500/40' : 'text-slate-400 hover:text-amber-400'
                        }`}
                        title="Score >= 85"
                      >
                        🔥 Hot
                      </button>
                      <button
                        onClick={() => setTierFilter('good')}
                        className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                          tierFilter === 'good' ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40' : 'text-slate-400 hover:text-emerald-400'
                        }`}
                        title="Score 70-84"
                      >
                        🟢 Good
                      </button>
                      <button
                        onClick={() => setTierFilter('medium')}
                        className={`px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                          tierFilter === 'medium' ? 'bg-amber-950/60 text-amber-400 border border-amber-500/30' : 'text-slate-400 hover:text-amber-400'
                        }`}
                        title="Score 45-69"
                      >
                        🟡 Medium
                      </button>
                    </div>
                  </div>
                  
                  <div className="text-xs text-slate-500 font-semibold self-end md:self-center">
                    Showing {
                      fileLeads.filter(lead => {
                        const hasWebsite = lead["Website"] && !['', 'nan', 'not found', 'none'].includes(lead["Website"].toString().trim().toLowerCase());
                        if (websiteFilter === 'website') return hasWebsite;
                        if (websiteFilter === 'no_website') return !hasWebsite;
                        return true;
                      }).filter(lead => {
                        const tier = String(lead["Lead Tier"] || '');
                        if (tierFilter === 'hot') return tier.includes('Hot') || tier.includes('🔥');
                        if (tierFilter === 'good') return tier.includes('Good') || tier.includes('🟢');
                        if (tierFilter === 'medium') return tier.includes('Medium') || tier.includes('🟡');
                        if (tierFilter === 'skip') return tier.includes('Skip') || tier.includes('❌');
                        return true;
                      }).filter(lead => {
                        if (!leadSearchTerm.trim()) return true;
                        const term = leadSearchTerm.toLowerCase();
                        const name = (lead["Business Name"] || "").toLowerCase();
                        const city = (lead["City"] || "").toLowerCase();
                        const locality = (lead["Locality"] || "").toLowerCase();
                        const phone = String(lead["Phone"] || "").toLowerCase();
                        const status = (lead["Outreach Status"] || "").toLowerCase();
                        const notes = (lead["Notes"] || "").toLowerCase();
                        return name.includes(term) || city.includes(term) || locality.includes(term) || phone.includes(term) || status.includes(term) || notes.includes(term);
                      }).length
                    } of {fileLeads.length} leads
                  </div>
                </div>
              )}

              {/* Leads Table Container */}
              <div className="bg-slate-900/30 border border-slate-800/80 rounded-2xl overflow-hidden backdrop-blur-md">
                {loadingFile ? (
                  <div className="p-20 flex flex-col items-center justify-center gap-4">
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                    <p className="text-sm text-slate-400">Parsing Excel sheet data...</p>
                  </div>
                ) : fileLeads.length === 0 ? (
                  <div className="p-20 text-center text-slate-400">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-500" />
                    <p>No leads found in this spreadsheet.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    {(() => {
                      const filteredLeads = fileLeads
                        .filter(lead => {
                          const hasWebsite = lead["Website"] && !['', 'nan', 'not found', 'none'].includes(lead["Website"].toString().trim().toLowerCase());
                          if (websiteFilter === 'website') return hasWebsite;
                          if (websiteFilter === 'no_website') return !hasWebsite;
                          return true;
                        })
                        .filter(lead => {
                          const tier = String(lead["Lead Tier"] || '');
                          if (tierFilter === 'hot') return tier.includes('Hot') || tier.includes('🔥');
                          if (tierFilter === 'good') return tier.includes('Good') || tier.includes('🟢');
                          if (tierFilter === 'medium') return tier.includes('Medium') || tier.includes('🟡');
                          if (tierFilter === 'skip') return tier.includes('Skip') || tier.includes('❌');
                          return true;
                        })
                        .filter(lead => {
                          if (!leadSearchTerm.trim()) return true;
                          const term = leadSearchTerm.toLowerCase();
                          const name = (lead["Business Name"] || "").toLowerCase();
                          const city = (lead["City"] || "").toLowerCase();
                          const locality = (lead["Locality"] || "").toLowerCase();
                          const phone = String(lead["Phone"] || "").toLowerCase();
                          const status = (lead["Outreach Status"] || "").toLowerCase();
                          const notes = (lead["Notes"] || "").toLowerCase();
                          return name.includes(term) || city.includes(term) || locality.includes(term) || phone.includes(term) || status.includes(term) || notes.includes(term);
                        });

                      if (filteredLeads.length === 0) {
                        return (
                          <div className="p-20 text-center text-slate-400">
                            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-500" />
                            <p>No leads match your filter or search criteria.</p>
                          </div>
                        );
                      }

                      return (
                        <table className="w-full border-collapse text-left text-sm">
                          <thead className="bg-slate-900 border-b border-slate-800 text-xs">
                            <tr>
                              <th className="px-4 py-3.5 font-semibold text-slate-400">#</th>
                              <th className="px-5 py-3.5 font-semibold text-slate-300">Business Details</th>
                              <th className="px-4 py-3.5 font-semibold text-slate-300">Location</th>
                              <th className="px-4 py-3.5 font-semibold text-slate-300">Rating</th>
                              <th className="px-4 py-3.5 font-semibold text-slate-300">Phone & WhatsApp</th>
                              <th className="px-4 py-3.5 font-semibold text-slate-300">Website</th>
                              <th className="px-4 py-3.5 font-semibold text-slate-300">Lead Score</th>
                              <th className="px-4 py-3.5 font-semibold text-slate-300">Tier</th>
                              <th className="px-4 py-3.5 font-semibold text-slate-300">Method</th>
                              <th className="px-4 py-3.5 font-semibold text-slate-300">Status</th>
                              <th className="px-4 py-3.5 font-semibold text-slate-300">Notes / Reviews</th>
                              <th className="px-4 py-3.5 font-semibold text-slate-300 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 text-xs">
                            {filteredLeads.map((lead, idx) => {
                              const sNo = lead["S.No"] || idx + 1;
                              const tier = String(lead["Lead Tier"] || '🟡 Medium');
                              
                              let tierBadge = 'text-slate-400 bg-slate-900/60 border border-slate-800';
                              if (tier.includes('Hot') || tier.includes('🔥')) {
                                tierBadge = 'text-amber-300 bg-amber-950/60 border border-amber-500/50 shadow-sm shadow-amber-500/20 font-extrabold';
                              } else if (tier.includes('Good') || tier.includes('🟢') || tier.includes('Tier 1') || tier.includes('High')) {
                                tierBadge = 'text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 font-bold';
                              } else if (tier.includes('Medium') || tier.includes('🟡') || tier.includes('Tier 2')) {
                                tierBadge = 'text-amber-400 bg-amber-950/40 border border-amber-500/30 font-bold';
                              } else if (tier.includes('Skip') || tier.includes('❌') || tier.includes('Low')) {
                                tierBadge = 'text-rose-400 bg-rose-950/40 border border-rose-500/30 font-bold';
                              }

                              const score = Number(lead["Lead Score"]) || 0;
                              let scoreColor = 'text-rose-400 bg-rose-950/30';
                              if (score >= 80) {
                                scoreColor = 'text-emerald-400 bg-emerald-950/30';
                              } else if (score >= 50) {
                                scoreColor = 'text-amber-400 bg-amber-950/30';
                              }

                              const rawPhone = String(lead["Phone"] || '').trim();
                              const phoneDigits = rawPhone.replace(/\D/g, '');
                              const hasPhone = phoneDigits.length >= 10;
                              const waUrl = hasPhone 
                                ? (phoneDigits.length === 10 ? `https://wa.me/91${phoneDigits}` : `https://wa.me/${phoneDigits}`)
                                : '';

                              const websiteVal = String(lead["Website"] || '').trim();
                              const hasValidWebsite = websiteVal && !['not found', 'nan', 'none', ''].includes(websiteVal.toLowerCase());

                              return (
                                <tr
                                  key={idx}
                                  onClick={() => handleOpenLeadDetail(lead)}
                                  className={`hover:bg-slate-900/50 transition-all cursor-pointer ${
                                    tier.includes('Hot') ? 'bg-amber-950/10' : tier.includes('Good') ? 'bg-emerald-955/5' : ''
                                  }`}
                                >
                                  {/* 1. S.No */}
                                  <td className="px-4 py-3.5 font-mono text-xs font-bold text-slate-400">
                                    {sNo}
                                  </td>

                                  {/* 2. Business Details */}
                                  <td className="px-5 py-3.5 max-w-[220px]">
                                    <div className="font-bold text-slate-100 text-sm hover:text-indigo-400 transition-colors truncate">
                                      {lead["Business Name"]}
                                    </div>
                                    <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                                      {lead["Category"] || (lead["Contact Person"] && lead["Contact Person"] !== 'Not Listed' ? lead["Contact Person"] : 'Business')}
                                    </div>
                                  </td>

                                  {/* 3. Location */}
                                  <td className="px-4 py-3.5 text-xs text-slate-300 max-w-[160px]">
                                    {(() => {
                                      const locFallback = extractFallbackLocation(lead["Full Address"]);
                                      const locality = (lead["Locality"] && lead["Locality"] !== 'Unknown') 
                                        ? lead["Locality"] 
                                        : locFallback.locality;
                                      const subLoc = (lead["City"] && lead["City"] !== 'Unknown')
                                        ? lead["City"]
                                        : (lead["Zone"] && lead["Zone"] !== 'Unknown'
                                            ? lead["Zone"]
                                            : locFallback.city);
                                      return (
                                        <>
                                          <div className="font-semibold truncate text-slate-200" title={locality}>{locality}</div>
                                          <div className="text-[11px] text-slate-400 truncate mt-0.5" title={subLoc}>{subLoc}</div>
                                        </>
                                      );
                                    })()}
                                  </td>

                                  {/* 4. Google Rating */}
                                  <td className="px-4 py-3.5 text-xs whitespace-nowrap">
                                    {lead["Google Rating"] && String(lead["Google Rating"]).toLowerCase() !== 'nan' ? (
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-amber-400 font-semibold">★ {lead["Google Rating"]}</span>
                                        <span className="text-slate-500 text-[11px]">({lead["Review Count"] || 0})</span>
                                      </div>
                                    ) : (
                                      <span className="text-slate-500">N/A</span>
                                    )}
                                  </td>

                                  {/* 5. Phone & WhatsApp */}
                                  <td className="px-4 py-3.5 text-xs whitespace-nowrap">
                                    {hasPhone ? (
                                      <div className="flex items-center gap-2">
                                        <a
                                          href={`tel:${rawPhone}`}
                                          onClick={(e) => e.stopPropagation()}
                                          className="font-mono font-semibold text-slate-200 hover:text-indigo-400 transition-colors inline-flex items-center gap-1"
                                          title="Call Phone"
                                        >
                                          <Phone className="w-3 h-3 text-slate-500" />
                                          <span>{rawPhone}</span>
                                        </a>
                                        {waUrl && (
                                          <a
                                            href={waUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="p-1 bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/60 rounded-md transition-all"
                                            title="Chat on WhatsApp"
                                          >
                                            <MessageSquare className="w-3 h-3" />
                                          </a>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-slate-500">Not Listed</span>
                                    )}
                                  </td>

                                  {/* 6. Website */}
                                  <td className="px-4 py-3.5 text-xs whitespace-nowrap">
                                    {hasValidWebsite ? (
                                      <a
                                        href={websiteVal.startsWith('http') ? websiteVal : `http://${websiteVal}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium hover:underline max-w-[130px] truncate"
                                      >
                                        <Globe className="w-3 h-3 shrink-0" />
                                        <span className="truncate">{websiteVal.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</span>
                                        <ExternalLink className="w-2.5 h-2.5 shrink-0 text-slate-500" />
                                      </a>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-900 text-slate-500 border border-slate-800">
                                        Not Found
                                      </span>
                                    )}
                                  </td>

                                  {/* 7. Lead Score */}
                                  <td className="px-4 py-3.5 whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                      <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold font-mono ${scoreColor}`}>
                                        {score}
                                      </span>
                                      <div className="w-12 bg-slate-800 h-1.5 rounded-full overflow-hidden shrink-0">
                                        <div 
                                          className={`h-full ${
                                            score >= 80 ? 'bg-emerald-500' :
                                            score >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                                          }`}
                                          style={{ width: `${score}%` }}
                                        />
                                      </div>
                                    </div>
                                  </td>

                                  {/* 8. Lead Tier */}
                                  <td className="px-4 py-3.5 whitespace-nowrap">
                                    <span className={`px-2.5 py-1 rounded-full text-[11px] border inline-block ${tierBadge}`}>
                                      {tier}
                                    </span>
                                  </td>

                                  {/* 9. Contact Method */}
                                  <td className="px-4 py-3.5 whitespace-nowrap">
                                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-950 border border-slate-800 text-slate-300">
                                      {lead["Contact Method"] || (hasPhone ? 'Call' : 'N/A')}
                                    </span>
                                  </td>

                                  {/* 10. Outreach Status */}
                                  <td className="px-4 py-3.5 whitespace-nowrap">
                                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                                      lead["Outreach Status"] === 'Contacted' ? 'bg-indigo-950/40 border-indigo-500/30 text-indigo-300' :
                                      lead["Outreach Status"] === 'Interested' ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300' :
                                      lead["Outreach Status"] === 'Not Interested' ? 'bg-rose-950/40 border-rose-500/30 text-rose-300' :
                                      'bg-slate-900 border-slate-800 text-slate-300'
                                    }`}>
                                      {lead["Outreach Status"] || 'Not Contacted'}
                                    </span>
                                  </td>

                                  {/* 11. Notes / Reviews */}
                                  <td className="px-4 py-3.5 max-w-[200px] truncate text-slate-400 text-xs">
                                    {lead["Response"] ? (
                                      <span className="text-indigo-300 italic" title={lead["Response"]}>
                                        Resp: {lead["Response"]}
                                      </span>
                                    ) : lead["Notes"] ? (
                                      <span title={lead["Notes"]} className="text-slate-400">
                                        {lead["Notes"]}
                                      </span>
                                    ) : (
                                      <span className="text-slate-600">-</span>
                                    )}
                                  </td>

                                  {/* 12. Actions */}
                                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setEditingLead(lead);
                                        }}
                                        className="px-2.5 py-1.5 rounded-lg font-bold bg-amber-500/10 text-amber-400 border border-amber-500/25 hover:bg-amber-500 hover:text-slate-950 transition-all text-xs flex items-center gap-1 cursor-pointer shadow-sm"
                                        title="Edit Lead Details & Save to Excel"
                                      >
                                        <Edit className="w-3.5 h-3.5" />
                                        <span>Edit</span>
                                      </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenLeadDetail(lead);
                                        }}
                                        className="px-3 py-1.5 rounded-lg font-bold bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-600 hover:text-white transition-all text-xs cursor-pointer shadow-sm"
                                      >
                                        Audit Details
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Active Scrape Progress Widget */}
              {(() => {
                const activeRun = runs.find(r => r.status === 'active');
                if (!activeRun) return null;

                const curProgress = activeRun.progress || 0;
                const stages = [
                  { id: 'starting', label: '1. Setup & Search', icon: Compass, threshold: 15 },
                  { id: 'scraping', label: '2. Scrape Listings', icon: Layers, threshold: 70 },
                  { id: 'analyzing', label: '3. AI Evaluation', icon: Sparkles, threshold: 95 },
                  { id: 'saving', label: '4. Excel Export', icon: FileSpreadsheet, threshold: 100 }
                ];

                return (
                  <div className="bg-gradient-to-br from-indigo-950/70 via-slate-900/90 to-purple-950/50 border border-indigo-500/30 rounded-2xl p-6 shadow-2xl shadow-indigo-950/50 backdrop-blur-xl relative overflow-hidden">
                    <div className="absolute -top-16 -right-16 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

                    {/* Header */}
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-5 relative z-10">
                      <div className="flex items-center gap-3">
                        <div className="relative flex items-center justify-center w-11 h-11 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 shrink-0">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full animate-ping" />
                          <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                              Live Scraping In Progress
                            </span>
                            <span className="text-xs text-slate-400 font-mono">
                              {activeRun.jobId || 'Active'}
                            </span>
                          </div>
                          <h3 className="text-lg font-bold text-white mt-1">
                            &ldquo;{activeRun.query}&rdquo;
                          </h3>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="text-3xl font-black bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent font-mono">
                            {curProgress}%
                          </div>
                          <div className="text-[11px] text-slate-400 font-medium mt-0.5">
                            {activeRun.current !== undefined && activeRun.total
                              ? `${activeRun.current} of ${activeRun.total} leads`
                              : `Target: ${activeRun.limit >= 9999 ? 'All' : activeRun.limit} leads`}
                          </div>
                        </div>

                        {activeTab === 'scrape' ? (
                          <button
                            onClick={() => setActiveTab('manager')}
                            className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 transition-all flex items-center gap-1.5"
                          >
                            <span>Open Manager</span>
                            <FolderOpen className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => setActiveTab('scrape')}
                            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-800 text-slate-300 border border-slate-700 transition-all flex items-center gap-1.5"
                          >
                            <span>New Scrape</span>
                            <Search className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Multi-Stage Stepper Tracker */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5 relative z-10">
                      {stages.map((step, idx) => {
                        const prevThreshold = idx === 0 ? 0 : stages[idx - 1].threshold;
                        const isDone = curProgress >= step.threshold || activeRun.status === 'completed';
                        const isCurrent = !isDone && curProgress >= prevThreshold;
                        const StepIcon = step.icon;

                        return (
                          <div
                            key={step.id}
                            className={`p-3 rounded-xl border transition-all flex flex-col gap-1.5 ${
                              isDone
                                ? 'bg-emerald-955/20 border-emerald-500/30 text-emerald-400'
                                : isCurrent
                                ? 'bg-indigo-950/60 border-indigo-500/40 text-indigo-300 ring-1 ring-indigo-500/30 shadow-lg shadow-indigo-950/40'
                                : 'bg-slate-900/40 border-slate-800/60 text-slate-500'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <StepIcon className={`w-4 h-4 ${isCurrent ? 'animate-pulse text-indigo-400' : ''}`} />
                              {isDone ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : isCurrent ? (
                                <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                              ) : (
                                <span className="w-2 h-2 rounded-full bg-slate-700" />
                              )}
                            </div>
                            <span className="text-xs font-semibold leading-tight">{step.label}</span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Primary Animated Progress Bar */}
                    <div className="relative z-10 mb-4">
                      <div className="w-full bg-slate-950/90 border border-slate-800/80 h-3 rounded-full overflow-hidden p-0.5">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 shadow-md shadow-indigo-500/40 transition-all duration-300 ease-out relative"
                          style={{ width: `${Math.max(3, curProgress)}%` }}
                        >
                          <div className="absolute inset-0 bg-white/20 animate-pulse rounded-full" />
                        </div>
                      </div>
                    </div>

                    {/* Live Status Message Log */}
                    <div className="relative z-10 flex items-center justify-between text-xs px-3.5 py-2.5 bg-slate-950/70 border border-slate-800/60 rounded-xl font-mono text-slate-300">
                      <div className="flex items-center gap-2 overflow-hidden truncate">
                        <Activity className="w-3.5 h-3.5 text-indigo-400 shrink-0 animate-pulse" />
                        <span className="truncate">{activeRun.statusMessage || 'Processing scraping tasks...'}</span>
                      </div>
                      <span className="shrink-0 text-[10px] uppercase font-bold text-emerald-400 flex items-center gap-1.5 ml-3">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                        Live
                      </span>
                    </div>
                  </div>
                );
              })()}

              {activeTab === 'scrape' ? (
                /* VIEW 2: NEW SCRAPE FORM */
                <div className="max-w-2xl mx-auto w-full flex flex-col gap-8">
                  <div>
                    <h2 className="text-3xl font-extrabold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                      Create Leads Scrape Job
                    </h2>
                    <p className="text-slate-400 text-sm mt-2 leading-relaxed">
                      Automate Google Maps data retrieval and evaluate lead potentials using Gemini LLM analysis.
                    </p>
                  </div>

                  <form onSubmit={handleStartScrape} className="flex flex-col gap-6 bg-slate-900/30 p-6 border border-slate-900 rounded-2xl backdrop-blur-md">
                {/* Search query input */}
                <div className="flex flex-col gap-2">
                  <label htmlFor="query" className="text-sm font-semibold text-slate-300">
                    Google Maps Search Query
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      id="query"
                      required
                      placeholder="e.g. Gyms in Navrangpura, Ahmedabad or Cafes in Seattle"
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none rounded-xl px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 transition-all pr-10"
                    />
                    <Search className="w-5 h-5 text-slate-600 absolute right-3.5 top-3" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Limit selection */}
                  <div className="flex flex-col gap-2">
                    <label htmlFor="limit" className="text-sm font-semibold text-slate-300">
                      Scraping Limit
                    </label>
                    <select
                      id="limit"
                      value={isCustomLimit ? 'custom' : limit}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === 'custom') {
                          setIsCustomLimit(true);
                          setCustomLimitInput(limit > 0 && ![5, 10, 25, 50, 100, 9999].includes(limit) ? String(limit) : '5');
                          setLimit(limit > 0 && ![5, 10, 25, 50, 100, 9999].includes(limit) ? limit : 5);
                        } else {
                          setIsCustomLimit(false);
                          setLimit(parseInt(val));
                        }
                      }}
                      className="bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none rounded-xl px-4 py-3 text-sm text-slate-100 transition-all cursor-pointer"
                    >
                      <option value={5}>5 Leads (Quick Test)</option>
                      <option value={10}>10 Leads</option>
                      <option value={25}>25 Leads</option>
                      <option value={50}>50 Leads</option>
                      <option value={100}>100 Leads</option>
                      <option value={9999}>All (till end of results)</option>
                      <option value="custom">Custom Limit...</option>
                    </select>
                    {isCustomLimit && (
                      <input
                        type="number"
                        min={1}
                        placeholder="Enter custom limit (e.g. 5, 25, 250)"
                        value={customLimitInput}
                        onChange={e => {
                          const val = e.target.value;
                          setCustomLimitInput(val);
                          const parsed = parseInt(val);
                          if (!isNaN(parsed) && parsed > 0) {
                            setLimit(parsed);
                          }
                        }}
                        onBlur={() => {
                          if (!customLimitInput || parseInt(customLimitInput) <= 0) {
                            setCustomLimitInput('5');
                            setLimit(5);
                          }
                        }}
                        className="w-full mt-1.5 bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none rounded-xl px-4 py-2 text-xs text-slate-200 transition-all font-mono"
                      />
                    )}
                  </div>

                  {/* Browser Mode Toggle */}
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-semibold text-slate-300">Browser Display</label>
                    <div className="flex items-center h-full px-4 border border-slate-800 bg-slate-950 rounded-xl">
                      <input
                        type="checkbox"
                        id="headless"
                        checked={headless}
                        onChange={e => setHeadless(e.target.checked)}
                        className="w-4 h-4 text-indigo-600 border-slate-700 bg-slate-950 rounded focus:ring-indigo-500 focus:ring-offset-slate-950"
                      />
                      <label htmlFor="headless" className="ml-3 text-sm text-slate-400 select-none cursor-pointer">
                        Run Headless (Recommended)
                      </label>
                    </div>
                  </div>
                </div>

                {/* Smart Deduplication & Merge Option */}
                <div className="flex items-center justify-between p-3.5 bg-indigo-950/20 border border-indigo-500/20 rounded-xl">
                  <div className="flex items-start gap-3">
                    <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                        <span>Smart Deduplication & Merge</span>
                        <span className="text-[10px] bg-indigo-950/80 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded font-mono">Recommended</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                        If an Excel sheet already exists for this query, new listings will be appended automatically while skipping duplicates and preserving your notes.
                      </p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer ml-3 shrink-0">
                    <input
                      type="checkbox"
                      checked={mergeExisting}
                      onChange={e => setMergeExisting(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                {/* AI Model & Failover Engine Settings */}
                <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-xl flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-400" />
                      <span className="text-sm font-semibold text-slate-200">AI Analysis Model & Fallback</span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      Evaluates potential, problems & pitch angles
                    </span>
                  </div>

                  {/* Hugging Face Model Selection */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <label htmlFor="ai-model" className="text-slate-300 font-medium flex items-center gap-1.5">
                        <span>Hugging Face Model</span>
                        <span className="text-[10px] text-indigo-400 bg-indigo-950/60 border border-indigo-500/20 px-1.5 py-0.2 rounded font-mono">100% Free Inference</span>
                      </label>
                      <span className="text-[10px] text-slate-500 font-mono">
                        Serverless Router
                      </span>
                    </div>

                    <select
                      id="ai-model"
                      value={isCustomModel ? 'custom' : aiModel}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === 'custom') {
                          setIsCustomModel(true);
                        } else {
                          setIsCustomModel(false);
                          setAiModel(val);
                          localStorage.setItem('ai_model', val);
                        }
                      }}
                      className="bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none rounded-xl px-4 py-2.5 text-xs text-slate-100 transition-all cursor-pointer font-mono"
                    >
                      <option value="Qwen/Qwen2.5-72B-Instruct">Qwen/Qwen2.5-72B-Instruct (Recommended - Best Quality & Speed)</option>
                      <option value="meta-llama/Llama-3.3-70B-Instruct">meta-llama/Llama-3.3-70B-Instruct (Meta 70B)</option>
                      <option value="mistralai/Mistral-7B-Instruct-v0.3">mistralai/Mistral-7B-Instruct-v0.3 (Fast & Lightweight)</option>
                      <option value="deepseek-ai/DeepSeek-R1-Distill-Qwen-32B">deepseek-ai/DeepSeek-R1-Distill-Qwen-32B</option>
                      <option value="custom">Custom Hugging Face Model...</option>
                    </select>

                    {isCustomModel && (
                      <input
                        type="text"
                        placeholder="Enter model repo ID (e.g. Qwen/Qwen2.5-Coder-32B-Instruct)"
                        value={customModelInput}
                        onChange={e => setCustomModelInput(e.target.value)}
                        className="w-full mt-1 bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none rounded-xl px-3 py-2 text-xs text-slate-200 font-mono"
                      />
                    )}
                  </div>

                  {/* Auto Fallback Checkbox */}
                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={enableFallback}
                        onChange={e => setEnableFallback(e.target.checked)}
                        className="w-4 h-4 text-indigo-600 border-slate-700 bg-slate-950 rounded focus:ring-indigo-500"
                      />
                      <span className="text-xs text-slate-300 font-medium">
                        Auto-switch Hugging Face models on 503 / High Load
                      </span>
                    </label>
                    <span className="text-[10px] text-emerald-400/90 font-mono">Zero Failure</span>
                  </div>
                </div>

                {/* API Key Status Notice */}
                {!hfApiKey && !hasEnvHfKey ? (
                  <div className="p-3.5 bg-amber-950/20 border border-amber-500/10 rounded-xl flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-amber-300 font-semibold">No Hugging Face Token detected</p>
                      <p className="text-[11px] text-amber-400/80 mt-0.5 leading-relaxed">
                        Scraping will run, but AI analysis will be skipped. Configure your Hugging Face Token in the top-right button to enable AI insights.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-950/20 border border-emerald-500/20 rounded-xl flex items-center justify-between text-xs text-emerald-400">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span>
                        Hugging Face AI Engine Active ({aiModel})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowApiKeyInput(true)}
                      className="text-[11px] underline hover:text-emerald-300"
                    >
                      Manage Keys
                    </button>
                  </div>
                )}

                {/* Start Scraping Button */}
                <button
                  type="submit"
                  disabled={scraping}
                  className="w-full mt-2 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-slate-800 disabled:to-slate-850 disabled:text-slate-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 transition-all"
                >
                  {scraping ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Submitting Scraping Task...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 text-white fill-white" />
                      <span>Start Scraping & Analysis</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          ) : (
            /* VIEW 3: LEADS MANAGER (LIST OF JOBS & DOWNLOADS) */
            <div className="flex flex-col gap-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">Leads Management Database</h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Manage and review all your scraping records and Excel exports.
                  </p>
                </div>
                
                <div className="flex gap-4">
                  {/* Status Filters */}
                  <div className="bg-slate-900 p-1 rounded-xl border border-slate-800 flex gap-1">
                    {(['all', 'active', 'completed', 'failed'] as const).map(filter => (
                      <button
                        key={filter}
                        onClick={() => setRunsFilter(filter)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all ${
                          runsFilter === filter
                            ? 'bg-indigo-600 text-white shadow'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => fetchRuns()}
                    className="p-2 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 transition-all text-slate-400 hover:text-slate-200"
                    title="Refresh List"
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingRuns ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Runs Table */}
              <div className="bg-slate-900/30 border border-slate-800/80 rounded-2xl overflow-hidden backdrop-blur-md">
                {loadingRuns ? (
                  <div className="p-20 flex flex-col items-center justify-center gap-4">
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                    <p className="text-sm text-slate-400">Loading database...</p>
                  </div>
                ) : filteredRuns.length === 0 ? (
                  <div className="p-20 text-center text-slate-400">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-500" />
                    <p>No scrape runs found matching the selection.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead className="bg-slate-900 border-b border-slate-800">
                        <tr>
                          <th className="px-6 py-4 font-semibold text-slate-300">Job Title / Query</th>
                          <th className="px-6 py-4 font-semibold text-slate-300">Started At</th>
                          <th className="px-6 py-4 font-semibold text-slate-300">Status</th>
                          <th className="px-6 py-4 font-semibold text-slate-300">Limit</th>
                          <th className="px-6 py-4 font-semibold text-slate-300">File Size</th>
                          <th className="px-6 py-4 font-semibold text-slate-300 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850">
                        {filteredRuns.map((run, idx) => {
                          // Format File Size
                          const formattedSize = run.size > 0 
                            ? `${(run.size / 1024).toFixed(1)} KB` 
                            : 'N/A';

                          // Format Date
                          const date = new Date(run.timestamp);
                          const formattedDate = date.toLocaleString();

                          // Status indicator styles
                          let statusBadge = '';
                          if (run.status === 'active') {
                            statusBadge = 'text-indigo-400 bg-indigo-950/40 border border-indigo-500/20';
                          } else if (run.status === 'completed') {
                            statusBadge = 'text-emerald-400 bg-emerald-950/40 border border-emerald-500/20';
                          } else {
                            statusBadge = 'text-rose-400 bg-rose-950/40 border border-rose-500/20';
                          }

                          return (
                            <tr key={idx} className="hover:bg-slate-900/10 transition-all">
                              {/* Query/Title */}
                              <td className="px-6 py-4">
                                <div className="font-semibold text-slate-100">{run.query}</div>
                                {run.filename && (
                                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">{run.filename}</div>
                                )}
                                {run.status === 'active' && (
                                  <div className="mt-2.5 max-w-sm">
                                    <div className="flex justify-between text-[11px] font-bold mb-1">
                                      <span className="truncate pr-2 text-indigo-300 flex items-center gap-1">
                                        <Loader2 className="w-3 h-3 animate-spin text-indigo-400 shrink-0" />
                                        {run.statusMessage || 'Processing...'}
                                      </span>
                                      <span className="shrink-0 text-emerald-400 font-mono">{run.progress || 0}%</span>
                                    </div>
                                    <div className="w-full bg-slate-800/90 border border-slate-700/60 h-2 rounded-full overflow-hidden p-0.5">
                                      <div 
                                        className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 rounded-full transition-all duration-300 ease-out shadow-sm shadow-indigo-500/50"
                                        style={{ width: `${Math.max(4, run.progress || 0)}%` }}
                                      />
                                    </div>
                                    {run.current !== undefined && run.total ? (
                                      <div className="text-[10px] text-slate-400 mt-1 font-mono">
                                        Progress: {run.current} / {run.total} items
                                      </div>
                                    ) : null}
                                  </div>
                                )}
                              </td>

                              {/* Timestamp */}
                              <td className="px-6 py-4 text-xs text-slate-400">
                                {formattedDate}
                              </td>

                              {/* Status Badge */}
                              <td className="px-6 py-4">
                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 w-fit ${statusBadge}`}>
                                  {run.status === 'active' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                  {run.status === 'completed' && <CheckCircle className="w-3.5 h-3.5" />}
                                  {run.status === 'failed' && <XCircle className="w-3.5 h-3.5" />}
                                  <span className="capitalize">{run.status}</span>
                                </span>
                              </td>

                              {/* Scrape Limit */}
                              <td className="px-6 py-4 text-xs font-semibold text-slate-300">
                                {run.limit >= 9999 ? 'All (End of results)' : run.limit}
                              </td>

                              {/* Size */}
                              <td className="px-6 py-4 text-xs text-slate-400">
                                {formattedSize}
                              </td>

                              {/* Actions (Cancel, Open, Delete, Download) */}
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {/* Cancel button for active job */}
                                  {run.status === 'active' && (
                                    <button
                                      onClick={() => handlePromptDeleteRun(run)}
                                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-rose-950/50 text-rose-400 border border-rose-500/30 hover:bg-rose-900/60 transition-all flex items-center gap-1"
                                      title="Cancel Scrape Job"
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
                                      <span>Cancel</span>
                                    </button>
                                  )}

                                  {/* Open button */}
                                  {(() => {
                                    const targetFile = run.filename || runs.find(r => r.filename && r.query === run.query)?.filename;
                                    const hasFile = Boolean(targetFile);
                                    return (
                                      <button
                                        onClick={() => {
                                          if (!hasFile) {
                                            showToast('Spreadsheet file is still compiling or not available yet', 'info');
                                            return;
                                          }
                                          handleOpenFile({ ...run, filename: targetFile! });
                                        }}
                                        disabled={!hasFile}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                          hasFile
                                            ? 'bg-indigo-600/10 text-indigo-400 border-indigo-500/20 hover:bg-indigo-600 hover:text-white cursor-pointer shadow-sm'
                                            : 'bg-slate-900/40 text-slate-600 border-slate-800 cursor-not-allowed opacity-40'
                                        }`}
                                        title={hasFile ? 'Open Leads Table' : 'Spreadsheet not available'}
                                      >
                                        Open
                                      </button>
                                    );
                                  })()}

                                  {/* Download buttons: Excel & CSV */}
                                  {(() => {
                                    const targetFile = run.filename || runs.find(r => r.filename && r.query === run.query)?.filename;
                                    const hasFile = Boolean(targetFile);
                                    const csvTargetName = targetFile ? targetFile.replace(/\.xlsx$/i, '') + '.csv' : 'leads.csv';
                                    return (
                                      <div className="flex items-center gap-1.5">
                                        {/* Download Excel (.xlsx) */}
                                        <a
                                          href={hasFile ? `/api/leads?file=${encodeURIComponent(targetFile!)}&download=true&format=xlsx` : '#'}
                                          download={targetFile || 'leads.xlsx'}
                                          onClick={(e) => {
                                            if (!hasFile) {
                                              e.preventDefault();
                                              showToast('Spreadsheet file is still compiling or not available yet', 'info');
                                            } else {
                                              showToast(`Downloading ${targetFile}...`, 'success');
                                            }
                                          }}
                                          className={`px-2.5 py-1.5 rounded-lg border transition-all inline-flex items-center gap-1.5 text-xs font-semibold ${
                                            hasFile
                                              ? 'bg-emerald-950/40 border-emerald-500/25 hover:bg-emerald-600 hover:text-white hover:border-emerald-500 text-emerald-400 cursor-pointer shadow-sm'
                                              : 'bg-slate-900/40 border-slate-800 text-slate-600 cursor-not-allowed opacity-40'
                                          }`}
                                          title={hasFile ? `Download Excel: ${targetFile}` : 'Spreadsheet not available'}
                                        >
                                          <FileSpreadsheet className="w-3.5 h-3.5" />
                                          <span>Excel</span>
                                        </a>

                                        {/* Download CSV (.csv) */}
                                        <a
                                          href={hasFile ? `/api/leads?file=${encodeURIComponent(targetFile!)}&download=true&format=csv` : '#'}
                                          download={csvTargetName}
                                          onClick={(e) => {
                                            if (!hasFile) {
                                              e.preventDefault();
                                              showToast('File is still compiling or not available yet', 'info');
                                            } else {
                                              showToast(`Downloading ${csvTargetName}...`, 'success');
                                            }
                                          }}
                                          className={`px-2.5 py-1.5 rounded-lg border transition-all inline-flex items-center gap-1.5 text-xs font-semibold ${
                                            hasFile
                                              ? 'bg-cyan-950/40 border-cyan-500/25 hover:bg-cyan-600 hover:text-white hover:border-cyan-500 text-cyan-400 cursor-pointer shadow-sm'
                                              : 'bg-slate-900/40 border-slate-800 text-slate-600 cursor-not-allowed opacity-40'
                                          }`}
                                          title={hasFile ? `Download CSV: ${csvTargetName}` : 'CSV not available'}
                                        >
                                          <FileText className="w-3.5 h-3.5" />
                                          <span>CSV</span>
                                        </a>
                                      </div>
                                    );
                                  })()}

                                  {/* Delete button */}
                                  <button
                                    onClick={() => handlePromptDeleteRun(run)}
                                    className="p-1.5 rounded-lg bg-slate-900 border border-slate-850 hover:bg-rose-950/40 hover:text-rose-400 text-slate-500 transition-all"
                                    title="Delete Lead Data"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
      </div>

      {/* Side Drawer for Lead Details */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity"
            onClick={() => setSelectedLead(null)}
          />
          
          {/* Drawer Body */}
          <div className="relative w-full max-w-2xl bg-slate-900 border-l border-slate-800 h-full shadow-2xl flex flex-col z-10 animate-slide-in overflow-hidden">
            {/* Drawer Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/50 bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950">
              <div>
                <span className="text-[10px] font-bold text-indigo-400 tracking-wider uppercase">Lead Audit Details</span>
                <h3 className="text-xl font-bold text-white mt-1">{selectedLead["Business Name"]}</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">ID: {selectedLead["Lead ID"] || 'N/A'}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditingLead(selectedLead)}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/25 hover:bg-amber-500 hover:text-slate-950 transition-all text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                  title="Edit Lead Details & Save to Excel"
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>Edit Lead</span>
                </button>
                <button
                  onClick={() => setSelectedLead(null)}
                  className="p-2 text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-xl transition-all cursor-pointer"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-950/40">
              
              {/* Score and Tier Card */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl flex items-center gap-4">
                  {/* Lead Score circular meter */}
                  <div className="relative w-16 h-16 flex items-center justify-center shrink-0">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle cx="32" cy="32" r="28" className="stroke-slate-800 fill-none" strokeWidth="6" />
                      <circle 
                        cx="32" 
                        cy="32" 
                        r="28" 
                        className={`fill-none transition-all duration-1000 ${
                          (selectedLead["Lead Score"] || 0) >= 80 ? 'stroke-emerald-500' :
                          (selectedLead["Lead Score"] || 0) >= 50 ? 'stroke-amber-500' : 'stroke-rose-500'
                        }`} 
                        strokeWidth="6"
                        strokeDasharray={175}
                        strokeDashoffset={175 - (175 * (selectedLead["Lead Score"] || 0)) / 100}
                      />
                    </svg>
                    <span className="absolute text-sm font-bold text-white">{selectedLead["Lead Score"] || 0}</span>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-slate-400">Lead Score</h4>
                    <p className="text-sm font-extrabold text-white mt-0.5">
                      {(selectedLead["Lead Score"] || 0) >= 80 ? 'Highly Qualified' :
                       (selectedLead["Lead Score"] || 0) >= 50 ? 'Moderate Fit' : 'Low Potential'}
                    </p>
                  </div>
                </div>

                <div className="bg-slate-900/50 border border-slate-800 p-4 rounded-xl flex flex-col justify-center">
                  <h4 className="text-xs font-semibold text-slate-400">Lead Tier</h4>
                  <div className="mt-1.5">
                    {(() => {
                      const tier = selectedLead["Lead Tier"] || 'Tier 3 (Low)';
                      let badge = 'bg-slate-800 text-slate-300 border-slate-700';
                      if (tier.includes('Tier 1') || tier.includes('High')) {
                        badge = 'bg-emerald-950/40 text-emerald-400 border-emerald-500/20';
                      } else if (tier.includes('Tier 2') || tier.includes('Medium')) {
                        badge = 'bg-amber-950/40 text-amber-400 border-amber-500/20';
                      }
                      return (
                        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${badge}`}>
                          {tier}
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* 1. General & Contact Details */}
              <div className="bg-slate-900/30 border border-slate-800 p-5 rounded-xl space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Database className="w-3.5 h-3.5 text-indigo-400" />
                  <span>General & Contact Details</span>
                </h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                  <div>
                    <span className="text-slate-500">Category</span>
                    <p className="text-slate-200 font-semibold mt-0.5">{selectedLead["Category"] || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">City & Zone</span>
                    <p className="text-slate-200 font-semibold mt-0.5">
                      {(() => {
                        const fb = extractFallbackLocation(selectedLead["Full Address"]);
                        const cit = selectedLead["City"] && selectedLead["City"] !== 'Unknown' ? selectedLead["City"] : fb.city;
                        const zon = selectedLead["Zone"] && selectedLead["Zone"] !== 'Unknown' ? selectedLead["Zone"] : (fb.zone !== 'Unknown' ? fb.zone : '');
                        return `${cit}${zon ? ` (${zon})` : ''}`;
                      })()}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Locality</span>
                    <p className="text-slate-200 font-semibold mt-0.5">
                      {selectedLead["Locality"] && selectedLead["Locality"] !== 'Unknown'
                        ? selectedLead["Locality"]
                        : extractFallbackLocation(selectedLead["Full Address"]).locality}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Phone</span>
                    <p className="text-slate-200 font-mono font-semibold mt-0.5">{selectedLead["Phone"] || 'N/A'}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-500">Full Address</span>
                    <p className="text-slate-200 mt-0.5 leading-relaxed">{selectedLead["Full Address"] || 'N/A'}</p>
                  </div>
                  <div className="col-span-2 pt-1 flex gap-2">
                    {selectedLead["Google Maps URL"] && (
                      <a
                        href={selectedLead["Google Maps URL"]}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-slate-100 transition-all text-xs"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Google Maps Profile</span>
                      </a>
                    )}
                    {selectedLead["Website"] && (
                      <a
                        href={selectedLead["Website"].startsWith('http') ? selectedLead["Website"] : `http://${selectedLead["Website"]}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-650 hover:bg-indigo-600 rounded-lg text-white transition-all text-xs font-semibold"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Visit Website</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. Digital Audit */}
              <div className="bg-slate-900/30 border border-slate-800 p-5 rounded-xl space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Search className="w-3.5 h-3.5 text-purple-400" />
                  <span>Digital Presence Audit</span>
                </h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                  <div>
                    <span className="text-slate-500">Website Quality</span>
                    <p className={`font-semibold mt-0.5 ${
                      selectedLead["Website Quality"] === 'Excellent' || selectedLead["Website Quality"] === 'Good' ? 'text-emerald-400' :
                      selectedLead["Website Quality"] === 'Average' ? 'text-amber-400' : 'text-rose-400'
                    }`}>{selectedLead["Website Quality"] || 'Unknown'}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Mobile Layout</span>
                    <p className={`font-semibold mt-0.5 ${
                      selectedLead["Mobile Website"] === 'Yes' ? 'text-emerald-400' : 'text-rose-400'
                    }`}>{selectedLead["Mobile Website"] || 'Unknown'}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Online Booking Support</span>
                    <p className="text-slate-200 font-semibold mt-0.5">{selectedLead["Online Booking"] || 'Unknown'}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">WhatsApp Link</span>
                    <p className="mt-0.5">
                      {(() => {
                        const waVal = selectedLead["WhatsApp"];
                        const phone = selectedLead["Phone"];
                        
                        const getWaLink = (ph: string) => {
                          const digits = ph.replace(/\D/g, "");
                          if (!digits) return "";
                          if (digits.length === 10) return `https://wa.me/91${digits}`;
                          if (digits.length === 11 && digits.startsWith('0')) return `https://wa.me/91${digits.slice(1)}`;
                          return `https://wa.me/${digits}`;
                        };

                        const link = waVal && waVal.toString().startsWith('http') 
                          ? waVal.toString() 
                          : (phone ? getWaLink(phone.toString()) : "");

                        if (link) {
                          return (
                            <a
                              href={link}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-900/40 rounded-lg text-xs font-semibold transition-all"
                            >
                              <span>Start WhatsApp Chat</span>
                              <ExternalLink className="w-3 h-3 text-emerald-400" />
                            </a>
                          );
                        } else {
                          return (
                            <span className="text-slate-500 font-semibold">Not available (No phone)</span>
                          );
                        }
                      })()}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Instagram Handle</span>
                    <p className="text-slate-200 mt-0.5 truncate max-w-[200px]">
                      {selectedLead["Instagram"] ? (
                        <a href={selectedLead["Instagram"]} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
                          {selectedLead["Instagram"].split('/').pop() || 'Instagram Profile'}
                        </a>
                      ) : 'None found'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Instagram Activity</span>
                    <p className="text-slate-200 font-semibold mt-0.5">{selectedLead["Instagram Activity"] || 'Unknown'}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Facebook URL</span>
                    <p className="text-slate-200 mt-0.5 truncate max-w-[200px]">
                      {selectedLead["Facebook"] ? (
                        <a href={selectedLead["Facebook"]} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline font-semibold">
                          Facebook Profile
                        </a>
                      ) : 'None found'}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Google Rating / Reviews</span>
                    <p className="text-slate-200 font-semibold mt-0.5">
                      ★ {selectedLead["Google Rating"] || 'N/A'} <span className="text-slate-500">({selectedLead["Review Count"] || 0} reviews)</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* 3. Sales Pitch Analysis */}
              <div className="bg-slate-900/30 border border-slate-800 p-5 rounded-xl space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400/20" />
                  <span>Sales Pitch & Audit Insights</span>
                </h4>
                <div className="space-y-3.5 text-xs">
                  <div>
                    <span className="text-slate-500">Contact Person (Reviews Inferred)</span>
                    <p className="text-slate-200 font-semibold mt-0.5">{selectedLead["Contact Person"] || 'Unknown'}</p>
                  </div>
                  
                  <div className="p-3.5 bg-rose-950/20 border border-rose-500/10 rounded-xl">
                    <span className="text-rose-400 font-bold">Problem Found</span>
                    <p className="text-slate-200 mt-1 leading-relaxed font-semibold">{selectedLead["Problem Found"] || 'None listed'}</p>
                  </div>

                  {selectedLead["Problem Evidence"] && selectedLead["Problem Evidence"] !== 'N/A' && (
                    <div className="p-3 bg-slate-950/40 border border-slate-850 rounded-xl border-l-4 border-l-slate-500 italic text-slate-400">
                      <span>&ldquo;{selectedLead["Problem Evidence"]}&rdquo;</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-slate-500">Recommended Service</span>
                      <p className="text-indigo-400 font-extrabold mt-1 text-sm">{selectedLead["Recommended Service"] || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Contact Method</span>
                      <p className="text-slate-200 font-semibold mt-1">{selectedLead["Contact Method"] || 'Phone'}</p>
                    </div>
                  </div>

                  <div className="p-3.5 bg-indigo-950/25 border border-indigo-500/15 rounded-xl">
                    <span className="text-indigo-400 font-bold">Sales Pitch / Outreach Angle</span>
                    <p className="text-slate-200 mt-1 leading-relaxed font-medium">{selectedLead["Pitch Angle"] || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* 4. CRM Outreach Status */}
              <div className="bg-slate-900/30 border border-slate-800 p-5 rounded-xl space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-amber-400" />
                  <span>CRM & Outreach Status</span>
                </h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                  <div>
                    <span className="text-slate-500">Outreach Status</span>
                    <div className="mt-1">
                      <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 font-semibold border border-slate-700">
                        {selectedLead["Outreach Status"] || 'Not Contacted'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">Follow-up Date</span>
                    <p className="text-slate-200 font-mono mt-1">{selectedLead["Follow-up Date"] || 'None set'}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-500">Outreach Response</span>
                    <p className="text-slate-200 mt-1">{selectedLead["Response"] || 'No response recorded yet'}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-500">Lead Notes</span>
                    <p className="text-slate-200 mt-1 bg-slate-950/40 p-2.5 border border-slate-850 rounded-lg min-h-16 whitespace-pre-wrap">
                      {selectedLead["Notes"] || 'No notes added yet.'}
                    </p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* Delete / Cancel Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteConfirmRun)}
        title={deleteConfirmRun?.status === 'active' ? 'Cancel Scraping Task?' : 'Delete Lead Dataset?'}
        description={
          deleteConfirmRun?.status === 'active'
            ? 'Are you sure you want to cancel this ongoing scrape job? Progress will be stopped.'
            : 'Are you sure you want to delete this lead dataset? This will permanently delete all extracted leads, AI audits, and the generated Excel spreadsheet.'
        }
        itemName={deleteConfirmRun?.query}
        itemType={deleteConfirmRun?.status === 'active' ? 'job' : 'dataset'}
        confirmText={deleteConfirmRun?.status === 'active' ? 'Cancel Job' : 'Delete Dataset'}
        cancelText="Keep"
        isDestructive={true}
        isLoading={isDeletingRun}
        onConfirm={handleConfirmDeleteRun}
        onCancel={() => {
          if (!isDeletingRun) setDeleteConfirmRun(null);
        }}
      />

      {/* Edit Lead Modal */}
      <EditLeadModal
        isOpen={Boolean(editingLead)}
        lead={editingLead}
        fileName={selectedFile}
        isLoading={isSavingLead}
        onClose={() => {
          if (!isSavingLead) setEditingLead(null);
        }}
        onSave={handleSaveLead}
      />

      {/* Floating Toast Notification */}
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* Slide-in and Scale Animations */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in {
          animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes scaleIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-scale-in {
          animation: scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes slideUp {
          from { transform: translateY(16px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up {
          animation: slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}} />
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-sm text-slate-400">Loading dashboard...</p>
        </div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  );
}


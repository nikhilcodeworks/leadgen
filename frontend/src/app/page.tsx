'use client';

import React, { useState, useEffect, useRef } from 'react';
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
  ExternalLink
} from 'lucide-react';

interface LeadRun {
  filename: string | null;
  jobId: string | null;
  query: string;
  limit: number;
  status: 'active' | 'completed' | 'failed';
  size: number;
  timestamp: string;
}

interface LeadRecord {
  lead_potential: 'High Potential Lead' | 'Medium Potential Lead' | 'Low Potential Lead';
  insight: string;
  name: string;
  rating: number | null;
  reviews_count: number | null;
  category: string | null;
  phone: string | null;
  website: string | null;
  address: string | null;
  opening_hours: string | null;
  social_links: string[];
  valuable_data: string;
}

export default function Home() {
  // Navigation & View State
  const [activeTab, setActiveTab] = useState<'scrape' | 'manager'>('scrape');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedRunQuery, setSelectedRunQuery] = useState<string | null>(null);
  const [fileLeads, setFileLeads] = useState<LeadRecord[]>([]);
  const [loadingFile, setLoadingFile] = useState(false);
  const [runs, setRuns] = useState<LeadRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [runsFilter, setRunsFilter] = useState<'all' | 'active' | 'completed' | 'failed'>('all');

  // Scraper Input State
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(50);
  const [headless, setHeadless] = useState(true);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  
  // Job Running Notification State
  const [scraping, setScraping] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  // Load API Key from localStorage
  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) {
      setGeminiApiKey(savedKey);
    }
  }, []);

  // Fetch runs list
  const fetchRuns = async (silent = false) => {
    if (!silent) setLoadingRuns(true);
    try {
      const res = await fetch('/api/leads');
      const data = await res.json();
      if (data.runs) {
        setRuns(data.runs);
      }
    } catch (e) {
      console.error('Error fetching lead runs:', e);
    } finally {
      if (!silent) setLoadingRuns(false);
    }
  };

  // Initial fetch of runs
  useEffect(() => {
    fetchRuns();
  }, []);

  // Poll active runs status every 5 seconds
  useEffect(() => {
    const hasActiveJobs = runs.some(run => run.status === 'active');
    let interval: NodeJS.Timeout;

    if (hasActiveJobs || scraping) {
      interval = setInterval(() => {
        fetchRuns(true);
      }, 5000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [runs, scraping]);

  // Handle API Key Save
  const saveApiKey = (key: string) => {
    setGeminiApiKey(key);
    localStorage.setItem('gemini_api_key', key);
    setShowApiKeyInput(false);
  };

  // Handle Form Scrape Submit
  const handleStartScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setScraping(true);
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          limit,
          headless,
          gemini_api_key: geminiApiKey || null
        })
      });
      const data = await res.json();
      if (data.success) {
        setCurrentJobId(data.jobId);
        setQuery('');
        // Switch to manager view to see job progress
        setActiveTab('manager');
        fetchRuns();
      } else {
        alert(`Error starting job: ${data.error}`);
      }
    } catch (e: any) {
      alert(`Error starting scrape job: ${e.message}`);
    } finally {
      setScraping(false);
    }
  };

  // Open Lead File details
  const handleOpenFile = async (run: LeadRun) => {
    if (!run.filename) return;
    setSelectedFile(run.filename);
    setSelectedRunQuery(run.query);
    setLoadingFile(true);
    try {
      const res = await fetch(`/api/leads?file=${encodeURIComponent(run.filename)}`);
      const data = await res.json();
      if (data.data) {
        setFileLeads(data.data);
      } else {
        alert(data.error || 'Failed to load lead details');
      }
    } catch (e) {
      console.error('Error opening file:', e);
      alert('Error loading file contents');
    } finally {
      setLoadingFile(false);
    }
  };

  // Delete Lead Run
  const handleDeleteRun = async (run: LeadRun) => {
    if (!confirm(`Are you sure you want to delete the lead data for "${run.query}"?`)) return;

    try {
      const fileParam = run.filename ? `file=${encodeURIComponent(run.filename)}` : '';
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
      }
    } catch (e) {
      console.error('Error deleting run:', e);
      alert('Failed to delete run');
    }
  };

  // Download Excel File
  const handleDownloadFile = (filename: string) => {
    window.open(`/api/leads?file=${encodeURIComponent(filename)}&download=true`, '_blank');
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

        {/* API Key settings in the top-right corner */}
        <div className="relative">
          <button
            onClick={() => setShowApiKeyInput(!showApiKeyInput)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
              geminiApiKey
                ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30 hover:bg-emerald-900/40'
                : 'bg-amber-950/40 text-amber-400 border-amber-500/30 hover:bg-amber-900/40'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>{geminiApiKey ? 'API Key Active' : 'Configure API Key'}</span>
            <span className={`w-2 h-2 rounded-full ${geminiApiKey ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          </button>

          {/* API Key Modal dropdown */}
          {showApiKeyInput && (
            <div className="absolute right-0 mt-2 w-80 p-4 bg-slate-900 border border-slate-850 rounded-xl shadow-2xl shadow-black/80 z-50">
              <h3 className="text-sm font-semibold mb-2">Set Gemini Developer API Key</h3>
              <p className="text-xs text-slate-400 mb-4">
                Required for structured business potential evaluations and insights.
              </p>
              <input
                type="password"
                placeholder="Paste API Key here..."
                defaultValue={geminiApiKey}
                id="api-key-input"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 mb-3"
              />
              <div className="flex justify-end gap-2 text-xs">
                <button
                  onClick={() => setShowApiKeyInput(false)}
                  className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const el = document.getElementById('api-key-input') as HTMLInputElement;
                    saveApiKey(el?.value || '');
                  }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-semibold"
                >
                  Save
                </button>
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

                <div className="flex gap-3">
                  <button
                    onClick={() => handleDownloadFile(selectedFile)}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-850 rounded-xl text-sm font-semibold transition-all"
                  >
                    <Download className="w-4 h-4 text-slate-400" />
                    <span>Download Excel</span>
                  </button>
                  <button
                    onClick={() => setSelectedFile(null)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-all"
                  >
                    Done
                  </button>
                </div>
              </div>

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
                    <table className="w-full border-collapse text-left text-sm">
                      <thead className="bg-slate-900 border-b border-slate-800">
                        <tr>
                          <th className="px-6 py-4 font-semibold text-slate-300">Lead Potential</th>
                          <th className="px-6 py-4 font-semibold text-slate-300">Insights</th>
                          <th className="px-6 py-4 font-semibold text-slate-300">Business Details</th>
                          <th className="px-6 py-4 font-semibold text-slate-300">Contact</th>
                          <th className="px-6 py-4 font-semibold text-slate-300">Links</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {fileLeads.map((lead, idx) => {
                          // Badge color helper
                          let badgeClass = 'text-slate-400 bg-slate-900/60 border border-slate-800';
                          if (lead.lead_potential === 'High Potential Lead') {
                            badgeClass = 'text-emerald-400 bg-emerald-950/40 border border-emerald-500/20';
                          } else if (lead.lead_potential === 'Medium Potential Lead') {
                            badgeClass = 'text-amber-400 bg-amber-950/40 border border-amber-500/20';
                          }

                          return (
                            <tr
                              key={idx}
                              className={`hover:bg-slate-900/20 transition-all ${
                                lead.lead_potential === 'High Potential Lead' ? 'bg-emerald-950/5' : ''
                              }`}
                            >
                              {/* 1. Lead Potential */}
                              <td className="px-6 py-4 align-top w-48">
                                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold inline-block ${badgeClass}`}>
                                  {lead.lead_potential}
                                </span>
                              </td>

                              {/* 2. Insights */}
                              <td className="px-6 py-4 align-top max-w-sm">
                                <p className="text-slate-200 text-xs leading-relaxed">{lead.insight}</p>
                                {lead.valuable_data && lead.valuable_data !== lead.insight && (
                                  <details className="mt-2 text-[11px] text-slate-400 cursor-pointer">
                                    <summary className="font-semibold text-indigo-400 hover:text-indigo-300 outline-none">
                                      View Analyzed Data Details
                                    </summary>
                                    <p className="mt-1 bg-slate-950/60 border border-slate-850 p-2 rounded-lg font-mono text-[10px] whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                                      {lead.valuable_data}
                                    </p>
                                  </details>
                                )}
                              </td>

                              {/* 3. Business Name & Rating */}
                              <td className="px-6 py-4 align-top">
                                <div className="font-bold text-slate-100 text-base">{lead.name}</div>
                                <div className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                                  <span>{lead.category || 'Business'}</span>
                                  {lead.rating && (
                                    <>
                                      <span>•</span>
                                      <span className="text-amber-400 font-semibold">★ {lead.rating}</span>
                                      <span className="text-slate-500">({lead.reviews_count} reviews)</span>
                                    </>
                                  )}
                                </div>
                                {lead.opening_hours && (
                                  <details className="mt-1.5 text-[11px] text-slate-400 cursor-pointer">
                                    <summary className="hover:text-slate-200 outline-none">Operating Hours</summary>
                                    <p className="mt-1 bg-slate-950/40 p-2 border border-slate-850 rounded text-[10px] whitespace-pre-line font-mono">
                                      {lead.opening_hours}
                                    </p>
                                  </details>
                                )}
                              </td>

                              {/* 4. Phone & Address */}
                              <td className="px-6 py-4 align-top text-xs text-slate-300 space-y-1.5">
                                {lead.phone && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-slate-500 font-medium">Tel:</span>
                                    <span className="font-mono text-slate-200">{lead.phone}</span>
                                  </div>
                                )}
                                {lead.address && (
                                  <div className="text-slate-400 max-w-xs text-[11px] leading-relaxed">
                                    <span className="text-slate-500 font-medium">Add:</span> {lead.address}
                                  </div>
                                )}
                              </td>

                              {/* 5. Website & Socials */}
                              <td className="px-6 py-4 align-top text-xs space-y-2">
                                {lead.website && (
                                  <a
                                    href={lead.website}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-semibold"
                                  >
                                    <span>Website</span>
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                )}
                                {(() => {
                                  const links = Array.isArray(lead.social_links)
                                    ? lead.social_links
                                    : typeof lead.social_links === 'string'
                                    ? (() => {
                                        const val = (lead.social_links as string).trim();
                                        if (val.startsWith('[') && val.endsWith(']')) {
                                          try {
                                            return JSON.parse(val.replace(/'/g, '"'));
                                          } catch {
                                            return val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
                                          }
                                        }
                                        return val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];
                                      })()
                                    : [];
                                  
                                  return links && links.length > 0 && (
                                    <div className="flex flex-col gap-1">
                                      {links.map((link: string, lIdx: number) => (
                                        <a
                                          key={lIdx}
                                          href={link}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-[11px] text-purple-400 hover:text-purple-300 truncate max-w-[120px] inline-block"
                                          title={link}
                                        >
                                          {link.includes('instagram') ? 'Instagram' :
                                           link.includes('facebook') ? 'Facebook' :
                                           link.includes('linkedin') ? 'LinkedIn' :
                                           link.includes('twitter') || link.includes('x.com') ? 'Twitter/X' :
                                           link.includes('youtube') ? 'YouTube' : 'Social'}
                                        </a>
                                      ))}
                                    </div>
                                  );
                                })()}
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
          ) : activeTab === 'scrape' ? (
            /* VIEW 2: NEW SCRAPE FORM */
            <div className="max-w-2xl mx-auto flex flex-col gap-8">
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
                      value={limit}
                      onChange={e => setLimit(parseInt(e.target.value))}
                      className="bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none rounded-xl px-4 py-3 text-sm text-slate-100 transition-all cursor-pointer"
                    >
                      <option value={50}>50 Leads</option>
                      <option value={100}>100 Leads</option>
                      <option value={9999}>All (till end of results)</option>
                    </select>
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

                {/* Warning about API key */}
                {!geminiApiKey && (
                  <div className="p-3.5 bg-amber-950/20 border border-amber-500/10 rounded-xl flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-amber-300 font-semibold">Gemini API Key missing</p>
                      <p className="text-[11px] text-amber-400/80 mt-0.5 leading-relaxed">
                        You can still run the scraper, but lead potential ratings and insights will use fallback values. 
                        Configure it in the top right to enable LLM analysis.
                      </p>
                    </div>
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

                              {/* Actions (Open, Delete, Download) */}
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {/* Open button */}
                                  <button
                                    disabled={run.status !== 'completed'}
                                    onClick={() => handleOpenFile(run)}
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600/10 text-indigo-400 border border-indigo-500/20 hover:bg-indigo-600 hover:text-white disabled:bg-slate-900/30 disabled:text-slate-600 disabled:border-slate-850 transition-all"
                                    title="Open Leads Table"
                                  >
                                    Open
                                  </button>

                                  {/* Download button */}
                                  <button
                                    disabled={run.status !== 'completed' || !run.filename}
                                    onClick={() => run.filename && handleDownloadFile(run.filename)}
                                    className="p-1.5 rounded-lg bg-slate-900 border border-slate-850 hover:bg-slate-800 text-slate-400 hover:text-slate-200 disabled:text-slate-700 disabled:border-slate-900 transition-all"
                                    title="Download Excel Sheet"
                                  >
                                    <Download className="w-4 h-4" />
                                  </button>

                                  {/* Delete button */}
                                  <button
                                    onClick={() => handleDeleteRun(run)}
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
        </main>
      </div>
    </div>
  );
}

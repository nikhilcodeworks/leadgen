'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Database,
  Search,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
  MapPin,
  Phone,
  Globe,
  MessageSquare,
  AlertCircle,
  FileText,
  Save,
  Check
} from 'lucide-react';
import Toast, { ToastMessage } from '@/components/Toast';
import { extractFallbackLocation } from '../page';

interface LeadRecord {
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
  "Web Results"?: string | null;
}

function LeadDetailInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const file = searchParams.get('file');
  const leadId = searchParams.get('leadId');

  const [lead, setLead] = useState<LeadRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // CRM State
  const [contactMethod, setContactMethod] = useState('Call');
  const [outreachStatus, setOutreachStatus] = useState('Not Contacted');
  const [followUpDate, setFollowUpDate] = useState('');
  const [response, setResponse] = useState('');
  const [notes, setNotes] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ id: Date.now().toString(), message, type });
  };

  useEffect(() => {
    if (!file || !leadId) {
      setError('Missing file or leadId query parameters.');
      setLoading(false);
      return;
    }

    const customBackendUrl = typeof window !== 'undefined' ? (localStorage.getItem('custom_backend_url') || '') : '';
    const getHeaders = (extra: Record<string, string> = {}) => {
      const h: Record<string, string> = { ...extra };
      if (customBackendUrl) h['x-backend-url'] = customBackendUrl;
      return h;
    };

    const fetchLeadDetails = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/leads?file=${encodeURIComponent(file)}&leadId=${encodeURIComponent(leadId)}`, {
          headers: getHeaders()
        });
        const data = await res.json();
        if (data.data) {
          setLead(data.data);
          // Initialize CRM fields
          setContactMethod(data.data["Contact Method"] || (data.data["WhatsApp"] === 'Yes' ? 'WhatsApp' : 'Call'));
          setOutreachStatus(data.data["Outreach Status"] || 'Not Contacted');
          setFollowUpDate(data.data["Follow-up Date"] || '');
          setResponse(data.data["Response"] || '');
          setNotes(data.data["Notes"] || '');
        } else {
          setError(data.error || 'Failed to fetch lead details');
        }
      } catch (e: any) {
        setError(e.message || 'An error occurred while loading');
      } finally {
        setLoading(false);
      }
    };

    fetchLeadDetails();
  }, [file, leadId]);

  const handleSaveCRM = async () => {
    if (!file || !leadId) return;
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const customBackendUrl = typeof window !== 'undefined' ? (localStorage.getItem('custom_backend_url') || '') : '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (customBackendUrl) headers['x-backend-url'] = customBackendUrl;

      const res = await fetch('/api/leads', {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          file,
          leadId,
          backend_url: customBackendUrl || null,
          updates: {
            "Contact Method": contactMethod,
            "Outreach Status": outreachStatus,
            "Follow-up Date": followUpDate,
            "Response": response,
            "Notes": notes
          }
        })
      });

      const data = await res.json();
      if (data.success) {
        setSaveSuccess(true);
        showToast('Changes saved to Excel successfully', 'success');
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        showToast(data.error || 'Failed to save changes', 'error');
      }
    } catch (e: any) {
      showToast(`Error saving changes: ${e.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const getWaLink = (ph: string) => {
    const digits = ph.replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 10) return `https://wa.me/91${digits}`;
    if (digits.length === 11 && digits.startsWith('0')) return `https://wa.me/91${digits.slice(1)}`;
    return `https://wa.me/${digits}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-sm text-slate-400">Loading lead details...</p>
        </div>
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl text-center">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Error Loading Details</h2>
          <p className="text-sm text-slate-400 mb-6">{error || 'Lead records could not be resolved.'}</p>
          <button
            onClick={() => router.push('/')}
            className="w-full py-2.5 bg-indigo-650 hover:bg-indigo-600 rounded-xl text-sm font-semibold transition-all"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const score = lead["Lead Score"] || 0;
  const tier = lead["Lead Tier"] || '🟡 Medium';

  let tierBadge = 'text-slate-400 bg-slate-900/60 border border-slate-800';
  if (tier.includes('Hot') || tier.includes('🔥')) {
    tierBadge = 'text-amber-300 bg-amber-950/60 border border-amber-500/50 shadow-md shadow-amber-500/20';
  } else if (tier.includes('Good') || tier.includes('🟢') || tier.includes('Tier 1') || tier.includes('High')) {
    tierBadge = 'text-emerald-400 bg-emerald-950/40 border border-emerald-500/30';
  } else if (tier.includes('Medium') || tier.includes('🟡') || tier.includes('Tier 2')) {
    tierBadge = 'text-amber-400 bg-amber-950/40 border border-amber-500/30';
  } else if (tier.includes('Skip') || tier.includes('❌') || tier.includes('Low')) {
    tierBadge = 'text-rose-400 bg-rose-950/40 border border-rose-500/30';
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-slate-900/60 backdrop-blur-md border-b border-slate-800/80 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/?tab=manager&file=${encodeURIComponent(file || '')}`)}
            className="p-2 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 transition-all text-slate-400 hover:text-slate-200"
            title="Back to Leads List"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <span className="text-[10px] font-bold text-indigo-400 tracking-wider uppercase">Lead Audit Details</span>
            <h1 className="text-xl font-bold text-white mt-0.5">{lead["Business Name"]}</h1>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              {lead["S.No"] ? `S.No: ${lead["S.No"]} • ` : ''}ID: {lead["Lead ID"] || (lead["S.No"] ? `L-${lead["S.No"]}` : 'N/A')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/?tab=manager&file=${encodeURIComponent(file || '')}`)}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-sm font-semibold transition-all text-slate-300"
          >
            Done
          </button>
        </div>
      </header>

      {/* Detail Content Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 space-y-6">
        
        {/* Score Card and General Metadata Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Lead Score circular meter */}
          <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl flex items-center gap-6 backdrop-blur-md">
            <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="40" cy="40" r="35" className="stroke-slate-800 fill-none" strokeWidth="6" />
                <circle 
                  cx="40" 
                  cy="40" 
                  r="35" 
                  className={`fill-none transition-all duration-1000 ${
                    score >= 80 ? 'stroke-emerald-500' :
                    score >= 50 ? 'stroke-amber-500' : 'stroke-rose-500'
                  }`} 
                  strokeWidth="6"
                  strokeDasharray={220}
                  strokeDashoffset={220 - (220 * score) / 100}
                />
              </svg>
              <span className="absolute text-lg font-bold text-white">{score}</span>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Lead Audit Score</h4>
              <p className="text-base font-extrabold text-white mt-1">
                {score >= 80 ? 'Highly Qualified' :
                 score >= 50 ? 'Moderate Fit' : 'Low Potential'}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Based on ratings, digital footprint & gaps.</p>
            </div>
          </div>

          {/* Lead Tier details */}
          <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl flex flex-col justify-center backdrop-blur-md">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Lead Category Tier</h4>
            <div className="mt-2.5">
              <span className={`px-4 py-1.5 rounded-full text-xs font-extrabold border inline-block ${tierBadge}`}>
                {tier}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-2">Determines the priority level for outreach campaigns.</p>
          </div>

          {/* Source Document name */}
          <div className="bg-slate-900/40 border border-slate-800 p-6 rounded-2xl flex flex-col justify-center backdrop-blur-md">
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Source Campaign File</h4>
            <p className="text-sm font-semibold text-slate-200 mt-2 truncate font-mono bg-slate-950/60 px-3 py-2 border border-slate-850 rounded-xl">
              {file}
            </p>
          </div>
        </div>

        {/* Two Column Layout for Audit Details vs CRM updates */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* LEFT COLUMN: Data details */}
          <div className="space-y-6">
            
            {/* Card 1: General & Contact Details */}
            <div className="bg-slate-900/30 border border-slate-800 p-6 rounded-2xl space-y-5 backdrop-blur-md">
              <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800/80 pb-3">
                <Database className="w-4 h-4 text-indigo-400" />
                <span>General & Contact Details</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                <div>
                  <span className="text-slate-500 text-xs">Category</span>
                  <p className="text-slate-200 font-semibold mt-0.5">{lead["Category"] || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-slate-500 text-xs">City & Region</span>
                  <p className="text-slate-200 font-semibold mt-0.5">
                    {(() => {
                      const fb = extractFallbackLocation(lead["Full Address"]);
                      const cit = lead["City"] && lead["City"] !== 'Unknown' ? lead["City"] : fb.city;
                      const zon = lead["Zone"] && lead["Zone"] !== 'Unknown' ? lead["Zone"] : (fb.zone !== 'Unknown' ? fb.zone : '');
                      return `${cit}${zon ? ` (${zon})` : ''}`;
                    })()}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500 text-xs">Locality / Neighborhood</span>
                  <p className="text-slate-200 font-semibold mt-0.5">
                    {lead["Locality"] && lead["Locality"] !== 'Unknown'
                      ? lead["Locality"]
                      : extractFallbackLocation(lead["Full Address"]).locality}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500 text-xs">Phone Number</span>
                  <p className="text-slate-200 font-mono font-semibold mt-0.5">{lead["Phone"] || 'N/A'}</p>
                </div>
                <div className="md:col-span-2">
                  <span className="text-slate-500 text-xs">Full Address</span>
                  <p className="text-slate-200 mt-1 leading-relaxed">{lead["Full Address"] || 'N/A'}</p>
                </div>
                
                <div className="md:col-span-2 pt-2 flex flex-wrap gap-2.5">
                  {lead["Google Maps URL"] && (
                    <a
                      href={lead["Google Maps URL"]}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 px-3 py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-xl text-slate-300 hover:text-slate-100 transition-all text-xs font-semibold"
                    >
                      <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Google Maps Profile</span>
                      <ExternalLink className="w-3 h-3 text-slate-500" />
                    </a>
                  )}
                  {lead["Website"] && (
                    <a
                      href={lead["Website"].startsWith('http') ? lead["Website"] : `http://${lead["Website"]}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 px-3.5 py-2 bg-indigo-650 hover:bg-indigo-600 rounded-xl text-white transition-all text-xs font-bold"
                    >
                      <Globe className="w-3.5 h-3.5 text-white" />
                      <span>Visit Website</span>
                      <ExternalLink className="w-3 h-3 text-indigo-200" />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Card 2: Digital Presence Audit */}
            <div className="bg-slate-900/30 border border-slate-800 p-6 rounded-2xl space-y-5 backdrop-blur-md">
              <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800/80 pb-3">
                <Search className="w-4 h-4 text-purple-400" />
                <span>Digital Presence Audit</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                <div>
                  <span className="text-slate-500 text-xs">Website Quality</span>
                  <p className={`font-semibold mt-0.5 ${
                    lead["Website Quality"] === 'Excellent' || lead["Website Quality"] === 'Good' ? 'text-emerald-400' :
                    lead["Website Quality"] === 'Average' ? 'text-amber-400' : 'text-rose-400'
                  }`}>{lead["Website Quality"] || 'Unknown'}</p>
                </div>
                <div>
                  <span className="text-slate-500 text-xs">Mobile Layout Support</span>
                  <p className={`font-semibold mt-0.5 ${
                    lead["Mobile Website"] === 'Yes' ? 'text-emerald-400' : 'text-rose-400'
                  }`}>{lead["Mobile Website"] || 'Unknown'}</p>
                </div>
                <div>
                  <span className="text-slate-500 text-xs">Online Booking Support</span>
                  <p className="text-slate-200 font-semibold mt-0.5">{lead["Online Booking"] || 'Unknown'}</p>
                </div>
                <div>
                  <span className="text-slate-500 text-xs">WhatsApp Direct Chat</span>
                  <div className="mt-1">
                    {(() => {
                      const phone = lead["Phone"];
                      const waLink = phone ? getWaLink(phone.toString()) : "";
                      if (waLink) {
                        return (
                          <a
                            href={waLink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/40 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-900/40 rounded-lg text-xs font-semibold transition-all"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Start WhatsApp Chat</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        );
                      }
                      return <span className="text-slate-500">Not Available</span>;
                    })()}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500 text-xs">Instagram Handle</span>
                  <p className="text-slate-200 mt-0.5 truncate font-semibold">
                    {lead["Instagram"] ? (
                      <a href={lead["Instagram"]} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline inline-flex items-center gap-1">
                        <span>@{lead["Instagram"].split('/').filter(Boolean).pop()}</span>
                        <ExternalLink className="w-3 h-3 text-slate-500" />
                      </a>
                    ) : 'None'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500 text-xs">Instagram Activity Inferred</span>
                  <p className="text-slate-200 font-semibold mt-0.5">{lead["Instagram Activity"] || 'Unknown'}</p>
                </div>
                <div>
                  <span className="text-slate-500 text-xs">Facebook Page</span>
                  <p className="text-slate-200 mt-0.5 truncate font-semibold">
                    {lead["Facebook"] ? (
                      <a href={lead["Facebook"]} target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline inline-flex items-center gap-1">
                        <span>Facebook Profile</span>
                        <ExternalLink className="w-3 h-3 text-slate-500" />
                      </a>
                    ) : 'None'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-550 text-xs">Google Rating / Reviews</span>
                  <p className="text-slate-200 font-semibold mt-0.5">
                    ★ {lead["Google Rating"] || 'N/A'} <span className="text-slate-500 font-normal">({lead["Review Count"] || 0} reviews)</span>
                  </p>
                </div>
              </div>
            </div>
            {/* Card 5: Organic Web Results & Social Profiles */}
            {((lead["Social Media Links"] && lead["Social Media Links"].trim()) || 
              (lead["Web Results"] && lead["Web Results"].trim())) && (
              <div className="bg-slate-900/30 border border-slate-800 p-6 rounded-2xl space-y-5 backdrop-blur-md">
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800/80 pb-3">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  <span>Organic Search & Web Results</span>
                </h3>
                
                <div className="space-y-4">
                  {/* Social profiles list */}
                  {lead["Social Media Links"] && lead["Social Media Links"].trim() && (
                    <div className="space-y-2">
                      <span className="text-slate-500 text-xs font-bold uppercase tracking-wide block mb-1">Identified Social Profiles</span>
                      <div className="flex flex-wrap gap-2">
                        {lead["Social Media Links"].split(',').map((link, idx) => {
                          const cleanLink = link.trim();
                          if (!cleanLink) return null;
                          
                          let label = "Social Link";
                          if (cleanLink.includes("linkedin.com")) label = "LinkedIn";
                          else if (cleanLink.includes("twitter.com") || cleanLink.includes("x.com")) label = "Twitter / X";
                          else if (cleanLink.includes("youtube.com")) label = "YouTube";
                          else if (cleanLink.includes("tiktok.com")) label = "TikTok";
                          else if (cleanLink.includes("instagram.com")) label = "Instagram";
                          else if (cleanLink.includes("facebook.com")) label = "Facebook";
                          else if (cleanLink.includes("pinterest.com")) label = "Pinterest";
                          else if (cleanLink.includes("snapchat.com")) label = "Snapchat";

                          return (
                            <a
                              key={idx}
                              href={cleanLink.startsWith('http') ? cleanLink : `http://${cleanLink}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 border border-slate-800 hover:border-indigo-500/50 rounded-xl text-xs text-indigo-400 hover:text-indigo-300 transition-all font-semibold"
                            >
                              <span>{label}</span>
                              <ExternalLink className="w-3 h-3 text-slate-500" />
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Organic web results list */}
                  {lead["Web Results"] && lead["Web Results"].trim() && (
                    <div className="space-y-2.5 pt-2">
                      <span className="text-slate-500 text-xs font-bold uppercase tracking-wide block">Organic Search Listings</span>
                      <div className="space-y-2">
                        {lead["Web Results"].split('\n').map((result, idx) => {
                          const trimmed = result.trim();
                          if (!trimmed) return null;
                          
                          let title = "Search Result";
                          let url = trimmed;
                          
                          // Parse "Title: URL"
                          if (trimmed.includes("http")) {
                            const httpIdx = trimmed.indexOf("http");
                            const labelPart = trimmed.substring(0, httpIdx).trim().replace(/:$/, "");
                            if (labelPart) {
                              title = labelPart;
                            }
                            url = trimmed.substring(httpIdx).trim();
                          }
                          
                          return (
                            <div key={idx} className="p-3 bg-slate-950/60 border border-slate-850 rounded-xl hover:border-slate-800 transition-all flex items-center justify-between gap-4">
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-200 truncate">{title}</p>
                                <p className="text-[10px] text-slate-500 font-mono truncate mt-0.5">{url}</p>
                              </div>
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-all shrink-0"
                                title={`Visit ${title}`}
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: LLM Insights & CRM Editing */}
          <div className="space-y-6">
            
            {/* Card 3: sales Pitch & Insights */}
            <div className="bg-slate-900/30 border border-slate-800 p-6 rounded-2xl space-y-5 backdrop-blur-md">
              <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800/80 pb-3">
                <FileText className="w-4 h-4 text-emerald-400" />
                <span>Sales Pitch & Audit Insights</span>
              </h3>
              <div className="space-y-4 text-sm">
                <div>
                  <span className="text-slate-500 text-xs">Contact Person (Reviews Inferred)</span>
                  <p className="text-slate-200 font-semibold mt-0.5">{lead["Contact Person"] || 'Unknown'}</p>
                </div>

                <div className="p-4 bg-rose-950/20 border border-rose-500/10 rounded-xl border-l-4 border-l-rose-500">
                  <span className="text-rose-400 font-extrabold text-xs uppercase tracking-wider">Problem Found</span>
                  <p className="text-slate-200 mt-1 leading-relaxed font-semibold">{lead["Problem Found"] || 'None listed'}</p>
                </div>

                {lead["Problem Evidence"] && lead["Problem Evidence"] !== 'N/A' && (
                  <div className="p-3 bg-slate-950/40 border border-slate-850 rounded-xl italic text-slate-400 text-xs">
                    <span>"{lead["Problem Evidence"]}"</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-slate-500 text-xs">Recommended Pitch Offer</span>
                    <p className="text-indigo-400 font-extrabold mt-1 text-sm">{lead["Recommended Service"] || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 text-xs">Contact Preference</span>
                    <p className="text-slate-200 font-semibold mt-1">{lead["Contact Method"] || 'Phone'}</p>
                  </div>
                </div>

                <div className="p-4 bg-gradient-to-tr from-indigo-950/30 to-purple-950/30 border border-indigo-500/15 rounded-xl">
                  <span className="text-indigo-400 font-extrabold text-xs uppercase tracking-wider">Sales Pitch / outreach Angle</span>
                  <p className="text-slate-200 mt-1 leading-relaxed font-semibold">{lead["Pitch Angle"] || 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* Card 4: CRM Outreach Updates */}
            <div className="bg-slate-900/30 border border-slate-850 p-6 rounded-2xl space-y-5 backdrop-blur-md shadow-xl border-l-4 border-l-indigo-600/50">
              <div className="flex justify-between items-center border-b border-slate-800/80 pb-3">
                <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-indigo-400" />
                  <span>CRM Outreach Updates</span>
                </h3>

                {saveSuccess && (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded-full animate-fade-in">
                    <Check className="w-3.5 h-3.5" />
                    <span>Saved to Excel!</span>
                  </span>
                )}
              </div>

              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  
                  {/* Contact Method Dropdown */}
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="contactMethod" className="text-xs text-slate-400 font-bold">Contact Method</label>
                    <select
                      id="contactMethod"
                      value={contactMethod}
                      onChange={(e) => setContactMethod(e.target.value)}
                      className="bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none rounded-xl px-3 py-2 text-xs text-slate-100 transition-all cursor-pointer font-semibold"
                    >
                      <option value="Call">Call</option>
                      <option value="WhatsApp">WhatsApp</option>
                      <option value="Email">Email</option>
                      <option value="In-Person">In-Person</option>
                    </select>
                  </div>

                  {/* Status Dropdown */}
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="outreachStatus" className="text-xs text-slate-400 font-bold">Outreach Status</label>
                    <select
                      id="outreachStatus"
                      value={outreachStatus}
                      onChange={(e) => setOutreachStatus(e.target.value)}
                      className="bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none rounded-xl px-3 py-2 text-xs text-slate-100 transition-all cursor-pointer font-semibold"
                    >
                      <option value="Not Contacted">Not Contacted</option>
                      <option value="Contacted">Contacted</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Replied">Replied</option>
                      <option value="Interested">Interested</option>
                      <option value="Not Interested">Not Interested</option>
                    </select>
                  </div>

                  {/* Follow-up Date */}
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="followUpDate" className="text-xs text-slate-400 font-bold">Follow-up Date</label>
                    <input
                      type="text"
                      id="followUpDate"
                      placeholder="e.g. 2026-09-05 or 5th Sept"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      className="bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-700 transition-all font-semibold font-mono"
                    />
                  </div>
                </div>

                {/* Outreach Response */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="response" className="text-xs text-slate-400 font-bold">Latest Response / Remarks</label>
                  <textarea
                    id="response"
                    placeholder="Describe their response or callback remarks..."
                    value={response}
                    onChange={(e) => setResponse(e.target.value)}
                    rows={2}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-700 transition-all font-semibold"
                  />
                </div>

                {/* Lead Notes */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="notes" className="text-xs text-slate-400 font-bold">Detailed Lead Notes</label>
                  <textarea
                    id="notes"
                    placeholder="Enter private notes, custom requirements, or call summaries..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-700 transition-all min-h-[100px]"
                  />
                </div>

                {/* Save Changes Button */}
                <button
                  onClick={handleSaveCRM}
                  disabled={isSaving}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:from-slate-800 disabled:to-slate-850 disabled:text-slate-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 transition-all text-xs uppercase tracking-wider mt-2"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving Updates...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Save CRM updates to Excel</span>
                    </>
                  )}
                </button>
              </div>
            </div>

          </div>

        </div>

        <Toast toast={toast} onClose={() => setToast(null)} />
      </main>
    </div>
  );
}

export default function LeadDetailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-sm text-slate-400">Loading details page...</p>
        </div>
      </div>
    }>
      <LeadDetailInner />
    </Suspense>
  );
}

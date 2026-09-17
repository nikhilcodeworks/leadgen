'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Save,
  Building2,
  MapPin,
  Star,
  Sparkles,
  Phone,
  Globe,
  MessageSquare,
  Calendar,
  Layers,
  FileText,
  Loader2
} from 'lucide-react';
import { LeadRecord } from '@/app/page';

export interface EditLeadModalProps {
  isOpen: boolean;
  lead: LeadRecord | null;
  fileName?: string | null;
  isLoading?: boolean;
  onClose: () => void;
  onSave: (updatedLead: LeadRecord, updates: Record<string, any>) => Promise<void> | void;
}

export default function EditLeadModal({
  isOpen,
  lead,
  fileName,
  isLoading = false,
  onClose,
  onSave
}: EditLeadModalProps) {
  // Form State
  const [businessName, setBusinessName] = useState('');
  const [category, setCategory] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('Yes');
  const [website, setWebsite] = useState('');
  const [city, setCity] = useState('');
  const [locality, setLocality] = useState('');
  const [fullAddress, setFullAddress] = useState('');
  const [googleRating, setGoogleRating] = useState<number | string>('');
  const [reviewCount, setReviewCount] = useState<number | string>('');
  const [leadScore, setLeadScore] = useState<number | string>('');
  const [leadTier, setLeadTier] = useState('Tier 2 (Medium)');
  const [contactMethod, setContactMethod] = useState('WhatsApp');
  const [outreachStatus, setOutreachStatus] = useState('Not Contacted');
  const [followUpDate, setFollowUpDate] = useState('');
  const [response, setResponse] = useState('');
  const [notes, setNotes] = useState('');

  const [activeTab, setActiveTab] = useState<'profile' | 'crm'>('profile');

  // Populate state when lead changes
  useEffect(() => {
    if (lead) {
      setBusinessName(lead["Business Name"] || '');
      setCategory(lead["Category"] || '');
      setPhone(lead["Phone"] ? String(lead["Phone"]) : '');
      setWhatsapp(lead["WhatsApp"] ? String(lead["WhatsApp"]) : 'Yes');
      setWebsite(lead["Website"] || '');
      setCity(lead["City"] || '');
      setLocality(lead["Locality"] || '');
      setFullAddress(lead["Full Address"] || '');
      setGoogleRating(lead["Google Rating"] !== null && lead["Google Rating"] !== undefined ? lead["Google Rating"] : '');
      setReviewCount(lead["Review Count"] !== null && lead["Review Count"] !== undefined ? lead["Review Count"] : '');
      setLeadScore(lead["Lead Score"] !== null && lead["Lead Score"] !== undefined ? lead["Lead Score"] : 50);
      setLeadTier(lead["Lead Tier"] || 'Tier 2 (Medium)');
      setContactMethod(lead["Contact Method"] || 'WhatsApp');
      setOutreachStatus(lead["Outreach Status"] || 'Not Contacted');
      setFollowUpDate(lead["Follow-up Date"] || '');
      setResponse(lead["Response"] || '');
      setNotes(lead["Notes"] || '');
      setActiveTab('profile');
    }
  }, [lead]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onClose]);

  if (!isOpen || !lead) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const updates: Record<string, any> = {
      "Business Name": businessName.trim() || lead["Business Name"],
      "Category": category.trim(),
      "Phone": phone.trim() || null,
      "WhatsApp": whatsapp,
      "Website": website.trim() || null,
      "City": city.trim() || null,
      "Locality": locality.trim() || null,
      "Full Address": fullAddress.trim() || null,
      "Google Rating": googleRating !== '' ? Number(googleRating) : null,
      "Review Count": reviewCount !== '' ? Number(reviewCount) : null,
      "Lead Score": leadScore !== '' ? Number(leadScore) : null,
      "Lead Tier": leadTier,
      "Contact Method": contactMethod,
      "Outreach Status": outreachStatus,
      "Follow-up Date": followUpDate || null,
      "Response": response.trim() || null,
      "Notes": notes.trim() || null
    };

    const updatedLead: LeadRecord = {
      ...lead,
      ...updates
    };

    await onSave(updatedLead, updates);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-md transition-opacity"
        onClick={() => {
          if (!isLoading) onClose();
        }}
      />

      {/* Modal Dialog */}
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-10 animate-scale-in my-8 flex flex-col max-h-[90vh]">
        {/* Ambient Top Glow */}
        <div className="absolute -top-16 -right-16 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">Edit Lead Details</h3>
                {lead["Lead ID"] && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    {lead["Lead ID"]}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Update business records and save changes directly to Excel spreadsheet
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              if (!isLoading) onClose();
            }}
            disabled={isLoading}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-6 pt-3 pb-0 bg-slate-950/40 border-b border-slate-800 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'profile'
                ? 'text-indigo-400 border-indigo-500 bg-slate-900/60'
                : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Business Profile & Info</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('crm')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'crm'
                ? 'text-emerald-400 border-emerald-500 bg-slate-900/60'
                : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-900/30'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>CRM, Scoring & Outreach</span>
          </button>
        </div>

        {/* Modal Form Content (Scrollable) */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'profile' ? (
            <div className="space-y-5">
              {/* 1. Business Info */}
              <div className="bg-slate-950/40 border border-slate-800/80 p-4 rounded-xl space-y-4">
                <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Business Information</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Business Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      required
                      placeholder="e.g. Gupta Realtors"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Category</label>
                    <input
                      type="text"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      placeholder="e.g. Real estate agency"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Phone Number</label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="e.g. 9910223322"
                        className="w-full pl-10 pr-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 font-mono transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Website</label>
                    <div className="relative">
                      <Globe className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="e.g. https://www.guptarealtors.com"
                        className="w-full pl-10 pr-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 font-mono transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">WhatsApp Available?</label>
                    <select
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-indigo-500 transition-all"
                    >
                      <option value="Yes">Yes (WhatsApp enabled)</option>
                      <option value="No">No</option>
                      <option value="Unknown">Unknown</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 2. Location */}
              <div className="bg-slate-950/40 border border-slate-800/80 p-4 rounded-xl space-y-4">
                <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Location & Address</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Locality / Sector</label>
                    <input
                      type="text"
                      value={locality}
                      onChange={(e) => setLocality(e.target.value)}
                      placeholder="e.g. Dwarka"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">City</label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="e.g. New Delhi"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Full Address</label>
                    <textarea
                      rows={2}
                      value={fullAddress}
                      onChange={(e) => setFullAddress(e.target.value)}
                      placeholder="e.g. Kothi no, 485 & 486, Sector 19, Dwarka, New Delhi..."
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-xs leading-relaxed focus:outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Ratings */}
              <div className="bg-slate-950/40 border border-slate-800/80 p-4 rounded-xl space-y-4">
                <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                  <Star className="w-3.5 h-3.5 text-amber-400" />
                  <span>Google Maps Rating & Reviews</span>
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Google Rating (0 - 5)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="5"
                      value={googleRating}
                      onChange={(e) => setGoogleRating(e.target.value)}
                      placeholder="e.g. 4.8"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 font-mono transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Review Count</label>
                    <input
                      type="number"
                      min="0"
                      value={reviewCount}
                      onChange={(e) => setReviewCount(e.target.value)}
                      placeholder="e.g. 610"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 font-mono transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* 1. Lead Score & Tier */}
              <div className="bg-slate-950/40 border border-slate-800/80 p-4 rounded-xl space-y-4">
                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Lead Evaluation & Tier</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Lead Score (0 - 100)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={leadScore}
                      onChange={(e) => setLeadScore(e.target.value)}
                      placeholder="e.g. 50"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm font-mono focus:outline-none focus:border-emerald-500 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Lead Tier</label>
                    <select
                      value={leadTier}
                      onChange={(e) => setLeadTier(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-emerald-500 transition-all"
                    >
                      <option value="Tier 1 (High)">🟢 Tier 1 (High Potential)</option>
                      <option value="Tier 2 (Medium)">🟡 Tier 2 (Medium Fit)</option>
                      <option value="Tier 3 (Low)">🔴 Tier 3 (Low Priority)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 2. Outreach Status */}
              <div className="bg-slate-950/40 border border-slate-800/80 p-4 rounded-xl space-y-4">
                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5" />
                  <span>Outreach & CRM Channel</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Contact Method</label>
                    <select
                      value={contactMethod}
                      onChange={(e) => setContactMethod(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-emerald-500 transition-all"
                    >
                      <option value="WhatsApp">WhatsApp</option>
                      <option value="Call">Phone Call</option>
                      <option value="Email">Email</option>
                      <option value="Instagram">Instagram DM</option>
                      <option value="Facebook">Facebook Messenger</option>
                      <option value="In-Person">In-Person Visit</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Outreach Status</label>
                    <select
                      value={outreachStatus}
                      onChange={(e) => setOutreachStatus(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-emerald-500 transition-all"
                    >
                      <option value="Not Contacted">Not Contacted</option>
                      <option value="Contacted">Contacted</option>
                      <option value="Follow-up Needed">Follow-up Needed</option>
                      <option value="In Discussion">In Discussion</option>
                      <option value="Interested">Interested / Qualified</option>
                      <option value="Closed">Deal Closed / Won</option>
                      <option value="Not Interested">Not Interested</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Follow-up Date</label>
                    <div className="relative">
                      <input
                        type="date"
                        value={followUpDate}
                        onChange={(e) => setFollowUpDate(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white text-sm focus:outline-none focus:border-emerald-500 font-mono transition-all"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Client Response</label>
                    <input
                      type="text"
                      value={response}
                      onChange={(e) => setResponse(e.target.value)}
                      placeholder="e.g. Call back on Monday, interested in website redesign"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 transition-all"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Notes & Review Details</label>
                    <textarea
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add conversation notes, owner remarks, follow-up logs..."
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700/80 text-white placeholder-slate-500 text-xs leading-relaxed focus:outline-none focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              Target File: <code className="text-slate-400 font-mono">{fileName || 'Active Dataset'}</code>
            </span>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!isLoading) onClose();
                }}
                disabled={isLoading}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isLoading}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/25 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving to Excel...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save to Excel</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

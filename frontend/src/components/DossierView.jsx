// src/components/DossierView.jsx
import React, { useState, useEffect } from 'react';
import { 
  FileText, Shield, MapPin, User, Scale, Gavel, 
  AlertOctagon, CheckCircle2, FileCheck, Landmark, 
  Calendar, Loader2, Download, Clock
} from 'lucide-react';
import { useStore } from '../store';

export const formatForensicDate = (rawStr, includeTime = false) => {
  if (!rawStr || rawStr === 'UNKNOWN_TIME' || rawStr === 'N/A') return 'DATE PENDING';
  const cleanStr = String(rawStr).trim().replace(' ', 'T');
  const d = new Date(cleanStr);
  if (isNaN(d.getTime())) return String(rawStr);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(includeTime ? { hour: '2-digit', minute: '2-digit', hour12: true } : {})
  });
};

export default function DossierView() {
  const { activeCaseId, setSelectedNode } = useStore();
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!activeCaseId) return;
    let isMounted = true;
    setLoading(true);
    fetch(`http://127.0.0.1:8000/api/dossier-timeline/${encodeURIComponent(activeCaseId)}`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => {
        if (isMounted) {
          setTimeline(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error(err);
        if (isMounted) setLoading(false);
      });
    return () => { isMounted = false; };
  }, [activeCaseId]);

  const handleDownloadDossier = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/dossier/${encodeURIComponent(activeCaseId)}`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Statutory_Dossier_${activeCaseId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error(err);
      alert("PDF download failed");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center space-y-3 bg-zinc-950 font-mono">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        <span className="text-xs text-emerald-500/80">
          RECONSTRUCTING CCTNS STATUTORY IIF 1-7 TIMELINE FOR [{activeCaseId}]...
        </span>
      </div>
    );
  }

  if (!timeline || !timeline.case) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 space-y-2 bg-zinc-950 font-mono">
        <FileText className="w-8 h-8 opacity-40 text-amber-500" />
        <p className="text-xs">NO PROCEDURAL CCTNS ENTRIES FOR THIS CASE</p>
      </div>
    );
  }

  const { case: caseInfo, iif1_fir, iif2_crime_detail, iif3_arrests, iif4_seizures, iif5_chargesheet, iif6_disposal, iif7_appeal, criminal_history } = timeline;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-zinc-950 text-zinc-300 font-mono p-6 space-y-6">
      {/* Top Header Strip with Synchronized Incident Timelines */}
      <div className="grid grid-cols-5 gap-3 shrink-0">
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-500 text-[10px]">
            <span>e-COURT CNR</span>
            <Scale className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xs font-bold text-zinc-100 mt-1 truncate">
            {caseInfo.icjs_cnr_number || 'ICJS-PENDING'}
          </div>
          <span className="text-[9px] text-zinc-500">ICJS Integrated Registry</span>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-500 text-[10px]">
            <span>PRECINCT JURISDICTION</span>
            <MapPin className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xs font-bold text-zinc-200 mt-1 truncate">
            {caseInfo.police_station}, {caseInfo.district}
          </div>
          <span className="text-[9px] text-zinc-500">State: {caseInfo.state || 'National Grid'}</span>
        </div>

        <div className="bg-zinc-900/60 border border-emerald-500/20 bg-emerald-950/5 rounded-lg p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-400 text-[10px]">
            <span>INCIDENT PERIOD</span>
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xs font-bold text-emerald-300 mt-1 truncate">
            {formatForensicDate(caseInfo.incident_date_from || iif1_fir?.incident_date_from)}
          </div>
          <span className="text-[9px] text-zinc-500 truncate">
            To: {formatForensicDate(caseInfo.incident_date_to || iif1_fir?.incident_date_to) || 'Single Occurrence'}
          </span>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-500 text-[10px]">
            <span>CASE DIARY MASTER</span>
            <Calendar className="w-3.5 h-3.5 text-emerald-500" />
          </div>
          <div className="text-xs font-bold text-zinc-200 mt-1 truncate">
            {formatForensicDate(caseInfo.date_reported || iif1_fir?.date_reported, true)}
          </div>
          <span className="text-[9px] text-zinc-500">IO Badge: {caseInfo.investigating_officer_badge}</span>
        </div>

        <div className="bg-zinc-900/60 border border-emerald-500/30 rounded-lg p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-400 text-[10px]">
            <span>STATUTORY COMPLIANCE</span>
            <FileCheck className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-[11px] font-bold text-emerald-300 mt-1">
            BSA §63(4) CERTIFIED
          </div>
          <button
            onClick={handleDownloadDossier}
            disabled={downloading}
            className="mt-1 py-1 px-2 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 text-[10px] font-bold rounded flex items-center justify-center space-x-1"
          >
            <Download className="w-3 h-3" />
            <span>{downloading ? 'GENERATING...' : 'EXPORT DOSSIER'}</span>
          </button>
        </div>
      </div>

      {/* Main Procedural Timeline Stream */}
      <div className="flex-1 overflow-y-auto pr-2 space-y-6">
        {criminal_history && (
          <div className="p-4 bg-red-950/20 border border-red-800/60 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-red-400 flex items-center">
                <AlertOctagon className="w-4 h-4 mr-2" /> STATE CID HABITUAL OFFENDER RECORD (SEC 111 BNS)
              </span>
              <span className="text-[10px] bg-red-900/60 text-red-200 px-2 py-0.5 rounded border border-red-700">
                {criminal_history.state_crime_record_num}
              </span>
            </div>
            <p className="text-xs text-zinc-300">{criminal_history.history_sheet_narrative}</p>
          </div>
        )}

        {/* Step 1: IIF-1 FIR */}
        {iif1_fir && (
          <div className="border border-zinc-800 bg-zinc-900/40 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold">
                  IIF-1 : FIRST INFORMATION REPORT
                </span>
                <span className="text-xs font-bold text-zinc-200">FIR NO: {iif1_fir.fir_number}</span>
              </div>
              <div className="text-[10px] text-zinc-400 flex items-center space-x-3">
                <span className="flex items-center">
                  <Calendar className="w-3 h-3 mr-1 text-emerald-400" /> Reported: {formatForensicDate(iif1_fir.date_reported, true)}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-[10px] text-zinc-500 block mb-1">COMPLAINANT / VICTIM</span>
                <p 
                  onClick={() => setSelectedNode({ id: 'VICTIM:COMPLAINANT', name: iif1_fir.complainant_name, type: 'COMPLAINANT', status: 'VERIFIED COMPLAINANT / VICTIM', riskScore: '0.0', district: caseInfo.district })}
                  className="font-semibold text-emerald-400 cursor-pointer hover:underline"
                >
                  {iif1_fir.complainant_name}
                </p>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 block mb-1">STATUTORY SECTIONS ENFORCED</span>
                <span className="px-2 py-0.5 bg-zinc-800 text-amber-300 rounded font-bold text-[11px] border border-zinc-700">
                  {iif1_fir.bns_sections}
                </span>
              </div>
            </div>
            <p className="text-xs text-zinc-400 bg-zinc-950 p-2.5 rounded border border-zinc-900">
              "{iif1_fir.incident_narrative}"
            </p>
          </div>
        )}

        {/* Step 3: IIF-3 Arrests */}
        {iif3_arrests && iif3_arrests.length > 0 && (
          <div className="border border-zinc-800 bg-zinc-900/40 rounded-lg p-4 space-y-3">
            <span className="px-2 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/30 rounded text-[10px] font-bold inline-block">
              IIF-3 : ARREST MEMO & SURETY COUNSEL
            </span>
            {iif3_arrests.map((arr, idx) => (
              <div key={idx} className="p-3 bg-zinc-950 border border-zinc-800/80 rounded space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <strong className="text-zinc-100 text-sm">{arr.suspect_legal_name}</strong>
                    <span className="text-zinc-500 text-[11px] ml-2">({arr.alias_urf})</span>
                  </div>
                  <span className="text-[10px] text-zinc-400 font-mono">{formatForensicDate(arr.date_time_arrest, true)}</span>
                </div>
                <p className="text-zinc-400 text-[11px]">{arr.grounds_of_arrest}</p>
              </div>
            ))}
          </div>
        )}

        {/* Step 5: Chargesheet */}
        {iif5_chargesheet && (
          <div className="border border-zinc-800 bg-zinc-900/40 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
              <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/30 rounded text-[10px] font-bold">
                IIF-5 : FINAL CHARGESHEET REPORT
              </span>
              <span className="text-xs font-bold text-zinc-200">CS NUMBER: {iif5_chargesheet.chargesheet_number}</span>
            </div>
            <div className="text-xs">
              <p className="text-zinc-300 font-semibold">{iif5_chargesheet.court_name}</p>
              <p className="text-zinc-500 text-[11px] mt-0.5">
                Cognizance Date: <strong className="text-zinc-300">{formatForensicDate(iif5_chargesheet.court_cognizance_date)}</strong> | Sent Up Under: <strong className="text-amber-400">{iif5_chargesheet.sections_sent_up}</strong>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
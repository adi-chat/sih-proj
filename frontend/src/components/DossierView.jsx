import React, { useState, useEffect, useRef } from "react";
import {
  FileText,
  Shield,
  MapPin,
  User,
  Scale,
  Gavel,
  AlertOctagon,
  CheckCircle2,
  FileCheck,
  Landmark,
  Calendar,
  Loader2,
  Download,
  Clock,
} from "lucide-react";
import { useStore } from "../store";
import LetterGlitch from "./ui/LetterGlitch";
import DitherVeil from "./ui/DitherVeil";
import panoptesEye from "../assets/panoptes-eye.jpg";

export const formatForensicDate = (rawStr, includeTime = false) => {
  if (!rawStr || rawStr === "UNKNOWN_TIME" || rawStr === "N/A")
    return "DATE PENDING";
  const cleanStr = String(rawStr).trim().replace(" ", "T");
  const d = new Date(cleanStr);
  if (isNaN(d.getTime())) return String(rawStr);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(includeTime
      ? { hour: "2-digit", minute: "2-digit", hour12: true }
      : {}),
  });
};

export default function DossierView() {
  const { activeCaseId, setSelectedNode } = useStore();
  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const timelineContainerRef = useRef(null);

  useEffect(() => {
    if (!activeCaseId) return;
    let isMounted = true;
    setLoading(true);
    fetch(
      `http://127.0.0.1:8000/api/dossier-timeline/${encodeURIComponent(activeCaseId)}`,
    )
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
    return () => {
      isMounted = false;
    };
  }, [activeCaseId]);

  const handleDownloadDossier = async () => {
    setDownloading(true);
    try {
      const res = await fetch(
        `http://127.0.0.1:8000/api/dossier/${encodeURIComponent(activeCaseId)}`,
      );
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
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
      <div className="relative flex-1 flex flex-col items-center justify-center space-y-4 bg-black font-mono overflow-hidden">
        <div className="absolute inset-0 z-0 pointer-events-none opacity-20 select-none overflow-hidden">
          <LetterGlitch
            glitchColors={[
              "#18181b",
              "#27272a",
              "#3f3f46",
              "#52525b",
              "#71717a",
            ]}
            glitchSpeed={80}
            centerVignette={false}
            outerVignette={true}
            smooth={true}
            backgroundColor="#000000"
          />
        </div>
        <div className="relative z-10 flex flex-col items-center space-y-3">
          <Loader2 className="w-9 h-9 animate-spin text-white" />
          <span className="text-sm font-semibold text-zinc-300 tracking-wider">
            RECONSTRUCTING CCTNS STATUTORY IIF 1-7 TIMELINE FOR [{activeCaseId}
            ]...
          </span>
        </div>
      </div>
    );
  }

  if (!timeline || !timeline.case) {
    return (
      <div className="relative flex-1 flex flex-col items-center justify-center text-zinc-500 space-y-3 bg-black font-mono overflow-hidden">
        <div className="absolute inset-0 z-0 pointer-events-none opacity-20 select-none overflow-hidden">
          <LetterGlitch
            glitchColors={[
              "#18181b",
              "#27272a",
              "#3f3f46",
              "#52525b",
              "#71717a",
            ]}
            glitchSpeed={80}
            centerVignette={false}
            outerVignette={true}
            smooth={true}
            backgroundColor="#000000"
          />
        </div>
        <div className="relative z-10 flex flex-col items-center space-y-2">
          <FileText className="w-10 h-10 opacity-30 text-white" />
          <p className="text-sm font-display font-bold tracking-[0.14em] uppercase text-zinc-400">
            NO PROCEDURAL CCTNS ENTRIES FOR THIS CASE
          </p>
        </div>
      </div>
    );
  }

  const {
    case: caseInfo,
    iif1_fir,
    iif3_arrests,
    iif5_chargesheet,
    criminal_history,
  } = timeline;

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden bg-black text-white select-none">
      {/* 1. Constant Ambient Slow Glitch Backdrop */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-25 select-none overflow-hidden">
        <LetterGlitch
          glitchColors={[
            "#1f1f23",
            "#27272a",
            "#3f3f46",
            "#52525b",
            "#71717a",
            "#a1a1aa",
          ]}
          glitchSpeed={75}
          centerVignette={false}
          outerVignette={true}
          smooth={true}
          backgroundColor="#000000"
        />
      </div>

      {/* 2. Glassmorphic Procedural Containers */}
      <div className="relative z-10 flex-1 flex flex-col h-full overflow-hidden p-6 space-y-6">
        {/* Top Header Metrics Strip */}
        <div className="grid grid-cols-5 gap-4 shrink-0 font-mono">
          {/* Card 1: e-COURT CNR */}
          <div className="bg-black/65 border border-sky-500/25 hover:border-sky-500/45 rounded-xl p-3.5 flex flex-col justify-between backdrop-blur-2xl shadow-xl transition-colors">
            <div className="flex items-center justify-between text-sky-400 text-xs font-display font-bold tracking-wider uppercase">
              <span>e-COURT CNR</span>
              <Scale className="w-4 h-4 text-sky-400" />
            </div>
            <div className="text-sm font-bold text-white mt-1.5 truncate tracking-wide font-mono">
              {caseInfo.icjs_cnr_number || "ICJS-PENDING"}
            </div>
            <span className="text-xs text-zinc-500 mt-1 font-sans">
              ICJS Integrated Registry
            </span>
          </div>

          {/* Card 2: Jurisdiction */}
          <div className="bg-black/65 border border-amber-500/25 hover:border-amber-500/45 rounded-xl p-3.5 flex flex-col justify-between backdrop-blur-2xl shadow-xl transition-colors">
            <div className="flex items-center justify-between text-amber-400 text-xs font-display font-bold tracking-wider uppercase">
              <span>PRECINCT JURISDICTION</span>
              <MapPin className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-sm font-bold text-white mt-1.5 truncate font-mono">
              {caseInfo.police_station}, {caseInfo.district}
            </div>
            <span className="text-xs text-zinc-500 mt-1 font-sans">
              State: {caseInfo.state || "National Grid"}
            </span>
          </div>

          {/* Card 3: Incident Period */}
          <div className="bg-black/65 border border-rose-500/25 hover:border-rose-500/45 rounded-xl p-3.5 flex flex-col justify-between backdrop-blur-2xl shadow-xl transition-colors">
            <div className="flex items-center justify-between text-rose-400 text-xs font-display font-bold tracking-wider uppercase">
              <span>INCIDENT PERIOD</span>
              <Clock className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-sm font-bold text-rose-200 mt-1.5 truncate font-mono">
              {formatForensicDate(
                caseInfo.incident_date_from || iif1_fir?.incident_date_from,
              )}
            </div>
            <span className="text-xs text-zinc-400 mt-1 truncate font-sans">
              To:{" "}
              {formatForensicDate(
                caseInfo.incident_date_to || iif1_fir?.incident_date_to,
              ) || "Single Occurrence"}
            </span>
          </div>

          {/* Card 4: Case Diary */}
          <div className="bg-black/65 border border-purple-500/25 hover:border-purple-500/45 rounded-xl p-3.5 flex flex-col justify-between backdrop-blur-2xl shadow-xl transition-colors">
            <div className="flex items-center justify-between text-purple-400 text-xs font-display font-bold tracking-wider uppercase">
              <span>CASE DIARY MASTER</span>
              <Calendar className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-sm font-bold text-white mt-1.5 truncate font-mono">
              {formatForensicDate(
                caseInfo.date_reported || iif1_fir?.date_reported,
                true,
              )}
            </div>
            <span className="text-xs text-zinc-500 mt-1 font-sans">
              IO Badge: {caseInfo.investigating_officer_badge}
            </span>
          </div>

          {/* Card 5: Statutory Compliance */}
          <div className="bg-black/65 border border-emerald-500/30 hover:border-emerald-500/50 rounded-xl p-3.5 flex flex-col justify-between backdrop-blur-2xl shadow-xl transition-colors">
            <div className="flex items-center justify-between text-emerald-400 text-xs font-display font-bold tracking-wider uppercase">
              <span>COMPLIANCE</span>
              <FileCheck className="w-4 h-4 text-emerald-400" />
            </div>

            <div className="text-xs font-bold text-white mt-1 uppercase font-display tracking-wider">
              BSA SEC 63(4) CERTIFIED
            </div>

            <button
              onClick={handleDownloadDossier}
              disabled={downloading}
              className="mt-2 py-1.5 px-2.5 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-display font-bold tracking-wider uppercase rounded-md flex items-center justify-center space-x-1.5 transition-all active:scale-[0.98] export-breathe"
            >
              <Download className="w-3.5 h-3.5 text-black" />
              <span>{downloading ? "GENERATING..." : "EXPORT DOSSIER"}</span>
            </button>

            {/* Scoped keyframes for slow glow and scale breathing */}
            <style>{`
    @keyframes slowBreathe {
      0%, 100% {
        box-shadow: 0 0 8px rgba(52, 211, 153, 0.25);
        transform: scale(1);
        opacity: 0.9;
      }
      50% {
        box-shadow: 0 0 20px rgba(52, 211, 153, 0.65), 0 0 35px rgba(52, 211, 153, 0.3);
        transform: scale(1.02);
        opacity: 1;
      }
    }
    .export-breathe {
      animation: slowBreathe 3.6s ease-in-out infinite;
    }
  `}</style>
          </div>
        </div>

        {/* 3. Main Procedural Timeline Stream with Interactive DitherVeil Eye Background */}
        <div
          ref={timelineContainerRef}
          className="relative flex-1 overflow-hidden rounded-xl border border-white/15 bg-black/40 backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_16px_48px_rgba(0,0,0,0.6)] flex flex-col p-5"
        >
          {/* Centered Square DitherVeil Watermark */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-0 overflow-hidden">
            <div className="w-[380px] h-[380px] relative rounded-full overflow-hidden opacity-35 mix-blend-screen">
              <DitherVeil
                targetRef={timelineContainerRef}
                src={panoptesEye}
                fit="cover"
                pattern="floyd"
                palette="rgb"
                pixelSize={2}
                levels={2}
                inkColor="#000000"
                paperColor="#ffffff"
                contrast={1.4}
                brightness={0.0}
                revealRadius={160}
                softness={0.6}
                linger={1}
                rimColor="#ffffff"
                rim={0}
                wander={false}
                clickBurst={true}
              />
            </div>
          </div>

          {/* Timeline Scroll Surface */}
          <div className="relative z-10 flex-1 overflow-y-auto pr-2 space-y-6">
            {/* Criminal History Record */}
            {criminal_history && (
              <div className="p-5 bg-black/55 border border-rose-500/30 hover:border-rose-500/50 rounded-xl space-y-2.5 backdrop-blur-md shadow-xl transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-rose-400 flex items-center tracking-wide font-display uppercase">
                    <AlertOctagon className="w-4 h-4 mr-2 text-rose-400" />{" "}
                    STATE CID HABITUAL OFFENDER RECORD (SEC 111 BNS)
                  </span>
                  <span className="text-xs font-mono bg-rose-950/60 text-rose-200 border border-rose-500/40 px-2.5 py-1 rounded font-bold">
                    {criminal_history.state_crime_record_num}
                  </span>
                </div>
                <p className="text-sm text-zinc-300 leading-relaxed font-sans">
                  {criminal_history.history_sheet_narrative}
                </p>
              </div>
            )}

            {/* Step 1: IIF-1 FIR (Victim In Focus) */}
            {iif1_fir && (
              <div className="border border-sky-500/20 bg-black/50 backdrop-blur-md rounded-xl p-5 space-y-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center space-x-3">
                    <span className="px-2.5 py-1 rounded text-xs font-bold font-display uppercase tracking-wider bg-sky-500/10 text-sky-300 border border-sky-500/30">
                      IIF-1 : FIRST INFORMATION REPORT
                    </span>
                    <span className="text-sm font-bold text-white tracking-wide font-mono">
                      FIR NO: {iif1_fir.fir_number}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400 font-mono flex items-center space-x-3">
                    <span className="flex items-center">
                      <Calendar className="w-3.5 h-3.5 mr-1.5 text-zinc-400" />
                      Reported:{" "}
                      {formatForensicDate(iif1_fir.date_reported, true)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 text-sm font-sans">
                  <div>
                    <span className="text-xs text-zinc-400 font-display block mb-1 uppercase font-bold tracking-wider">
                      COMPLAINANT / VICTIM
                    </span>
                    <p
                      onClick={() =>
                        setSelectedNode({
                          id: "VICTIM:COMPLAINANT",
                          name: iif1_fir.complainant_name,
                          type: "COMPLAINANT",
                          status: "VERIFIED COMPLAINANT / VICTIM",
                          riskScore: "0.0",
                          district: caseInfo.district,
                        })
                      }
                      className="font-bold text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.35)] text-lg cursor-pointer hover:underline tracking-tight"
                    >
                      {iif1_fir.complainant_name}
                    </p>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-400 font-display block mb-1 uppercase font-bold tracking-wider">
                      STATUTORY SECTIONS ENFORCED
                    </span>
                    <span className="px-3 py-1 bg-amber-500/10 text-amber-300 rounded font-bold text-xs border border-amber-500/30 font-mono inline-block">
                      {iif1_fir.bns_sections}
                    </span>
                  </div>
                </div>

                <p className="text-sm text-zinc-300 bg-black/60 p-3.5 rounded-lg border border-white/10 leading-relaxed font-mono">
                  "{iif1_fir.incident_narrative}"
                </p>
              </div>
            )}

            {/* Step 3: IIF-3 Arrests (Suspects / Accused) */}
            {iif3_arrests && iif3_arrests.length > 0 && (
              <div className="border border-orange-500/20 bg-black/50 backdrop-blur-md rounded-xl p-5 space-y-4 shadow-xl">
                <span className="px-2.5 py-1 rounded text-xs font-bold font-display uppercase tracking-wider bg-orange-500/10 text-orange-300 border border-orange-500/30 inline-block">
                  IIF-3 : ARREST MEMO & SURETY COUNSEL
                </span>
                <div className="space-y-3">
                  {iif3_arrests.map((arr, idx) => (
                    <div
                      key={idx}
                      className="p-4 bg-black/65 border border-white/10 rounded-lg space-y-2 text-sm backdrop-blur-sm hover:border-orange-500/30 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <strong className="text-orange-400 drop-shadow-[0_0_10px_rgba(251,146,60,0.35)] text-base font-sans font-bold">
                            {arr.suspect_legal_name}
                          </strong>
                          <span className="text-zinc-400 text-xs ml-2 font-mono">
                            ({arr.alias_urf})
                          </span>
                        </div>
                        <span className="text-xs text-zinc-400 font-mono">
                          {formatForensicDate(arr.date_time_arrest, true)}
                        </span>
                      </div>
                      <p className="text-zinc-300 text-xs leading-relaxed font-mono">
                        {arr.grounds_of_arrest}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 5: Chargesheet */}
            {iif5_chargesheet && (
              <div className="border border-purple-500/20 bg-black/50 backdrop-blur-md rounded-xl p-5 space-y-3 shadow-xl">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <span className="px-2.5 py-1 rounded text-xs font-bold font-display uppercase tracking-wider bg-purple-500/10 text-purple-300 border border-purple-500/30">
                    IIF-5 : FINAL CHARGESHEET REPORT
                  </span>
                  <span className="text-sm font-bold text-white font-mono">
                    CS NUMBER: {iif5_chargesheet.chargesheet_number}
                  </span>
                </div>
                <div className="text-sm space-y-1.5 font-sans">
                  <p className="text-white font-bold text-base">
                    {iif5_chargesheet.court_name}
                  </p>
                  <p className="text-zinc-400 text-xs font-mono">
                    Cognizance Date:{" "}
                    <strong className="text-white">
                      {formatForensicDate(
                        iif5_chargesheet.court_cognizance_date,
                      )}
                    </strong>{" "}
                    | Sent Up Under:{" "}
                    <strong className="text-amber-300">
                      {iif5_chargesheet.sections_sent_up}
                    </strong>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

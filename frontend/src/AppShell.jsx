import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  Network,
  FileText,
  Activity,
  Database,
  ChevronRight,
  ScanLine,
  Download,
  AlertOctagon,
  MapPin,
  UserCheck,
  Globe,
  ChevronDown,
  Upload,
  X,
  FileUp,
  CheckCircle2,
  LogIn,
  LogOut,
  KeyRound,
  User,
  Boxes,
  RotateCcw,
  CircleDot,
  Crosshair,
  BrainCircuit,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useStore } from "./store";
import PanoptesLogo from "./components/ui/PanoptesLogo";
import SplitFlapText from "./components/ui/SplitFlapText";
import TargetCursor from "./components/ui/TargetCursor";
import AsciiDecryptedText from "./components/ui/AsciiDecryptedText";
import TiltCard from "./components/ui/TiltCard";

const SCOPE_OPTIONS = [
  { value: "national", label: "NATIONAL GRID" },
  { value: "state", label: "STATE LEVEL" },
  { value: "district", label: "DISTRICT LEVEL" },
  { value: "precinct", label: "PRECINCT LOCAL" },
];

export default function AppShell({ children }) {
  const {
    isAuthenticated,
    login,
    logout,
    activeCaseId,
    setActiveCase,
    operatorBadge,
    inspectorOpen,
    toggleInspector,
    activeModule,
    setModule,
    selectedNode,
    setSelectedNode,
    routeOrigin,
    routeTarget,
    setRouteOrigin,
    setRouteTarget,
    jurisdictionScope,
    setJurisdictionScope,
    evidenceMode,
    resetToDatabaseMode,
    hiddenNodes = [],
    restoreNode,
    restoreAllNodes,
    trayOpen,
    setTrayOpen,
  } = useStore();

  const trayRef = useRef(null);
  const trayBtnRef = useRef(null);
  const scopeDropdownRef = useRef(null);
  const fileInputRef = useRef(null);

  const [searchInput, setSearchInput] = useState(activeCaseId || "");
  const [downloading, setDownloading] = useState(false);
  const [archetypeData, setArchetypeData] = useState(null);
  const [showHopfieldScore, setShowHopfieldScore] = useState(false);
  const [loadingArchetype, setLoadingArchetype] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);

  useEffect(() => {
    setSearchInput(activeCaseId || "");
  }, [activeCaseId]);

  useEffect(() => {
    if (!activeCaseId || !isAuthenticated) {
      setArchetypeData(null);
      return;
    }
    let isMounted = true;
    setLoadingArchetype(true);
    fetch(
      `http://127.0.0.1:8000/api/ai/archetype/${encodeURIComponent(activeCaseId)}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (isMounted) {
          setArchetypeData(data);
          setLoadingArchetype(false);
        }
      })
      .catch((err) => {
        console.error("[Hopfield Classification Error]:", err);
        if (isMounted) {
          setArchetypeData(null);
          setLoadingArchetype(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [activeCaseId, isAuthenticated]);

  useEffect(() => {
    if (!trayOpen && !scopeMenuOpen) return;
    const handleClickOutside = (e) => {
      if (
        scopeDropdownRef.current &&
        !scopeDropdownRef.current.contains(e.target)
      ) {
        setScopeMenuOpen(false);
      }
      if (
        trayOpen &&
        trayRef.current &&
        !trayRef.current.contains(e.target) &&
        trayBtnRef.current &&
        !trayBtnRef.current.contains(e.target)
      ) {
        setTrayOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [trayOpen, scopeMenuOpen, setTrayOpen]);

  const handleRestoreNode = (id) => {
    restoreNode(id);
    const iframe = document.querySelector("iframe");
    if (iframe) {
      iframe.contentWindow?.postMessage(
        { type: "RESTORE_NODE", payload: id },
        "*",
      );
    }
  };

  const handleRestoreAllNodes = () => {
    restoreAllNodes();
    const iframe = document.querySelector("iframe");
    if (iframe) {
      iframe.contentWindow?.postMessage({ type: "RESTORE_ALL_NODES" }, "*");
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (!isAuthenticated || evidenceMode === "uploaded") return;
    const cleanId = searchInput.trim().toUpperCase();
    if (cleanId) {
      if (setSelectedNode) setSelectedNode(null);
      setTrayOpen(false);
      useStore.setState({ inspectorOpen: false });
      setActiveCase(cleanId);
    }
  };

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    if (loginUsername.trim() === "turbo" && loginPassword === "torpedo") {
      login("turbo", "");
    } else {
      alert("Access Denied: Invalid Badge ID or Access Key.");
    }
  };

  const handleDownloadTargetRapSheet = async (nodeId, nodeName) => {
    setDownloading(true);
    try {
      const cleanId = encodeURIComponent(String(nodeId).trim());
      const res = await fetch(
        `http://127.0.0.1:8000/api/dossier/target/${cleanId}`,
      );
      if (!res.ok) throw new Error("Target rap sheet failed on server");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `RapSheet_${(nodeName || "Target").replace(/\s+/g, "_")}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error(err);
      alert("Target rap sheet compilation failed.");
    } finally {
      setDownloading(false);
    }
  };

  const handleExitExhibitMode = async () => {
    try {
      await fetch("http://127.0.0.1:8000/api/exhibits/reset", {
        method: "POST",
      });
    } catch (err) {
      console.error("Failed to reset backend exhibit stream:", err);
    } finally {
      resetToDatabaseMode();
      setSearchInput("");
      setJurisdictionScope("national");
      const iframe = document.querySelector("iframe");
      if (iframe) iframe.src = "about:blank";
    }
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 11) {
      alert("Maximum 11 exhibit files can be uploaded at once.");
      setSelectedFiles(files.slice(0, 11));
    } else {
      setSelectedFiles(files);
    }
  };

  const handleUploadSubmit = async (e) => {
    e.preventDefault();
    if (selectedFiles.length === 0) {
      alert("Select at least 1 evidence file (.csv or .txt)");
      return;
    }
    setUploading(true);
    const formData = new FormData();
    selectedFiles.forEach((file, index) => {
      formData.append(`file${index + 1}`, file);
    });
    try {
      const targetId = "CASE-FIELD-INGEST";
      const res = await fetch(
        `http://127.0.0.1:8000/api/analyze-all/${targetId}`,
        {
          method: "POST",
          body: formData,
        },
      );
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.detail || `Upload failed with HTTP ${res.status}`,
        );
      }
      const data = await res.json();
      useStore.setState({
        activeCaseId: targetId,
        evidenceMode: "uploaded",
        uploadedExhibitHash: data.sha256_exhibit_hash,
        uploadedFiles: selectedFiles,
        uploadedEntityMap: data.entity_map || {},
        selectedNode: null,
        trayOpen: false,
        inspectorOpen: false,
      });
      setUploadModalOpen(false);
      setSelectedFiles([]);
      const iframe = document.querySelector("iframe");
      if (iframe) {
        iframe.src = `http://127.0.0.1:8000/static/crime_network_visualization.html?t=${Date.now()}`;
      }
    } catch (err) {
      console.error(err);
      alert(`Evidence Ingestion Error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const getTargetNameColorClass = () => {
    if (!selectedNode) return "text-white";
    const type = String(selectedNode.type || "").toUpperCase();
    const status = String(selectedNode.status || "").toUpperCase();
    const idStr = String(selectedNode.id || "");
    const risk = Number(selectedNode.riskScore) || 0;

    if (
      type.includes("COMPLAINANT") ||
      type.includes("VICTIM") ||
      status.includes("VICTIM") ||
      status.includes("PROTECTED") ||
      idStr.includes("888888")
    ) {
      return "text-emerald-400 drop-shadow-[0_0_12px_rgba(52,211,153,0.45)]";
    }

    if (
      status.includes("MASTERMIND") ||
      status.includes("APEX") ||
      type.includes("MASTERMIND") ||
      (type === "PERSON" && risk >= 70)
    ) {
      return "text-rose-500 drop-shadow-[0_0_12px_rgba(244,63,94,0.45)]";
    }

    if (type.includes("ATM") || status.includes("SHATTER")) {
      return "text-rose-400 drop-shadow-[0_0_12px_rgba(251,113,133,0.45)]";
    }

    if (
      type === "PERSON" ||
      type.includes("SUSPECT") ||
      status.includes("SUSPECT") ||
      status.includes("ACCUSED") ||
      status.includes("SURETY") ||
      status.includes("BROKER")
    ) {
      return "text-orange-400 drop-shadow-[0_0_12px_rgba(251,146,60,0.45)]";
    }

    if (
      type.includes("ACCOUNT") ||
      type.includes("UPI") ||
      type.includes("MULE")
    ) {
      return "text-purple-400 drop-shadow-[0_0_12px_rgba(192,132,252,0.45)]";
    }

    if (
      type.includes("PHONE") ||
      type.includes("MSISDN") ||
      type.includes("CDR")
    ) {
      return "text-sky-400 drop-shadow-[0_0_12px_rgba(56,189,248,0.45)]";
    }

    if (
      type.includes("CELL") ||
      type.includes("TOWER") ||
      type.includes("CGI")
    ) {
      return "text-teal-400 drop-shadow-[0_0_12px_rgba(45,212,191,0.45)]";
    }

    if (type.includes("VEHICLE")) {
      return "text-slate-300 drop-shadow-[0_0_10px_rgba(203,213,225,0.35)]";
    }

    return "text-orange-400 drop-shadow-[0_0_12px_rgba(251,146,60,0.4)]";
  };

  const getNodeDrawerStyles = (node) => {
    const type = String(node.type || "").toUpperCase();
    const status = String(node.status || "").toUpperCase();
    const idStr = String(node.id || "");
    const risk = Number(node.riskScore) || 0;

    if (
      type.includes("COMPLAINANT") ||
      type.includes("VICTIM") ||
      status.includes("VICTIM") ||
      status.includes("PROTECTED") ||
      idStr.includes("888888")
    ) {
      return {
        card: "border-emerald-500/30 bg-emerald-950/20 hover:border-emerald-500/55",
        dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.85)]",
        name: "text-emerald-300",
        typeText: "text-emerald-400 font-bold",
        badge: "text-emerald-300 bg-emerald-500/15 border-emerald-500/30",
      };
    }

    if (
      status.includes("MASTERMIND") ||
      status.includes("APEX") ||
      type.includes("MASTERMIND") ||
      (type === "PERSON" && risk >= 70)
    ) {
      return {
        card: "border-rose-500/35 bg-rose-950/25 hover:border-rose-500/60",
        dot: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)]",
        name: "text-rose-300",
        typeText: "text-rose-400 font-bold",
        badge: "text-rose-300 bg-rose-500/20 border-rose-500/40",
      };
    }

    if (type.includes("ATM") || status.includes("SHATTER")) {
      return {
        card: "border-rose-400/30 bg-rose-950/20 hover:border-rose-400/50",
        dot: "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.85)]",
        name: "text-rose-300",
        typeText: "text-rose-400 font-bold",
        badge: "text-rose-300 bg-rose-400/15 border-rose-400/30",
      };
    }

    if (
      type === "PERSON" ||
      type.includes("SUSPECT") ||
      status.includes("SUSPECT") ||
      status.includes("ACCUSED") ||
      status.includes("SURETY") ||
      status.includes("BROKER")
    ) {
      return {
        card: "border-orange-500/30 bg-orange-950/20 hover:border-orange-500/55",
        dot: "bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.85)]",
        name: "text-orange-300",
        typeText: "text-orange-400 font-bold",
        badge: "text-orange-300 bg-orange-500/15 border-orange-500/30",
      };
    }

    if (
      type.includes("ACCOUNT") ||
      type.includes("UPI") ||
      type.includes("MULE")
    ) {
      return {
        card: "border-purple-500/30 bg-purple-950/20 hover:border-purple-500/55",
        dot: "bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.85)]",
        name: "text-purple-300",
        typeText: "text-purple-400 font-bold",
        badge: "text-purple-300 bg-purple-500/15 border-purple-500/30",
      };
    }

    if (
      type.includes("PHONE") ||
      type.includes("MSISDN") ||
      type.includes("CDR")
    ) {
      return {
        card: "border-sky-500/30 bg-sky-950/20 hover:border-sky-500/55",
        dot: "bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.85)]",
        name: "text-sky-300",
        typeText: "text-sky-400 font-bold",
        badge: "text-sky-300 bg-sky-500/15 border-sky-500/30",
      };
    }

    if (
      type.includes("CELL") ||
      type.includes("TOWER") ||
      type.includes("CGI")
    ) {
      return {
        card: "border-teal-500/30 bg-teal-950/20 hover:border-teal-500/55",
        dot: "bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.85)]",
        name: "text-teal-300",
        typeText: "text-teal-400 font-bold",
        badge: "text-teal-300 bg-teal-500/15 border-teal-500/30",
      };
    }

    if (type.includes("VEHICLE")) {
      return {
        card: "border-slate-500/30 bg-slate-900/30 hover:border-slate-500/50",
        dot: "bg-slate-300 shadow-[0_0_8px_rgba(203,213,225,0.7)]",
        name: "text-slate-200",
        typeText: "text-slate-300 font-bold",
        badge: "text-slate-300 bg-slate-500/15 border-slate-500/30",
      };
    }

    if (
      type.includes("CRIME") ||
      type.includes("INCIDENT") ||
      type.includes("FIR")
    ) {
      return {
        card: "border-amber-500/30 bg-amber-950/20 hover:border-amber-500/55",
        dot: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.85)]",
        name: "text-amber-300",
        typeText: "text-amber-400 font-bold",
        badge: "text-amber-300 bg-amber-500/15 border-amber-500/30",
      };
    }

    return {
      card: "border-white/10 bg-black/60 hover:border-white/25",
      dot: "bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)]",
      name: "text-white",
      typeText: "text-zinc-400 font-bold",
      badge: "text-zinc-200 bg-white/10 border-white/20",
    };
  };

  const getRiskBreatheClass = () => {
    if (!selectedNode) return "breathe-amber-t1";
    const score = Number(selectedNode.riskScore) || 0;
    if (score >= 70) return "breathe-red-t1";
    if (score >= 30) return "breathe-amber-t1";
    return "breathe-green-t1";
  };

  const getEntityTypeBreatheClass = () => {
    if (!selectedNode) return "breathe-cyan-t2";
    const type = String(selectedNode.type || "").toUpperCase();
    if (
      type.includes("PHONE") ||
      type.includes("MSISDN") ||
      type.includes("CDR")
    )
      return "breathe-cyan-t2";
    if (
      type.includes("ACCOUNT") ||
      type.includes("UPI") ||
      type.includes("MULE")
    )
      return "breathe-violet-t2";
    if (type.includes("COMPLAINANT") || type.includes("VICTIM"))
      return "breathe-green-t2";
    if (
      type.includes("ATM") ||
      type.includes("SHATTER") ||
      type.includes("MASTERMIND")
    )
      return "breathe-red-t2";
    if (type.includes("VEHICLE")) return "breathe-slate-t2";
    return "breathe-amber-t2";
  };

  const getOperationalStatusBreatheClass = () => {
    if (!selectedNode) return "breathe-amber-t3";
    const status = String(selectedNode.status || "").toUpperCase();
    if (
      status.includes("VICTIM") ||
      status.includes("PROTECTED") ||
      status.includes("COMPLAINANT")
    )
      return "breathe-green-t3";
    if (
      status.includes("CRITICAL") ||
      status.includes("SHATTER") ||
      status.includes("MASTERMIND")
    )
      return "breathe-red-t3";
    if (
      status.includes("KEY COORDINATION") ||
      status.includes("BURNER") ||
      status.includes("PHONE") ||
      status.includes("CDR")
    )
      return "breathe-cyan-t3";
    if (
      status.includes("MULE") ||
      status.includes("PMLA") ||
      status.includes("FAN-OUT")
    )
      return "breathe-violet-t3";
    return "breathe-amber-t3";
  };

  const navItems = [
    { id: "network", icon: Network, label: "Shatter Mesh" },
    { id: "finance", icon: Database, label: "Financial Trails" },
    { id: "telecom", icon: Activity, label: "Telecom Logs" },
    { id: "dossier", icon: FileText, label: "Dossiers" },
  ];

  const currentScopeObj =
    SCOPE_OPTIONS.find((o) => o.value === jurisdictionScope) ||
    SCOPE_OPTIONS[0];
  const hiddenCount = (hiddenNodes || []).length;

  return (
    <div className="h-screen w-screen bg-black text-white flex flex-col overflow-hidden selection:bg-white selection:text-black font-display">
      <TargetCursor
        targetSelector=".cursor-target"
        spinDuration={2}
        hoverDuration={0.16}
        hideDefaultCursor={false}
        parallaxOn={true}
        cursorColor="#ffffff"
        cursorColorOnTarget="#e4e4e7"
      />

      {/* Header Deck */}
      <header className="h-14 border-b border-white/10 bg-black/60 backdrop-blur-2xl flex items-center px-4 justify-between shrink-0 relative z-40 shadow-[0_4px_30px_rgba(0,0,0,0.8)]">
        <div className="flex items-center shrink-0 z-10">
          <PanoptesLogo className="w-6 h-6 mr-3 text-white shrink-0 drop-shadow-[0_0_12px_rgba(255,255,255,0.6)]" />
          <SplitFlapText
            words={["PANOPTES"]}
            alwaysFlip={true}
            cycleDelay={5000}
            flipDuration={0.07}
            stagger={0.025}
            flipsPerChar={6}
            tileColor="#000000"
            textColor="#ffffff"
            tileRadius={4}
            gap={3}
            fontSize={18}
            padTo={0}
          />
        </div>

        {/* Center Search & Grid Scope */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center space-x-3 w-full max-w-2xl justify-center z-10">
          <form onSubmit={handleSearch} className="relative w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
            <input
              type="text"
              value={
                evidenceMode === "uploaded"
                  ? "INGESTED FILE STREAM"
                  : searchInput
              }
              onChange={(e) => setSearchInput(e.target.value)}
              disabled={!isAuthenticated || evidenceMode === "uploaded"}
              placeholder={
                !isAuthenticated
                  ? "Login to query cases..."
                  : evidenceMode === "uploaded"
                    ? "Exit exhibit mode to query cases..."
                    : "Query Case ID (e.g. CASE-BR-PAT-2023-00207)..."
              }
              className="cursor-target w-full bg-black/60 border border-white/10 hover:border-white/20 focus:border-white/50 disabled:opacity-40 disabled:cursor-not-allowed text-xs rounded-md pl-9 pr-3 py-2 text-white placeholder:text-zinc-500 transition-all font-display font-medium tracking-wider backdrop-blur-md outline-none"
            />
          </form>

          {/* Regional Scope Menu */}
          <div className="relative shrink-0" ref={scopeDropdownRef}>
            <button
              type="button"
              onClick={() => setScopeMenuOpen(!scopeMenuOpen)}
              disabled={
                !isAuthenticated ||
                evidenceMode === "uploaded" ||
                activeModule !== "network"
              }
              className="cursor-target flex items-center bg-black/60 border border-white/10 hover:border-white/25 disabled:opacity-40 disabled:cursor-not-allowed text-xs text-white rounded-md pl-8 pr-7 py-2 font-display font-bold tracking-[0.14em] uppercase transition-all select-none backdrop-blur-md shadow-lg"
            >
              <Globe className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-300 pointer-events-none" />
              <span>{currentScopeObj.label}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 transition-transform duration-200 ${
                  scopeMenuOpen ? "rotate-180 text-white" : ""
                }`}
              />
            </button>

            {scopeMenuOpen && (
              <div className="absolute top-full left-0 mt-2 w-52 bg-black/90 border border-white/15 rounded-lg p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.95)] backdrop-blur-2xl z-50 flex flex-col space-y-1 font-display">
                {SCOPE_OPTIONS.map((opt) => {
                  const isSelected = jurisdictionScope === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setJurisdictionScope(opt.value);
                        setScopeMenuOpen(false);
                      }}
                      className={`cursor-target w-full text-left px-3 py-2 rounded text-xs font-bold tracking-[0.12em] uppercase transition-colors flex items-center justify-between ${
                        isSelected
                          ? "text-black bg-white shadow-md"
                          : "text-zinc-300 hover:text-white hover:bg-white/10"
                      }`}
                    >
                      <span>{opt.label}</span>
                      {isSelected && (
                        <span className="w-1.5 h-1.5 rounded-full bg-black" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Evidence Buttons */}
          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={() => setUploadModalOpen(true)}
              disabled={!isAuthenticated}
              className={`cursor-target flex items-center space-x-1.5 px-3.5 py-2 text-xs font-display font-bold tracking-[0.14em] uppercase rounded-md border transition-all disabled:opacity-30 ${
                evidenceMode === "uploaded"
                  ? "bg-white text-black border-white shadow-[0_0_16px_rgba(255,255,255,0.35)]"
                  : "bg-black/60 text-white border-white/10 hover:border-white/30 hover:bg-white/10 backdrop-blur-md"
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>
                {evidenceMode === "uploaded"
                  ? "RE-UPLOAD FILES"
                  : "UPLOAD EXHIBITS"}
              </span>
            </button>

            {evidenceMode === "uploaded" && isAuthenticated && (
              <button
                type="button"
                onClick={handleExitExhibitMode}
                className="flex items-center space-x-1.5 px-3 py-2 bg-black/60 hover:bg-white/10 text-white border border-white/15 rounded-md text-xs font-display font-bold tracking-[0.12em] uppercase transition-all backdrop-blur-md"
              >
                <X className="w-3.5 h-3.5" />
                <span>EXIT EXHIBIT</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Officer Status & Session Control */}
        <div className="flex items-center space-x-3 shrink-0 z-10 font-display">
          {isAuthenticated ? (
            <div className="flex items-center space-x-2">
              <div className="flex items-center px-3 py-1.5 bg-black/60 rounded-md border border-white/10 shadow-sm backdrop-blur-md">
                <ShieldCheck className="w-4 h-4 mr-2 text-white" />
                <span className="text-xs text-zinc-400 mr-1.5 font-bold uppercase tracking-wider font-display">
                  BADGE:
                </span>
                <span className="font-bold text-white tracking-widest text-xs font-display">
                  {operatorBadge}
                </span>
              </div>
              <button
                onClick={logout}
                title="Disconnect terminal session"
                className="p-2 bg-black/60 hover:bg-white/10 border border-white/10 hover:border-white/30 text-zinc-300 hover:text-white rounded-md transition-colors backdrop-blur-md"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center px-3 py-1.5 bg-black/60 rounded-md border border-white/10 text-zinc-400 font-display backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-zinc-600 mr-2" />
              <span className="text-xs uppercase tracking-[0.14em] font-bold font-display">
                SESSION LOCKED
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden relative bg-black">
        {/* Left Navigation Bar */}
        <aside className="w-16 flex flex-col items-center justify-between py-4 border-r border-white/10 bg-black/50 backdrop-blur-2xl shrink-0 relative z-30 shadow-[4px_0_24px_rgba(0,0,0,0.8)]">
          <div className="flex flex-col items-center space-y-3.5 w-full">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeModule === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (isAuthenticated) {
                      if (activeModule === "network" && item.id !== "network") {
                        useStore.setState({ inspectorOpen: false });
                      }
                      setModule(item.id);
                    }
                  }}
                  disabled={!isAuthenticated}
                  title={item.label}
                  className={`cursor-target p-3 rounded-xl transition-all duration-150 disabled:opacity-30 ${
                    isActive && isAuthenticated
                      ? "bg-white text-black border border-white shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                      : "text-zinc-400 hover:text-white hover:bg-white/10"
                  }`}
                >
                  <Icon className="w-5 h-5 stroke-[2]" />
                </button>
              );
            })}
          </div>

          {/* Node Inventory Trigger Button */}
          <div className="flex flex-col items-center w-full relative">
            <div className="w-8 h-[1px] bg-white/10 my-2" />
            <button
              ref={trayBtnRef}
              onClick={() => setTrayOpen(!trayOpen)}
              title={`Node Inventory (${hiddenCount} Staged)`}
              className={`cursor-target relative p-3 rounded-xl transition-all duration-150 ${
                trayOpen
                  ? "bg-white text-black border border-white"
                  : hiddenCount > 0
                    ? "bg-black/60 text-white border border-white/20 hover:bg-white/10"
                    : "text-zinc-400 hover:text-white hover:bg-white/10"
              }`}
            >
              <Boxes className="w-5 h-5 stroke-[2]" />
              <span
                className={`absolute -top-1 -right-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold font-display shadow-md border border-black leading-none ${
                  hiddenCount > 0
                    ? "bg-white text-black"
                    : "bg-black/80 text-zinc-500 border border-white/10"
                }`}
              >
                {String(hiddenCount).padStart(2, "0")}
              </span>
            </button>
          </div>
        </aside>

        {/* Dynamic Viewport */}
        <main className="flex-1 relative bg-black overflow-hidden flex flex-col z-10">
          {children}
        </main>

        {/* Right Forensic Inspector Panel */}
        <aside
          className={`border-l border-white/10 bg-black/70 backdrop-blur-2xl flex flex-col transition-all duration-300 ease-in-out shrink-0 z-20 shadow-[-10px_0_30px_rgba(0,0,0,0.85)] ${
            inspectorOpen ? "w-92 opacity-100" : "w-0 opacity-0 border-none"
          }`}
        >
          {inspectorOpen && (
            <div className="flex flex-col h-full w-92 font-display">
              {/* Header Strip */}
              <div className="h-14 border-b border-white/10 flex items-center justify-between px-4 bg-black/40 shrink-0">
                <span className="text-xs font-display font-bold tracking-[0.14em] text-white uppercase flex items-center shrink-0">
                  {isAuthenticated ? (
                    <>
                      <UserCheck className="w-4 h-4 mr-2 text-zinc-300 shrink-0" />
                      <AsciiDecryptedText text="TARGET NODE INTEL" />
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4 mr-2 text-zinc-300 shrink-0" />
                      <span>TERMINAL LOGIN</span>
                    </>
                  )}
                </span>

                {/* AI PATTERN BUTTON: RED AURA GLOW */}
                {isAuthenticated && (() => {
                  const conf = Number(archetypeData?.confidence_score) || 0;
                  const isHighRisk = conf >= 70;

                  const glowStyle = showHopfieldScore
                    ? {
                        boxShadow:
                          "0 0 20px rgba(244, 63, 94, 0.75), inset 0 0 10px rgba(244, 63, 94, 0.35)",
                      }
                    : isHighRisk
                    ? {
                        boxShadow:
                          "0 0 16px rgba(244, 63, 94, 0.6), inset 0 0 6px rgba(244, 63, 94, 0.25)",
                      }
                    : undefined;

                  const buttonClasses = showHopfieldScore
                    ? "bg-rose-600 text-white border-rose-400 font-bold"
                    : isHighRisk
                    ? "bg-rose-950/40 text-rose-300 border-rose-500 animate-pulse"
                    : "bg-black/60 text-zinc-300 hover:text-white hover:border-white/30 animate-hud-breathe";

                  return (
                    <button
                      type="button"
                      onClick={() => setShowHopfieldScore((prev) => !prev)}
                      disabled={!activeCaseId || evidenceMode === "uploaded"}
                      style={glowStyle}
                      className={`cursor-target flex items-center space-x-1.5 px-2.5 py-1 text-xs font-display font-bold tracking-[0.12em] uppercase rounded-md border transition-all select-none shrink-0 disabled:opacity-30 disabled:cursor-not-allowed ${buttonClasses}`}
                    >
                      <BrainCircuit
                        className={`w-3.5 h-3.5 ${
                          showHopfieldScore
                            ? "text-white"
                            : isHighRisk
                            ? "text-rose-400 drop-shadow-[0_0_6px_rgba(244,63,94,0.9)]"
                            : "text-zinc-300"
                        }`}
                      />
                      <span
                        className={
                          showHopfieldScore
                            ? "text-white"
                            : isHighRisk
                            ? "text-rose-200"
                            : ""
                        }
                      >
                        AI PATTERN
                      </span>
                      {archetypeData?.confidence_score && (
                        <span
                          className={`text-xs font-display font-bold px-1.5 py-0.5 rounded border ${
                            showHopfieldScore
                              ? "bg-black/30 border-white/30 text-white"
                              : isHighRisk
                              ? "bg-rose-500/20 border-rose-500/50 text-rose-300 shadow-[0_0_8px_rgba(244,63,94,0.5)]"
                              : "bg-white/10 border-white/20 breathe-amber-t1"
                          }`}
                        >
                          {archetypeData.confidence_score}%
                        </span>
                      )}
                    </button>
                  );
                })()}
              </div>

              {/* Inspector Content */}
              <div className="p-4 flex-1 overflow-y-auto space-y-4">
                {!isAuthenticated ? (
                  <form
                    onSubmit={handleLoginSubmit}
                    className="space-y-4 pt-1 font-display"
                  >
                    <div className="p-3 bg-black/60 border border-white/10 rounded-md text-xs text-zinc-300 leading-relaxed font-sans backdrop-blur-md">
                      <span className="text-white font-display font-bold tracking-wider block mb-1 uppercase">
                         AIRGAP ACCESS CONTROL 
                      </span>
                      Authenticate with verified officer credentials to
                      initialize session.
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-zinc-400 font-bold uppercase tracking-wider flex items-center">
                        <User className="w-3.5 h-3.5 mr-1.5 text-zinc-500" />
                        Username
                      </label>
                      <input
                        type="text"
                        value={loginUsername}
                        onChange={(e) => setLoginUsername(e.target.value)}
                        placeholder="turbo"
                        autoComplete="off"
                        className="w-full bg-black/80 border border-white/10 focus:border-white/40 rounded-md px-3 py-2 text-sm text-white outline-none transition-colors font-display"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-zinc-400 font-bold uppercase tracking-wider flex items-center">
                        <KeyRound className="w-3.5 h-3.5 mr-1.5 text-zinc-500" />
                        Password
                      </label>
                      <input
                        type="password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="torpedo"
                        autoComplete="off"
                        className="w-full bg-black/80 border border-white/10 focus:border-white/40 rounded-md px-3 py-2 text-sm text-white outline-none transition-colors font-display"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full mt-2 bg-white hover:bg-zinc-200 text-black font-display font-bold tracking-[0.14em] uppercase py-2.5 px-3 rounded-md text-sm transition-all flex items-center justify-center space-x-2 shadow-lg"
                    >
                      <LogIn className="w-4 h-4" />
                      <span>START INVESTIGATION</span>
                    </button>
                  </form>
                ) : (
                  <>
                    {selectedNode ? (
                      <div className="space-y-3.5 animate-in fade-in duration-200">
                        {/* Canonical Target Hero */}
                        <TiltCard maxTilt={6}>
                          <div className="hud-field hud-field-accent p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-display font-bold tracking-[0.16em] uppercase text-zinc-400">
                                CANONICAL TARGET
                              </span>
                              <span className="text-xs font-display font-bold px-2 py-0.5 rounded bg-white/10 border border-white/20 text-white">
                                [IDENTIFIED]
                              </span>
                            </div>
                            <div
                              className={`font-bold text-lg tracking-tight break-all font-display transition-colors ${getTargetNameColorClass()}`}
                            >
                              <AsciiDecryptedText
                                text={selectedNode.name || selectedNode.id}
                              />
                            </div>
                          </div>
                        </TiltCard>

                        {/* Metric Row */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="hud-field p-3.5 flex flex-col justify-between">
                            <span className="text-xs font-display font-bold tracking-[0.14em] uppercase text-zinc-400">
                              CENTRALITY RISK
                            </span>
                            <div className="mt-2 flex items-baseline space-x-1 font-display">
                              <span
                                className={`text-3xl font-bold tracking-tight transition-colors ${getRiskBreatheClass()}`}
                              >
                                {selectedNode.riskScore}
                              </span>
                              <span className="text-sm font-bold text-zinc-500">
                                %
                              </span>
                            </div>
                          </div>

                          <div className="hud-field p-3.5 flex flex-col justify-between">
                            <span className="text-xs font-display font-bold tracking-[0.14em] uppercase text-zinc-400">
                              ENTITY TYPE
                            </span>
                            <div className="mt-2">
                              <span
                                className={`text-sm font-bold font-display tracking-wider uppercase truncate block transition-colors ${getEntityTypeBreatheClass()}`}
                              >
                                {selectedNode.type || "ENTITY"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Operational Status */}
                        <div className="hud-field p-3.5">
                          <span className="text-xs font-display font-bold tracking-[0.14em] uppercase text-zinc-400 block mb-1">
                            OPERATIONAL STATUS
                          </span>
                          <div
                            className={`flex items-center text-sm font-semibold mt-1 font-display transition-colors ${getOperationalStatusBreatheClass()}`}
                          >
                            <AlertOctagon className="w-4 h-4 mr-2 shrink-0 opacity-80" />
                            <span className="truncate">
                              {selectedNode.status}
                            </span>
                          </div>
                        </div>

                        {/* Jurisdiction Sector */}
                        <div className="hud-field p-3.5">
                          <span className="text-xs font-display font-bold tracking-[0.14em] uppercase text-zinc-400 block mb-1">
                            JURISDICTION SECTOR
                          </span>
                          <div className="flex items-center text-sm text-zinc-300 mt-1 font-display">
                            <MapPin className="w-4 h-4 mr-2 text-zinc-400 shrink-0" />
                            <span className="truncate">
                              {selectedNode.district || "Pan-India Grid"}
                            </span>
                          </div>
                        </div>

                        {/* System UID */}
                        <div className="hud-field p-3.5">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-display font-bold tracking-[0.14em] uppercase text-zinc-400">
                              SYSTEM UID
                            </span>
                            <span className="text-xs font-display text-zinc-500 font-semibold">
                              SEC 63(4)
                            </span>
                          </div>
                          <div className="text-xs font-display font-medium text-zinc-300 bg-black/80 px-2.5 py-2 rounded border border-white/10 truncate select-all tracking-wider">
                            {selectedNode.id}
                          </div>
                        </div>

                        {/* Corridor Pathfinder */}
                        <div className="pt-2 border-t border-white/10">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-display font-bold tracking-[0.14em] uppercase text-zinc-400">
                              CORRIDOR PATHFINDER
                            </span>
                            <span
                              className={`text-xs font-display font-bold tracking-widest ${
                                routeOrigin && routeTarget
                                  ? "text-white"
                                  : routeOrigin || routeTarget
                                    ? "text-zinc-300 animate-pulse"
                                    : "text-zinc-600"
                              }`}
                            >
                              {routeOrigin && routeTarget
                                ? "[LOCKED]"
                                : routeOrigin || routeTarget
                                  ? "[1/2 ARMED]"
                                  : "[STANDBY]"}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            {/* Origin Button */}
                            {(() => {
                              const resolvedId =
                                selectedNode.rawId !== undefined
                                  ? selectedNode.rawId
                                  : selectedNode.id === "VICTIM:COMPLAINANT"
                                    ? 888888
                                    : parseInt(
                                        String(selectedNode.id).replace(
                                          /\D/g,
                                          "",
                                        ),
                                      ) || 0;
                              const isOriginSet =
                                routeOrigin &&
                                String(routeOrigin.id) === String(resolvedId);

                              const handleToggleOrigin = () => {
                                if (isOriginSet) {
                                  setRouteOrigin(null);
                                } else {
                                  if (
                                    routeTarget &&
                                    String(routeTarget.id) ===
                                      String(resolvedId)
                                  )
                                    setRouteTarget(null);
                                  setRouteOrigin({
                                    id: resolvedId,
                                    name: selectedNode.name,
                                  });
                                }
                              };

                              return (
                                <button
                                  onClick={handleToggleOrigin}
                                  className={`cursor-target flex items-center justify-between px-3 py-2 rounded-md text-xs font-display font-bold tracking-wider uppercase border transition-all ${
                                    isOriginSet
                                      ? "bg-white text-black border-white shadow-[0_0_14px_rgba(255,255,255,0.35)]"
                                      : "bg-black/60 hover:bg-white/10 border-white/10 hover:border-white/30 text-zinc-300"
                                  }`}
                                >
                                  <div className="flex items-center space-x-1.5 truncate">
                                    <CircleDot
                                      className={`w-3.5 h-3.5 shrink-0 ${
                                        isOriginSet
                                          ? "text-black"
                                          : "text-zinc-500"
                                      }`}
                                    />
                                    <span className="truncate font-display">
                                      {isOriginSet ? "ORIGIN" : "SET SRC"}
                                    </span>
                                  </div>
                                  <span
                                    className={`text-xs font-display px-1.5 py-0.5 rounded border ${
                                      isOriginSet
                                        ? "border-black bg-zinc-200 text-black font-bold"
                                        : "border-white/15 text-zinc-400"
                                    }`}
                                  >
                                    A
                                  </span>
                                </button>
                              );
                            })()}

                            {/* Target Button */}
                            {(() => {
                              const resolvedId =
                                selectedNode.rawId !== undefined
                                  ? selectedNode.rawId
                                  : selectedNode.id === "VICTIM:COMPLAINANT"
                                    ? 888888
                                    : parseInt(
                                        String(selectedNode.id).replace(
                                          /\D/g,
                                          "",
                                        ),
                                      ) || 0;
                              const isTargetSet =
                                routeTarget &&
                                String(routeTarget.id) === String(resolvedId);

                              const handleToggleTarget = () => {
                                if (isTargetSet) {
                                  setRouteTarget(null);
                                } else {
                                  if (
                                    routeOrigin &&
                                    String(routeOrigin.id) ===
                                      String(resolvedId)
                                  )
                                    setRouteOrigin(null);
                                  setRouteTarget({
                                    id: resolvedId,
                                    name: selectedNode.name,
                                  });
                                }
                              };

                              return (
                                <button
                                  onClick={handleToggleTarget}
                                  className={`cursor-target flex items-center justify-between px-3 py-2 rounded-md text-xs font-display font-bold tracking-wider uppercase border transition-all ${
                                    isTargetSet
                                      ? "bg-white text-black border-white shadow-[0_0_14px_rgba(255,255,255,0.35)]"
                                      : "bg-black/60 hover:bg-white/10 border-white/10 hover:border-white/30 text-zinc-300"
                                  }`}
                                >
                                  <div className="flex items-center space-x-1.5 truncate">
                                    <Crosshair
                                      className={`w-3.5 h-3.5 shrink-0 ${
                                        isTargetSet
                                          ? "text-black"
                                          : "text-zinc-500"
                                      }`}
                                    />
                                    <span className="truncate font-display">
                                      {isTargetSet ? "TARGET" : "SET TGT"}
                                    </span>
                                  </div>
                                  <span
                                    className={`text-xs font-display px-1.5 py-0.5 rounded border ${
                                      isTargetSet
                                        ? "border-black bg-zinc-200 text-black font-bold"
                                        : "border-white/15 text-zinc-400"
                                    }`}
                                  >
                                    B
                                  </span>
                                </button>
                              );
                            })()}
                          </div>
                        </div>

                        {/* Rap Sheet Action Button */}
                        <button
                          onClick={() =>
                            handleDownloadTargetRapSheet(
                              selectedNode.rawId,
                              selectedNode.name,
                            )
                          }
                          disabled={downloading}
                          className="cursor-target w-full mt-3 bg-white hover:bg-zinc-200 text-black font-display font-bold tracking-[0.14em] uppercase py-3 px-4 rounded-lg text-xs transition-all flex items-center justify-center space-x-2 shadow-[0_0_20px_rgba(255,255,255,0.2)] disabled:bg-black/40 disabled:text-zinc-600 disabled:border-white/10"
                        >
                          <Download className="w-4 h-4" />
                          <span>
                            {downloading
                              ? "GENERATING RAP SHEET..."
                              : "PULL TARGET RAP SHEET"}
                          </span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-64 text-zinc-500 space-y-3 font-display">
                        <ScanLine className="w-9 h-9 opacity-40 text-zinc-400 animate-pulse" />
                        <p className="text-xs font-display font-bold tracking-[0.16em] uppercase text-zinc-300">
                          AWAITING NODE SELECTION
                        </p>
                        <span className="text-xs text-zinc-500 text-center px-4 leading-relaxed font-sans">
                          Click any suspect, vehicle, or account node on the
                          canvas to inspect forensic telemetry.
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </aside>

        {/* Inspector Toggle Button */}
        <button
          onClick={toggleInspector}
          className="absolute right-0 top-1/2 -translate-y-1/2 bg-black/80 border-y border-l border-white/10 p-2 rounded-l-md text-zinc-300 hover:text-white backdrop-blur-md z-30 font-display"
        >
          <ChevronRight
            className={`w-4 h-4 transition-transform duration-300 ${
              inspectorOpen ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>

      {/* Floating Node Inventory Drawer: Full Chakra Petch Font Hierarchy */}
      {trayOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={trayRef}
            id="panoptes-node-inventory-drawer"
            className="fixed left-20 bottom-12 z-[99999] w-[430px] max-h-[72vh] flex flex-col bg-black/85 border border-white/15 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.98)] backdrop-blur-2xl animate-in fade-in slide-in-from-left-4 font-display select-none"
          >
            {/* Header: All elements strictly on a single row */}
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-white/10 bg-black/60 rounded-t-xl gap-2 shrink-0">
              <div className="flex items-center space-x-2 shrink-0">
                <Boxes className="w-4 h-4 text-white shrink-0" />
                <span className="text-xs font-display font-bold tracking-[0.14em] uppercase text-white whitespace-nowrap">
                  NODE INVENTORY
                </span>
              </div>

              <div className="flex items-center space-x-2 shrink-0">
                {/* 1-Line Monochrome Hidden Counter Badge */}
                <span className="text-xs px-2.5 py-1 rounded bg-white/10 border border-white/20 text-white font-display font-bold whitespace-nowrap shrink-0 leading-none flex items-center tracking-wider">
                  HIDDEN: {String(hiddenCount).padStart(2, "0")}
                </span>

                {/* 1-Line Monochrome Restore All Button */}
                {hiddenCount > 0 && (
                  <button
                    onClick={handleRestoreAllNodes}
                    title="Restore all hidden entities"
                    className="text-xs text-white hover:text-black hover:bg-white font-bold font-display transition-colors flex items-center space-x-1.5 px-2.5 py-1 bg-white/10 rounded border border-white/20 uppercase whitespace-nowrap shrink-0 leading-none tracking-wider"
                  >
                    <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                    <span>RESTORE ALL</span>
                  </button>
                )}

                <button
                  onClick={() => setTrayOpen(false)}
                  className="p-1 text-zinc-400 hover:text-white rounded transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content: Color-Coded Entity Badges with Clean B&W RESTORE Buttons */}
            <div className="p-3 overflow-y-auto max-h-96 space-y-2">
              {hiddenCount === 0 ? (
                <div className="py-8 text-center text-zinc-500 flex flex-col items-center justify-center space-y-2">
                  <Boxes className="w-9 h-9 opacity-30 text-zinc-400 mb-1" />
                  <span className="text-xs font-display font-bold tracking-[0.16em] uppercase text-zinc-300 whitespace-nowrap">
                    TRAY EMPTY
                  </span>
                  <p className="text-xs text-zinc-500 max-w-[240px] leading-relaxed font-sans">
                    Click the stash icon on any node card to temporarily remove
                    it from analytical view.
                  </p>
                </div>
              ) : (
                hiddenNodes.map((node) => {
                  const styles = getNodeDrawerStyles(node);
                  return (
                    <div
                      key={node.id}
                      onClick={() => {
                        setSelectedNode(node);
                        setTrayOpen(false);
                      }}
                      className={`p-3 border rounded-lg transition-all flex items-center justify-between backdrop-blur-md cursor-pointer hover:scale-[1.01] ${styles.card}`}
                    >
                      <div className="truncate mr-3 space-y-1">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${styles.dot}`}
                          />
                          <span
                            className={`text-xs font-display font-bold tracking-wide truncate block ${styles.name}`}
                          >
                            {node.name}
                          </span>
                        </div>
                        <div className="text-xs flex items-center space-x-2">
                          <span className={`font-display text-[11px] tracking-wider uppercase ${styles.typeText}`}>
                            {node.type}
                          </span>
                          <span className="text-zinc-600 font-display">•</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-display font-bold tracking-wider uppercase border ${styles.badge}`}
                          >
                            {node.riskScore
                              ? `RISK ${node.riskScore}%`
                              : "VERIFIED"}
                          </span>
                        </div>
                      </div>

                      {/* Monochrome B&W Individual Restore Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRestoreNode(node.id);
                        }}
                        className="cursor-target px-3 py-1 bg-white/10 hover:bg-white text-white hover:text-black border border-white/20 rounded text-xs font-display font-bold tracking-wider uppercase transition-colors shrink-0 whitespace-nowrap"
                      >
                        RESTORE
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}

      {/* Floating AI Pattern Card */}
      {showHopfieldScore &&
        isAuthenticated &&
        activeCaseId &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed top-16 right-96 z-[99998] w-96 bg-black/90 border border-white/20 rounded-xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.98)] backdrop-blur-2xl select-none font-display">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-3 font-display">
              <div className="flex items-center space-x-2">
                <BrainCircuit className="w-4 h-4 text-white animate-pulse" />
                <span className="text-xs font-bold tracking-[0.14em] uppercase text-white font-display">
                  AI SYNDICATE PATTERN MATCH
                </span>
              </div>
              <button
                onClick={() => setShowHopfieldScore(false)}
                className="p-1 text-zinc-400 hover:text-white rounded transition-colors"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {loadingArchetype ? (
              <div className="py-6 flex flex-col items-center justify-center space-y-2 text-zinc-500 font-display">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-zinc-400 font-display">
                  CORRELATING CRIME PATTERNS ACROSS ARCHIVES...
                </span>
              </div>
            ) : archetypeData ? (
              <div className="space-y-3 font-display">
                <div className="hud-field p-3">
                  <div className="flex items-center justify-between text-xs text-zinc-400 font-bold mb-2 font-display tracking-wider">
                    <span>PATTERN MATCH CONFIDENCE</span>
                    <span
                      className={`text-base font-bold font-display ${
                        Number(archetypeData.confidence_score) >= 70
                          ? "breathe-red-t1"
                          : "breathe-amber-t1"
                      }`}
                    >
                      {archetypeData.confidence_score}%
                    </span>
                  </div>
                  <div className="w-full bg-black/80 h-2 rounded-full overflow-hidden border border-white/10">
                    <div
                      className="h-full bg-gradient-to-r from-zinc-500 to-white transition-all duration-500"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(0, archetypeData.confidence_score || 0),
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-zinc-500 mt-1.5 font-display">
                    <span>WEAK CORRELATION</span>
                    <span>HIGH M.O. MATCH</span>
                  </div>
                </div>

                <div className="hud-field p-3">
                  <span className="text-xs font-display font-bold tracking-wider uppercase text-zinc-500 block mb-1">
                    DETECTED MODUS OPERANDI (M.O.)
                  </span>
                  <div className="text-sm font-bold text-white leading-snug font-display">
                    {archetypeData.archetype_name}
                  </div>
                  <div className="mt-2.5 flex items-center space-x-2 text-xs">
                    <span className="px-2 py-0.5 rounded bg-black/80 border border-white/15 text-zinc-200 font-bold font-display">
                      {archetypeData.archetype_code?.replace("ARCH_", "CODE: ")}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded font-bold border border-white/25 bg-white/10 font-display ${
                        archetypeData.threat_level?.includes("CRITICAL")
                          ? "breathe-red-t3"
                          : "breathe-amber-t3"
                      }`}
                    >
                      {archetypeData.threat_level}
                    </span>
                  </div>
                </div>

                <div className="hud-field p-3">
                  <div className="flex items-center text-xs font-display font-bold tracking-wider text-white mb-1.5 uppercase">
                    <ShieldAlert className="w-4 h-4 mr-1.5 shrink-0" />
                    <span>RECOMMENDED LEGAL ACTION</span>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed font-sans">
                    {archetypeData.statutory_action}
                  </p>
                </div>
              </div>
            ) : (
              <div className="py-4 text-center text-zinc-500 text-xs font-display">
                No matching syndicate pattern found for case [{activeCaseId}].
              </div>
            )}
          </div>,
          document.body,
        )}

      {/* Multipart File Upload Modal */}
      {uploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-2xl animate-in fade-in duration-150 font-display">
          <div className="bg-black/90 border border-white/20 rounded-xl w-[560px] max-w-full p-6 space-y-4 shadow-[0_25px_70px_rgba(0,0,0,0.98)] relative font-display">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center space-x-2 text-white font-display font-bold tracking-wider text-sm uppercase">
                <FileUp className="w-5 h-5 text-zinc-300" />
                <span>EVIDENTIARY EXHIBIT INGESTION (UP TO 11 FILES)</span>
              </div>
              <button
                onClick={() => setUploadModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed font-sans">
              Upload raw seized files (
              <span className="text-white font-bold">.csv</span> /{" "}
              <span className="text-white font-bold">.txt</span>), such as DoT
              CDR telecom records, IMPS banking logs, or extracted chats.
            </p>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-white/15 hover:border-white/40 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer transition-colors bg-white/[0.02] hover:bg-white/[0.05] group"
              >
                <Upload className="w-8 h-8 text-zinc-500 group-hover:text-white transition-colors mb-2" />
                <span className="text-xs font-display font-bold tracking-wider text-white uppercase">
                  Click to select files (file1 to file11)
                </span>
                <span className="text-xs text-zinc-500 mt-1 font-display">
                  Accepts CSV, TXT (Maximum 11 files)
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".csv,.txt"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {selectedFiles.length > 0 && (
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 text-xs font-display">
                  {selectedFiles.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 bg-black/60 rounded border border-white/10 text-xs"
                    >
                      <span className="text-zinc-200 truncate max-w-[340px]">
                        <span className="text-white font-bold mr-2">
                          [{idx + 1}]
                        </span>
                        {file.name}
                      </span>
                      <span className="text-zinc-400 text-xs">
                        {(file.size / 1024).toFixed(1)} KB
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-end space-x-3 pt-2 border-t border-white/10 font-display">
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-white font-display"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || selectedFiles.length === 0}
                  className="px-4 py-2 bg-white hover:bg-zinc-200 disabled:bg-white/10 disabled:text-zinc-600 text-black font-bold text-xs uppercase tracking-wider rounded transition-colors flex items-center space-x-2 shadow-md font-display"
                >
                  {uploading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                      <span>PARSING CSR MATRIX...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>ANALYZE EXHIBITS IN C++</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
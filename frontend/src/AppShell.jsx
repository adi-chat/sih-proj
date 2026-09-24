import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Search, Network, FileText, Activity, Database, 
  ChevronRight, Terminal, ScanLine, 
  Download, AlertOctagon, MapPin, UserCheck,
  Globe, ChevronDown, Upload, X, FileUp, CheckCircle2,
  LogIn, LogOut, KeyRound, User, Boxes, RotateCcw
} from 'lucide-react';
import { useStore } from './store';
import PanoptesLogo from './components/ui/PanoptesLogo';
import SplitFlapText from './components/ui/SplitFlapText';
import TargetCursor from './components/ui/TargetCursor';

const SCOPE_OPTIONS = [
  { value: 'national', label: 'NATIONAL GRID' },
  { value: 'state', label: 'STATE LEVEL' },
  { value: 'district', label: 'DISTRICT LEVEL' },
  { value: 'precinct', label: 'PRECINCT LOCAL' }
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
    jurisdictionScope,
    setJurisdictionScope,
    evidenceMode,
    uploadedExhibitHash,
    resetToDatabaseMode,
    hiddenNodes = [],
    restoreNode,
    restoreAllNodes,
    trayOpen,
    setTrayOpen
  } = useStore();

  const trayRef = useRef(null);
  const trayBtnRef = useRef(null);
  const scopeDropdownRef = useRef(null);
  const fileInputRef = useRef(null);

  const [searchInput, setSearchInput] = useState(activeCaseId || '');
  const [downloading, setDownloading] = useState(false);
  const [, setArchetype] = useState(null);

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [scopeMenuOpen, setScopeMenuOpen] = useState(false);

  useEffect(() => {
    setSearchInput(activeCaseId || '');
  }, [activeCaseId]);

  useEffect(() => {
    if (!activeCaseId || !isAuthenticated) return;
    fetch(`http://127.0.0.1:8000/api/ai/archetype/${activeCaseId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setArchetype(data))
      .catch(() => setArchetype(null));
  }, [activeCaseId, isAuthenticated]);

  // Click-outside listener for tray and scope menu
  useEffect(() => {
    if (!trayOpen && !scopeMenuOpen) return;

    const handleClickOutside = (e) => {
      if (scopeDropdownRef.current && !scopeDropdownRef.current.contains(e.target)) {
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

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [trayOpen, scopeMenuOpen, setTrayOpen]);

  const handleRestoreNode = (id) => {
    restoreNode(id);
    const iframe = document.querySelector('iframe');
    if (iframe) {
      iframe.contentWindow?.postMessage({ type: 'RESTORE_NODE', payload: id }, '*');
    }
  };

  const handleRestoreAllNodes = () => {
    restoreAllNodes();
    const iframe = document.querySelector('iframe');
    if (iframe) {
      iframe.contentWindow?.postMessage({ type: 'RESTORE_ALL_NODES' }, '*');
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (!isAuthenticated || evidenceMode === 'uploaded') return;
    const cleanId = searchInput.trim().toUpperCase();
    if (cleanId) {
      if (setSelectedNode) {
        setSelectedNode(null);
      }
      setTrayOpen(false);
      setActiveCase(cleanId);
    }
  };

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    if (loginUsername.trim() === 'turbo' && loginPassword === 'torpedo') {
      login('turbo', '');
    } else {
      alert('Access Denied: Invalid Badge ID or Access Key.');
    }
  };

  const handleDownloadTargetRapSheet = async (nodeId, nodeName) => {
    setDownloading(true);
    try {
      const cleanId = encodeURIComponent(String(nodeId).trim());
      const res = await fetch(`http://127.0.0.1:8000/api/dossier/target/${cleanId}`);
      if (!res.ok) throw new Error('Target rap sheet failed on server');
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `RapSheet_${(nodeName || 'Target').replace(/\s+/g, '_')}.pdf`;
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
      await fetch('http://127.0.0.1:8000/api/exhibits/reset', { method: 'POST' });
    } catch (err) {
      console.error('Failed to reset backend exhibit stream:', err);
    } finally {
      resetToDatabaseMode();
      setSearchInput('');
      setJurisdictionScope('national');

      const iframe = document.querySelector('iframe');
      if (iframe) {
        iframe.src = 'about:blank';
      }
    }
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 11) {
      alert("A maximum of 11 exhibit files (file1 to file11) can be uploaded at once.");
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
      const targetId = 'CASE-FIELD-INGEST';
      const res = await fetch(`http://127.0.0.1:8000/api/analyze-all/${targetId}`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Upload failed with HTTP ${res.status}`);
      }

      const data = await res.json();

      useStore.setState({
        activeCaseId: targetId,
        evidenceMode: 'uploaded',
        uploadedExhibitHash: data.sha256_exhibit_hash,
        uploadedFiles: selectedFiles,
        uploadedEntityMap: data.entity_map || {},
        selectedNode: null,
        trayOpen: false
      });

      setUploadModalOpen(false);
      setSelectedFiles([]);

      const iframe = document.querySelector('iframe');
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

  const navItems = [
    { id: 'network', icon: Network, label: 'Shatter Mesh' },
    { id: 'finance', icon: Database, label: 'Financial Trails' },
    { id: 'telecom', icon: Activity, label: 'Telecom Logs' },
    { id: 'dossier', icon: FileText, label: 'Dossiers' },
  ];

  const currentScopeObj = SCOPE_OPTIONS.find((o) => o.value === jurisdictionScope) || SCOPE_OPTIONS[0];
  const hiddenCount = (hiddenNodes || []).length;

  return (
    <div className="h-screen w-screen bg-zinc-950 text-zinc-300 font-sans flex flex-col overflow-hidden selection:bg-emerald-500/30 selection:text-emerald-300">
      <TargetCursor
        targetSelector=".cursor-target"
        spinDuration={2}
        hoverDuration={0.18}
        hideDefaultCursor={false}
        parallaxOn={true}
        cursorColor="#10b981"
        cursorColorOnTarget="#34d399"
      />

      <header className="h-14 border-b border-zinc-800 bg-zinc-900/60 flex items-center px-4 justify-between shrink-0 relative z-40">
        <div className="flex items-center shrink-0 z-10">
          <PanoptesLogo className="w-6 h-6 mr-2.5 text-emerald-500 shrink-0 drop-shadow-[0_0_8px_rgba(16,185,129,0.35)]" />
          <SplitFlapText
            words={['PANOPTES']}
            alwaysFlip={true}
            cycleDelay={4000}
            flipDuration={0.07}
            stagger={0.025}
            flipsPerChar={6}
            tileColor="#141417"
            textColor="#34d399"
            tileRadius={4}
            gap={3}
            fontSize={18}
            padTo={0}
          />
        </div>

        {/* Center Navigation & Search */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center space-x-3 w-full max-w-2xl justify-center z-10">
          <form onSubmit={handleSearch} className="relative w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              value={evidenceMode === 'uploaded' ? 'INGESTED FILE STREAM' : searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              disabled={!isAuthenticated || evidenceMode === 'uploaded'}
              placeholder={
                !isAuthenticated 
                  ? "Login to query cases..." 
                  : evidenceMode === 'uploaded'
                  ? "Exit exhibit mode to query cases..."
                  : "Query Case ID (e.g. CASE-BR-PAT-2023-00207)..."
              }
              title={evidenceMode === 'uploaded' ? "Search locked during custom exhibit analysis. Click EXIT EXHIBIT to return to workspace." : "Query Case ID"}
              className="cursor-target w-full bg-zinc-950 border border-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed text-xs rounded px-9 py-1.5 focus:outline-none focus:border-emerald-500 text-zinc-200 transition-opacity font-mono"
            />
          </form>

          {/* Scope Dropdown */}
          <div className="relative shrink-0" ref={scopeDropdownRef}>
            <button
              type="button"
              onClick={() => setScopeMenuOpen(!scopeMenuOpen)}
              disabled={!isAuthenticated || evidenceMode === 'uploaded' || activeModule !== 'network'}
              title="Select Regional Grid Scope"
              className="cursor-target flex items-center bg-zinc-950 border border-zinc-800 hover:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-xs text-zinc-200 rounded pl-8 pr-7 py-1.5 uppercase tracking-wider font-semibold transition-all select-none"
            >
              <Globe className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-400 pointer-events-none" />
              <span>{currentScopeObj.label}</span>
              <ChevronDown className={`w-3 h-3 absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 transition-transform duration-200 ${scopeMenuOpen ? 'rotate-180 text-emerald-400' : ''}`} />
            </button>

            {scopeMenuOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-44 bg-zinc-950/95 border border-zinc-800/90 rounded-lg p-1.5 shadow-2xl backdrop-blur-md z-50 flex flex-col space-y-1 animate-in fade-in duration-100">
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
                      className={`cursor-target w-full text-left px-3 py-1.5 rounded text-[11px] font-mono font-semibold tracking-wider transition-colors flex items-center justify-between ${
                        isSelected
                          ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                          : 'text-zinc-400 hover:text-emerald-300 hover:bg-transparent'
                      }`}
                    >
                      <span>{opt.label}</span>
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Upload & Exit Buttons */}
          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={() => setUploadModalOpen(true)}
              disabled={!isAuthenticated}
              className={`cursor-target flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded border transition-all disabled:opacity-30 ${
                evidenceMode === 'uploaded'
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/40 hover:bg-amber-500/20'
                  : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-emerald-500 hover:text-emerald-400'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{evidenceMode === 'uploaded' ? 'RE-UPLOAD FILES' : 'UPLOAD EXHIBITS'}</span>
            </button>

            {evidenceMode === 'uploaded' && isAuthenticated && (
              <button
                type="button"
                onClick={handleExitExhibitMode}
                title="Exit custom exhibit stream and return to empty search workspace"
                className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-rose-100 border border-rose-800/60 hover:border-rose-600 rounded text-xs font-semibold transition-all shadow-sm group"
              >
                <X className="w-3.5 h-3.5 text-rose-400 group-hover:rotate-90 transition-transform duration-200" />
                <span>EXIT EXHIBIT</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Officer Badge & Logout */}
        <div className="flex items-center space-x-3 text-xs shrink-0 z-10">
          {isAuthenticated ? (
            <div className="flex items-center space-x-2">
              <div className="flex items-center px-3 py-1 bg-zinc-900 rounded border border-zinc-800 font-mono">
                <Terminal className="w-3.5 h-3.5 mr-2 text-emerald-400" />
                <span className="text-zinc-500 mr-1.5">OFFICER:</span>
                <span className="font-semibold text-emerald-400">{operatorBadge}</span>
              </div>
              <button
                onClick={logout}
                title="Disconnect terminal session"
                className="p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-red-500/40 text-zinc-400 hover:text-red-400 rounded transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center px-3 py-1 bg-zinc-900/60 rounded border border-zinc-800 text-zinc-500 font-mono">
              <span className="w-2 h-2 rounded-full bg-zinc-600 mr-2" />
              <span className="text-[10px] uppercase tracking-wider font-semibold">SESSION LOCKED</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Navigation Sidebar */}
        <aside className="w-16 flex flex-col items-center justify-between py-4 border-r border-zinc-800 bg-zinc-900/20 shrink-0 relative z-30">
          <div className="flex flex-col items-center space-y-3 w-full">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeModule === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => isAuthenticated && setModule(item.id)}
                  disabled={!isAuthenticated}
                  title={item.label}
                  className={`cursor-target p-3 rounded-xl transition-all duration-150 disabled:opacity-30 ${
                    isActive && isAuthenticated
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.15)]'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
                  }`}
                >
                  <Icon className="w-5 h-5 stroke-[1.5]" />
                </button>
              );
            })}
          </div>

          {/* Node Inventory Trigger Button */}
          <div className="flex flex-col items-center w-full relative">
            <div className="w-8 h-[1px] bg-zinc-800 my-2" />
            <button
              ref={trayBtnRef}
              onClick={() => setTrayOpen(!trayOpen)}
              title={`Node Inventory (${hiddenCount} Staged)`}
              className={`cursor-target relative p-3 rounded-xl transition-all duration-150 ${
                trayOpen
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-[0_0_12px_rgba(168,85,247,0.25)]'
                  : hiddenCount > 0
                  ? 'bg-zinc-900 text-purple-400 border border-purple-500/30 hover:bg-zinc-800'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
              }`}
            >
              <Boxes className="w-5 h-5 stroke-[1.5]" />
              <span className={`absolute -top-1 -right-1 px-1 py-0.5 rounded-full text-[8.5px] font-bold font-mono shadow-md border border-zinc-900 leading-none ${
                hiddenCount > 0 
                  ? 'bg-purple-600 text-white' 
                  : 'bg-zinc-800 text-zinc-500'
              }`}>
                {String(hiddenCount).padStart(2, '0')}
              </span>
            </button>
          </div>
        </aside>

        <main className="flex-1 relative bg-zinc-950 overflow-hidden flex flex-col z-10">
          {children}
        </main>

        <aside className={`border-l border-zinc-800 bg-zinc-900/40 flex flex-col transition-all duration-300 ease-in-out shrink-0 z-20 ${
          inspectorOpen ? 'w-84 opacity-100' : 'w-0 opacity-0 border-none'
        }`}>
          {inspectorOpen && (
            <div className="flex flex-col h-full w-84">
              <div className="h-14 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-900/50 shrink-0">
                <span className="text-xs font-semibold text-emerald-400 tracking-wider flex items-center">
                  {isAuthenticated ? (
                    <>
                      <UserCheck className="w-4 h-4 mr-2" /> TARGET NODE INTEL
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4 mr-2" /> TERMINAL LOGIN
                    </>
                  )}
                </span>
              </div>

              <div className="p-4 flex-1 overflow-y-auto space-y-4">
                {!isAuthenticated ? (
                  <form onSubmit={handleLoginSubmit} className="space-y-4 pt-1">
                    <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded text-xs text-zinc-400 leading-relaxed">
                      <span className="text-emerald-400 font-bold block mb-0.5">AIRGAP ACCESS CONTROL</span>
                      Authenticate with verified officer credentials to initialize session.
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] text-zinc-400 font-medium flex items-center">
                        <User className="w-3.5 h-3.5 mr-1.5 text-zinc-500" /> Username
                      </label>
                      <input
                        type="text"
                        value={loginUsername}
                        onChange={(e) => setLoginUsername(e.target.value)}
                        placeholder="turbo"
                        autoComplete="off"
                        className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded px-3 py-2 text-xs text-zinc-100 outline-none transition-colors"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] text-zinc-400 font-medium flex items-center">
                        <KeyRound className="w-3.5 h-3.5 mr-1.5 text-zinc-500" /> Password
                      </label>
                      <input
                        type="password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        placeholder="torpedo"
                        autoComplete="off"
                        className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded px-3 py-2 text-xs text-zinc-100 outline-none transition-colors"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold py-2.5 px-3 rounded text-xs transition-colors flex items-center justify-center space-x-2 shadow-lg shadow-emerald-950/50"
                    >
                      <LogIn className="w-4 h-4" />
                      <span>START INVESTIGATION</span>
                    </button>

                    <div className="pt-2 text-[10px] text-zinc-600 text-center border-t border-zinc-800 font-mono">
                      CCTNS PAN-INDIA SECURE MESH
                    </div>
                  </form>
                ) : (
                  <>
                    {selectedNode ? (
                      <div className="space-y-3.5 animate-in fade-in duration-200">
                        <div>
                          <span className="text-[10px] text-zinc-500 font-semibold tracking-wider block mb-1">CANONICAL TARGET</span>
                          <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded font-semibold text-zinc-100 text-xs break-all">
                            {selectedNode.name || selectedNode.id}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded">
                            <span className="text-[10px] text-zinc-500 block mb-0.5">CENTRALITY RISK</span>
                            <div className={`text-lg font-bold font-mono ${
                              Number(selectedNode.riskScore) > 70 ? 'text-red-400' : 'text-amber-400'
                            }`}>
                              {selectedNode.riskScore}%
                            </div>
                          </div>

                          <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded">
                            <span className="text-[10px] text-zinc-500 block mb-0.5">TYPE</span>
                            <span className="text-xs font-semibold text-emerald-400 truncate block">
                              {selectedNode.type || 'ENTITY'}
                            </span>
                          </div>
                        </div>

                        <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded space-y-0.5">
                          <span className="text-[10px] text-zinc-500 block">STATUS</span>
                          <div className={`flex items-center text-xs font-semibold ${
                            selectedNode.status?.includes('VICTIM') ? 'text-emerald-400' : 'text-red-400'
                          }`}>
                            <AlertOctagon className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                            <span className="truncate">{selectedNode.status}</span>
                          </div>
                        </div>

                        <div className="p-2.5 bg-zinc-950 border border-zinc-800 rounded space-y-0.5">
                          <span className="text-[10px] text-zinc-500 block">JURISDICTION</span>
                          <div className="flex items-center text-xs text-zinc-300">
                            <MapPin className="w-3.5 h-3.5 mr-1.5 text-zinc-500 shrink-0" />
                            <span>{selectedNode.district || 'Pan-India Grid'}</span>
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] text-zinc-500 block mb-1">SYSTEM UID</span>
                          <div className="text-[10px] font-mono text-zinc-400 bg-zinc-950 p-2 rounded border border-zinc-800 truncate">
                            {selectedNode.id}
                          </div>
                        </div>

                        {/* SUPPLY-CHAIN ROUTE TRACER */}
                        <div className="pt-2 border-t border-zinc-800">
                          <span className="text-[10px] text-zinc-500 font-semibold block mb-2">SUPPLY-CHAIN ROUTE TRACER</span>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => {
                                const rawId = selectedNode.rawId !== undefined ? selectedNode.rawId : (selectedNode.id === 'VICTIM:COMPLAINANT' ? 888888 : parseInt(String(selectedNode.id).replace(/\D/g, '')) || 0);
                                useStore.getState().setRouteOrigin({ id: rawId, name: selectedNode.name });
                              }}
                              className="cursor-target py-1.5 px-2 bg-zinc-900 hover:bg-zinc-800 text-amber-400 border border-amber-500/30 rounded text-xs font-semibold tracking-wide transition-all"
                            >
                              📍 Origin
                            </button>
                            <button
                              onClick={() => {
                                const rawId = selectedNode.rawId !== undefined ? selectedNode.rawId : (selectedNode.id === 'VICTIM:COMPLAINANT' ? 888888 : parseInt(String(selectedNode.id).replace(/\D/g, '')) || 0);
                                useStore.getState().setRouteTarget({ id: rawId, name: selectedNode.name });
                              }}
                              className="cursor-target py-1.5 px-2 bg-zinc-900 hover:bg-zinc-800 text-rose-400 border border-rose-500/30 rounded text-xs font-semibold tracking-wide transition-all"
                            >
                              🎯 Target
                            </button>
                          </div>
                        </div>

                        {/* PULL TARGET RAP SHEET */}
                        <button
                          onClick={() => handleDownloadTargetRapSheet(selectedNode.rawId, selectedNode.name)}
                          disabled={downloading}
                          className="cursor-target w-full mt-2 bg-emerald-600 hover:bg-transparent text-zinc-950 hover:text-emerald-400 border border-emerald-600 hover:border-emerald-500/80 font-bold py-2.5 px-3 rounded text-xs transition-all flex items-center justify-center space-x-2 shadow-lg shadow-emerald-950/50 hover:shadow-[0_0_20px_rgba(16,185,129,0.15)] disabled:bg-zinc-800 disabled:text-zinc-500 disabled:border-zinc-800"
                        >
                          <Download className="w-4 h-4" />
                          <span>{downloading ? 'GENERATING RAP SHEET...' : 'PULL TARGET RAP SHEET'}</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-64 text-zinc-600 space-y-2">
                        <ScanLine className="w-8 h-8 opacity-30 animate-pulse text-emerald-500" />
                        <p className="text-xs font-semibold tracking-wider text-zinc-400">AWAITING NODE SELECTION</p>
                        <span className="text-xs text-zinc-500 text-center px-4">
                          Click any suspect, vehicle, or account to inspect forensic telemetry.
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </aside>

        <button
          onClick={toggleInspector}
          className="absolute right-0 top-1/2 -translate-y-1/2 bg-zinc-900 border-y border-l border-zinc-800 p-1.5 rounded-l text-zinc-400 hover:text-zinc-200 z-30"
        >
          <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${inspectorOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Floating Node Inventory Drawer - MOUNTED VIA PORTAL TO PREVENT IFRAME OCCLUSION */}
      {trayOpen && typeof document !== 'undefined' && createPortal(
        <div 
          ref={trayRef}
          id="panoptes-node-inventory-drawer"
          className="fixed left-20 bottom-10 z-[99999] w-84 max-h-[72vh] flex flex-col bg-zinc-950 border border-zinc-700/90 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.95)] backdrop-blur-2xl animate-in fade-in slide-in-from-left-4 font-mono select-none"
        >
          {/* Drawer Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/60 rounded-t-xl">
            <div className="flex items-center space-x-2">
              <Boxes className="w-4 h-4 text-purple-400" />
              <span className="text-xs font-bold text-zinc-100 tracking-wider">NODE INVENTORY</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-purple-950/80 border border-purple-700 text-purple-300 font-bold">
                HIDDEN // {String(hiddenCount).padStart(2, '0')}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              {hiddenCount > 0 && (
                <button
                  onClick={handleRestoreAllNodes}
                  title="Restore all hidden entities to active mesh"
                  className="text-[10px] text-zinc-300 hover:text-emerald-400 font-bold transition-colors flex items-center space-x-1 px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700"
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  <span>ALL</span>
                </button>
              )}
              <button
                onClick={() => setTrayOpen(false)}
                className="p-1 text-zinc-400 hover:text-zinc-100 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Hidden Entities List */}
          <div className="p-3 overflow-y-auto max-h-96 space-y-2">
            {hiddenCount === 0 ? (
              <div className="py-8 text-center text-zinc-500 flex flex-col items-center justify-center space-y-2">
                <Boxes className="w-9 h-9 opacity-25 text-purple-400 mb-1" />
                <span className="text-xs font-bold tracking-wider text-zinc-300">TRAY EMPTY</span>
                <p className="text-[11px] text-zinc-500 max-w-[220px] leading-relaxed">
                  Click the <span className="text-rose-400 font-bold">[×]</span> on any expanded node card to temporarily stash it from analytical view.
                </p>
              </div>
            ) : (
              hiddenNodes.map((node) => (
                <div
                  key={node.id}
                  className="p-2.5 bg-zinc-900/80 border border-zinc-800 rounded-lg hover:border-zinc-700 transition-all flex items-center justify-between group"
                >
                  <div className="truncate mr-3 space-y-0.5">
                    <div className="flex items-center space-x-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                      <span className="text-xs font-bold text-zinc-100 truncate block">
                        {node.name}
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-400 flex items-center space-x-2">
                      <span>{node.type}</span>
                      <span>•</span>
                      <span className="text-amber-400">
                        {node.riskScore ? `RISK ${node.riskScore}%` : 'VERIFIED'}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRestoreNode(node.id)}
                    className="cursor-target px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-bold tracking-wider transition-colors shrink-0"
                  >
                    RESTORE
                  </button>
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Statutory Footer */}
      <footer className="h-7 border-t border-zinc-800 bg-zinc-950 px-4 flex items-center justify-between text-xs text-zinc-500 shrink-0 font-mono relative z-40">
        <div className="flex items-center space-x-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-zinc-300 font-semibold text-[11px]">BSA 2023 SEC 63(4) CERTIFIED</span>
          <span className="text-zinc-600">|</span>
          <span className="text-[11px]">{evidenceMode === 'uploaded' ? 'CUSTOM EVIDENCE INGESTION' : 'AIRGAP SOVEREIGN MESH'}</span>
        </div>

        <div className="flex items-center space-x-2 text-zinc-400">
          <span className="text-zinc-500 text-[10px]">EVIDENTIARY HASH:</span>
          <span className="text-emerald-400/90 text-[10px] bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
            {uploadedExhibitHash || '2c7d1fd3af452a4b368d47284790ff3b7fbe7b66ee24456fc6c208871b804c15'}
          </span>
        </div>
      </footer>

      {/* Multipart File Upload Modal */}
      {uploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl w-[520px] max-w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center space-x-2 text-emerald-400 font-bold text-sm font-mono">
                <FileUp className="w-5 h-5" />
                <span>EVIDENTIARY EXHIBIT INGESTION (UP TO 11 FILES)</span>
              </div>
              <button
                onClick={() => setUploadModalOpen(false)}
                className="text-zinc-500 hover:text-zinc-200 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Upload raw seized files (<span className="text-amber-400 font-mono">.csv</span> / <span className="text-amber-400 font-mono">.txt</span>), such as DoT CDR telecom records, IMPS banking logs, or extracted chats.
            </p>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-zinc-800 hover:border-emerald-500/60 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer transition-colors bg-zinc-900/30 group"
              >
                <Upload className="w-8 h-8 text-zinc-600 group-hover:text-emerald-400 transition-colors mb-2" />
                <span className="text-xs font-semibold text-zinc-300">Click to select files (file1 to file11)</span>
                <span className="text-[10px] text-zinc-500 mt-1">Accepts CSV, TXT (Maximum 11 files)</span>
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
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 text-xs">
                  {selectedFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-zinc-900 rounded border border-zinc-800 text-[11px]">
                      <span className="text-zinc-300 truncate max-w-[320px]">
                        <span className="text-emerald-400 font-bold mr-2 font-mono">[{idx + 1}]</span>
                        {file.name}
                      </span>
                      <span className="text-zinc-500 text-[10px] font-mono">{(file.size / 1024).toFixed(1)} KB</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-end space-x-3 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setUploadModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading || selectedFiles.length === 0}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 text-zinc-950 font-bold text-xs rounded transition-colors flex items-center space-x-2"
                >
                  {uploading ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin"></div>
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
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Loader2, AlertTriangle, Route, ArrowRight, RotateCcw, 
  Sparkles, Filter, ChevronDown, ChevronUp, Lock, X, 
  Search 
} from 'lucide-react';
import { useStore, ALL_CLASSIFICATIONS } from '../store';
import CursorGrid from './ui/CursorGrid';
import LetterGlitch from './ui/LetterGlitch';
import SpecularButton from './ui/SpecularButton';

const FILTER_CATEGORIES = [
  { id: 'PERSON', label: 'Suspects / Masterminds', dot: 'bg-amber-400', border: 'border-amber-500/40', text: 'text-amber-300' },
  { id: 'ACCOUNT_UPI', label: 'Mule Accounts (UPI)', dot: 'bg-purple-400', border: 'border-purple-500/40', text: 'text-purple-300' },
  { id: 'VEHICLE', label: 'Transit Vehicles', dot: 'bg-slate-400', border: 'border-slate-500/40', text: 'text-slate-300' },
  { id: 'CRIME_INCIDENT', label: 'Linked FIR Cases', dot: 'bg-sky-400', border: 'border-sky-500/40', text: 'text-sky-300' },
  { id: 'PHONE_MSISDN', label: 'CDR Handsets', dot: 'bg-cyan-400', border: 'border-cyan-500/40', text: 'text-cyan-300' },
  { id: 'CELL_TOWER_CGI', label: 'Cell Towers', dot: 'bg-indigo-400', border: 'border-indigo-500/40', text: 'text-indigo-300' },
  { id: 'COMPLAINANT', label: 'Protected Victim', dot: 'bg-emerald-400', border: 'border-emerald-500/40', text: 'text-emerald-300' },
  { id: 'ATM', label: 'Cash-Out ATMs', dot: 'bg-rose-400', border: 'border-rose-500/40', text: 'text-rose-300' },
];

export default function NetworkView() {
  const { 
    isAuthenticated,
    activeCaseId, 
    activeModule, 
    routeOrigin, 
    routeTarget, 
    clearRoute,
    jurisdictionScope,
    evidenceMode,
    uploadedFiles,
    uploadedEntityMap,
    enabledNodeTypes,
    toggleNodeType,
    setAllNodeTypes,
    hiddenNodes = [],
    hideNode
  } = useStore();

  const [status, setStatus] = useState('idle');
  const [isGlitching, setIsGlitching] = useState(false);
  const [iframeKey, setIframeKey] = useState(Date.now());
  const [pathResult, setPathResult] = useState(null);
  const [cycleResult, setCycleResult] = useState(null);
  const [tracing, setTracing] = useState(false);
  const [detectingCycles, setDetectingCycles] = useState(false);
  const [filterExpanded, setFilterExpanded] = useState(false);
  const iframeRef = useRef(null);
  const iframeLoadResolverRef = useRef(null);

// In src/components/NetworkView.jsx:
  useEffect(() => {
    if (!isAuthenticated || (!activeCaseId && evidenceMode !== 'uploaded')) {
      if (iframeRef.current) {
        iframeRef.current.src = 'about:blank';
      }
      setStatus('idle');
      return;
    }

    let isMounted = true;
    const generateAndLoadGraph = async () => {
      // 1. Immediately wipe previous graph & route artifacts from viewport
      if (iframeRef.current) {
        iframeRef.current.src = 'about:blank';
      }
      setPathResult(null);
      setCycleResult(null);
      clearRoute();
      setIsGlitching(true);

      const minTimerPromise = new Promise(resolve => setTimeout(resolve, 1500));
      const iframeReadyPromise = new Promise(resolve => {
        const safetyTimer = setTimeout(resolve, 3500);
        iframeLoadResolverRef.current = () => {
          clearTimeout(safetyTimer);
          resolve();
        };
      });

      try {
        const typesParam = enabledNodeTypes.length > 0 ? enabledNodeTypes.join(',') : 'NONE';
        const targetId = activeCaseId || 'DEFAULT-INGEST';
        const res = await fetch(
          `http://127.0.0.1:8000/api/graph/generate/${encodeURIComponent(targetId)}?mode=${activeModule}&scope=${jurisdictionScope}&types=${encodeURIComponent(typesParam)}`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!isMounted) return;

        setIframeKey(data.timestamp);
        // Point iframe to freshly compiled graph
        if (iframeRef.current) {
          iframeRef.current.src = `http://127.0.0.1:8000/static/crime_network_visualization.html?t=${data.timestamp}`;
        }
        await Promise.all([minTimerPromise, iframeReadyPromise]);
        if (isMounted) {
          setStatus('success');
          setIsGlitching(false);
        }
      } catch (err) {
        console.error(err);
        if (isMounted) {
          setStatus('error');
          setIsGlitching(false);
        }
      }
    };

    generateAndLoadGraph();
    return () => { isMounted = false; };
  }, [isAuthenticated, activeCaseId, activeModule, jurisdictionScope, evidenceMode, enabledNodeTypes]);
  const handleIframeLoad = useCallback(() => {
    if (iframeLoadResolverRef.current) {
      iframeLoadResolverRef.current();
      iframeLoadResolverRef.current = null;
    }
    setTimeout(() => {
      const currentHidden = (useStore.getState().hiddenNodes || []).map((n) => n.id);
      if (currentHidden.length > 0) {
        iframeRef.current?.contentWindow?.postMessage({ type: 'SET_HIDDEN_NODES', payload: currentHidden }, '*');
      }
      iframeRef.current?.contentWindow?.postMessage({ type: 'FIT_VIEW' }, '*');
    }, 150);
  }, []);

  useEffect(() => {
    const handleMessage = async (event) => {
      if (!event.data) return;

      // 1. Handle node removal message from Vis.js canvas
      if (event.data.type === 'NODE_REMOVED') {
        const removed = event.data.payload;
        useStore.getState().hideNode(removed);
        
        const curSelected = useStore.getState().selectedNode;
        if (curSelected && (String(curSelected.rawId) === String(removed.id) || String(curSelected.id) === String(removed.id))) {
          useStore.setState({ selectedNode: null });
        }
        return;
      }

      // 2. Handle node selection
      if (event.data.type === 'NODE_CLICK') {
        const nodeId = event.data.payload;
        const canvasNode = event.data.nodeData;
        let parsedType = 'ENTITY';
        let parsedName = `Node #${nodeId}`;
        if (canvasNode && canvasNode.label) {
          const lines = String(canvasNode.label).split('\n');
          if (lines.length > 1) {
            parsedType = lines[0].trim();
            parsedName = lines.slice(1).join(' ').trim();
          } else {
            parsedName = lines[0].trim();
          }
        }
        const initialNode = {
          rawId: nodeId,
          id: String(nodeId),
          name: parsedName,
          type: parsedType,
          status: 'ACTIVE EVIDENCE LINK',
          riskScore: '50.0',
          district: evidenceMode === 'uploaded' ? 'Custom Exhibit Stream' : 'Pan-India Grid'
        };
        useStore.setState({ selectedNode: initialNode });
        try {
          const cleanId = encodeURIComponent(String(nodeId).trim());
          const res = await fetch(`http://127.0.0.1:8000/api/node/${cleanId}`);
          if (res.ok) {
            const data = await res.json();
            const riskNum = Number(data.risk_score || 0);
            let tacticalStatus = 'ACTIVE SUSPECT LINK';
            if (data.is_shatter_point === 1 || String(data.entity_uid).includes('ATM_') || String(data.entity_uid).includes('SHATTER')) {
              tacticalStatus = 'CRITICAL SHATTER POINT (ATM / EXIT)';
            } else if (data.node_type === 'COMPLAINANT' || riskNum === 0 || nodeId === 888888) {
              tacticalStatus = 'VERIFIED COMPLAINANT / VICTIM';
            } else if (data.node_type === 'PERSON' && riskNum >= 0.8) {
              tacticalStatus = 'HIGH-RISK MASTERMIND / BROKER';
            } else if (data.node_type === 'ACCOUNT_UPI' || data.node_type === 'MULE_ACCOUNT') {
              tacticalStatus = 'IDENTIFIED MULE ACCOUNT';
            } else if (data.node_type === 'PHONE_MSISDN') {
              tacticalStatus = 'MONITORED CDR HANDSET';
            }
            useStore.setState({
              selectedNode: {
                rawId: nodeId,
                id: data.entity_uid || `NODE #${nodeId}`,
                name: data.canonical_label || parsedName,
                type: data.node_type || parsedType,
                status: tacticalStatus,
                riskScore: (riskNum * 100).toFixed(1),
                district: data.jurisdiction_district || 'Pan-India Grid'
              }
            });
          }
        } catch (err) {
          console.warn('API node fetch error (using canvas fallback):', err);
        }
      } else if (event.data?.type === 'CANVAS_CLICK') {
        useStore.setState({ selectedNode: null });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [evidenceMode, uploadedEntityMap]);

  const handleTraceRoute = async () => {
    if (!routeOrigin || !routeTarget) return;
    setTracing(true);
    try {
      let data = null;
      if (evidenceMode === 'uploaded' && uploadedFiles.length > 0) {
        const formData = new FormData();
        uploadedFiles.forEach((f, i) => formData.append(`file${i + 1}`, f));
        const res = await fetch(`http://127.0.0.1:8000/api/find-path/${activeCaseId || 'DEFAULT-INGEST'}?source_node=${routeOrigin.id}&target_node=${routeTarget.id}`, {
          method: 'POST',
          body: formData
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
      } else {
        const res = await fetch(`http://127.0.0.1:8000/api/path/${activeCaseId}?source_node=${routeOrigin.id}&target_node=${routeTarget.id}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
      }
      if (data.status === 'success' && data.path && data.path.length > 0) {
        setPathResult(data);
        setCycleResult(null);
        iframeRef.current?.contentWindow?.postMessage({ type: 'HIGHLIGHT_PATH', payload: data.path }, '*');
      } else {
        alert("No connecting supply-chain route found between selected nodes.");
      }
    } catch (err) {
      console.error(err);
      alert("Route tracing failed. Check console or node IDs.");
    } finally {
      setTracing(false);
    }
  };

  const handleDetectCycles = async () => {
    setDetectingCycles(true);
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/cycles/${activeCaseId}`);
      const data = await res.json();
      if (data.status === 'success' && data.all_cycle_nodes.length > 0) {
        setCycleResult(data);
        setPathResult(null);
        iframeRef.current?.contentWindow?.postMessage({ type: 'HIGHLIGHT_CYCLES', payload: data.all_cycle_nodes }, '*');
      } else {
        alert("Hawala Loop Tracer: No circular fund routing detected. Financial flow is linear.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDetectingCycles(false);
    }
  };

  const handleClearCycles = () => {
    setCycleResult(null);
    iframeRef.current?.contentWindow?.postMessage({ type: 'RESET_PATH' }, '*');
  };

  const handleReset = () => {
    clearRoute();
    setPathResult(null);
    setCycleResult(null);
    iframeRef.current?.contentWindow?.postMessage({ type: 'RESET_PATH' }, '*');
  };

  if (!isAuthenticated) {
    return (
      <div className="relative w-full h-full bg-zinc-950 overflow-hidden flex flex-col items-center justify-center font-mono select-none">
        <div className="absolute inset-0 z-0">
          <CursorGrid
            cellSize={55}
            color="#10b981"
            radius={180}
            falloff="smooth"
            holdTime={350}
            fadeDuration={750}
            lineWidth={1.1}
            maxOpacity={0.65}
            fillOpacity={0.06}
            gridOpacity={0.035}
            cellRadius={0}
            clickPulse={true}
            pulseSpeed={550}
          />
        </div>
        <div className="relative z-10 flex flex-col items-center justify-center text-center p-6 pointer-events-none">
          <div className="w-16 h-16 rounded-full border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center mb-6 shadow-[0_0_24px_rgba(16,185,129,0.15)] backdrop-blur-xs">
            <Lock className="w-7 h-7 text-emerald-400" />
          </div>
          <h2 className="text-sm font-bold tracking-widest text-zinc-100 mb-2.5">
            LOGIN TO START INVESTIGATION
          </h2>
          <p className="text-xs text-zinc-500 max-w-md leading-relaxed">
            Enter officer credentials in the right panel to initialize the CCTNS Sovereign Mesh session.
          </p>
        </div>
      </div>
    );
  }

  if (!activeCaseId && evidenceMode !== 'uploaded') {
    return (
      <div className="relative w-full h-full bg-zinc-950 overflow-hidden flex flex-col items-center justify-center font-mono select-none">
        <div className="absolute inset-0 z-0">
          <CursorGrid
            cellSize={55}
            color="#10b981"
            radius={180}
            falloff="smooth"
            holdTime={350}
            fadeDuration={750}
            lineWidth={1.1}
            maxOpacity={0.65}
            fillOpacity={0.06}
            gridOpacity={0.035}
            cellRadius={0}
            clickPulse={true}
            pulseSpeed={550}
          />
        </div>
        <div className="relative z-10 flex flex-col items-center justify-center text-center p-6 pointer-events-none">
          <div className="w-16 h-16 rounded-full border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center mb-6 shadow-[0_0_24px_rgba(16,185,129,0.15)] backdrop-blur-xs">
            <Search className="w-7 h-7 text-emerald-400" />
          </div>
          <h2 className="text-sm font-bold tracking-widest text-zinc-100 mb-2.5 uppercase">
            SEARCH CASE OR UPLOAD FILES TO INVESTIGATE
          </h2>
          <p className="text-xs text-zinc-500 max-w-md leading-relaxed">
            Query a registered FIR (e.g. <span className="text-zinc-300">CASE-BR-PAT-2023-00207</span>) in the top search bar, or click <span className="text-emerald-400 font-semibold">UPLOAD EXHIBITS</span> to ingest seized telecom CDR or bank statement files.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full text-red-400 space-y-3 bg-zinc-950 font-mono">
        <AlertTriangle className="w-10 h-10" />
        <p className="text-sm tracking-wider font-bold">FAILED TO GENERATE CASE NETWORK</p>
        <span className="text-xs text-zinc-500">Case ID does not exist in CCTNS registry or backend is restarting.</span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-zinc-950 overflow-hidden font-mono">
      {/* Full-Screen LetterGlitch Loader: Completely unmounted when isGlitching is false */}
      {isGlitching && (
        <div className="absolute inset-0 z-50 bg-zinc-950 select-none animate-in fade-in duration-150">
          <div className="w-full h-full opacity-40">
            <LetterGlitch
              glitchColors={['#064e3b', '#065f46', '#047857', '#10b981', '#34d399', '#6ee7b7']}
              glitchSpeed={35}
              centerVignette={true}
              outerVignette={true}
              smooth={true}
              backgroundColor="#09090b"
            />
          </div>
        </div>
      )}

      {/* Top Floating Control Bar */}
      <div className="absolute top-4 left-6 right-6 z-30 flex items-center justify-between pointer-events-none">
        {(routeOrigin || routeTarget) ? (
          <div className="pointer-events-auto bg-zinc-950/90 border border-zinc-800 rounded-lg p-2.5 shadow-2xl backdrop-blur-md flex items-center space-x-3 text-xs">
            <Route className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="flex items-center space-x-1.5">
              <span className="text-zinc-500 text-[10px]">SRC:</span>
              <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded font-semibold truncate max-w-[120px]">
                {routeOrigin?.name || '...'}
              </span>
            </div>
            <ArrowRight className="w-3 h-3 text-zinc-600" />
            <div className="flex items-center space-x-1.5">
              <span className="text-zinc-500 text-[10px]">TGT:</span>
              <span className="px-2 py-0.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded font-semibold truncate max-w-[120px]">
                {routeTarget?.name || '...'}
              </span>
            </div>
            <button
              onClick={handleTraceRoute}
              disabled={!routeOrigin || !routeTarget || tracing}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 text-zinc-950 font-bold rounded text-[11px] transition-all flex items-center space-x-1"
            >
              {tracing ? <Loader2 className="w-3 h-3 animate-spin" /> : <span>  BFS Route</span>}
            </button>
          </div>
        ) : (
          <div className="pointer-events-auto bg-zinc-950/85 border border-zinc-800/80 px-3 py-1.5 rounded-lg text-[11px] flex items-center space-x-2 shadow-lg backdrop-blur-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-zinc-500 text-[10px]">LENS:</span>
            <span className="text-emerald-300 font-bold uppercase tracking-wider">
              {evidenceMode === 'uploaded' ? 'CUSTOM EXHIBIT STREAM' : `${jurisdictionScope} GRID`}
            </span>
          </div>
        )}

        <div className="pointer-events-auto flex items-center space-x-2">
          {evidenceMode === 'database' && (
            <div className="flex items-center space-x-1.5">
              <SpecularButton
                size="sm"
                radius={8}
                tint="#3b0764"
                tintOpacity={0.4}
                blur={8}
                textColor="#f0abfc"
                lineColor="#e879f9"
                baseColor="#86198f"
                intensity={1.3}
                shineSize={14}
                shineFade={35}
                thickness={1.2}
                speed={0.4}
                followMouse={true}
                proximity={200}
                disabled={detectingCycles}
                onClick={handleDetectCycles}
                className={cycleResult ? 'shadow-[0_0_16px_rgba(232,121,249,0.3)]' : ''}
              >
                {detectingCycles ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin text-fuchsia-400" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 mr-1.5 text-fuchsia-400" />
                )}
                <span>Hawala Loop Tracer</span>
              </SpecularButton>

              {cycleResult && (
                <button
                  type="button"
                  onClick={handleClearCycles}
                  className="p-2 bg-zinc-950/90 hover:bg-rose-950/40 text-rose-400 hover:text-rose-300 border border-rose-500/40 hover:border-rose-400 rounded-lg text-xs shadow-lg backdrop-blur-md transition-all flex items-center justify-center group"
                  title="Turn off Hawala Loop Tracer"
                >
                  <X className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform duration-200" />
                </button>
              )}
            </div>
          )}

          {(pathResult || cycleResult || routeOrigin || routeTarget) && (
            <button
              onClick={handleReset}
              className="p-2 bg-zinc-950/90 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-lg shadow-lg"
              title="Reset View"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Bottom-Left: Classification Filter */}
      <div className="absolute bottom-4 left-6 z-30 flex flex-col space-y-2 pointer-events-none max-w-[calc(100vw-450px)]">
        {pathResult && (
          <div className="pointer-events-auto bg-zinc-950/95 border border-amber-500/40 rounded px-3 py-2 text-xs shadow-2xl font-mono max-w-md">
            <span className="font-bold text-zinc-200">TRAIL ({pathResult.hops} HOPS): </span>
            <span className="text-zinc-300">{pathResult.labels.join("   ")}</span>
          </div>
        )}

        {!filterExpanded ? (
          <div 
            onClick={() => setFilterExpanded(true)}
            className="pointer-events-auto bg-zinc-950/90 hover:bg-zinc-900/90 border border-zinc-800/90 hover:border-zinc-700 rounded-lg px-3 py-2 shadow-2xl backdrop-blur-md flex items-center space-x-2.5 font-mono text-xs cursor-pointer transition-all select-none group w-fit"
            title="Click to expand classification filters"
          >
            <Filter className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform shrink-0" />
            <span className="text-zinc-200 font-bold tracking-wider text-[11px] whitespace-nowrap">
              CLASSIFICATION FILTER
            </span>
            <span className="text-[10px] px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 text-emerald-400 rounded font-bold shrink-0">
              {enabledNodeTypes.length}/{FILTER_CATEGORIES.length}
            </span>
            <div className="h-3 w-[1px] bg-zinc-800 mx-0.5 shrink-0" />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setAllNodeTypes(ALL_CLASSIFICATIONS); }}
              className="text-[10px] text-zinc-400 hover:text-emerald-400 transition-colors font-semibold px-0.5"
              title="Enable all categories"
            >
              ALL
            </button>
            <span className="text-zinc-700 text-[10px]">|</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setAllNodeTypes(['PERSON', 'ACCOUNT_UPI']); }}
              className="text-[10px] text-zinc-400 hover:text-amber-400 transition-colors font-semibold px-0.5"
              title="Core targets only"
            >
              CORE
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setFilterExpanded(true); }}
              title="Expand Grid"
              className="p-1 hover:bg-zinc-800 text-zinc-500 hover:text-emerald-400 rounded transition-colors ml-1 shrink-0"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="pointer-events-auto bg-zinc-950/95 border border-zinc-800/90 rounded-lg p-3 shadow-2xl backdrop-blur-md font-mono text-xs w-80 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center justify-between border-b border-zinc-800/70 pb-2">
              <div className="flex items-center space-x-2">
                <Filter className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-zinc-200 font-bold tracking-wider text-[11px]">CLASSIFICATION FILTER</span>
                <span className="text-[10px] px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 text-emerald-400 rounded font-bold">
                  {enabledNodeTypes.length}/{FILTER_CATEGORIES.length}
                </span>
              </div>
              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={() => setAllNodeTypes(ALL_CLASSIFICATIONS)}
                  className="text-[10px] text-zinc-400 hover:text-emerald-400 transition-colors px-1 font-semibold"
                >
                  ALL
                </button>
                <span className="text-zinc-700 text-[10px]">|</span>
                <button
                  type="button"
                  onClick={() => setAllNodeTypes(['PERSON', 'ACCOUNT_UPI'])}
                  className="text-[10px] text-zinc-400 hover:text-amber-400 transition-colors px-1 font-semibold"
                >
                  CORE
                </button>
                <button
                  type="button"
                  onClick={() => setFilterExpanded(false)}
                  className="p-1 hover:bg-zinc-900 text-zinc-500 hover:text-zinc-200 rounded transition-colors"
                  title="Minimize filter"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-2.5">
              {FILTER_CATEGORIES.map((cat) => {
                const isChecked = enabledNodeTypes.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    onClick={() => toggleNodeType(cat.id)}
                    className={`flex items-center space-x-1.5 px-2 py-1.5 rounded text-[10px] border transition-all text-left truncate ${
                      isChecked
                        ? `bg-zinc-900/90 ${cat.border}${cat.text}`
                        : 'bg-zinc-950/40 border-zinc-900 text-zinc-600 hover:border-zinc-800'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isChecked ? cat.dot : 'bg-zinc-700'}`} />
                    <span className="truncate">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom-Right: Hawala Loops Overlay */}
      {cycleResult && (
        <div className="absolute bottom-4 right-6 z-30 pointer-events-auto bg-zinc-950/95 border border-fuchsia-500/50 rounded-lg p-3 text-xs shadow-2xl font-mono max-w-md animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center justify-between gap-3 border-b border-fuchsia-900/40 pb-1.5 mb-2">
            <span className="font-bold text-fuchsia-400 flex items-center text-[11px] tracking-wider">
              <Sparkles className="w-3.5 h-3.5 mr-1.5 text-fuchsia-400 shrink-0" />
              HAWALA LOOPS ({cycleResult.cycle_count})
            </span>
            <button
              onClick={handleClearCycles}
              className="text-zinc-500 hover:text-zinc-300 p-0.5 rounded transition-colors"
              title="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="text-zinc-300 text-[11px] leading-relaxed max-h-32 overflow-y-auto pr-1 space-y-1">
            {cycleResult.cycles.map((c, i) => (
              <div key={i} className="py-0.5 flex items-start space-x-1.5">
                <span className="text-fuchsia-400 shrink-0 font-bold">[{i + 1}]</span>
                <span className="text-zinc-300">{c.labels.join("   ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty Filter State Lens Indicator */}
      {enabledNodeTypes.length === 0 && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none font-mono">
          <div className="bg-zinc-950/90 border border-zinc-800/90 px-4 py-3 rounded-lg shadow-2xl backdrop-blur-md flex flex-col items-center space-y-1">
            <span className="text-amber-400 font-bold text-xs tracking-wider">ALL CLASSIFICATIONS MUTED (0/8)</span>
            <span className="text-zinc-500 text-[10px]">Toggle individual categories or click ALL / CORE in the filter tray.</span>
          </div>
        </div>
      )}

      {/* Vis-Network Iframe */}
      <iframe
        ref={iframeRef}
        key={iframeKey}
        title="Network Mesh"
        onLoad={handleIframeLoad}
        src={`http://127.0.0.1:8000/static/crime_network_visualization.html?t=${iframeKey}`}
        className="w-full h-full border-0 absolute inset-0 z-10 bg-transparent"
      />
      <div className="absolute inset-0 shadow-[inset_0_0_90px_rgba(0,0,0,0.85)] pointer-events-none z-20" />
    </div>
  );
}
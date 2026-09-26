import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Loader2,
  AlertTriangle,
  Route,
  ArrowRight,
  RotateCcw,
  Sparkles,
  Filter,
  ChevronDown,
  ChevronUp,
  Lock,
  X,
  Search,
} from "lucide-react";
import { useStore, ALL_CLASSIFICATIONS } from "../store";
import CursorGrid from "./ui/CursorGrid";
import LetterGlitch from "./ui/LetterGlitch";
import SpecularButton from "./ui/SpecularButton";

const FILTER_CATEGORIES = [
  {
    id: "PERSON",
    label: "Suspects / Masterminds",
    dot: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)]",
    active:
      "bg-rose-500/10 border-rose-500/40 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.15)]",
  },
  {
    id: "ACCOUNT_UPI",
    label: "Mule Accounts (UPI)",
    dot: "bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.9)]",
    active:
      "bg-purple-500/10 border-purple-500/40 text-purple-300 shadow-[0_0_12px_rgba(192,132,252,0.15)]",
  },
  {
    id: "VEHICLE",
    label: "Transit Vehicles",
    dot: "bg-slate-300 shadow-[0_0_8px_rgba(203,213,225,0.9)]",
    active:
      "bg-slate-500/10 border-slate-400/40 text-slate-200 shadow-[0_0_12px_rgba(148,163,184,0.15)]",
  },
  {
    id: "CRIME_INCIDENT",
    label: "Linked FIR Cases",
    dot: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]",
    active:
      "bg-amber-500/10 border-amber-500/40 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.15)]",
  },
  {
    id: "PHONE_MSISDN",
    label: "CDR Handsets",
    dot: "bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.9)]",
    active:
      "bg-sky-500/10 border-sky-500/40 text-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.15)]",
  },
  {
    id: "CELL_TOWER_CGI",
    label: "Cell Towers",
    dot: "bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.9)]",
    active:
      "bg-teal-500/10 border-teal-500/40 text-teal-300 shadow-[0_0_12px_rgba(45,212,191,0.15)]",
  },
  {
    id: "COMPLAINANT",
    label: "Protected Victim",
    dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]",
    active:
      "bg-emerald-500/10 border-emerald-500/40 text-emerald-300 shadow-[0_0_12px_rgba(52,211,153,0.15)]",
  },
  {
    id: "ATM",
    label: "Cash-Out ATMs",
    dot: "bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.9)]",
    active:
      "bg-rose-400/10 border-rose-400/40 text-rose-300 shadow-[0_0_12px_rgba(251,113,133,0.15)]",
  },
];

export default function NetworkView() {
  const {
    isAuthenticated,
    activeCaseId,
    activeModule,
    inspectorOpen,
    routeOrigin,
    routeTarget,
    setRouteOrigin,
    setRouteTarget,
    clearRoute,
    jurisdictionScope,
    evidenceMode,
    uploadedFiles,
    uploadedEntityMap,
    enabledNodeTypes,
    toggleNodeType,
    setAllNodeTypes,
    hiddenNodes = [],
    hideNode,
  } = useStore();

  const [status, setStatus] = useState("idle");
  const [isGlitching, setIsGlitching] = useState(false);
  const [iframeKey, setIframeKey] = useState(Date.now());
  const [pathResult, setPathResult] = useState(null);
  const [cycleResult, setCycleResult] = useState(null);
  const [tracing, setTracing] = useState(false);
  const [detectingCycles, setDetectingCycles] = useState(false);
  const [filterExpanded, setFilterExpanded] = useState(false);
  const iframeRef = useRef(null);
  const iframeLoadResolverRef = useRef(null);

  // Sync canvas dimensions and graph layout when inspector panel collapses or expands
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
      if (iframeRef.current) {
        iframeRef.current.contentWindow?.postMessage({ type: "FIT_VIEW" }, "*");
      }
    }, 320);
    return () => clearTimeout(timer);
  }, [inspectorOpen]);

  useEffect(() => {
    if (!isAuthenticated || (!activeCaseId && evidenceMode !== "uploaded")) {
      if (iframeRef.current) {
        iframeRef.current.src = "about:blank";
      }
      setStatus("idle");
      return;
    }

    let isMounted = true;
    const generateAndLoadGraph = async () => {
      if (iframeRef.current) {
        iframeRef.current.src = "about:blank";
      }
      setPathResult(null);
      setCycleResult(null);
      clearRoute();
      setIsGlitching(true);

      const minTimerPromise = new Promise((resolve) => setTimeout(resolve, 1500));
      const iframeReadyPromise = new Promise((resolve) => {
        const safetyTimer = setTimeout(resolve, 3500);
        iframeLoadResolverRef.current = () => {
          clearTimeout(safetyTimer);
          resolve();
        };
      });

      try {
        const typesParam =
          enabledNodeTypes.length > 0 ? enabledNodeTypes.join(",") : "NONE";
        const targetId = activeCaseId || "DEFAULT-INGEST";
        const res = await fetch(
          `http://127.0.0.1:8000/api/graph/generate/${encodeURIComponent(targetId)}?mode=${activeModule}&scope=${jurisdictionScope}&types=${encodeURIComponent(typesParam)}`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!isMounted) return;

        setIframeKey(data.timestamp);
        if (iframeRef.current) {
          iframeRef.current.src = `http://127.0.0.1:8000/static/crime_network_visualization.html?t=${data.timestamp}`;
        }

        await Promise.all([minTimerPromise, iframeReadyPromise]);
        if (isMounted) {
          setStatus("success");
          setIsGlitching(false);
        }
      } catch (err) {
        console.error(err);
        if (isMounted) {
          setStatus("error");
          setIsGlitching(false);
        }
      }
    };

    generateAndLoadGraph();
    return () => {
      isMounted = false;
    };
  }, [
    isAuthenticated,
    activeCaseId,
    activeModule,
    jurisdictionScope,
    evidenceMode,
    enabledNodeTypes,
  ]);

  const handleIframeLoad = useCallback(() => {
    if (iframeLoadResolverRef.current) {
      iframeLoadResolverRef.current();
      iframeLoadResolverRef.current = null;
    }
    setTimeout(() => {
      const currentHidden = (useStore.getState().hiddenNodes || []).map(
        (n) => n.id,
      );
      if (currentHidden.length > 0) {
        iframeRef.current?.contentWindow?.postMessage(
          { type: "SET_HIDDEN_NODES", payload: currentHidden },
          "*",
        );
      }
      iframeRef.current?.contentWindow?.postMessage({ type: "FIT_VIEW" }, "*");
    }, 150);
  }, []);

  useEffect(() => {
    const handleMessage = async (event) => {
      if (!event.data) return;
      if (event.data.type === "NODE_REMOVED") {
        const removed = event.data.payload;
        useStore.getState().hideNode(removed);
        const curSelected = useStore.getState().selectedNode;
        if (
          curSelected &&
          (String(curSelected.rawId) === String(removed.id) ||
            String(curSelected.id) === String(removed.id))
        ) {
          useStore.setState({ selectedNode: null });
        }
        return;
      }
      if (event.data.type === "NODE_CLICK") {
        const nodeId = event.data.payload;
        const canvasNode = event.data.nodeData;
        let parsedType = "ENTITY";
        let parsedName = `Node #${nodeId}`;
        if (canvasNode && canvasNode.label) {
          const lines = String(canvasNode.label).split("\n");
          if (lines.length > 1) {
            parsedType = lines[0].trim();
            parsedName = lines.slice(1).join(" ").trim();
          } else {
            parsedName = lines[0].trim();
          }
        }
        const initialNode = {
          rawId: nodeId,
          id: String(nodeId),
          name: parsedName,
          type: parsedType,
          status: "ACTIVE EVIDENCE LINK",
          riskScore: "50.0",
          district:
            evidenceMode === "uploaded"
              ? "Custom Exhibit Stream"
              : "Pan-India Grid",
        };
        useStore.setState({ selectedNode: initialNode, inspectorOpen: true });
        try {
          const cleanId = encodeURIComponent(String(nodeId).trim());
          const res = await fetch(`http://127.0.0.1:8000/api/node/${cleanId}`);
          if (res.ok) {
            const data = await res.json();
            const riskNum = Number(data.risk_score || 0);
            let tacticalStatus = "ACTIVE SUSPECT LINK";
            if (
              data.is_shatter_point === 1 ||
              String(data.entity_uid).includes("ATM_") ||
              String(data.entity_uid).includes("SHATTER")
            ) {
              tacticalStatus = "CRITICAL SHATTER POINT (ATM / EXIT)";
            } else if (
              data.node_type === "COMPLAINANT" ||
              nodeId === 888888 ||
              String(data.entity_uid).includes("VICTIM")
            ) {
              tacticalStatus = "VERIFIED COMPLAINANT / VICTIM";
            } else if (data.node_type === "VEHICLE") {
              tacticalStatus = "LOGISTICS CARRIER / VEHICLE";
            } else if (data.node_type === "PERSON" && riskNum >= 0.8) {
              tacticalStatus = "HIGH-RISK MASTERMIND / BROKER";
            } else if (
              data.node_type === "ACCOUNT_UPI" ||
              data.node_type === "MULE_ACCOUNT"
            ) {
              tacticalStatus = "IDENTIFIED MULE ACCOUNT";
            } else if (data.node_type === "PHONE_MSISDN") {
              tacticalStatus = "MONITORED CDR HANDSET";
            }
            useStore.setState({
              selectedNode: {
                rawId: nodeId,
                id: data.entity_uid || `NODE #${nodeId}`,
                name: data.canonical_label || parsedName,
                type: data.node_type || parsedType,
                status: tacticalStatus,
                riskScore: (riskNum * 100).toFixed(1),
                district: data.jurisdiction_district || "Pan-India Grid",
              },
              inspectorOpen: true,
            });
          }
        } catch (err) {
          console.warn("API node fetch error (using fallback):", err);
        }
      } else if (event.data?.type === "CANVAS_CLICK") {
        useStore.setState({ selectedNode: null });
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [evidenceMode, uploadedEntityMap]);

  const handleTraceRoute = async () => {
    if (!routeOrigin || !routeTarget) return;
    setTracing(true);
    try {
      let data = null;
      if (evidenceMode === "uploaded" && uploadedFiles.length > 0) {
        const formData = new FormData();
        uploadedFiles.forEach((f, i) => formData.append(`file${i + 1}`, f));
        const res = await fetch(
          `http://127.0.0.1:8000/api/find-path/${activeCaseId || "DEFAULT-INGEST"}?source_node=${routeOrigin.id}&target_node=${routeTarget.id}`,
          {
            method: "POST",
            body: formData,
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
      } else {
        const res = await fetch(
          `http://127.0.0.1:8000/api/path/${activeCaseId}?source_node=${routeOrigin.id}&target_node=${routeTarget.id}`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
      }
      if (data.status === "success" && data.path && data.path.length > 0) {
        setPathResult(data);
        setCycleResult(null);
        iframeRef.current?.contentWindow?.postMessage(
          { type: "HIGHLIGHT_PATH", payload: data.path },
          "*",
        );
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
      const res = await fetch(
        `http://127.0.0.1:8000/api/cycles/${activeCaseId}`,
      );
      const data = await res.json();
      if (data.status === "success" && data.all_cycle_nodes.length > 0) {
        setCycleResult(data);
        setPathResult(null);
        iframeRef.current?.contentWindow?.postMessage(
          { type: "HIGHLIGHT_CYCLES", payload: data.all_cycle_nodes },
          "*",
        );
      } else {
        alert(
          "Hawala Loop Tracer: No circular fund routing detected. Financial flow is linear.",
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDetectingCycles(false);
    }
  };

  const handleClearCycles = () => {
    setCycleResult(null);
    iframeRef.current?.contentWindow?.postMessage({ type: "RESET_PATH" }, "*");
  };

  const handleReset = () => {
    clearRoute();
    setPathResult(null);
    setCycleResult(null);
    iframeRef.current?.contentWindow?.postMessage({ type: "RESET_PATH" }, "*");
  };

  if (!isAuthenticated) {
    return (
      <div className="relative w-full h-full bg-black overflow-hidden flex flex-col items-center justify-center font-display select-none">
        <div className="absolute inset-0 z-0">
          <CursorGrid
            cellSize={55}
            color="#ffffff"
            radius={180}
            falloff="smooth"
            holdTime={350}
            fadeDuration={750}
            lineWidth={1.1}
            maxOpacity={0.35}
            fillOpacity={0.02}
            gridOpacity={0.02}
            cellRadius={0}
            clickPulse={true}
            pulseSpeed={550}
          />
        </div>
        <div className="relative z-10 flex flex-col items-center justify-center text-center p-6 pointer-events-none font-display">
          <div className="w-20 h-20 rounded-full border border-white/20 bg-black/60 flex items-center justify-center mb-6 shadow-2xl backdrop-blur-xl">
            <Lock className="w-9.5 h-9.5 text-white" />
          </div>
          <h2 className="text-xl md:text-2xl font-display font-bold tracking-[0.16em] text-white mb-4 uppercase">
            AUTHENTICATE TERMINAL SESSION
          </h2>
          <p className="text-sm md:text-base font-sans text-zinc-400 max-w-lg leading-relaxed">
            Enter authorized CCTNS officer credentials in the control panel to
            access the active forensic mesh.
          </p>
        </div>
      </div>
    );
  }

  if (!activeCaseId && evidenceMode !== "uploaded") {
    return (
      <div className="relative w-full h-full bg-black overflow-hidden flex flex-col items-center justify-center font-display select-none">
        <div className="absolute inset-0 z-0">
          <CursorGrid
            cellSize={55}
            color="#ffffff"
            radius={180}
            falloff="smooth"
            holdTime={350}
            fadeDuration={750}
            lineWidth={1.1}
            maxOpacity={0.35}
            fillOpacity={0.02}
            gridOpacity={0.02}
            cellRadius={0}
            clickPulse={true}
            pulseSpeed={550}
          />
        </div>
        <div className="relative z-10 flex flex-col items-center justify-center text-center p-6 pointer-events-none font-display">
          <div className="w-16 h-16 rounded-full border border-white/20 bg-black/60 flex items-center justify-center mb-6 shadow-2xl backdrop-blur-xl">
            <Search className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-base font-display font-bold tracking-[0.16em] text-white mb-2 uppercase">
            SEARCH CASE OR UPLOAD EXHIBIT STREAM
          </h2>
          <p className="text-xs font-sans text-zinc-400 max-w-md leading-relaxed">
            Query a registered FIR (e.g.{" "}
            <span className="font-display font-bold text-white tracking-wider">
              CASE-BR-PAT-2023-00207
            </span>
            ) in the top search bar, or click{" "}
            <span className="text-white font-bold font-display uppercase tracking-wider">
              Upload Exhibits
            </span>{" "}
            to ingest seized CDR or financial ledger files.
          </p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full text-zinc-300 space-y-3 bg-black font-display">
        <AlertTriangle className="w-10 h-10 text-white" />
        <p className="text-base font-display font-bold tracking-[0.16em] uppercase text-white">
          FAILED TO GENERATE CASE NETWORK
        </p>
        <span className="text-xs text-zinc-500 font-sans">
          Case ID does not exist in CCTNS registry or backend service is
          restarting.
        </span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black overflow-hidden font-display">
      {/* 1. Constant Ambient Slow Glitch Backdrop */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20 select-none overflow-hidden">
        <LetterGlitch
          glitchColors={[
            "#18181b",
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
          backgroundColor="transparent"
        />
      </div>

      {/* 2. Loading Glitch Transition Overlay */}
      {isGlitching && (
        <div className="absolute inset-0 z-50 bg-black select-none animate-in fade-in duration-150">
          <div className="w-full h-full opacity-40">
            <LetterGlitch
              glitchColors={[
                "#18181b",
                "#27272a",
                "#3f3f46",
                "#71717a",
                "#a1a1aa",
                "#e4e4e7",
                "#ffffff",
              ]}
              glitchSpeed={35}
              centerVignette={true}
              outerVignette={true}
              smooth={true}
              backgroundColor="#000000"
            />
          </div>
        </div>
      )}

      {/* Top Floating Control Bar */}
      <div className="absolute top-4 left-6 right-6 z-30 flex items-center justify-between pointer-events-none font-display">
        {routeOrigin || routeTarget ? (
          <div className="pointer-events-auto bg-black/75 border border-white/15 rounded-lg p-2.5 shadow-2xl backdrop-blur-2xl flex items-center space-x-3 text-xs font-display">
            <Route className="w-4 h-4 text-white shrink-0" />

            {/* SRC Indicator */}
            <div className="flex items-center space-x-1.5 bg-white/[0.06] border border-white/20 rounded px-2.5 py-1">
              <span className="text-zinc-400 font-bold uppercase tracking-wider">SRC:</span>
              <span className="text-white font-bold tracking-wide truncate max-w-[140px]">
                {routeOrigin?.name || "SELECT NODE"}
              </span>
              {routeOrigin && (
                <button
                  onClick={() => {
                    setRouteOrigin(null);
                    setPathResult(null);
                    iframeRef.current?.contentWindow?.postMessage(
                      { type: "RESET_PATH" },
                      "*",
                    );
                  }}
                  className="p-0.5 hover:bg-white/10 rounded text-zinc-400 hover:text-white transition-colors"
                  title="Deselect Origin"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <ArrowRight className="w-3.5 h-3.5 text-zinc-500" />

            {/* TGT Indicator */}
            <div className="flex items-center space-x-1.5 bg-white/[0.06] border border-white/20 rounded px-2.5 py-1">
              <span className="text-zinc-400 font-bold uppercase tracking-wider">TGT:</span>
              <span className="text-white font-bold tracking-wide truncate max-w-[140px]">
                {routeTarget?.name || "SELECT NODE"}
              </span>
              {routeTarget && (
                <button
                  onClick={() => {
                    setRouteTarget(null);
                    setPathResult(null);
                    iframeRef.current?.contentWindow?.postMessage(
                      { type: "RESET_PATH" },
                      "*",
                    );
                  }}
                  className="p-0.5 hover:bg-white/10 rounded text-zinc-400 hover:text-white transition-colors"
                  title="Deselect Target"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              onClick={handleTraceRoute}
              disabled={!routeOrigin || !routeTarget || tracing}
              className="px-3 py-1 bg-white hover:bg-zinc-200 text-black font-display font-bold tracking-wider uppercase rounded text-xs transition-all flex items-center space-x-1 shadow-md disabled:bg-white/10 disabled:text-zinc-600 disabled:border-white/10"
            >
              {tracing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <span>BFS ROUTE</span>
              )}
            </button>
          </div>
        ) : (
          <div className="pointer-events-auto bg-black/75 border border-white/15 px-3.5 py-2 rounded-lg text-xs flex items-center space-x-2.5 shadow-xl backdrop-blur-2xl font-display">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-zinc-400 font-bold uppercase tracking-wider">LENS:</span>
            <span className="text-white font-display font-bold tracking-[0.14em] uppercase">
              {evidenceMode === "uploaded"
                ? "CUSTOM EXHIBIT STREAM"
                : `${jurisdictionScope} GRID`}
            </span>
          </div>
        )}

        <div className="pointer-events-auto flex items-center space-x-2 font-display">
          {evidenceMode === "database" && (
            <div className="flex items-center space-x-1.5">
              <SpecularButton
                size="sm"
                radius={8}
                tint="#000000"
                tintOpacity={0.6}
                blur={12}
                textColor="#ffffff"
                lineColor="#ffffff"
                baseColor="#27272a"
                intensity={1.3}
                shineSize={14}
                shineFade={35}
                thickness={1.2}
                speed={0.4}
                followMouse={true}
                proximity={200}
                disabled={detectingCycles}
                onClick={handleDetectCycles}
                className={
                  cycleResult
                    ? "shadow-[0_0_18px_rgba(255,255,255,0.4)] font-display uppercase tracking-wider"
                    : "font-display uppercase tracking-wider"
                }
              >
                {detectingCycles ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin text-white" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 mr-1.5 text-white" />
                )}
                <span>Hawala Loop Tracer</span>
              </SpecularButton>
              {cycleResult && (
                <button
                  type="button"
                  onClick={handleClearCycles}
                  className="p-2 bg-black/80 hover:bg-white/10 text-white border border-white/20 rounded-lg text-xs shadow-lg backdrop-blur-2xl transition-all flex items-center justify-center font-display"
                  title="Dismiss Hawala Loop Tracer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {(pathResult || cycleResult || routeOrigin || routeTarget) && (
            <button
              onClick={handleReset}
              className="p-2.5 bg-black/75 border border-white/15 hover:bg-white/10 text-white rounded-lg shadow-xl backdrop-blur-2xl font-display"
              title="Reset View"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Bottom-Left: Color-Coded Classification Filter */}
      <div className="absolute bottom-4 left-6 z-30 flex flex-col space-y-2 pointer-events-none max-w-[calc(100vw-450px)] font-display">
        {pathResult && (
          <div className="pointer-events-auto bg-black/80 border border-white/20 rounded-lg p-3 text-xs shadow-2xl font-display max-w-md backdrop-blur-2xl">
            <span className="font-bold text-white uppercase tracking-wider">
              TRAIL ({pathResult.hops} HOPS):{" "}
            </span>
            <span className="text-zinc-200 font-semibold tracking-wide">
              {pathResult.labels.join(" → ")}
            </span>
          </div>
        )}

        {!filterExpanded ? (
          <div
            onClick={() => setFilterExpanded(true)}
            className="pointer-events-auto bg-black/80 hover:bg-black/90 border border-white/15 hover:border-white/30 rounded-lg px-3.5 py-2.5 shadow-2xl backdrop-blur-2xl flex items-center space-x-3 cursor-pointer transition-all select-none group w-fit font-display"
            title="Click to expand classification filters"
          >
            <Filter className="w-4 h-4 text-white group-hover:scale-110 transition-transform shrink-0" />
            <span className="text-white font-display font-bold tracking-[0.14em] text-xs whitespace-nowrap uppercase">
              CLASSIFICATION FILTER
            </span>
            <span className="text-xs px-2 py-0.5 bg-white/10 border border-white/20 text-white rounded font-bold shrink-0 font-display">
              {enabledNodeTypes.length}/{FILTER_CATEGORIES.length}
            </span>
            <div className="h-3 w-[1px] bg-white/10 mx-0.5 shrink-0" />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setAllNodeTypes(ALL_CLASSIFICATIONS);
              }}
              className="text-xs text-zinc-400 hover:text-white transition-colors font-bold px-1 uppercase font-display"
            >
              ALL
            </button>
            <span className="text-white/20 text-xs">|</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setAllNodeTypes(["PERSON", "ACCOUNT_UPI"]);
              }}
              className="text-xs text-zinc-400 hover:text-white transition-colors font-bold px-1 uppercase font-display"
            >
              CORE
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setFilterExpanded(true);
              }}
              className="p-1 hover:bg-white/10 text-zinc-400 hover:text-white rounded transition-colors ml-1 shrink-0"
            >
              <ChevronUp className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="pointer-events-auto bg-black/85 border border-white/20 rounded-lg p-3.5 shadow-2xl backdrop-blur-2xl text-xs w-96 animate-in fade-in slide-in-from-bottom-2 font-display">
            <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
              <div className="flex items-center space-x-2">
                <Filter className="w-4 h-4 text-white" />
                <span className="text-white font-display font-bold tracking-[0.14em] text-xs uppercase">
                  CLASSIFICATION FILTER
                </span>
                <span className="text-xs px-2 py-0.5 bg-white/10 border border-white/20 text-white rounded font-bold font-display">
                  {enabledNodeTypes.length}/{FILTER_CATEGORIES.length}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setAllNodeTypes(ALL_CLASSIFICATIONS)}
                  className="text-xs text-zinc-400 hover:text-white transition-colors px-1 font-bold uppercase font-display"
                >
                  ALL
                </button>
                <span className="text-white/20 text-xs">|</span>
                <button
                  type="button"
                  onClick={() => setAllNodeTypes(["PERSON", "ACCOUNT_UPI"])}
                  className="text-xs text-zinc-400 hover:text-white transition-colors px-1 font-bold uppercase font-display"
                >
                  CORE
                </button>
                <button
                  type="button"
                  onClick={() => setFilterExpanded(false)}
                  className="p-1 hover:bg-white/10 text-zinc-400 hover:text-white rounded transition-colors"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Color-Coded Classification Filter Grid */}
            <div className="grid grid-cols-2 gap-2 pt-3 font-display">
              {FILTER_CATEGORIES.map((cat) => {
                const isChecked = enabledNodeTypes.includes(cat.id);
                return (
                  <button
                    key={cat.id}
                    onClick={() => toggleNodeType(cat.id)}
                    className={`flex items-center space-x-2 px-2.5 py-2 rounded text-xs border transition-all text-left truncate font-display ${
                      isChecked
                        ? `${cat.active} font-bold backdrop-blur-md`
                        : "bg-black/40 border-white/[0.06] text-zinc-500 hover:border-white/15"
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 transition-all ${
                        isChecked ? cat.dot : "bg-zinc-700"
                      }`}
                    />
                    <span className="truncate tracking-wide">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom-Right: Hawala Loops Overlay */}
      {cycleResult && (
        <div className="absolute bottom-4 right-6 z-30 pointer-events-auto bg-black/85 border border-white/20 rounded-lg p-3.5 text-xs shadow-2xl font-display max-w-md animate-in fade-in slide-in-from-bottom-2 backdrop-blur-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2 mb-2 font-display">
            <span className="font-bold text-white flex items-center text-xs tracking-[0.14em] uppercase">
              <Sparkles className="w-4 h-4 mr-1.5 text-white shrink-0" />
              HAWALA LOOPS ({cycleResult.cycle_count})
            </span>
            <button
              onClick={handleClearCycles}
              className="text-zinc-400 hover:text-white p-0.5 rounded transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="text-zinc-200 text-xs leading-relaxed max-h-36 overflow-y-auto pr-1 space-y-1.5 font-display">
            {cycleResult.cycles.map((c, i) => (
              <div key={i} className="py-0.5 flex items-start space-x-2">
                <span className="text-white shrink-0 font-bold">
                  [{i + 1}]
                </span>
                <span className="text-zinc-200 tracking-wide font-medium">{c.labels.join(" → ")}</span>
              </div>
            ))}
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
        allowTransparency="true"
      />
      <div className="absolute inset-0 shadow-[inset_0_0_120px_rgba(0,0,0,0.98)] pointer-events-none z-20" />
    </div>
  );
}
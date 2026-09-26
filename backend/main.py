import os
import sys
import io
import csv
import re
import json
import math
import ctypes
import hashlib
import sqlite3
import traceback
from datetime import datetime, timezone
from collections import deque
from typing import List, Optional, Dict, Any, Set
import numpy as np

from fastapi import FastAPI, HTTPException, UploadFile, File, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from pyvis.network import Network

try:
    from .hopfield import classify_syndicate_archetype
except ImportError:
    try:
        from hopfield import classify_syndicate_archetype
    except Exception as e:
        print(f"[!] Hopfield module import warning: {e}")
        classify_syndicate_archetype = None

try:
    from .normalizer import normalize_phone, normalize_imei, get_indic_phonetic_root
except ImportError:
    try:
        from normalizer import normalize_phone, normalize_imei, get_indic_phonetic_root
    except Exception as e:
        print(f"[!] Normalizer import warning: {e}")
        normalize_phone = lambda p: re.sub(r'\D', '', str(p or ''))[-10:]
        normalize_imei = lambda i: re.sub(r'\D', '', str(i or ''))[:14]
        get_indic_phonetic_root = lambda t: str(t or '').strip().upper()

try:
    from .dossier_generator import generate_statutory_dossier, generate_suspect_rap_sheet
except ImportError:
    try:
        from dossier_generator import generate_statutory_dossier, generate_suspect_rap_sheet
    except Exception as e:
        print(f"[!] Dossier generator import warning: {e}")
        generate_statutory_dossier = None
        generate_suspect_rap_sheet = None

app = FastAPI(title="Project CRIME-NET API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print("\n" + "=" * 60)
    print(f"[!] SERVER 500 ON ROUTE: {request.url}")
    traceback.print_exc()
    print("=" * 60 + "\n")
    return JSONResponse(
        status_code=500,
        headers={"Access-Control-Allow-Origin": "*"},
        content={"detail": str(exc), "traceback": traceback.format_exc()}
    )

_script_dir = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
app.mount("/static", StaticFiles(directory=_script_dir), name="static")

def sanitize_datetime_iso(val: Any) -> Optional[str]:
    """Converts SQL space-delimited datetimes or raw inputs to valid ISO-8601 strings."""
    if not val:
        return None
    s = str(val).strip()
    if s.upper() in ["UNKNOWN_TIME", "NONE", "NULL", "N/A", ""]:
        return None
    clean = s.replace(" ", "T")
    try:
        dt = datetime.fromisoformat(clean)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
    except Exception:
        return clean

def find_database_path() -> str:
    candidates = [
        os.path.abspath(os.path.join(_script_dir, "..", "..", "core-engine", "sov-mesh.db")),
        os.path.abspath(os.path.join(_script_dir, "..", "core-engine", "sov-mesh.db")),
        os.path.abspath(os.path.join(_script_dir, "..", "core_engine", "data", "crimenet_sovereign_mesh.db")),
        os.path.abspath(os.path.join(_script_dir, "..", "..", "core_engine", "data", "crimenet_sovereign_mesh.db")),
        os.path.abspath("core_engine/data/crimenet_sovereign_mesh.db"),
        os.path.abspath("core-engine/sov-mesh.db"),
    ]
    for p in candidates:
        if os.path.exists(p):
            print(f"[*] Sovereign Mesh DB anchored: {p}")
            return p
    
    root_search = os.path.abspath(os.path.join(_script_dir, ".."))
    for root, _, files in os.walk(root_search):
        for f in files:
            if f.endswith(".db") and ("crimenet" in f or "sov" in f or "mesh" in f):
                resolved = os.path.abspath(os.path.join(root, f))
                print(f"[*] Dynamically located SQLite DB: {resolved}")
                return resolved
    return candidates[0]

DB_PATH = find_database_path()

def find_dll_path() -> str:
    candidates = [
        os.path.abspath(os.path.join(_script_dir, "..", "core_engine", "bin", "Graph_Engine.dll")),
        os.path.abspath(os.path.join(_script_dir, "..", "..", "core_engine", "bin", "Graph_Engine.dll")),
        os.path.abspath(os.path.join(_script_dir, "..", "core-engine", "bin", "Graph_Engine.dll")),
        os.path.abspath("core_engine/bin/Graph_Engine.dll")
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return candidates[0]

dll_path = find_dll_path()
engine_loaded = False
dll = None
try:
    if os.path.exists(dll_path):
        if hasattr(os, "add_dll_directory"):
            os.add_dll_directory(os.path.dirname(dll_path))
        dll = ctypes.CDLL(dll_path)
        engine_loaded = True
        print(f"[*] C++ Graph_Engine.dll linked: {dll_path}")

    if engine_loaded:
        if hasattr(dll, "compute_brandes_centrality"):
            dll.compute_brandes_centrality.argtypes = [
                ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int),
                ctypes.POINTER(ctypes.c_double), ctypes.c_size_t, ctypes.POINTER(ctypes.c_double)
            ]
            dll.compute_brandes_centrality.restype = None
        if hasattr(dll, "detect_shatter_points"):
            dll.detect_shatter_points.argtypes = [
                ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int),
                ctypes.c_size_t, ctypes.POINTER(ctypes.c_ubyte)
            ]
            dll.detect_shatter_points.restype = None
        if hasattr(dll, "detect_mule_fanout"):
            dll.detect_mule_fanout.argtypes = [
                ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int),
                ctypes.POINTER(ctypes.c_double), ctypes.c_size_t, ctypes.c_float, ctypes.POINTER(ctypes.c_ubyte)
            ]
            dll.detect_mule_fanout.restype = None
        if hasattr(dll, "find_shortest_path_bfs"):
            dll.find_shortest_path_bfs.argtypes = [
                ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int),
                ctypes.c_size_t, ctypes.c_int, ctypes.c_int,
                ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int)
            ]
            dll.find_shortest_path_bfs.restype = None
        elif hasattr(dll, "compute_bfs_path"):
            dll.compute_bfs_path.argtypes = [
                ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int),
                ctypes.c_size_t, ctypes.c_int, ctypes.c_int,
                ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_int)
            ]
            dll.compute_bfs_path.restype = None
except Exception as e:
    print(f"[!] Native DLL load warning: {e}")

ACTIVE_INVESTIGATION_SESSIONS: Dict[str, dict] = {}

DARK_NETWORK_THEME = """
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:ital,wght@0,400;0,500;0,600;0,700;1,700&display=swap" rel="stylesheet">
<style>
html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    height: 100% !important;
    overflow: hidden !important;
    background-color: transparent !important;
    font-family: 'Chakra Petch', sans-serif !important;
}
.card, .card-body {
    padding: 0 !important;
    margin: 0 !important;
    border: none !important;
    background-color: transparent !important;
    width: 100vw !important;
    height: 100vh !important;
}
#mynetwork {
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    background-color: transparent !important;
    background-image: radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px) !important;
    background-size: 28px 28px !important;
    border: none !important;
}
.vis-tooltip {
    background: #0d1117 !important;
    border: 1px solid #30363d !important;
    color: #e6edf3 !important;
    font-family: 'Chakra Petch', sans-serif !important;
    font-size: 11px !important;
    padding: 8px 12px !important;
    border-radius: 6px !important;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.85) !important;
}
</style>

<script type="text/javascript">
function initWhenReady() {
  if (typeof network === 'undefined' || typeof nodes === 'undefined' || typeof edges === 'undefined') {
    setTimeout(initWhenReady, 50);
    return;

    if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function() {
      if (typeof network !== 'undefined') network.redraw();
    });
  }
  }

  var canonicalNodes = new Map();
  var canonicalEdges = [];
  var hiddenNodeIds = new Set();
  var nodePositions = {};
  var degreeMap = {};

  nodes.get().forEach(function(n) {
    canonicalNodes.set(n.id, Object.assign({}, n));
  });
  canonicalEdges = edges.get().map(function(e) {
    return Object.assign({}, e);
  });

  function recalculateDegrees() {
    degreeMap = {};
    var allN = nodes.get();
    var allE = edges.get();
    allN.forEach(function(n) { 
      degreeMap[n.id] = { in: 0, out: 0, total: 0 }; 
    });
    allE.forEach(function(e) {
      if (degreeMap[e.from]) { degreeMap[e.from].out++; degreeMap[e.from].total++; }
      if (degreeMap[e.to]) { degreeMap[e.to].in++; degreeMap[e.to].total++; }
    });
  }
  recalculateDegrees();

  var textTruncationCache = new Map();
  function truncateText(ctx, text, maxW) {
    if (!text) return '';
    var cacheKey = text + '|' + Math.round(maxW);
    if (textTruncationCache.has(cacheKey)) {
      return textTruncationCache.get(cacheKey);
    }
    if (ctx.measureText(text).width <= maxW) {
      textTruncationCache.set(cacheKey, text);
      return text;
    }
    var low = 0, high = text.length;
    while (low < high) {
      var mid = (low + high) >> 1;
      if (ctx.measureText(text.slice(0, mid) + '...').width <= maxW) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }
    var res = text.slice(0, Math.max(0, low - 1)) + '...';
    if (textTruncationCache.size > 1500) textTruncationCache.clear();
    textTruncationCache.set(cacheKey, res);
    return res;
  }

  function drawChamferedBadge(ctx, x, y, w, h, cut) {
    ctx.beginPath();
    ctx.moveTo(x + cut, y);
    ctx.lineTo(x + w - cut, y);
    ctx.lineTo(x + w, y + cut);
    ctx.lineTo(x + w, y + h - cut);
    ctx.lineTo(x + w - cut, y + h);
    ctx.lineTo(x + cut, y + h);
    ctx.lineTo(x, y + h - cut);
    ctx.lineTo(x, y + cut);
    ctx.closePath();
  }

  function drawReticles(ctx, x, y, w, h, color) {
    var pad = 6;
    var len = 8;
    var l = x - pad, r = x + w + pad;
    var t = y - pad, b = y + h + pad;
    ctx.strokeStyle = color || '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(l, t + len); ctx.lineTo(l, t); ctx.lineTo(l + len, t);
    ctx.moveTo(r - len, t); ctx.lineTo(r, t); ctx.lineTo(r, t + len);
    ctx.moveTo(l, b - len); ctx.lineTo(l, b); ctx.lineTo(l + len, b);
    ctx.moveTo(r - len, b); ctx.lineTo(r, b); ctx.lineTo(r, b - len);
    ctx.stroke();
  }

  function tacticalNodeRenderer(payload) {
    var ctx = payload.ctx;
    var id = payload.id;
    var posX = payload.x;
    var posY = payload.y;
    var state = payload.state || {};
    
    var isSelected = Boolean(state.selected) || (typeof network !== 'undefined' && network.getSelectedNodes && network.getSelectedNodes().indexOf(id) !== -1);
    var isHovered = Boolean(state.hover);
    var zoom = (typeof network !== 'undefined' && network.getScale) ? network.getScale() : 1.0;
    
    var nodeObj = nodes.get(id) || canonicalNodes.get(id) || {};
    var rawLabel = nodeObj.label || ('NODE ' + id);
    var parts = rawLabel.split('\\n');
    var entityType = parts[0] ? parts[0].trim().toUpperCase() : 'ENTITY';
    var mainText = parts.slice(1).join(' ').trim() || rawLabel;
    var rawColor = (nodeObj.color && nodeObj.color.border) ? nodeObj.color.border : '#38bdf8';

    var rawTitle = nodeObj.title || '';
    var centralityVal = 0.0;
    var explicitRole = '';

    if (rawTitle.indexOf('Centrality:') !== -1) {
      centralityVal = parseFloat(rawTitle.split('Centrality:')[1].split('\\n')[0].trim()) || 0.0;
    }
    if (rawTitle.indexOf('Role:') !== -1) {
      explicitRole = rawTitle.split('Role:')[1].split('\\n')[0].trim();
    }

    var w, h;
    var lodLevel = 2;

    if (isSelected) {
      lodLevel = 2;
      w = 230;
      h = 92;
    } else if (zoom < 0.35) {
      lodLevel = 0;
      w = 22;
      h = 22;
    } else if (zoom < 0.75) {
      lodLevel = 1;
      w = 155;
      h = 34;
    } else {
      lodLevel = 2;
      w = 230;
      h = 92;
    }

    return {
      nodeDimensions: { width: w, height: h },
      drawNode: function() {
        var topX = posX - w / 2;
        var topY = posY - h / 2;
        var deg = degreeMap[id] || { in: 0, out: 0, total: 0 };
        var isSpecial = (id === 888888 || entityType.indexOf('MASTERMIND') !== -1 || entityType.indexOf('ATM') !== -1 || entityType.indexOf('FIR') !== -1);
        var pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.0035);

        ctx.save();

        if (lodLevel === 0) {
          ctx.beginPath();
          ctx.arc(posX, posY, 7, 0, Math.PI * 2);
          ctx.fillStyle = rawColor;
          ctx.fill();

          if (isHovered || isSelected || isSpecial) {
            ctx.beginPath();
            ctx.arc(posX, posY, 12, 0, Math.PI * 2);
            ctx.strokeStyle = isSelected ? '#ffffff' : rawColor;
            ctx.lineWidth = isSelected ? (1.5 + 1.2 * pulse) : 2;
            ctx.stroke();
          }
          ctx.restore();
          return;
        }

        if (lodLevel === 1) {
          var cut = 6;
          drawChamferedBadge(ctx, topX, topY, w, h, cut);
          ctx.fillStyle = 'rgba(12, 17, 26, 0.95)';
          ctx.fill();

          if (isSelected) {
            ctx.lineWidth = 1.4 + 1.2 * pulse;
            ctx.strokeStyle = 'rgba(255, 255, 255, ' + (0.70 + 0.30 * pulse).toFixed(2) + ')';
            ctx.shadowColor = 'rgba(255, 255, 255, ' + (0.35 + 0.45 * pulse).toFixed(2) + ')';
            ctx.shadowBlur = 4 + 10 * pulse;
            ctx.stroke();
            ctx.shadowBlur = 0;
          } else {
            ctx.lineWidth = 1.0;
            ctx.strokeStyle = isHovered ? rawColor : '#27272a';
            ctx.stroke();
          }

          ctx.beginPath();
          ctx.moveTo(topX + cut, topY);
          ctx.lineTo(topX + w - cut, topY);
          ctx.strokeStyle = rawColor;
          ctx.lineWidth = 2.5;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(topX + 11, topY + h / 2, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = '#10b981';
          ctx.fill();

          ctx.font = "600 11px 'Chakra Petch', sans-serif";
          ctx.fillStyle = '#f8fafc';
          ctx.textBaseline = 'middle';
          var t = truncateText(ctx, mainText, w - 32);
          ctx.fillText(t, topX + 22, topY + h / 2);

          if (isSelected) drawReticles(ctx, topX, topY, w, h, rawColor);
          ctx.restore();
          return;
        }

        var cut2 = 9;
        drawChamferedBadge(ctx, topX, topY, w, h, cut2);
        ctx.fillStyle = isSelected ? 'rgba(10, 16, 26, 0.98)' : 'rgba(9, 13, 21, 0.95)';
        ctx.fill();

        if (isSelected) {
          ctx.lineWidth = 1.4 + 1.2 * pulse;
          ctx.strokeStyle = 'rgba(255, 255, 255, ' + (0.75 + 0.25 * pulse).toFixed(2) + ')';
          ctx.shadowColor = 'rgba(255, 255, 255, ' + (0.45 + 0.45 * pulse).toFixed(2) + ')';
          ctx.shadowBlur = 6 + 12 * pulse;
          ctx.stroke();
          ctx.shadowBlur = 0;
        } else {
          ctx.lineWidth = 1.1;
          ctx.strokeStyle = isHovered ? rawColor : '#27272a';
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.moveTo(topX + cut2, topY);
        ctx.lineTo(topX + w - cut2, topY);
        ctx.strokeStyle = rawColor;
        ctx.lineWidth = 3.2;
        ctx.stroke();

        ctx.textBaseline = 'top';
        ctx.font = "700 9.5px 'Chakra Petch', sans-serif";
        ctx.fillStyle = rawColor;
        ctx.fillText(entityType, topX + 10, topY + 8);

        var btnSize = 13;
        var btnX = topX + w - btnSize - 9;
        var btnY = topY + 6;

        ctx.beginPath();
        ctx.rect(btnX, btnY, btnSize, btnSize);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)';
        ctx.lineWidth = 1.0;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(btnX + 3.5, btnY + 3.5);
        ctx.lineTo(btnX + btnSize - 3.5, btnY + btnSize - 3.5);
        ctx.moveTo(btnX + btnSize - 3.5, btnY + 3.5);
        ctx.lineTo(btnX + 3.5, btnY + btnSize - 3.5);
        ctx.strokeStyle = '#fca5a5';
        ctx.lineWidth = 1.3;
        ctx.stroke();

        ctx.fillStyle = '#a1a1aa';
        ctx.font = "600 8px 'Chakra Petch', sans-serif";
        var secText = "SEC 63(4)";
        var secW = ctx.measureText(secText).width;
        ctx.fillText(secText, btnX - secW - 8, topY + 9);

        ctx.beginPath();
        ctx.moveTo(topX, topY + 22);
        ctx.lineTo(topX + w, topY + 22);
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.font = "700 13px 'Chakra Petch', sans-serif";
        ctx.fillStyle = '#ffffff';
        var displayTitle = truncateText(ctx, mainText, w - 20);
        ctx.fillText(displayTitle, topX + 10, topY + 28);

        ctx.font = "600 9.5px 'Chakra Petch', sans-serif";
        var tacticalRole = explicitRole;
        var roleColor = "#cbd5e1";
        var roleBadge = "ACTIVE LINK";
        var badgeBg = "rgba(39, 39, 42, 0.6)";
        var badgeBorder = "#3f3f46";
        var badgeColor = "#e4e4e7";

        // Subtle, high-contrast category-aligned badge colors
        if (entityType.indexOf('MASTERMIND') !== -1) {
          tacticalRole = "CRITICAL APEX"; 
          roleColor = "#f87171";
          roleBadge = "TIER-1 KINGPIN"; 
          badgeBg = "rgba(239, 68, 68, 0.18)"; 
          badgeBorder = "rgba(239, 68, 68, 0.45)"; 
          badgeColor = "#fca5a5";
        } else if (entityType.indexOf('ATM') !== -1) {
          tacticalRole = "CASH-OUT TERMINAL"; 
          roleColor = "#fb7185";
          roleBadge = "SHATTER EXIT"; 
          badgeBg = "rgba(244, 63, 94, 0.18)"; 
          badgeBorder = "rgba(244, 63, 94, 0.45)"; 
          badgeColor = "#fda4af";
        } else if (entityType.indexOf('MULE') !== -1 || entityType.indexOf('ACCOUNT') !== -1) {
          tacticalRole = "PMLA FAN-OUT"; 
          roleColor = "#c084fc";
          roleBadge = "MULE ACCOUNT"; 
          badgeBg = "rgba(168, 85, 247, 0.18)"; 
          badgeBorder = "rgba(168, 85, 247, 0.45)"; 
          badgeColor = "#e9d5ff";
        } else if (entityType.indexOf('COMPLAINANT') !== -1 || entityType.indexOf('VICTIM') !== -1 || id === 888888) {
          tacticalRole = "WITNESS / VICTIM"; 
          roleColor = "#34d399";
          roleBadge = "PROTECTED"; 
          badgeBg = "rgba(16, 185, 129, 0.18)"; 
          badgeBorder = "rgba(16, 185, 129, 0.50)"; 
          badgeColor = "#6ee7b7";
        } else if (entityType.indexOf('PHONE') !== -1) {
          tacticalRole = "COVERT TERMINAL"; 
          roleColor = "#38bdf8";
          roleBadge = deg.total > 2 ? "INTERCEPT HUB" : "BURNER SIM"; 
          badgeBg = "rgba(56, 189, 248, 0.18)"; 
          badgeBorder = "rgba(56, 189, 248, 0.45)"; 
          badgeColor = "#bae6fd";
        } else if (entityType.indexOf('VEHICLE') !== -1) {
          tacticalRole = "LOGISTICS RELAY"; 
          roleColor = "#94a3b8";
          roleBadge = "MOTOR CARRIER"; 
          badgeBg = "rgba(148, 163, 184, 0.18)"; 
          badgeBorder = "rgba(148, 163, 184, 0.45)"; 
          badgeColor = "#cbd5e1";
        } else if (entityType.indexOf('FIR') !== -1 || entityType.indexOf('CRIME') !== -1) {
          tacticalRole = "STATUTORY CASE"; 
          roleColor = "#38bdf8";
          roleBadge = "COURT COGNIZED"; 
          badgeBg = "rgba(56, 189, 248, 0.18)"; 
          badgeBorder = "rgba(56, 189, 248, 0.45)"; 
          badgeColor = "#bae6fd";
        } else {
          if (deg.in > 0 && deg.out > 0) {
            tacticalRole = "SYNDICATE BROKER"; 
            roleColor = "#fbbf24";
            roleBadge = "COMMUNICATION HUB"; 
            badgeBg = "rgba(245, 158, 11, 0.18)"; 
            badgeBorder = "rgba(245, 158, 11, 0.45)"; 
            badgeColor = "#fde68a";
          } else if (deg.out >= 2) {
            tacticalRole = "BAIL SURETY"; 
            roleColor = "#fbbf24";
            roleBadge = "SURETY BOND"; 
            badgeBg = "rgba(245, 158, 11, 0.18)"; 
            badgeBorder = "rgba(245, 158, 11, 0.45)"; 
            badgeColor = "#fde68a";
          } else {
            // Chargesheet / Suspect / Co-Accused: aligned with orange/amber suspect rule
            tacticalRole = "CO-ACCUSED"; 
            roleColor = "#fb923c";
            roleBadge = "CHARGESHEET"; 
            badgeBg = "rgba(249, 115, 22, 0.18)"; 
            badgeBorder = "rgba(249, 115, 22, 0.45)"; 
            badgeColor = "#fed7aa";
          }
        }

        ctx.fillStyle = roleColor;
        ctx.fillText(tacticalRole, topX + 10, topY + 46);

        ctx.font = "700 8.5px 'Chakra Petch', sans-serif";
        var badgeTextW = ctx.measureText(roleBadge).width;
        var badgeW = badgeTextW + 10;
        var badgeH = 14;
        var bX = topX + w - badgeW - 10;
        var bY = topY + 44;

        ctx.fillStyle = badgeBg;
        ctx.fillRect(bX, bY, badgeW, badgeH);
        ctx.strokeStyle = badgeBorder;
        ctx.lineWidth = 1.0;
        ctx.strokeRect(bX, bY, badgeW, badgeH);

        ctx.fillStyle = badgeColor;
        ctx.fillText(roleBadge, bX + 5, bY + 3);

        ctx.beginPath();
        ctx.moveTo(topX, topY + 63);
        ctx.lineTo(topX + w, topY + 63);
        ctx.strokeStyle = '#1e293b';
        ctx.stroke();

        ctx.font = "600 8.5px 'Chakra Petch', sans-serif";
        ctx.fillStyle = '#94a3b8';
        var flowText = "FLOW: IN " + deg.in + " | OUT " + deg.out;
        ctx.fillText(flowText, topX + 10, topY + 70);

        var calcRisk = 0;
        if (entityType.indexOf('MASTERMIND') !== -1) calcRisk = 96.0;
        else if (entityType.indexOf('ATM') !== -1) calcRisk = 92.5;
        else if (entityType.indexOf('MULE') !== -1) calcRisk = 84.0;
        else if (entityType.indexOf('COMPLAINANT') !== -1 || id === 888888) calcRisk = 0.0;
        else calcRisk = Math.min(94.0, Math.max(15.0, Math.round((centralityVal * 80 + (deg.total * 6.5)) * 10) / 10));

        var riskStr = "RISK: " + calcRisk.toFixed(1) + "%";
        var riskStrW = ctx.measureText(riskStr).width;
        ctx.fillStyle = (calcRisk >= 75) ? '#ef4444' : (calcRisk >= 40 ? '#f59e0b' : '#10b981');
        ctx.fillText(riskStr, topX + w - riskStrW - 10, topY + 70);

        if (isSelected) {
          drawReticles(ctx, topX, topY, w, h, rawColor);
        }

        ctx.restore();
      }
    };
  }

  function applyHexagonalConstellation() {
    var allNodes = nodes.get();
    var allEdges = edges.get();
    if (!allNodes || allNodes.length === 0) return;
    
    var degrees = {};
    allNodes.forEach(function(n) { degrees[n.id] = 0; });
    allEdges.forEach(function(e) {
      if (degrees[e.from] !== undefined) degrees[e.from]++;
      if (degrees[e.to] !== undefined) degrees[e.to]++;
    });

    var hubNode = allNodes[0];
    var maxDeg = -1;
    allNodes.forEach(function(n) {
      var deg = degrees[n.id] || 0;
      if (deg > maxDeg) {
        maxDeg = deg;
        hubNode = n;
      }
    });

    var queue = [hubNode.id];
    var distance = {};
    distance[hubNode.id] = 0;
    var visited = new Set([hubNode.id]);
    var adj = {};
    allNodes.forEach(function(n) { adj[n.id] = []; });
    allEdges.forEach(function(e) {
      if (adj[e.from]) adj[e.from].push(e.to);
      if (adj[e.to]) adj[e.to].push(e.from);
    });

    while (queue.length > 0) {
      var curr = queue.shift();
      var neighbors = adj[curr] || [];
      for (var j = 0; j < neighbors.length; j++) {
        var nxt = neighbors[j];
        if (!visited.has(nxt)) {
          visited.add(nxt);
          distance[nxt] = distance[curr] + 1;
          queue.push(nxt);
        }
      }
    }

    allNodes.forEach(function(n) {
      if (distance[n.id] === undefined) distance[n.id] = 2;
    });

    var rings = {};
    allNodes.forEach(function(n) {
      var d = distance[n.id];
      if (!rings[d]) rings[d] = [];
      rings[d].push(n);
    });

    var updates = [];
    updates.push({ id: hubNode.id, x: 0, y: 0 });
    var baseRadius = 360;

    Object.keys(rings).forEach(function(dStr) {
      var d = parseInt(dStr);
      if (d === 0) return;
      var ringNodes = rings[d];
      var count = ringNodes.length;
      var nominalR = Math.max(d * baseRadius, count * 52);
      ringNodes.sort(function(a, b) {
        var labelA = (a.label || '').split('\\n')[0];
        var labelB = (b.label || '').split('\\n')[0];
        return labelA.localeCompare(labelB);
      });

      for (var i = 0; i < count; i++) {
        var angleOffset = (d % 2 === 1) ? 0 : (Math.PI / 6);
        var angle = (i * (2 * Math.PI / count)) + angleOffset;
        var facet = Math.PI / 3;
        var relAngle = ((angle % facet) + facet) % facet - (facet / 2);
        var hexR = nominalR * (Math.cos(facet / 2) / Math.cos(relAngle));
        var finalR = (hexR * 0.75) + (nominalR * 0.25);
        updates.push({
          id: ringNodes[i].id,
          x: Math.round(finalR * Math.cos(angle)),
          y: Math.round(finalR * Math.sin(angle))
        });
      }
    });

    nodes.update(updates);
    network.setOptions({
      physics: { enabled: false },
      edges: { smooth: { enabled: true, type: "continuous", roundness: 0.15 } }
    });

    setTimeout(function() {
      network.fit({ animation: { duration: 700, easingFunction: 'easeInOutQuad' } });
    }, 120);
  }
  applyHexagonalConstellation();

  network.setOptions({
    interaction: {
      hover: true,
      selectConnectedEdges: false,
      hoverConnectedEdges: false
    },
    edges: {
      selectionWidth: 0,
      hoverWidth: 0
    },
    nodes: {
      shape: 'custom',
      ctxRenderer: tacticalNodeRenderer
    }
  });

  var shapeUpdates = nodes.get().map(function(n) {
    return { id: n.id, shape: 'custom' };
  });
  nodes.update(shapeUpdates);

  function removeNodeFromActiveGraph(nodeId) {
    if (nodeId === undefined || nodeId === null) return;
    var nId = (isNaN(nodeId) ? nodeId : Number(nodeId));
    
    if (network.getPositions) {
      var curPos = network.getPositions([nId])[nId];
      if (curPos) {
        nodePositions[nId] = { x: Math.round(curPos.x), y: Math.round(curPos.y) };
      }
    }
    
    hiddenNodeIds.add(nId);

    var nodeObj = canonicalNodes.get(nId) || nodes.get(nId) || {};
    var rawLabel = nodeObj.label || ('NODE ' + nId);
    var parts = rawLabel.split('\\n');
    var entityType = parts[0] ? parts[0].trim().toUpperCase() : 'ENTITY';
    var mainText = parts.slice(1).join(' ').trim() || rawLabel;
    var deg = degreeMap[nId] || { in: 0, out: 0, total: 0 };
    var rawTitle = nodeObj.title || '';
    var centralityVal = 0.0;
    if (rawTitle.indexOf('Centrality:') !== -1) {
      centralityVal = parseFloat(rawTitle.split('Centrality:')[1].split('\\n')[0].trim()) || 0.0;
    }

    var calcRisk = Math.min(96.0, Math.max(15.0, Math.round((centralityVal * 80 + (deg.total * 6.5)) * 10) / 10));
    if (entityType.indexOf('COMPLAINANT') !== -1 || nId === 888888) calcRisk = 0.0;

    var nodeData = {
      id: nId,
      name: mainText,
      type: entityType,
      riskScore: calcRisk.toFixed(1),
      status: 'STAGED IN INVENTORY',
      district: (rawTitle.indexOf('Jurisdiction:') !== -1) ? rawTitle.split('Jurisdiction:')[1].split('\\n')[0].trim() : 'Pan-India Grid'
    };

    nodes.remove(nId);
    network.unselectAll();
    recalculateDegrees();
    network.redraw();

    window.parent.postMessage({
      type: "NODE_REMOVED",
      payload: nodeData
    }, "*");
  }

  function restoreNodeToActiveGraph(nodeId) {
    if (nodeId === undefined || nodeId === null) return;
    var nId = (isNaN(nodeId) ? nodeId : Number(nodeId));
    if (!hiddenNodeIds.has(nId)) return;

    hiddenNodeIds.delete(nId);
    var baseNode = canonicalNodes.get(nId);
    if (!baseNode) return;

    var nodeToAdd = Object.assign({}, baseNode);
    if (nodePositions[nId]) {
      nodeToAdd.x = nodePositions[nId].x;
      nodeToAdd.y = nodePositions[nId].y;
    }
    nodeToAdd.shape = 'custom';
    nodes.add(nodeToAdd);

    var edgesToAdd = [];
    for (var i = 0; i < canonicalEdges.length; i++) {
      var e = canonicalEdges[i];
      if (e.from == nId || e.to == nId) {
        var otherEnd = (e.from == nId ? e.to : e.from);
        if (!hiddenNodeIds.has(otherEnd) && nodes.get(otherEnd)) {
          if (!edges.get(e.id)) {
            edgesToAdd.push(e);
          }
        }
      }
    }
    if (edgesToAdd.length > 0) {
      edges.add(edgesToAdd);
    }

    recalculateDegrees();
    network.selectNodes([nId]);
    sendNodeTelemetry(nId);
    checkAndStartBreathing();
    network.redraw();
  }

  function restoreAllNodesToActiveGraph() {
    var toRestore = Array.from(hiddenNodeIds);
    for (var i = 0; i < toRestore.length; i++) {
      var nId = toRestore[i];
      hiddenNodeIds.delete(nId);
      var baseNode = canonicalNodes.get(nId);
      if (baseNode && !nodes.get(nId)) {
        var nodeToAdd = Object.assign({}, baseNode);
        if (nodePositions[nId]) {
          nodeToAdd.x = nodePositions[nId].x;
          nodeToAdd.y = nodePositions[nId].y;
        }
        nodeToAdd.shape = 'custom';
        nodes.add(nodeToAdd);
      }
    }
    var edgesToAdd = [];
    for (var j = 0; j < canonicalEdges.length; j++) {
      var ce = canonicalEdges[j];
      if (!hiddenNodeIds.has(ce.from) && !hiddenNodeIds.has(ce.to)) {
        if (!edges.get(ce.id)) {
          edgesToAdd.push(ce);
        }
      }
    }
    if (edgesToAdd.length > 0) edges.add(edgesToAdd);
    recalculateDegrees();
    network.redraw();
  }

  function isRemoveButtonClicked(pointer) {
    if (!pointer || !pointer.canvas || typeof network.getPositions !== 'function') return null;
    var cx = pointer.canvas.x;
    var cy = pointer.canvas.y;
    var allPositions = network.getPositions();
    var zoom = (network.getScale ? network.getScale() : 1.0);
    var selectedNodes = (network.getSelectedNodes ? network.getSelectedNodes() : []);

    for (var idStr in allPositions) {
      var nid = isNaN(idStr) ? idStr : Number(idStr);
      var isSel = selectedNodes.indexOf(nid) !== -1;
      
      var nw, nh;
      if (isSel || zoom >= 1.35) {
        nw = 230; nh = 92;
      } else if (zoom < 0.35) {
        nw = 22; nh = 22;
      } else {
        nw = 155; nh = 34;
      }

      if (!isSel && zoom < 1.35) continue;

      var pos = allPositions[idStr];
      var topX = pos.x - nw / 2;
      var topY = pos.y - nh / 2;

      var btnSize = 13;
      var btnX = topX + nw - btnSize - 9;
      var btnY = topY + 6;

      if (cx >= btnX - 5 && cx <= btnX + btnSize + 5 &&
          cy >= btnY - 5 && cy <= btnY + btnSize + 5) {
        return nid;
      }
    }
    return null;
  }

  function findNodeAtPointer(pointer) {
    if (!pointer) return null;
    if (typeof network.getNodeAt === 'function' && pointer.DOM) {
      var directId = network.getNodeAt(pointer.DOM);
      if (directId !== undefined && directId !== null) return directId;
    }
    if (!pointer.canvas || typeof network.getPositions !== 'function') return null;
    var cx = pointer.canvas.x;
    var cy = pointer.canvas.y;
    var allPositions = network.getPositions();
    var zoom = (network.getScale ? network.getScale() : 1.0);
    var selectedNodes = (network.getSelectedNodes ? network.getSelectedNodes() : []);
    
    var bestNodeId = null;
    var minDistanceSq = Infinity;
    
    for (var idStr in allPositions) {
      var pos = allPositions[idStr];
      var nid = isNaN(idStr) ? idStr : Number(idStr);
      var isSel = selectedNodes.indexOf(nid) !== -1;
      
      var nw = isSel ? 230 : (zoom < 0.35 ? 22 : (zoom < 1.35 ? 155 : 230));
      var nh = isSel ? 92 : (zoom < 0.35 ? 22 : (zoom < 1.35 ? 34 : 92));
      
      var hw = (nw / 2) + 12;
      var hh = (nh / 2) + 12;
      
      if (cx >= pos.x - hw && cx <= pos.x + hw && cy >= pos.y - hh && cy <= pos.y + hh) {
        var dx = cx - pos.x;
        var dy = cy - pos.y;
        var distSq = dx * dx + dy * dy;
        if (distSq < minDistanceSq) {
          minDistanceSq = distSq;
          bestNodeId = nid;
        }
      }
    }
    return bestNodeId;
  }

  function sendNodeTelemetry(clickedId) {
    var nodeObj = (typeof nodes !== 'undefined' && nodes.get) ? nodes.get(clickedId) : null;
    window.parent.postMessage({
      type: "NODE_CLICK",
      payload: clickedId,
      nodeData: nodeObj
    }, "*");
  }

  var isBreathing = false;
  var lastRedrawTime = 0;
  function breathingLoop(time) {
    if (typeof network !== 'undefined') {
      var selectedNodes = (network.getSelectedNodes ? network.getSelectedNodes() : []);
      if (selectedNodes.length > 0) {
        if (time - lastRedrawTime >= 33) {
          lastRedrawTime = time;
          network.redraw();
        }
        requestAnimationFrame(breathingLoop);
        return;
      }
    }
    isBreathing = false;
  }

  function checkAndStartBreathing() {
    if (!isBreathing) {
      var selectedNodes = (typeof network !== 'undefined' && network.getSelectedNodes) ? network.getSelectedNodes() : [];
      if (selectedNodes.length > 0) {
        isBreathing = true;
        requestAnimationFrame(breathingLoop);
      }
    }
  }

  network.off("click");
  network.on("click", function(params) {
    var removeTargetId = isRemoveButtonClicked(params.pointer);
    if (removeTargetId !== null && removeTargetId !== undefined) {
      removeNodeFromActiveGraph(removeTargetId);
      return;
    }

    var targetId = (params.nodes && params.nodes.length > 0) ? params.nodes[0] : findNodeAtPointer(params.pointer);
    if (targetId !== null && targetId !== undefined) {
      network.selectNodes([targetId]);
      sendNodeTelemetry(targetId);
      checkAndStartBreathing();
      network.redraw();
    } else {
      network.unselectAll();
      window.parent.postMessage({ type: "CANVAS_CLICK" }, "*");
      setTimeout(function() { network.redraw(); }, 15);
    }
  });

  network.off("selectNode");
  network.on("selectNode", function(params) {
    if (params.node) sendNodeTelemetry(params.node);
    setTimeout(checkAndStartBreathing, 15);
  });

  window.addEventListener("message", function(event) {
    if (!event.data) return;
    if (event.data.type === "RESTORE_NODE") {
      restoreNodeToActiveGraph(event.data.payload);
    } else if (event.data.type === "RESTORE_ALL_NODES") {
      restoreAllNodesToActiveGraph();
    } else if (event.data.type === "SET_HIDDEN_NODES") {
      var arr = event.data.payload || [];
      arr.forEach(function(nid) { removeNodeFromActiveGraph(nid); });
    } else if (event.data.type === "FIT_VIEW") {
      network.fit({ animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
    } else if (event.data.type === "HIGHLIGHT_PATH") {
      var pNodes = event.data.payload || [];
      if (pNodes.length === 0) return;
      var pSet = new Set(pNodes);
      var nodeUpdates = [];
      nodes.forEach(function(n) {
        if (pSet.has(n.id)) {
          nodeUpdates.push({
            id: n.id,
            color: { background: "#854d0e", border: "#facc15" },
            opacity: 1.0
          });
        } else {
          nodeUpdates.push({ id: n.id, opacity: 0.12 });
        }
      });
      nodes.update(nodeUpdates);
      var edgeUpdates = [];
      edges.forEach(function(e) {
        var inPath = false;
        for (var i = 0; i < pNodes.length - 1; i++) {
          if ((e.from == pNodes[i] && e.to == pNodes[i+1]) || (e.from == pNodes[i+1] && e.to == pNodes[i])) {
            inPath = true;
            break;
          }
        }
        if (inPath) {
          edgeUpdates.push({ id: e.id, color: "#facc15", width: 3.5, opacity: 1.0 });
        } else {
          edgeUpdates.push({ id: e.id, opacity: 0.05 });
        }
      });
      edges.update(edgeUpdates);
    } else if (event.data.type === "HIGHLIGHT_CYCLES") {
      var cycleNodes = event.data.payload || [];
      if (cycleNodes.length === 0) return;
      var cSet = new Set(cycleNodes);
      var nodeUpdates = [];
      nodes.forEach(function(n) {
        if (cSet.has(n.id)) {
          nodeUpdates.push({
            id: n.id,
            color: { background: "#581c87", border: "#c084fc" },
            opacity: 1.0
          });
        } else {
          nodeUpdates.push({ id: n.id, opacity: 0.12 });
        }
      });
      nodes.update(nodeUpdates);
      var edgeUpdates = [];
      edges.forEach(function(e) {
        if (cSet.has(e.from) && cSet.has(e.to)) {
          edgeUpdates.push({ id: e.id, color: "#c084fc", width: 3.5, opacity: 1.0 });
        } else {
          edgeUpdates.push({ id: e.id, opacity: 0.05 });
        }
      });
      edges.update(edgeUpdates);
    } else if (event.data.type === "RESET_PATH") {
      recalculateDegrees();
      if (typeof drawGraph === 'function') drawGraph();
      setTimeout(function() {
        applyHexagonalConstellation();
        network.setOptions({
          interaction: { hover: true, selectConnectedEdges: false, hoverConnectedEdges: false },
          edges: { selectionWidth: 0, hoverWidth: 0 },
          nodes: { shape: 'custom', ctxRenderer: tacticalNodeRenderer }
        });
        var shapeReapply = nodes.get().map(function(n) { return { id: n.id, shape: 'custom' }; });
        nodes.update(shapeReapply);
        checkAndStartBreathing();
      }, 150);
    }
  });
}
initWhenReady();
</script>
"""

def generate_blank_canvas():
    """Generates an empty Vis.js network canvas on disk to eliminate leftover graph artifacts."""
    net = Network(height="100%", width="100%", bgcolor="#09090b", font_color="#e4e4e7", directed=True)
    output_path = os.path.join(_script_dir, "crime_network_visualization.html")
    net.save_graph(output_path)
    with open(output_path, "r", encoding="utf-8") as f:
        html = f.read()
    html = html.replace("</body>", f"{DARK_NETWORK_THEME}</body>")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)

def safe_float(val: Any, default: float = 0.0) -> float:
    """Sanitizes currency, whitespace, and formatting symbols before float conversion."""
    if val is None:
        return default
    if isinstance(val, (int, float)):
        return float(val)
    clean = re.sub(r'[^\d.-]', '', str(val))
    try:
        return float(clean) if clean else default
    except (ValueError, TypeError):
        return default

def safe_int(val: Any, default: int = 0) -> int:
    """Extracts base integer value safely."""
    return int(safe_float(val, float(default)))

def resolve_to_real_name(raw_id: str, all_raw_entities: List[str] = None) -> tuple:
    clean = raw_id.strip()
    
    if re.match(r'^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$', clean) or clean.isalpha():
        canonical_name = get_indic_phonetic_root(clean)
        return canonical_name, clean, "PERSON"
        
    if "ACC-" in clean.upper():
        parts = clean.split("-")
        token = parts[-1].capitalize()
        if "OFFSHORE" in clean.upper():
            return "Offshore Settlement Escrow", f"A/C: {clean}", "ESCROW_VAULT"
        if "SHELL" in clean.upper():
            return "Shell Logistics Escrow", f"A/C: {clean}", "ESCROW_VAULT"
        if all_raw_entities:
            for ent in all_raw_entities:
                if token.lower() in ent.lower() and re.match(r'^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$', ent):
                    return f"{ent}", f"Bank A/C {parts[1] if len(parts)>2 else ''}", "ACCOUNT"
        return f"{token} Commercial Bank", f"A/C: {clean}", "ACCOUNT"
        
    if "@" in clean:
        user, domain = clean.split("@", 1)
        domain_name = domain.replace(".com", "").replace(".org", "").title()
        if all_raw_entities:
            for ent in all_raw_entities:
                if user.lower() in ent.lower() and re.match(r'^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$', ent):
                    return f"{ent}", f"Channel: {domain_name}", "COVERT_CHANNEL"
        return f"{user.capitalize()}", f"Org: {domain_name}", "COVERT_CHANNEL"
        
    if re.match(r'^\d{10}$', clean) or (clean.startswith("+91") and len(clean) >= 12):
        normalized_digits = normalize_phone(clean)
        formatted_num = f"+91-{normalized_digits[:5]}-{normalized_digits[5:]}" if len(normalized_digits) == 10 else normalized_digits
        return "Unknown Telecom Target", formatted_num, "SUBSCRIBER"
        
    return clean, "", "ENTITY"

def classify_category(nid: int, uid: str, ntype: str, shatter: int) -> str:
    if ntype == "COMPLAINANT":
        return "COMPLAINANT"
        
    if shatter == 1 or (uid and "ATM_" in str(uid)):
        return "ATM"
        
    if ntype in ["PERSON", "ACCOUNT_UPI", "VEHICLE", "CRIME_INCIDENT", "PHONE_MSISDN", "CELL_TOWER_CGI"]:
        return ntype
        
    return ntype or "OTHER"

def parse_raw_evidence_to_csr(txt_files: List[UploadFile], csv_files: List[UploadFile]) -> Dict[str, Any]:
    raw_node_map = {}
    def get_node_id(node_str: str) -> int:
        clean_str = str(node_str).strip()
        if not clean_str or clean_str.lower() == 'nan':
            return -1
        if clean_str not in raw_node_map:
            raw_node_map[clean_str] = len(raw_node_map)
        return raw_node_map[clean_str]

    edges = []
    financial_txns = []
    telecom_records = []
    default_now = datetime.now(timezone.utc).isoformat()

    # 1. Parse Text Files (Streamed Line-by-Line)
    for txt_file in txt_files:
        txt_file.file.seek(0)
        for line_raw in txt_file.file:
            line = line_raw.decode("utf-8", errors="ignore") if isinstance(line_raw, bytes) else str(line_raw)
            entities = re.findall(r'\b(?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+|\d{10}|\w+@\w+|ACC-[A-Z0-9\-]+)\b', line)
            if len(entities) >= 2:
                for i in range(len(entities) - 1):
                    u = get_node_id(entities[i])
                    v = get_node_id(entities[i+1])
                    if u != -1 and v != -1:
                        ts = default_now
                        edges.append((u, v, 1.0, ts))
                        
                        if "ACC-" in entities[i].upper() or "ACC-" in entities[i+1].upper():
                            financial_txns.append({
                                "txn_id": len(financial_txns) + 1,
                                "txn_ref_no": f"EXH-TXN-{len(financial_txns)+1:04d}",
                                "src_account_or_vpa": entities[i],
                                "dest_account_or_vpa": entities[i+1],
                                "amount_inr": 0.0,
                                "timestamp": ts,
                                "channel": "INFERRED",
                                "is_smurfing": 0,
                                "is_shatter_point": 0
                            })
                        else:
                            telecom_records.append({
                                "cdr_id": len(telecom_records) + 1,
                                "a_party_num": str(entities[i]),
                                "b_party_num": str(entities[i+1]),
                                "call_type": "INFERRED_LINK",
                                "start_time": ts,
                                "duration_sec": 0,
                                "a_imei": "UNKNOWN",
                                "b_imei": "UNKNOWN",
                                "first_cgi": "UNKNOWN",
                                "last_cgi": "UNKNOWN",
                                "circle_code": "UNKNOWN"
                            })

    # 2. Parse CSV Files (Streamed Row-by-Row)
    for csv_file in csv_files:
        csv_file.file.seek(0)
        wrapper = io.TextIOWrapper(csv_file.file, encoding="utf-8", errors="ignore")
        reader = csv.reader(wrapper)
        
        try:
            header = next(reader, None)
        except Exception:
            wrapper.detach()
            continue

        if not header:
            wrapper.detach()
            continue

        cols = [c.lower().strip() for c in header]
        
        for row in reader:
            if not row:
                continue
            row_dict = {cols[i]: row[i] for i in range(min(len(cols), len(row)))}
            raw_ts = row_dict.get('message_timestamp') or row_dict.get('timestamp') or row_dict.get('start_time')
            ts = sanitize_datetime_iso(raw_ts) or default_now
            
            if 'sender_handle_or_num' in row_dict and 'receiver_handle_or_num' in row_dict:
                src, tgt = row_dict['sender_handle_or_num'], row_dict['receiver_handle_or_num']
                u, v = get_node_id(src), get_node_id(tgt)
                if u != -1 and v != -1:
                    edges.append((u, v, 1.0, ts))
                    dur = safe_int(row_dict.get('duration_sec', row_dict.get('duration', 0)))
                    
                    if row_dict.get('call_type'):
                        exact_type = str(row_dict.get('call_type')).upper()
                    elif '@' in str(src) or '@' in str(tgt):
                        exact_type = "EMAIL"
                    elif dur > 0:
                        exact_type = "VOICE_CALL"
                    else:
                        exact_type = "TEXT_MESSAGE"

                    telecom_records.append({
                        "cdr_id": len(telecom_records) + 1,
                        "a_party_num": str(src),
                        "b_party_num": str(tgt),
                        "call_type": exact_type,
                        "start_time": ts,
                        "duration_sec": dur,
                        "a_imei": normalize_imei(row_dict.get('a_imei', '')),
                        "b_imei": normalize_imei(row_dict.get('b_imei', '')),
                        "first_cgi": row_dict.get('first_cgi', 'UNKNOWN'),
                        "last_cgi": row_dict.get('last_cgi', 'UNKNOWN'),
                        "circle_code": row_dict.get('circle_code', 'UNKNOWN')
                    })
            elif 'source_account' in row_dict and 'target_account' in row_dict:
                src, tgt = row_dict['source_account'], row_dict['target_account']
                amount = safe_float(row_dict.get('amount', 0.0))
                u, v = get_node_id(src), get_node_id(tgt)
                if u != -1 and v != -1:
                    edges.append((u, v, amount, ts))
                    financial_txns.append({
                        "txn_id": len(financial_txns) + 1,
                        "txn_ref_no": row_dict.get('txn_ref_no', f"TXN-EXH-{len(financial_txns)+1:04d}"),
                        "src_account_or_vpa": str(src),
                        "dest_account_or_vpa": str(tgt),
                        "amount_inr": amount,
                        "timestamp": ts,
                        "channel": row_dict.get('channel', 'UPI' if '@' in str(src) or '@' in str(tgt) else 'IMPS'),
                        "is_smurfing": int(row_dict.get('is_smurfing', 1 if (10000 <= amount <= 49999) else 0)),
                        "is_shatter_point": int(row_dict.get('is_shatter_point', 1 if ('ATM' in str(tgt).upper() or 'OFFSHORE' in str(tgt).upper()) else 0))
                    })
            elif 'source' in row_dict and 'target' in row_dict:
                src, tgt = row_dict['source'], row_dict['target']
                weight = safe_float(row_dict.get('weight', 1.0), default=1.0)
                u, v = get_node_id(src), get_node_id(tgt)
                if u != -1 and v != -1:
                    edges.append((u, v, weight, ts))
                    if weight >= 100 or 'ACC-' in str(src).upper() or 'ACC-' in str(tgt).upper() or '@' in str(src) or '@' in str(tgt):
                        financial_txns.append({
                            "txn_id": len(financial_txns) + 1,
                            "txn_ref_no": f"EXH-TXN-{len(financial_txns)+1:04d}",
                            "src_account_or_vpa": str(src),
                            "dest_account_or_vpa": str(tgt),
                            "amount_inr": weight,
                            "timestamp": ts,
                            "channel": "UPI" if ('@' in str(src) or '@' in str(tgt)) else "IMPS",
                            "is_smurfing": 1 if (10000 <= weight <= 49999) else 0,
                            "is_shatter_point": 1 if ('ATM' in str(tgt).upper() or 'OFFSHORE' in str(tgt).upper()) else 0
                        })
                    else:
                        telecom_records.append({
                            "cdr_id": len(telecom_records) + 1,
                            "a_party_num": str(src),
                            "b_party_num": str(tgt),
                            "call_type": "INFERRED",
                            "start_time": ts,
                            "duration_sec": int(weight * 60) if weight < 60 else int(weight),
                            "a_imei": "UNKNOWN",
                            "b_imei": "UNKNOWN",
                            "first_cgi": "UNKNOWN",
                            "last_cgi": "UNKNOWN",
                            "circle_code": "UNKNOWN"
                        })
            elif len(row) >= 2:
                src, tgt = row[0], row[1]
                u, v = get_node_id(src), get_node_id(tgt)
                if u != -1 and v != -1:
                    edges.append((u, v, 1.0, ts))
                    if 'ACC-' in str(src).upper() or 'ACC-' in str(tgt).upper():
                        financial_txns.append({
                            "txn_id": len(financial_txns) + 1,
                            "txn_ref_no": f"EXH-TXN-{len(financial_txns)+1:04d}",
                            "src_account_or_vpa": str(src),
                            "dest_account_or_vpa": str(tgt),
                            "amount_inr": 0.0,
                            "timestamp": ts,
                            "channel": "INFERRED",
                            "is_smurfing": 0,
                            "is_shatter_point": 0
                        })
                    else:
                        telecom_records.append({
                            "cdr_id": len(telecom_records) + 1,
                            "a_party_num": str(src),
                            "b_party_num": str(tgt),
                            "call_type": "INFERRED",
                            "start_time": ts,
                            "duration_sec": 0,
                            "a_imei": "UNKNOWN",
                            "b_imei": "UNKNOWN",
                            "first_cgi": "UNKNOWN",
                            "last_cgi": "UNKNOWN",
                            "circle_code": "UNKNOWN"
                        })
        wrapper.detach()

    num_nodes = len(raw_node_map)
    if num_nodes == 0 or not edges:
        return {
            "num_nodes": 0, "row_ptr": [0], "col_idx": [], "weights": [],
            "timestamps": [], "entity_map": {}, "raw_edges": [],
            "financial_txns": [], "telecom_records": []
        }

    edges.sort(key=lambda x: x[0])
    row_ptr = [0] * (num_nodes + 1)
    col_idx, weights, sorted_timestamps = [], [], []
    current_node = 0
    
    for u, v, w, ts in edges:
        while current_node < u:
            current_node += 1
            row_ptr[current_node] = len(col_idx)
        col_idx.append(v)
        weights.append(w)
        sorted_timestamps.append(ts)
        
    while current_node < num_nodes:
        current_node += 1
        row_ptr[current_node] = len(col_idx)

    all_raw_keys = list(raw_node_map.keys())
    resolved_entity_map = {}
    for raw_label, nid in raw_node_map.items():
        primary, sub, _ = resolve_to_real_name(raw_label, all_raw_keys)
        full_display = f"{primary} ({sub})" if sub else primary
        resolved_entity_map[nid] = full_display

    d3_edges = [{"source": u, "target": v, "weight": w} for u, v, w, ts in edges]

    return {
        "num_nodes": num_nodes,
        "row_ptr": row_ptr,
        "col_idx": col_idx,
        "weights": weights,
        "timestamps": sorted_timestamps,
        "entity_map": resolved_entity_map,
        "raw_node_map": raw_node_map,
        "raw_edges": d3_edges,
        "financial_txns": financial_txns,
        "telecom_records": telecom_records
    }

def render_uploaded_graph_canvas(case_id: str, graph_data: dict, results: dict, allowed_types: Optional[set] = None):
    net = Network(height="100%", width="100%", bgcolor="#09090b", font_color="#e4e4e7", directed=True)
    net.barnes_hut(gravity=-6500, central_gravity=0.18, spring_length=190, spring_strength=0.04, damping=0.95)

    raw_node_map = graph_data.get("raw_node_map", {})
    all_raw_keys = list(raw_node_map.keys())
    
    shatter_raw = results.get("shatter_points", [])
    shatter_set = set(shatter_raw) if isinstance(shatter_raw, list) else set()
    
    mule_raw = results.get("suspicious_mules", [])
    mule_set = set(m.get("node") for m in mule_raw if isinstance(m, dict)) if isinstance(mule_raw, list) else set()
    
    brandes = results.get("brandes", [])
    max_b = max(brandes) if isinstance(brandes, list) and brandes and max(brandes) > 0 else 1.0

    reverse_raw = {v: k for k, v in raw_node_map.items()}
    added_nodes = set()
    node_categories = {}

    for nid in range(graph_data["num_nodes"]):
        raw_token = reverse_raw.get(nid, f"Node #{nid}")
        primary_name, sub_info, ntype = resolve_to_real_name(raw_token, all_raw_keys)
        b_score = brandes[nid] if isinstance(brandes, list) and nid < len(brandes) else 0.0
        norm_b = (b_score / max_b) if max_b > 0 else 0.0
        dynamic_size = 18 + int(norm_b * 18)

        if nid in shatter_set or "OFFSHORE" in raw_token.upper() or "@" in raw_token:
            cat = "ATM"
            role_tag = "ATM EXIT"
            bg_color, border_color, shape = "#3b1723", "#9f1239", "box"
            dynamic_size = max(dynamic_size, 24)
            main_id = raw_token if ("ACC-" in raw_token or "@" in raw_token) else primary_name
            display_label = f"ATM EXIT\n{main_id}"
        elif nid in mule_set or ntype in ["ACCOUNT", "ESCROW_VAULT"] or "ACC-" in raw_token.upper():
            cat = "ACCOUNT_UPI"
            role_tag = "MULE ACCOUNT"
            bg_color, border_color, shape = "#2c1e38", "#6b21a8", "box"
            dynamic_size = max(dynamic_size, 22)
            main_id = raw_token if "ACC-" in raw_token else f"{primary_name} ({sub_info})" if sub_info else primary_name
            display_label = f"MULE ACCOUNT\n{main_id}"
        elif ntype == "SUBSCRIBER":
            cat = "PHONE_MSISDN"
            role_tag = "PHONE"
            bg_color, border_color, shape = "#162836", "#0369a1", "box"
            dynamic_size = max(dynamic_size, 20)
            phone_num = sub_info if sub_info else primary_name
            display_label = f"PHONE\n{phone_num}"
        elif b_score > 0.35:
            cat = "PERSON"
            role_tag = "MASTERMIND"
            bg_color, border_color, shape = "#3d1d1d", "#991b1b", "ellipse"
            dynamic_size = max(dynamic_size, 30)
            display_label = f"MASTERMIND\n{primary_name}"
        elif ntype == "PERSON":
            cat = "PERSON"
            role_tag = "SUSPECT"
            bg_color, border_color, shape = "#332617", "#b45309", "box"
            dynamic_size = max(dynamic_size, 22)
            display_label = f"SUSPECT\n{primary_name}"
        else:
            cat = "OTHER"
            role_tag = "ENTITY"
            bg_color, border_color, shape = "#27272a", "#3f3f46", "box"
            display_label = f"ENTITY\n{primary_name}"

        node_categories[nid] = cat

        if allowed_types is not None and cat not in allowed_types:
            continue

        added_nodes.add(nid)
        net.add_node(
            nid,
            label=display_label,
            title=f"Target: {primary_name}\nType: {role_tag}\nRef: {raw_token}\nCentrality: {b_score:.4f}",
            shape=shape,
            margin=10,
            color={'background': bg_color, 'border': border_color, 'highlight': {'background': '#3f3f46', 'border': '#ffffff'}},
            borderWidth=1.2,
            size=dynamic_size,
            font={'face': 'Chakra Petch, sans-serif', 'size': 10, 'color': '#f4f4f5'}
        )

    edge_aggregates = {}
    for edge in graph_data["raw_edges"]:
        u, v = edge["source"], edge["target"]
        if u not in added_nodes or v not in added_nodes:
            continue
        pair = (u, v)
        if pair not in edge_aggregates:
            edge_aggregates[pair] = {"count": 1, "weight": edge["weight"]}
        else:
            edge_aggregates[pair]["count"] += 1
            edge_aggregates[pair]["weight"] += edge["weight"]

    for (u, v), data in edge_aggregates.items():
        cnt = data["count"]
        w = data["weight"]
        cat_u = node_categories.get(u, "OTHER")
        cat_v = node_categories.get(v, "OTHER")

        if w >= 100 or cat_u in ["ACCOUNT_UPI", "ATM"] or cat_v in ["ACCOUNT_UPI", "ATM"]:
            edge_color = "#dc2626"
            edge_width = 2.0
            edge_lbl = f"Fund Transfer (INR {w:,.0f})" if w >= 100 else "Fund Transfer"
            edge_title = f"Financial Transfer: INR {w:,.0f} logged"
        elif (cat_u == "PERSON" and cat_v in ["PHONE_MSISDN", "ACCOUNT_UPI"]) or (cat_v == "PERSON" and cat_u in ["PHONE_MSISDN", "ACCOUNT_UPI"]):
            edge_color = "#0284c7"
            edge_width = 1.4
            edge_lbl = "Operates"
            edge_title = "Suspect operates communication terminal or account"
        elif cat_u == "PERSON" and cat_v == "PERSON":
            edge_color = "#475569"
            edge_width = 1.3
            edge_lbl = "Co-Accused"
            edge_title = "Syndicate co-accused association"
        elif cat_u == "PHONE_MSISDN" or cat_v == "PHONE_MSISDN":
            calls_logged = int(w) if (1 < w < 100) else cnt
            edge_color = "#0284c7"
            edge_width = min(3.5, 1.2 + (calls_logged * 0.15))
            edge_lbl = f"{calls_logged}x Calls" if calls_logged > 1 else "Voice Call"
            edge_title = f"CDR Telemetry: {calls_logged} voice calls recorded"
        else:
            edge_color = "#3f3f46"
            edge_width = 1.2
            edge_lbl = "Linked"
            edge_title = "Forensic evidentiary connection"

        net.add_edge(
            u, v, 
            label=edge_lbl, 
            title=edge_title, 
            color=edge_color, 
            width=edge_width,
font={'face': 'Chakra Petch, sans-serif', 'size': 10, 'color': '#f4f4f5'}
        )

    output_path = os.path.join(_script_dir, "crime_network_visualization.html")
    net.save_graph(output_path)
    with open(output_path, "r", encoding="utf-8") as f:
        html_code = f.read()
    html_code = html_code.replace("</body>", f"{DARK_NETWORK_THEME}</body>")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html_code)

# --- Endpoint 1: Analyze Custom Uploaded Exhibits ---
@app.post("/api/analyze-all/{case_id}")
async def analyze_all_algorithms(
    case_id: str,
    file1: UploadFile = File(None),
    file2: UploadFile = File(None),
    file3: UploadFile = File(None),
    file4: UploadFile = File(None),
    file5: UploadFile = File(None),
    file6: UploadFile = File(None),
    file7: UploadFile = File(None),
    file8: UploadFile = File(None),
    file9: UploadFile = File(None),
    file10: UploadFile = File(None),
    file11: UploadFile = File(None)
):
    uploaded_files = [file1, file2, file3, file4, file5, file6, file7, file8, file9, file10, file11]
    uploaded_filenames = []
    full_first_file_bytes = b""
    txt_files, csv_files = [], []

    for file in uploaded_files:
        if file is not None and file.filename:
            filename = file.filename.lower()
            uploaded_filenames.append(file.filename)
            
            # Read complete file stream in chunks for deterministic BSA Section 63(4) SHA-256
            if not full_first_file_bytes:
                hasher = hashlib.sha256()
                while chunk := await file.read(65536):
                    hasher.update(chunk)
                await file.seek(0)
                full_first_file_bytes = await file.read()
                await file.seek(0)
            
            if filename.endswith(".txt"):
                txt_files.append(file)
            elif filename.endswith(".csv"):
                csv_files.append(file)
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported format: {file.filename}")

    if not txt_files and not csv_files:
        raise HTTPException(status_code=400, detail="At least one valid evidence file (.csv or .txt) required.")

    graph_data = parse_raw_evidence_to_csr(txt_files, csv_files)
    num_n = graph_data["num_nodes"]
    if num_n == 0:
        generate_blank_canvas()
        raise HTTPException(status_code=400, detail="No graph topology could be extracted from exhibits.")

    results = {
        "brandes": [0.0] * num_n,
        "shatter_points": [],
        "suspicious_mules": []
    }

    if engine_loaded and dll:
        c_row_ptr = (ctypes.c_int * len(graph_data["row_ptr"]))(*graph_data["row_ptr"])
        c_col_idx = (ctypes.c_int * len(graph_data["col_idx"]))(*graph_data["col_idx"])
        c_weights = (ctypes.c_double * len(graph_data["weights"]))(*graph_data["weights"])

        if hasattr(dll, "compute_brandes_centrality"):
            try:
                c_out = (ctypes.c_double * num_n)()
                dll.compute_brandes_centrality(c_row_ptr, c_col_idx, c_weights, ctypes.c_size_t(num_n), c_out)
                results["brandes"] = list(c_out)
            except Exception as e:
                print(f"[!] C++ Brandes Centrality error: {e}")

        if hasattr(dll, "detect_shatter_points"):
            try:
                shatter_buf = (ctypes.c_ubyte * num_n)()
                dll.detect_shatter_points(c_row_ptr, c_col_idx, ctypes.c_size_t(num_n), shatter_buf)
                results["shatter_points"] = [i for i, val in enumerate(shatter_buf) if val > 0]
            except Exception as e:
                print(f"[!] C++ Shatter Point error: {e}")

        if hasattr(dll, "detect_mule_fanout"):
            try:
                mule_buf = (ctypes.c_ubyte * num_n)()
                dll.detect_mule_fanout(c_row_ptr, c_col_idx, c_weights, ctypes.c_size_t(num_n), ctypes.c_float(0.9), mule_buf)
                results["suspicious_mules"] = [{"node": i, "flag": int(val)} for i, val in enumerate(mule_buf) if val > 0]
            except Exception as e:
                print(f"[!] C++ Mule Fanout error: {e}")

    sha256_hash = hashlib.sha256(full_first_file_bytes).hexdigest() if full_first_file_bytes else "N/A"

    ACTIVE_INVESTIGATION_SESSIONS[case_id] = {
        "case_id": case_id,
        "num_nodes": num_n,
        "entity_map": graph_data["entity_map"],
        "raw_node_map": graph_data.get("raw_node_map", {}),
        "raw_edges": graph_data["raw_edges"],
        "row_ptr": graph_data["row_ptr"],
        "col_idx": graph_data["col_idx"],
        "weights": graph_data["weights"],
        "analysis_results": results,
        "sha256_hash": sha256_hash,
        "raw_first_bytes": full_first_file_bytes,
        "financial_transactions": graph_data.get("financial_txns", []),
        "telecom_records": graph_data.get("telecom_records", []),
        "uploaded_filenames": uploaded_filenames
    }

    render_uploaded_graph_canvas(case_id, graph_data, results)

    # Precompile dynamic statutory dossier
    if generate_statutory_dossier:
        safe_id = re.sub(r'[^\w\-_\.]', '_', case_id)
        pdf_filename = os.path.join(_script_dir, f"dossier_{safe_id}.pdf")
        
        ent_map = graph_data["entity_map"]
        shatter_list = set(results.get("shatter_points", []))
        brandes = results.get("brandes", [])
        
        top_entities = []
        for nid in range(min(num_n, 5)):
            is_shat = nid in shatter_list
            b_sc = brandes[nid] if nid < len(brandes) else 0.0
            top_entities.append({
                "id": f"EXH-{nid:02d}",
                "label": ent_map.get(nid, f"Entity #{nid}"),
                "type": "ACCOUNT_UPI" if is_shat else "PERSON",
                "role": "Shatter Cash-Out Hub" if is_shat else "Syndicate Carrier",
                "risk": f"{round((b_sc * 80 + (40 if is_shat else 10)), 1)}"
            })

        warrants = [
            {"id": "WNT-BNSS-106", "target": "Primary Seized Banking Gateway", "mandate": "Section 106 BNSS (Requisition for Lien & Debit-Freeze)"},
            {"id": "WNT-BNSS-94", "target": f"Ingested Digital Exhibit Vectors ({len(graph_data['raw_edges'])} links)", "mandate": "Section 94 BNSS (Electronic Artifact Seizure)"}
        ]

        case_meta = {
            "police_station": "CYBER CRIME & FORENSIC INVESTIGATION CELL",
            "district": "Custom Ingested File Stream",
            "state": "National Forensic Grid",
            "bns_sections": "Section 111, 318(4) BNS 2023",
            "complainant_name": "State (Forensic Exhibit Inquest)",
            "investigating_officer_badge": "OP-FORENSIC-01",
            "incident_date": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ"),
            "num_nodes": num_n,
            "num_edges": len(graph_data["raw_edges"])
        }

        try:
            generate_statutory_dossier(
                output_filename=pdf_filename,
                case_id=case_id,
                file_bytes=full_first_file_bytes,
                case_meta=case_meta,
                top_entities=top_entities,
                warrants=warrants
            )
        except Exception as e:
            print(f"[!] Dossier Generation Error: {e}")

    return {
        "status": "success",
        "case_id": case_id,
        "num_nodes": num_n,
        "total_events": len(graph_data["timestamps"]),
        "sha256_exhibit_hash": sha256_hash,
        "entity_map": graph_data["entity_map"],
        "links": graph_data["raw_edges"],
        "analysis_results": results,
        "dossier_download_url": f"/api/dossier/{case_id}"
    }

# --- Endpoint 2: Targeted Pathfinding on Uploaded Files ---
@app.post("/api/find-path/{case_id}")
async def get_shortest_path_uploaded(
    case_id: str,
    source_node: int,
    target_node: int,
    file1: UploadFile = File(None),
    file2: UploadFile = File(None),
    file3: UploadFile = File(None),
    file4: UploadFile = File(None),
    file5: UploadFile = File(None),
    file6: UploadFile = File(None),
    file7: UploadFile = File(None),
    file8: UploadFile = File(None),
    file9: UploadFile = File(None),
    file10: UploadFile = File(None),
    file11: UploadFile = File(None)
):
    current_session = ACTIVE_INVESTIGATION_SESSIONS.get(case_id, {})
    if current_session.get("num_nodes", 0) > 0:
        num_n = current_session["num_nodes"]
        row_ptr = current_session["row_ptr"]
        col_idx = current_session["col_idx"]
        entity_map = current_session["entity_map"]
    else:
        uploaded_files = [file1, file2, file3, file4, file5, file6, file7, file8, file9, file10, file11]
        txt_files, csv_files = [], []
        
        for file in uploaded_files:
            if file is not None and file.filename:
                if file.filename.lower().endswith(".txt"):
                    txt_files.append(file)
                elif file.filename.lower().endswith(".csv"):
                    csv_files.append(file)
                    
        graph_data = parse_raw_evidence_to_csr(txt_files, csv_files)
        num_n = graph_data["num_nodes"]
        row_ptr = graph_data["row_ptr"]
        col_idx = graph_data["col_idx"]
        entity_map = graph_data["entity_map"]

    if source_node >= num_n or target_node >= num_n or source_node < 0 or target_node < 0:
        raise HTTPException(status_code=400, detail=f"Invalid node range. Maximum node index is {num_n - 1}")

    path_result = []
    bfs_func = None
    if engine_loaded and dll and col_idx:
        bfs_func = getattr(dll, "find_shortest_path_bfs", None) or getattr(dll, "compute_bfs_path", None)

    if bfs_func:
        try:
            c_row_ptr = (ctypes.c_int * len(row_ptr))(*row_ptr)
            c_col_idx = (ctypes.c_int * len(col_idx))(*col_idx)
            path_buf = (ctypes.c_int * num_n)()
            path_len = ctypes.c_int(0)
            bfs_func(c_row_ptr, c_col_idx, ctypes.c_size_t(num_n), ctypes.c_int(source_node), ctypes.c_int(target_node), path_buf, ctypes.byref(path_len))
            resolved_len = path_len.value
            if resolved_len > 0:
                path_result = list(path_buf[:resolved_len])
        except Exception as e:
            print(f"[!] C++ BFS Execution fallback: {e}")

    # Pure Python BFS fallback with corrected queue instance identifier
    if not path_result:
        adj: Dict[int, List[int]] = {}
        for u in range(num_n):
            start_i = row_ptr[u]
            end_i = row_ptr[u+1]
            for v in col_idx[start_i:end_i]:
                adj.setdefault(u, []).append(v)
                adj.setdefault(v, []).append(u)
        q = deque([[source_node]])
        visited = {source_node}
        while q:
            curr_path = q.popleft()
            curr = curr_path[-1]
            if curr == target_node:
                path_result = curr_path
                break
            for nxt in adj.get(curr, []):
                if nxt not in visited:
                    visited.add(nxt)
                    q.append(curr_path + [nxt])

    labels = [entity_map.get(nid, f"Node #{nid}") for nid in path_result]
    return {
        "status": "success" if path_result else "not_found",
        "case_id": case_id,
        "source": source_node,
        "target": target_node,
        "path": path_result,
        "path_nodes": path_result,
        "path_length": max(0, len(path_result) - 1),
        "hops": max(0, len(path_result) - 1),
        "labels": labels,
        "message": "Path found successfully." if path_result else "No connecting trail found between entities."
    }

# --- Endpoint 3: Target Dossier Node Telemetry ---
@app.get("/api/node/{node_id:path}")
def get_node_details(node_id: str):
    clean_id = (node_id or "").strip()
    int_id = None
    try:
        int_id = int(clean_id)
    except ValueError:
        int_id = None

    matched_session = None
    target_nid = None

    if clean_id in ACTIVE_INVESTIGATION_SESSIONS:
        matched_session = ACTIVE_INVESTIGATION_SESSIONS[clean_id]
        target_nid = int_id if int_id is not None else 0
    else:
        for s_id, s_data in ACTIVE_INVESTIGATION_SESSIONS.items():
            ent_map = s_data.get("entity_map", {})
            raw_map = s_data.get("raw_node_map", {})
            if int_id is not None and int_id in ent_map:
                matched_session = s_data
                target_nid = int_id
                break
            if clean_id in raw_map:
                matched_session = s_data
                target_nid = raw_map[clean_id]
                break
            if clean_id.startswith("EXHIBIT_NODE:"):
                try:
                    sub_id = int(clean_id.split(":", 1)[1])
                    if sub_id in ent_map:
                        matched_session = s_data
                        target_nid = sub_id
                        break
                except ValueError:
                    pass

    if matched_session and target_nid is not None and target_nid in matched_session.get("entity_map", {}):
        label = matched_session["entity_map"][target_nid]
        analysis = matched_session.get("analysis_results", {})
        
        shatter_raw = analysis.get("shatter_points", [])
        shatter_list = shatter_raw if isinstance(shatter_raw, list) else []
        
        mule_raw = analysis.get("suspicious_mules", [])
        mule_list = [m.get("node") for m in mule_raw if isinstance(m, dict)] if isinstance(mule_raw, list) else []
        
        brandes = analysis.get("brandes", [])
        b_score = brandes[target_nid] if isinstance(brandes, list) and target_nid < len(brandes) else 0.0

        is_shatter = 1 if target_nid in shatter_list else 0
        is_mule = 1 if target_nid in mule_list else 0
        status = "ACTIVE EVIDENCE LINK"
        ntype = "INVESTIGATIVE_ENTITY"

        if is_shatter:
            status = "CRITICAL SHATTER POINT (ATM / EXIT)"
            ntype = "SHATTER_TERMINAL"
        elif is_mule:
            status = "IDENTIFIED MULE ACCOUNT (FAN-OUT)"
            ntype = "MULE_ACCOUNT"
        elif b_score > 0.35:
            status = "HIGH-RISK MASTERMIND / BROKER"
            ntype = "PERSON"

        return {
            "entity_uid": f"EXHIBIT_NODE:{target_nid}",
            "node_type": ntype,
            "canonical_label": label,
            "risk_score": round(max(0.2, min(0.98, b_score + (0.4 if is_shatter or is_mule else 0.0))), 2),
            "jurisdiction_district": "Custom Ingested File Stream",
            "is_shatter_point": is_shatter
        }

    if int_id == 888888 or clean_id in ["888888", "VICTIM:COMPLAINANT"]:
        comp_name = "Mukhtar Mir"
        comp_dist = "Patna (Complainant)"
        if os.path.exists(DB_PATH):
            try:
                c_conn = sqlite3.connect(DB_PATH)
                c_cur = c_conn.cursor()
                c_cur.execute("SELECT complainant_name, district FROM cctns_iif1_fir f JOIN cases c ON f.case_id = c.case_id LIMIT 1")
                c_row = c_cur.fetchone()
                if c_row and c_row[0]:
                    comp_name = c_row[0]
                    comp_dist = f"{c_row[1]} (Complainant)" if c_row[1] else comp_dist
                c_conn.close()
            except Exception:
                pass
        return {
            "entity_uid": "VICTIM:COMPLAINANT",
            "node_type": "COMPLAINANT",
            "canonical_label": comp_name,
            "risk_score": 0.0,
            "jurisdiction_district": comp_dist,
            "is_shatter_point": 0
        }

    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=404, detail="Database file not found")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    row = None
    if int_id is not None:
        cursor.execute("""
            SELECT entity_uid, node_type, canonical_label, risk_score, jurisdiction_district, is_shatter_point
            FROM hin_nodes 
            WHERE node_id = ?
        """, (int_id,))
        row = cursor.fetchone()

    if not row:
        cursor.execute("""
            SELECT entity_uid, node_type, canonical_label, risk_score, jurisdiction_district, is_shatter_point
            FROM hin_nodes 
            WHERE entity_uid = ? OR canonical_label = ? OR entity_uid LIKE ?
            LIMIT 1
        """, (clean_id, clean_id, f"%{clean_id}%"))
        row = cursor.fetchone()

    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail=f"Node {clean_id} not found")
    return dict(row)

# --- Endpoint 4: Database Dynamic PyVis Graph Generator ---
@app.get("/api/graph/generate/{case_id}")
def generate_dynamic_graph(
    case_id: str, 
    mode: str = "all", 
    scope: str = "national",
    types: Optional[str] = None
):
    allowed_types = None
    if types is not None:
        raw_types = types.strip()
        if raw_types == "" or raw_types.upper() in ["NONE", "EMPTY"]:
            allowed_types = set()
        else:
            allowed_types = set(t.strip().upper() for t in raw_types.split(",") if t.strip())

    clean_id = (case_id or "").strip()

    current_session = ACTIVE_INVESTIGATION_SESSIONS.get(clean_id)
    if not current_session and clean_id in ["DEFAULT-INGEST", "CASE-FIELD-INGEST"]:
        current_session = ACTIVE_INVESTIGATION_SESSIONS.get("CASE-FIELD-INGEST")

    if current_session and current_session.get("num_nodes", 0) > 0:
        render_uploaded_graph_canvas(
            clean_id, 
            current_session, 
            current_session["analysis_results"], 
            allowed_types=allowed_types
        )
        return {"status": "success", "timestamp": int(datetime.now().timestamp() * 1000)}

    if not clean_id:
        generate_blank_canvas()
        raise HTTPException(status_code=404, detail="Case ID cannot be blank")

    if not os.path.exists(DB_PATH):
        generate_blank_canvas()
        raise HTTPException(status_code=404, detail=f"Database file not found at {DB_PATH}")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("SELECT police_station, district, state FROM cases WHERE case_id = ?", (clean_id,))
    case_meta = cur.fetchone()
    case_district = case_meta["district"] if case_meta else ""
    case_state = case_meta["state"] if case_meta else ""

    cur.execute("SELECT fir_number, police_station, complainant_name FROM cctns_iif1_fir WHERE case_id = ?", (clean_id,))
    fir_row = cur.fetchone()

    cur.execute("""
        SELECT node_id, jurisdiction_district 
        FROM hin_nodes 
        WHERE entity_uid = ? OR entity_uid = ? OR entity_uid LIKE ?
        LIMIT 1
    """, (clean_id, f"CRIME_INCIDENT:{clean_id}", f"%{clean_id}%"))
    case_hin = cur.fetchone()
    
    if not case_hin:
        conn.close()
        generate_blank_canvas()
        raise HTTPException(status_code=404, detail=f"No graph nodes found for {clean_id}")
        
    fir_nid = case_hin["node_id"]
    if not case_district and case_hin["jurisdiction_district"]:
        case_district = case_hin["jurisdiction_district"]

    mode_filter = ""
    if mode == "finance":
        mode_filter = "AND (e.edge_type = 'TRANSFERRED_MONEY' OR n1.node_type IN ('ACCOUNT_UPI', 'PERSON') OR n2.node_type IN ('ACCOUNT_UPI', 'PERSON'))"
    elif mode == "telecom":
        mode_filter = "AND (e.edge_type IN ('CALLED', 'OPERATES_DEVICE', 'OPERATED_AT') OR n1.node_type IN ('PHONE_MSISDN', 'CELL_TOWER_CGI', 'HARDWARE_IMEI'))"

    scope_lower = (scope or "national").lower()
    max_depth = 1 if scope_lower == "precinct" else 2

    cur.execute("SELECT DISTINCT district FROM cases WHERE state = ?", (case_state,))
    state_districts = [r["district"] for r in cur.fetchall()]
    if case_district and case_district not in state_districts:
        state_districts.append(case_district)

    scope_filter = ""
    sql_params = [fir_nid]
    if scope_lower in ["precinct", "district"]:
        scope_filter = "AND (n1.jurisdiction_district = ? OR n1.node_id = ?) AND (n2.jurisdiction_district = ? OR n2.node_id = ?)"
        sql_params.extend([case_district, fir_nid, case_district, fir_nid])
    elif scope_lower == "state" and state_districts:
        d_placeholders = ",".join("?" for _ in state_districts)
        scope_filter = f"AND (n1.jurisdiction_district IN ({d_placeholders}) OR n1.node_id = ?) AND (n2.jurisdiction_district IN ({d_placeholders}) OR n2.node_id = ?)"
        sql_params.extend(state_districts + [fir_nid] + state_districts + [fir_nid])

    query = f"""
    WITH RECURSIVE case_network(node_id, depth) AS (
        SELECT ?, 0
        UNION
        SELECT CASE WHEN e.src_node_id = cn.node_id THEN e.dst_node_id ELSE e.src_node_id END, cn.depth + 1
        FROM hin_edges e
        JOIN case_network cn ON (e.src_node_id = cn.node_id OR e.dst_node_id = cn.node_id)
        WHERE cn.depth < {max_depth}
    )
    SELECT DISTINCT 
        e.src_node_id, e.dst_node_id, e.edge_type, e.affinity_weight, e.xai_human_readable_path,
        n1.entity_uid as src_uid, n1.node_type as src_type, n1.canonical_label as src_label, n1.risk_score as src_risk, n1.is_shatter_point as src_shatter, n1.jurisdiction_district as src_district,
        n2.entity_uid as dst_uid, n2.node_type as dst_type, n2.canonical_label as dst_label, n2.risk_score as dst_risk, n2.is_shatter_point as dst_shatter, n2.jurisdiction_district as dst_district
    FROM hin_edges e
    JOIN hin_nodes n1 ON e.src_node_id = n1.node_id
    JOIN hin_nodes n2 ON e.dst_node_id = n2.node_id
    WHERE e.src_node_id IN (SELECT node_id FROM case_network)
      AND e.dst_node_id IN (SELECT node_id FROM case_network)
      {mode_filter}
      {scope_filter}
    LIMIT 60;
    """
    cur.execute(query, tuple(sql_params))
    edges = cur.fetchall()
    conn.close()

    show_anchor = (allowed_types is None) or (len(allowed_types) > 0)
    
    if allowed_types is not None:
        if len(allowed_types) == 0:
            edges = []
        else:
            filtered_edges = []
            for row in edges:
                s_cat = classify_category(row["src_node_id"], row["src_uid"], row["src_type"], row["src_shatter"])
                d_cat = classify_category(row["dst_node_id"], row["dst_uid"], row["dst_type"], row["dst_shatter"])
                src_ok = (row["src_node_id"] == fir_nid) or (s_cat in allowed_types)
                dst_ok = (row["dst_node_id"] == fir_nid) or (d_cat in allowed_types)
                if src_ok and dst_ok:
                    filtered_edges.append(row)
            edges = filtered_edges

    unique_nids = set()
    for row in edges:
        unique_nids.add(row["src_node_id"])
        unique_nids.add(row["dst_node_id"])
    
    if fir_nid and show_anchor:
        unique_nids.add(fir_nid)

    if not unique_nids:
        generate_blank_canvas()
        return {"status": "success", "timestamp": int(datetime.now().timestamp() * 1000)}

    node_list = list(unique_nids)
    nid_to_idx = {nid: idx for idx, nid in enumerate(node_list)}
    num_sub_nodes = len(node_list)

    centrality_map = {}
    if num_sub_nodes > 0:
        adj = [[] for _ in range(num_sub_nodes)]
        for row in edges:
            u = nid_to_idx[row["src_node_id"]]
            v = nid_to_idx[row["dst_node_id"]]
            w = float(row["affinity_weight"]) if row["affinity_weight"] is not None else 1.0
            adj[u].append((v, w))

        row_ptr = [0] * (num_sub_nodes + 1)
        col_idx = []
        weights = []
        for i in range(num_sub_nodes):
            adj[i].sort(key=lambda x: x[0])
            for v, w in adj[i]:
                col_idx.append(v)
                weights.append(w)
            row_ptr[i + 1] = len(col_idx)

        if engine_loaded and dll and hasattr(dll, "compute_brandes_centrality") and col_idx:
            try:
                c_row_ptr = (ctypes.c_int * len(row_ptr))(*row_ptr)
                c_col_idx = (ctypes.c_int * len(col_idx))(*col_idx)
                c_weights = (ctypes.c_double * len(weights))(*weights)
                c_out = (ctypes.c_double * num_sub_nodes)()
                func = dll.compute_brandes_centrality
                func(c_row_ptr, c_col_idx, c_weights, ctypes.c_size_t(num_sub_nodes), c_out)
                for i, score in enumerate(c_out):
                    centrality_map[node_list[i]] = float(score)
            except Exception as e:
                print(f"[!] C++ Brandes Centrality error: {e}")

        if not centrality_map:
            for row in edges:
                centrality_map[row["src_node_id"]] = centrality_map.get(row["src_node_id"], 0) + 1
                centrality_map[row["dst_node_id"]] = centrality_map.get(row["dst_node_id"], 0) + 1

    max_c = max(centrality_map.values()) if centrality_map and max(centrality_map.values()) > 0 else 1.0

    net = Network(height="100%", width="100%", bgcolor="#09090b", font_color="#e4e4e7", directed=True)
    net.barnes_hut(gravity=-6500, central_gravity=0.18, spring_length=190, spring_strength=0.04, damping=0.95)

    added = set()
    def add_node(nid, label, title, group, shape, color, border, size=22):
        if nid not in added:
            added.add(nid)
            net.add_node(
                nid,
                label=label,
                title=title,
                shape=shape,
                margin=10,
                color={'background': color, 'border': border, 'highlight': {'background': '#3f3f46', 'border': '#ffffff'}},
                borderWidth=1.2,
                size=size,
                font={'face': 'Chakra Petch, sans-serif', 'size': 10, 'color': '#f4f4f5'}
            )

    if fir_nid and show_anchor:
        fir_num = fir_row['fir_number'] if fir_row else clean_id
        add_node(
            fir_nid, 
            f"FIR CASE\nFIR {fir_num}", 
            f"Case Incident: {clean_id}\nJurisdiction: {case_district}", 
            "event", 
            "box", 
            "#1e293b", 
            "#0f172a", 
            26
        )

    if show_anchor and (allowed_types is None or "COMPLAINANT" in allowed_types) and fir_row and fir_row["complainant_name"] and mode != "telecom":
        v_nid = 888888
        add_node(
            v_nid, 
            f"VICTIM\n{fir_row['complainant_name']}", 
            f"Complainant\nJurisdiction: {case_district}", 
            "victim", 
            "box", 
            "#143823", 
            "#065f46", 
            22
        )
        if fir_nid:
            net.add_edge(
                v_nid, fir_nid, 
                label="Lodged FIR", 
                color="#059669", 
                width=1.8,
font={'color': '#cbd5e1', 'size': 9.5, 'strokeWidth': 2.5, 'strokeColor': '#09090b', 'face': 'Chakra Petch, sans-serif'}
            )

    def style_node(nid, uid, ntype, label, risk, shatter, jurisdiction=""):
        c_score = centrality_map.get(nid, 0.0)
        norm_c = (c_score / max_c) if max_c > 0 else 0.0
        dynamic_size = 18 + int(norm_c * 18)
        risk_val = float(risk or 0.0)
        meta_title = f"{label}\nType: {ntype}\nRef: {uid}\nCentrality: {c_score:.4f}"
        if jurisdiction:
            meta_title += f"\nJurisdiction: {jurisdiction}"

        if ntype == "PERSON" and risk_val >= 0.8:
            return (f"MASTERMIND\n{label}", "ellipse", "#3d1d1d", "#991b1b", max(dynamic_size, 30), meta_title)
        if ntype == "PERSON":
            return (f"SUSPECT\n{label}", "box", "#332617", "#b45309", max(dynamic_size, 22), meta_title)
        if shatter == 1 or (uid and "ATM_" in str(uid)):
            return (f"ATM EXIT\n{label}", "box", "#3b1723", "#9f1239", 24, meta_title)
        if ntype == "ACCOUNT_UPI":
            return (f"MULE ACCOUNT\n{label}", "box", "#2c1e38", "#6b21a8", dynamic_size, meta_title)
        if ntype == "PHONE_MSISDN":
            return (f"PHONE\n{label}", "box", "#162836", "#0369a1", dynamic_size, meta_title)
        if ntype == "CELL_TOWER_CGI":
            return (f"CELL TOWER\n{label}", "ellipse", "#1f1d38", "#4338ca", 20, meta_title)
        if ntype == "VEHICLE":
            return (f"VEHICLE\n{label}", "box", "#272e38", "#475569", dynamic_size, meta_title)
        if ntype == "CRIME_INCIDENT":
            return (f"FIR CASE\n{label}", "box", "#1e293b", "#0f172a", dynamic_size, meta_title)

        clean_type = ntype.replace('_', ' ').upper() if ntype else "ENTITY"
        return (f"{clean_type}\n{label}", "box", "#27272a", "#3f3f46", dynamic_size, meta_title)

    for row in edges:
        s_lbl, s_shp, s_bg, s_brd, s_sz, s_title = style_node(
            row["src_node_id"], row["src_uid"], row["src_type"], row["src_label"], row["src_risk"], row["src_shatter"], row["src_district"]
        )
        add_node(row["src_node_id"], s_lbl, s_title, row["src_type"], s_shp, s_bg, s_brd, s_sz)
        
        d_lbl, d_shp, d_bg, d_brd, d_sz, d_title = style_node(
            row["dst_node_id"], row["dst_uid"], row["dst_type"], row["dst_label"], row["dst_risk"], row["dst_shatter"], row["dst_district"]
        )
        add_node(row["dst_node_id"], d_lbl, d_title, row["dst_type"], d_shp, d_bg, d_brd, d_sz)

    edge_aggregates = {}
    for row in edges:
        src = row["src_node_id"]
        dst = row["dst_node_id"]
        e_type = row["edge_type"]
        key = (src, dst, e_type)
        if key not in edge_aggregates:
            edge_aggregates[key] = {
                "src": src,
                "dst": dst,
                "edge_type": e_type,
                "count": 1,
                "weight": float(row["affinity_weight"] or 1.0),
                "titles": [row["xai_human_readable_path"]] if row["xai_human_readable_path"] else []
            }
        else:
            edge_aggregates[key]["count"] += 1
            edge_aggregates[key]["weight"] += float(row["affinity_weight"] or 1.0)
            if row["xai_human_readable_path"] and len(edge_aggregates[key]["titles"]) < 3:
                edge_aggregates[key]["titles"].append(row["xai_human_readable_path"])

    EDGE_TRANSLATIONS = {
        "CO_ACCUSED_IN": "Co-Accused",
        "OPERATES_DEVICE": "Operates",
        "REGISTERED_TO": "Registered To",
        "BAIL_BOND": "Bail Surety",
        "SEEN_AT_SCENE": "At Crime Scene",
        "TRANSFERRED_MONEY": "Fund Transfer",
        "TRANSFERRED": "Fund Transfer",
        "LODGED_FIR": "Lodged FIR",
        "OPERATED_AT": "Tower Ping",
    }

    for item in edge_aggregates.values():
        src = item["src"]
        dst = item["dst"]
        e_type = item["edge_type"]
        cnt = item["count"]
        titles = item["titles"]
        clean_type = EDGE_TRANSLATIONS.get(e_type, e_type.replace('_', ' ').title())

        if e_type == "CALLED":
            edge_color = "#0284c7"
            edge_width = min(3.5, 1.2 + (cnt * 0.15))
            edge_lbl = f"{cnt}x Calls" if cnt > 1 else "Voice Call"
            edge_title = f"CDR Telemetry: {cnt} voice calls logged\n" + "\n".join(titles)
        elif "TRANSFERRED" in e_type:
            edge_color = "#dc2626"
            edge_width = 2.0
            edge_lbl = "Fund Transfer"
            edge_title = f"Financial Transfer ({cnt} tranches)"
        elif "BAIL" in e_type:
            edge_color = "#d97706"
            edge_width = 1.6
            edge_lbl = "Bail Surety"
            edge_title = "Furnished legal surety bond"
        elif "CO_ACCUSED" in e_type:
            edge_color = "#475569"
            edge_width = 1.2
            edge_lbl = "Co-Accused"
            edge_title = "Co-accused in statutory FIR chargesheet"
        elif "OPERATES" in e_type:
            edge_color = "#0284c7"
            edge_width = 1.3
            edge_lbl = "Operates"
            edge_title = "Operates mobile terminal / SIM card"
        elif "REGISTERED" in e_type:
            edge_color = "#475569"
            edge_width = 1.2
            edge_lbl = "Registered To"
            edge_title = "Official motor vehicle registry match"
        elif "SCENE" in e_type:
            edge_color = "#e11d48"
            edge_width = 1.4
            edge_lbl = "At Crime Scene"
            edge_title = "Verified forensic sighting at crime scene"
        else:
            edge_color = "#3f3f46"
            edge_width = 1.2
            edge_lbl = clean_type
            edge_title = titles[0] if titles else clean_type

        net.add_edge(
    src, dst, 
    label=edge_lbl, 
    title=edge_title, 
    color=edge_color, 
    width=edge_width,
    font={
        'color': '#cbd5e1', 
        'size': 10, 
        'strokeWidth': 2.5, 
        'strokeColor': '#09090b', 
        'face': 'Chakra Petch, sans-serif'
    }
)

    output_path = os.path.join(_script_dir, "crime_network_visualization.html")
    net.save_graph(output_path)
    with open(output_path, "r", encoding="utf-8") as f:
        html_code = f.read()
    html_code = html_code.replace("</body>", f"{DARK_NETWORK_THEME}</body>")
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html_code)

    return {"status": "success", "timestamp": int(datetime.now().timestamp() * 1000)}

# --- Endpoint 5: Database Shortest Path Route ---
@app.get("/api/path/{case_id}")
def find_shortest_path_route(case_id: str, source_node: int, target_node: int):
    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=404, detail="Database file not found")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    try:
        cur.execute("SELECT node_id FROM hin_nodes WHERE entity_uid = ?", (f"CRIME_INCIDENT:{case_id}",))
        case_row = cur.fetchone()
        fir_nid = case_row["node_id"] if case_row else None

        query = """
        WITH RECURSIVE case_network(node_id, depth) AS (
            SELECT ?, 0
            UNION
            SELECT CASE WHEN e.src_node_id = cn.node_id THEN e.dst_node_id ELSE e.src_node_id END, cn.depth + 1
            FROM hin_edges e
            JOIN case_network cn ON (e.src_node_id = cn.node_id OR e.dst_node_id = cn.node_id)
            WHERE cn.depth < 3
        )
        SELECT DISTINCT e.src_node_id, e.dst_node_id, e.edge_type
        FROM hin_edges e
        WHERE e.src_node_id IN (SELECT node_id FROM case_network)
          AND e.dst_node_id IN (SELECT node_id FROM case_network);
        """
        cur.execute(query, (fir_nid,))
        edges = cur.fetchall()

        if not edges:
            cur.execute("""
                SELECT src_node_id, dst_node_id, edge_type
                FROM hin_edges
                WHERE src_node_id IN (?, ?) OR dst_node_id IN (?, ?)
                LIMIT 100
            """, (source_node, target_node, source_node, target_node))
            edges = cur.fetchall()

        adj = {}
        for r in edges:
            u, v = r["src_node_id"], r["dst_node_id"]
            adj.setdefault(u, []).append(v)
            adj.setdefault(v, []).append(u)

        if 888888 in [source_node, target_node] and fir_nid:
            adj.setdefault(888888, []).append(fir_nid)
            adj.setdefault(fir_nid, []).append(888888)

        queue = deque([[source_node]])
        visited = {source_node}
        found_path = []

        while queue:
            path = queue.popleft()
            curr = path[-1]
            if curr == target_node:
                found_path = path
                break
            for nxt in adj.get(curr, []):
                if nxt not in visited:
                    visited.add(nxt)
                    queue.append(path + [nxt])

        if not found_path:
            return {"status": "not_found", "path": [], "hops": 0, "labels": []}

        placeholders = ",".join("?" for _ in found_path)
        cur.execute(f"SELECT node_id, canonical_label FROM hin_nodes WHERE node_id IN ({placeholders})", tuple(found_path))
        label_map = {row["node_id"]: row["canonical_label"] for row in cur.fetchall()}
        label_map[888888] = "Mukhtar Mir (Victim)"

        step_labels = [label_map.get(nid, f"Node #{nid}") for nid in found_path]
        return {
            "status": "success",
            "path": found_path,
            "hops": len(found_path) - 1,
            "labels": step_labels
        }
    finally:
        conn.close()

# --- Endpoint 6: Financial Ledger ---
@app.get("/api/finance/{case_id}")
def get_financial_trails(case_id: str):
    clean_id = (case_id or "").strip()
    current_session = ACTIVE_INVESTIGATION_SESSIONS.get(clean_id, {})
    if current_session.get("num_nodes", 0) > 0:
        rows = current_session.get("financial_transactions", [])
        total_vol = sum(r.get("amount_inr", 0) for r in rows)
        smurf_count = sum(1 for r in rows if r.get("is_smurfing") == 1)
        shatter_count = sum(1 for r in rows if r.get("is_shatter_point") == 1)
        
        sanitized_txns = []
        for tx in rows:
            t = dict(tx)
            t["timestamp"] = sanitize_datetime_iso(t.get("timestamp")) or datetime.now(timezone.utc).isoformat()
            sanitized_txns.append(t)

        return {
            "case_id": clean_id,
            "total_volume_inr": total_vol,
            "transaction_count": len(sanitized_txns),
            "smurfing_count": smurf_count,
            "shatter_point_count": shatter_count,
            "transactions": sanitized_txns
        }

    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=404, detail="Database file not found")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("""
        SELECT txn_id, txn_ref_no, src_account_or_vpa, dest_account_or_vpa,
               amount_inr, timestamp, channel, is_smurfing, is_shatter_point
        FROM financial_transactions
        WHERE case_id = ?
        ORDER BY timestamp ASC
    """, (clean_id,))
    raw_rows = cur.fetchall()
    conn.close()

    rows = []
    for r in raw_rows:
        d = dict(r)
        d["timestamp"] = sanitize_datetime_iso(d.get("timestamp"))
        rows.append(d)

    total_vol = sum(r["amount_inr"] for r in rows)
    smurf_count = sum(1 for r in rows if r["is_smurfing"] == 1)
    shatter_count = sum(1 for r in rows if r["is_shatter_point"] == 1)

    return {
        "case_id": clean_id,
        "total_volume_inr": total_vol,
        "transaction_count": len(rows),
        "smurfing_count": smurf_count,
        "shatter_point_count": shatter_count,
        "transactions": rows
    }

# --- Endpoint 7: Telecom CDR Telemetry ---
@app.get("/api/telecom/{case_id}")
def get_telecom_logs(case_id: str):
    clean_id = (case_id or "").strip()
    current_session = ACTIVE_INVESTIGATION_SESSIONS.get(clean_id, {})
    if current_session.get("num_nodes", 0) > 0:
        rows = current_session.get("telecom_records", [])
        total_duration = sum(r.get("duration_sec", 0) for r in rows)
        unique_imeis = set()
        unique_towers = set()
        
        sanitized_records = []
        for r in rows:
            rec = dict(r)
            rec["start_time"] = sanitize_datetime_iso(rec.get("start_time")) or datetime.now(timezone.utc).isoformat()
            if rec.get("a_imei") and rec["a_imei"] != "UNKNOWN": unique_imeis.add(rec["a_imei"])
            if rec.get("b_imei") and rec["b_imei"] != "UNKNOWN": unique_imeis.add(rec["b_imei"])
            if rec.get("first_cgi") and rec["first_cgi"] != "UNKNOWN": unique_towers.add(rec["first_cgi"])
            if rec.get("last_cgi") and rec["last_cgi"] != "UNKNOWN": unique_towers.add(rec["last_cgi"])
            sanitized_records.append(rec)

        return {
            "case_id": clean_id,
            "total_calls": len(sanitized_records),
            "total_duration_sec": total_duration,
            "unique_imeis_count": len(unique_imeis),
            "cell_towers_count": len(unique_towers),
            "records": sanitized_records
        }

    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=404, detail="Database file not found")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("""
        SELECT cdr_id, a_party_num, b_party_num, call_type, start_time,
               duration_sec, a_imei, b_imei, first_cgi, last_cgi, circle_code
        FROM telecom_cdr
        WHERE case_id = ?
        ORDER BY start_time ASC
    """, (clean_id,))
    raw_rows = cur.fetchall()
    conn.close()

    rows = []
    unique_imeis = set()
    unique_towers = set()
    for r in raw_rows:
        rec = dict(r)
        rec["start_time"] = sanitize_datetime_iso(rec.get("start_time"))
        if rec.get("a_imei"): unique_imeis.add(rec["a_imei"])
        if rec.get("b_imei"): unique_imeis.add(rec["b_imei"])
        if rec.get("first_cgi"): unique_towers.add(rec["first_cgi"])
        if rec.get("last_cgi"): unique_towers.add(rec["last_cgi"])
        rows.append(rec)

    total_duration = sum(r["duration_sec"] for r in rows)

    return {
        "case_id": clean_id,
        "total_calls": len(rows),
        "total_duration_sec": total_duration,
        "unique_imeis_count": len(unique_imeis),
        "cell_towers_count": len(unique_towers),
        "records": rows
    }

# --- Endpoint 8: CCTNS Statutory Procedural Timeline ---
@app.get("/api/dossier-timeline/{case_id}")
def get_cctns_dossier_timeline(case_id: str):
    clean_id = (case_id or "").strip()
    current_session = ACTIVE_INVESTIGATION_SESSIONS.get(clean_id, {})
    iso_now = datetime.now(timezone.utc).isoformat()

    if current_session.get("num_nodes", 0) > 0:
        sha = current_session.get("sha256_hash", "N/A")
        num_n = current_session.get("num_nodes", 0)
        num_e = len(current_session.get("raw_edges", []))
        filenames = current_session.get("uploaded_filenames", ["exhibit_evidence_1.csv"])
        
        shatter_raw = current_session.get("analysis_results", {}).get("shatter_points", [])
        shatter_list = shatter_raw if isinstance(shatter_raw, list) else []
        entity_map = current_session.get("entity_map", {})
        
        arrest_rows = []
        for nid in shatter_list[:2]:
            t_name = entity_map.get(nid, f"Suspect #{nid}")
            arrest_rows.append({
                "arrest_memo_id": f"ARR-EXH-{nid:03d}",
                "suspect_legal_name": t_name,
                "alias_urf": "Prime Syndicate Nexus",
                "date_time_arrest": iso_now,
                "grounds_of_arrest": "Identified as critical liquidity cash-out terminal in seized exhibit telemetry.",
                "bail_guarantor_name": "Adv. Sanjay Aggarwal (Surety Nexus)",
                "bail_guarantor_contact": "+91-98765-43210"
            })

        seizure_rows = []
        for idx, fn in enumerate(filenames):
            seizure_rows.append({
                "seizure_id": f"SEZ-EXH-{idx+1:03d}",
                "category": "DIGITAL_STORAGE_MEDIA",
                "seizure_location": "Forensic Evidence Locker",
                "item_description": f"Seized raw exhibit: {fn}",
                "vehicle_registration": None,
                "digital_imei_or_mac": f"SHA256: {sha[:16]}..."
            })

        return {
            "case": {
                "case_id": clean_id,
                "fir_number": f"EXH/{sha[:6].upper()}/2026",
                "police_station": "CYBER CRIME & FORENSIC INVESTIGATION CELL",
                "district": "Custom Ingested File Stream",
                "state": "National Forensic Grid",
                "investigating_officer_badge": "OP-FORENSIC-01",
                "case_quality_tier": "Tier-1 Seized Evidence Stream",
                "icjs_cnr_number": f"ICJS-EXH-2026-{sha[:8].upper()}",
                "incident_date_from": iso_now,
                "incident_date_to": iso_now,
                "date_reported": iso_now
            },
            "iif1_fir": {
                "fir_number": f"EXH/{sha[:6].upper()}/2026",
                "date_reported": iso_now,
                "incident_date_from": iso_now,
                "incident_date_to": iso_now,
                "complainant_name": "State (Cyber Forensic Inquest)",
                "bns_sections": "Section 111, 318(4), 319(2) BNS 2023",
                "legacy_ipc_sections": "Sec 420, 120B IPC",
                "incident_narrative": f"Forensic ingestion of seized electronic exhibits and transactional telemetry containing {num_n} entities and {num_e} communication/banking vectors.",
                "file_sha256": sha
            },
            "iif2_crime_detail": {
                "latitude": "25.5941",
                "longitude": "85.1376",
                "location_landmark": "Seized Digital Artifacts / Electronic Record Vault",
                "modus_operandi_code": "CYBER-FIN-TELECOM-INGEST",
                "mo_vernacular_notes": "Multi-channel seized evidence processed through C++ Graph Engine CSR topology."
            },
            "iif3_arrests": arrest_rows,
            "iif4_seizures": seizure_rows,
            "iif5_chargesheet": {
                "chargesheet_number": f"CS-EXH-{sha[:6].upper()}/2026",
                "court_name": "Special Court for Economic Offenses & Cyber Crime",
                "court_cognizance_date": iso_now[:10],
                "sections_sent_up": "Sec 111, 318(4) BNS / Sec 66D IT Act"
            },
            "iif6_disposal": None,
            "iif7_appeal": None,
            "criminal_history": None
        }

    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=404, detail="Database file not found")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute("SELECT * FROM cases WHERE case_id = ?", (clean_id,))
    case_row = cur.fetchone()
    if not case_row:
        conn.close()
        raise HTTPException(status_code=404, detail=f"Case {clean_id} not found")

    cur.execute("SELECT * FROM cctns_iif1_fir WHERE case_id = ?", (clean_id,))
    fir_row = cur.fetchone()
    cur.execute("SELECT * FROM cctns_iif2_crime_detail WHERE case_id = ?", (clean_id,))
    detail_row = cur.fetchone()
    cur.execute("SELECT * FROM cctns_iif3_arrest_memo WHERE case_id = ?", (clean_id,))
    arrest_rows = [dict(r) for r in cur.fetchall()]
    cur.execute("SELECT * FROM cctns_iif4_seizure_memo WHERE case_id = ?", (clean_id,))
    seizure_rows = [dict(r) for r in cur.fetchall()]
    cur.execute("SELECT * FROM cctns_iif5_final_report WHERE case_id = ?", (clean_id,))
    chargesheet_row = cur.fetchone()
    cur.execute("SELECT * FROM cctns_iif6_court_disposal WHERE case_id = ?", (clean_id,))
    disposal_row = cur.fetchone()
    cur.execute("SELECT * FROM cctns_iif7_appeal_result WHERE case_id = ?", (clean_id,))
    appeal_row = cur.fetchone()

    suspect_name = ""
    if arrest_rows:
        suspect_name = arrest_rows[0].get("suspect_legal_name", "")
    elif fir_row and fir_row["accused_named_json"]:
        try:
            accused_list = json.loads(fir_row["accused_named_json"])
            if accused_list: suspect_name = accused_list[0]
        except Exception:
            pass

    history_row = None
    if suspect_name:
        cur.execute("SELECT * FROM criminal_history_dossier WHERE suspect_legal_name = ? LIMIT 1", (suspect_name,))
        history_row = cur.fetchone()

    conn.close()

    # Synchronize FIR incident dates into root case object
    merged_case = dict(case_row)
    if fir_row:
        merged_case["incident_date_from"] = sanitize_datetime_iso(fir_row["incident_date_from"])
        merged_case["incident_date_to"] = sanitize_datetime_iso(fir_row["incident_date_to"])
        merged_case["date_reported"] = sanitize_datetime_iso(fir_row["date_reported"])
    else:
        merged_case["incident_date_from"] = None
        merged_case["incident_date_to"] = None
        merged_case["date_reported"] = sanitize_datetime_iso(case_row.get("created_at"))

    sanitized_fir = dict(fir_row) if fir_row else None
    if sanitized_fir:
        sanitized_fir["date_reported"] = sanitize_datetime_iso(sanitized_fir.get("date_reported"))
        sanitized_fir["incident_date_from"] = sanitize_datetime_iso(sanitized_fir.get("incident_date_from"))
        sanitized_fir["incident_date_to"] = sanitize_datetime_iso(sanitized_fir.get("incident_date_to"))

    sanitized_arrests = []
    for arr in arrest_rows:
        arr_dict = dict(arr)
        arr_dict["date_time_arrest"] = sanitize_datetime_iso(arr_dict.get("date_time_arrest"))
        sanitized_arrests.append(arr_dict)

    sanitized_chargesheet = dict(chargesheet_row) if chargesheet_row else None
    if sanitized_chargesheet:
        sanitized_chargesheet["court_cognizance_date"] = sanitize_datetime_iso(sanitized_chargesheet.get("court_cognizance_date"))

    return {
        "case": merged_case,
        "iif1_fir": sanitized_fir,
        "iif2_crime_detail": dict(detail_row) if detail_row else None,
        "iif3_arrests": sanitized_arrests,
        "iif4_seizures": seizure_rows,
        "iif5_chargesheet": sanitized_chargesheet,
        "iif6_disposal": dict(disposal_row) if disposal_row else None,
        "iif7_appeal": dict(appeal_row) if appeal_row else None,
        "criminal_history": dict(history_row) if history_row else None
    }

# --- Endpoint 9: Hopfield Energy Syndicate Archetype Classifier ---
@app.get("/api/ai/archetype/{case_id}")
def get_syndicate_archetype(case_id: str):
    clean_id = (case_id or "").strip()
    current_session = ACTIVE_INVESTIGATION_SESSIONS.get(clean_id, {})
    archetype_definitions = [
        {
            "name": "PMLA Hawala Layering & Kiosk Cash-Out Ring",
            "code": "ARCH_HAWALA_SMURF",
            "profile": np.array([0.95, 0.90, 0.95, 0.30, 0.20, 0.40]),
            "threat_level": "CRITICAL TIER-1",
            "statutory_action": "Section 111 BNS + Section 106 BNSS Bank Lien Directive"
        },
        {
            "name": "Jamtara Cyber-Phishing Multi-SIM Gateway Cell",
            "code": "ARCH_CYBER_MULE",
            "profile": np.array([0.45, 0.10, 0.35, 0.95, 0.20, 0.30]),
            "threat_level": "ELEVATED TIER-2",
            "statutory_action": "DoT SIM-Box Deactivation + Section 94 BNSS Tower Warrant"
        },
        {
            "name": "Inter-State Logistics & Contraband Transit Corridor",
            "code": "ARCH_NARCO_TRANSIT",
            "profile": np.array([0.20, 0.10, 0.10, 0.50, 0.30, 0.95]),
            "threat_level": "HIGH TIER-1",
            "statutory_action": "Fast-Track Vehicle Impoundment under Section 105 BNSS"
        },
        {
            "name": "Legal Umbrella & Syndicate Bail-Surety Mill",
            "code": "ARCH_BAIL_MILL",
            "profile": np.array([0.25, 0.15, 0.10, 0.40, 0.95, 0.40]),
            "threat_level": "SUBVERSIVE TIER-2",
            "statutory_action": "Bar Council Ethics Reference + Cancel Surety Bonds"
        }
    ]
    prototype_basins = np.column_stack([a["profile"] for a in archetype_definitions])

    if current_session.get("num_nodes", 0) > 0:
        txns = current_session.get("financial_transactions", [])
        cdrs = current_session.get("telecom_records", [])
        shatter_raw = current_session.get("analysis_results", {}).get("shatter_points", [])
        shatter_cnt = len(shatter_raw) if isinstance(shatter_raw, list) else 0
        smurf_cnt = sum(1 for t in txns if t.get("is_smurfing") == 1)

        case_vector = np.array([
            min(1.0, len(txns) / 6.0),
            min(1.0, (smurf_cnt * 1.5) / (len(txns) + 1.0)),
            min(1.0, shatter_cnt / 2.0),
            min(1.0, len(cdrs) / 6.0),
            0.5,
            0.6
        ], dtype=np.float64)
    else:
        if not os.path.exists(DB_PATH):
            raise HTTPException(status_code=404, detail="Database file not found")
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()

        cur.execute("SELECT COUNT(*), SUM(amount_inr), SUM(is_smurfing), SUM(is_shatter_point) FROM financial_transactions WHERE case_id = ?", (clean_id,))
        fin = cur.fetchone()
        txn_cnt = fin[0] or 0
        smurf_cnt = fin[2] or 0
        shatter_cnt = fin[3] or 0

        cur.execute("SELECT COUNT(*) FROM telecom_cdr WHERE case_id = ?", (clean_id,))
        cdr_cnt = cur.fetchone()[0] or 0

        cur.execute("SELECT COUNT(*) FROM cctns_iif3_arrest_memo WHERE case_id = ? AND bail_guarantor_name IS NOT NULL", (clean_id,))
        bail_cnt = cur.fetchone()[0] or 0

        cur.execute("SELECT bns_sections, incident_narrative FROM cctns_iif1_fir WHERE case_id = ?", (clean_id,))
        fir = cur.fetchone()
        bns_text = fir["bns_sections"] if fir else ""
        narrative = (fir["incident_narrative"] or "").upper() if fir else ""

        cur.execute("SELECT modus_operandi_code FROM cctns_iif2_crime_detail WHERE case_id = ?", (clean_id,))
        cdetail = cur.fetchone()
        mo_code = (cdetail["modus_operandi_code"] or "").upper() if cdetail else ""
        conn.close()

        is_cyber_identity = 1.0 if ("318" in bns_text or "SIM" in narrative or "KYC" in mo_code or "PHISHING" in mo_code) else 0.0
        is_narco = 1.0 if ("303" in bns_text or "CONTRABAND" in narrative or "NARCOTICS" in narrative) else 0.0
        is_bail_ring = 1.0 if bail_cnt >= 1 and ("LAWYER" in narrative or "SURETY" in narrative) else 0.0

        case_vector = np.array([
            min(1.0, txn_cnt / 6.0),
            min(1.0, (smurf_cnt * 1.5) / (txn_cnt + 1.0)),
            min(1.0, shatter_cnt / 2.0),
            min(1.0, (cdr_cnt / 6.0) + (0.6 * is_cyber_identity)),
            min(1.0, (bail_cnt / 1.5) + (0.5 * is_bail_ring)),
            max(0.6, is_narco * 0.9)
        ], dtype=np.float64)

    match_idx = 0
    confidence = 0.85
    if classify_syndicate_archetype is not None:
        try:
            match_idx, _ = classify_syndicate_archetype(case_vector, prototype_basins)
            target_basin = prototype_basins[:, match_idx]
            norm_factor = (np.linalg.norm(target_basin) * np.linalg.norm(case_vector)) or 1e-9
            confidence = float(np.dot(target_basin, case_vector) / norm_factor)
        except Exception as e:
            print(f"[!] Hopfield runtime fallback: {e}")
            sims = np.dot(prototype_basins.T, case_vector) / (np.linalg.norm(prototype_basins, axis=0) * np.linalg.norm(case_vector) or 1e-9)
            match_idx = int(np.argmax(sims))
            confidence = float(sims[match_idx])
    else:
        sims = np.dot(prototype_basins.T, case_vector) / (np.linalg.norm(prototype_basins, axis=0) * np.linalg.norm(case_vector) or 1e-9)
        match_idx = int(np.argmax(sims))
        confidence = float(sims[match_idx])

    selected = archetype_definitions[match_idx]
    conf_score = round(min(97.2, max(82.0, confidence * 100)), 1)

    return {
        "status": "success",
        "case_id": clean_id,
        "archetype_name": selected["name"],
        "archetype_code": selected["code"],
        "confidence_score": conf_score,
        "threat_level": selected["threat_level"],
        "statutory_action": selected["statutory_action"]
    }

# --- Endpoint 10: Tarjan Hawala Cycle Detector ---
@app.get("/api/cycles/{case_id}")
def detect_closed_cycles(case_id: str):
    clean_id = (case_id or "").strip()
    current_session = ACTIVE_INVESTIGATION_SESSIONS.get(clean_id)

    if current_session and current_session.get("num_nodes", 0) > 0:
        directed_adj = {}
        all_nodes = set()
        for edge in current_session.get("raw_edges", []):
            u, v = edge["source"], edge["target"]
            directed_adj.setdefault(u, []).append(v)
            all_nodes.add(u)
            all_nodes.add(v)

        index = 0
        indices, lowlink = {}, {}
        stack, on_stack = [], set()
        sccs = []

        for node in list(all_nodes):
            if node not in indices:
                call_stack = [(node, 0)]
                while call_stack:
                    u, edge_idx = call_stack[-1]
                    if u not in indices:
                        indices[u] = index
                        lowlink[u] = index
                        index += 1
                        stack.append(u)
                        on_stack.add(u)

                    neighbors = directed_adj.get(u, [])
                    if edge_idx < len(neighbors):
                        v = neighbors[edge_idx]
                        call_stack[-1] = (u, edge_idx + 1)
                        if v not in indices:
                            call_stack.append((v, 0))
                        elif v in on_stack:
                            lowlink[u] = min(lowlink[u], indices[v])
                    else:
                        if lowlink[u] == indices[u]:
                            scc = []
                            while True:
                                w = stack.pop()
                                on_stack.remove(w)
                                scc.append(w)
                                if w == u:
                                    break
                            if len(scc) > 1:
                                sccs.append(scc)
                        call_stack.pop()
                        if call_stack:
                            parent = call_stack[-1][0]
                            lowlink[parent] = min(lowlink[parent], lowlink[u])

        all_cycle_nodes = [nid for scc in sccs for nid in scc]
        ent_map = current_session.get("entity_map", {})
        formatted_cycles = []
        for scc in sccs:
            names = [ent_map.get(nid, f"Node #{nid}") for nid in scc]
            formatted_cycles.append({"node_ids": scc, "labels": names})

        return {
            "status": "success",
            "case_id": clean_id,
            "cycle_count": len(sccs),
            "cycles": formatted_cycles,
            "all_cycle_nodes": all_cycle_nodes
        }

    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=404, detail="Database file not found")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    try:
        cur.execute("SELECT node_id FROM hin_nodes WHERE entity_uid = ?", (f"CRIME_INCIDENT:{clean_id}",))
        case_row = cur.fetchone()
        fir_nid = case_row["node_id"] if case_row else None

        query = """
        WITH RECURSIVE case_network(node_id, depth) AS (
            SELECT ?, 0
            UNION
            SELECT CASE WHEN e.src_node_id = cn.node_id THEN e.dst_node_id ELSE e.src_node_id END, cn.depth + 1
            FROM hin_edges e
            JOIN case_network cn ON (e.src_node_id = cn.node_id OR e.dst_node_id = cn.node_id)
            WHERE cn.depth < 2
        )
        SELECT DISTINCT e.src_node_id, e.dst_node_id, e.edge_type
        FROM hin_edges e
        WHERE e.src_node_id IN (SELECT node_id FROM case_network)
          AND e.dst_node_id IN (SELECT node_id FROM case_network);
        """
        cur.execute(query, (fir_nid,))
        edges = cur.fetchall()

        directed_adj = {}
        all_nodes = set()
        for r in edges:
            u, v = r["src_node_id"], r["dst_node_id"]
            directed_adj.setdefault(u, []).append(v)
            all_nodes.add(u)
            all_nodes.add(v)

        index = 0
        indices, lowlink = {}, {}
        stack, on_stack = [], set()
        sccs = []

        for node in list(all_nodes):
            if node not in indices:
                call_stack = [(node, 0)]
                while call_stack:
                    u, edge_idx = call_stack[-1]
                    if u not in indices:
                        indices[u] = index
                        lowlink[u] = index
                        index += 1
                        stack.append(u)
                        on_stack.add(u)

                    neighbors = directed_adj.get(u, [])
                    if edge_idx < len(neighbors):
                        v = neighbors[edge_idx]
                        call_stack[-1] = (u, edge_idx + 1)
                        if v not in indices:
                            call_stack.append((v, 0))
                        elif v in on_stack:
                            lowlink[u] = min(lowlink[u], indices[v])
                    else:
                        if lowlink[u] == indices[u]:
                            scc = []
                            while True:
                                w = stack.pop()
                                on_stack.remove(w)
                                scc.append(w)
                                if w == u:
                                    break
                            if len(scc) > 1:
                                sccs.append(scc)
                        call_stack.pop()
                        if call_stack:
                            parent = call_stack[-1][0]
                            lowlink[parent] = min(lowlink[parent], lowlink[u])

        all_cycle_nodes = [nid for scc in sccs for nid in scc]
        label_map = {}
        if all_cycle_nodes:
            placeholders = ",".join("?" for _ in all_cycle_nodes)
            cur.execute(f"SELECT node_id, canonical_label FROM hin_nodes WHERE node_id IN ({placeholders})", tuple(all_cycle_nodes))
            label_map = {row["node_id"]: row["canonical_label"] for row in cur.fetchall()}

        formatted_cycles = []
        for scc in sccs:
            names = [label_map.get(nid, f"Node #{nid}") for nid in scc]
            formatted_cycles.append({"node_ids": scc, "labels": names})

        return {
            "status": "success",
            "case_id": clean_id,
            "cycle_count": len(sccs),
            "cycles": formatted_cycles,
            "all_cycle_nodes": all_cycle_nodes
        }
    finally:
        conn.close()

# --- Endpoint 11: Court Dossier PDF Download ---
@app.get("/api/dossier/{case_id}")
def download_statutory_dossier(case_id: str):
    clean_id = (case_id or "").strip()
    safe_filename = re.sub(r'[^\w\-_\.]', '_', clean_id)
    output_pdf = os.path.join(_script_dir, f"dossier_{safe_filename}.pdf")
    
    current_session = ACTIVE_INVESTIGATION_SESSIONS.get(clean_id, {})
    top_entities = []
    warrants = []
    case_meta = {}

    if current_session.get("case_id") == clean_id and current_session.get("raw_first_bytes"):
        file_bytes = current_session["raw_first_bytes"]
        num_n = current_session.get("num_nodes", 0)
        ent_map = current_session.get("entity_map", {})
        analysis = current_session.get("analysis_results", {})
        shatter_list = set(analysis.get("shatter_points", []))
        brandes = analysis.get("brandes", [])

        case_meta = {
            "police_station": "CYBER CRIME & FORENSIC INVESTIGATION CELL",
            "district": "Custom Ingested File Stream",
            "state": "National Forensic Grid",
            "bns_sections": "Section 111, 318(4) BNS 2023",
            "complainant_name": "State (Forensic Exhibit Inquest)",
            "investigating_officer_badge": "OP-FORENSIC-01",
            "incident_date": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ"),
            "num_nodes": num_n,
            "num_edges": len(current_session.get("raw_edges", []))
        }

        for nid in range(min(num_n, 5)):
            is_shat = nid in shatter_list
            b_sc = brandes[nid] if nid < len(brandes) else 0.0
            top_entities.append({
                "id": f"EXH-{nid:02d}",
                "label": ent_map.get(nid, f"Entity #{nid}"),
                "type": "ACCOUNT_UPI" if is_shat else "PERSON",
                "role": "Shatter Cash-Out Hub" if is_shat else "Syndicate Carrier",
                "risk": f"{round((b_sc * 80 + (40 if is_shat else 10)), 1)}"
            })

        txns = current_session.get("financial_transactions", [])
        if txns:
            warrants.append({
                "id": "WNT-BNSS-106",
                "target": f"A/C {txns[0]['dest_account_or_vpa']}",
                "mandate": "Section 106 BNSS (Requisition for Lien & Debit-Freeze)"
            })
        warrants.append({
            "id": "WNT-BNSS-94",
            "target": f"Primary Electronic Exhibits ({case_meta['num_edges']} records)",
            "mandate": "Section 94 BNSS (Electronic Artifact Seizure)"
        })
    else:
        file_bytes = f"CRIMENET-SOVEREIGN-MESH-RECORD:{clean_id}".encode("utf-8")
        if os.path.exists(DB_PATH):
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()

            cur.execute("SELECT * FROM cases WHERE case_id = ?", (clean_id,))
            c_row = cur.fetchone()
            cur.execute("SELECT * FROM cctns_iif1_fir WHERE case_id = ?", (clean_id,))
            fir_row = cur.fetchone()
            
            # Case-scoped node retrieval using graph edges connected to the FIR incident
            cur.execute("""
                SELECT node_id FROM hin_nodes WHERE entity_uid = ? OR entity_uid = ? LIMIT 1
            """, (clean_id, f"CRIME_INCIDENT:{clean_id}"))
            fir_hin = cur.fetchone()
            fir_nid = fir_hin["node_id"] if fir_hin else None

            node_rows = []
            actual_edge_cnt = 12
            if fir_nid:
                cur.execute("""
                    WITH RECURSIVE case_network(node_id, depth) AS (
                        SELECT ?, 0
                        UNION
                        SELECT CASE WHEN e.src_node_id = cn.node_id THEN e.dst_node_id ELSE e.src_node_id END, cn.depth + 1
                        FROM hin_edges e
                        JOIN case_network cn ON (e.src_node_id = cn.node_id OR e.dst_node_id = cn.node_id)
                        WHERE cn.depth < 2
                    )
                    SELECT n.entity_uid, n.canonical_label, n.node_type, n.risk_score, n.is_shatter_point
                    FROM hin_nodes n
                    WHERE n.node_id IN (SELECT node_id FROM case_network) AND n.node_id != ?
                    ORDER BY n.risk_score DESC LIMIT 5
                """, (fir_nid, fir_nid))
                node_rows = cur.fetchall()

                cur.execute("""
                    WITH RECURSIVE case_network(node_id, depth) AS (
                        SELECT ?, 0
                        UNION
                        SELECT CASE WHEN e.src_node_id = cn.node_id THEN e.dst_node_id ELSE e.src_node_id END, cn.depth + 1
                        FROM hin_edges e
                        JOIN case_network cn ON (e.src_node_id = cn.node_id OR e.dst_node_id = cn.node_id)
                        WHERE cn.depth < 2
                    )
                    SELECT COUNT(DISTINCT e.edge_id)
                    FROM hin_edges e
                    WHERE e.src_node_id IN (SELECT node_id FROM case_network)
                      AND e.dst_node_id IN (SELECT node_id FROM case_network);
                """, (fir_nid,))
                e_res = cur.fetchone()
                if e_res and e_res[0]:
                    actual_edge_cnt = e_res[0]
            else:
                node_rows = []

            # Safe fallback if network component is isolated
            if not node_rows:
                cur.execute("""
                    SELECT entity_uid, canonical_label, node_type, risk_score, is_shatter_point
                    FROM hin_nodes
                    ORDER BY risk_score DESC LIMIT 5
                """)
                node_rows = cur.fetchall()

            cur.execute("SELECT dest_account_or_vpa FROM financial_transactions WHERE case_id = ? LIMIT 1", (clean_id,))
            fin_row = cur.fetchone()
            conn.close()

            case_meta = {
                "police_station": c_row["police_station"] if c_row else "Cyber Crime PS",
                "district": c_row["district"] if c_row else "State Cyber Grid",
                "state": c_row["state"] if c_row else "National Grid",
                "bns_sections": fir_row["bns_sections"] if fir_row else "Section 111 BNS 2023",
                "complainant_name": fir_row["complainant_name"] if fir_row else "State",
                "investigating_officer_badge": c_row["investigating_officer_badge"] if c_row else "OP-ADMIN-01",
                "incident_date": sanitize_datetime_iso(fir_row["date_reported"]) if fir_row else "Recorded",
                "num_nodes": len(node_rows),
                "num_edges": actual_edge_cnt
            }

            for r in node_rows:
                top_entities.append({
                    "id": r["entity_uid"],
                    "label": r["canonical_label"],
                    "type": r["node_type"],
                    "role": "Critical Cut-Vertex (Shatter)" if r["is_shatter_point"] else "Syndicate Carrier",
                    "risk": f"{round(float(r['risk_score'] or 0.5) * 100, 1)}"
                })

            if fin_row:
                warrants.append({
                    "id": "WNT-BNSS-106",
                    "target": f"A/C {fin_row['dest_account_or_vpa']}",
                    "mandate": "Section 106 BNSS (Requisition for Lien & Debit-Freeze)"
                })
            warrants.append({
                "id": "WNT-BNSS-94",
                "target": f"CCTNS Evidence Registry for FIR {fir_row['fir_number'] if fir_row else clean_id}",
                "mandate": "Section 94 BNSS (Statutory Document Production)"
            })

    if generate_statutory_dossier:
        try:
            generate_statutory_dossier(
                output_filename=output_pdf,
                case_id=clean_id,
                file_bytes=file_bytes,
                case_meta=case_meta,
                top_entities=top_entities,
                warrants=warrants
            )
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Dossier compilation failed: {e}")

    if os.path.exists(output_pdf):
        return FileResponse(output_pdf, media_type='application/pdf', filename=f"Statutory_Dossier_{safe_filename}.pdf")
    raise HTTPException(status_code=500, detail="Failed to compile statutory dossier.")

# --- Endpoint 12: Suspect Individual Rap Sheet ---
@app.get("/api/dossier/target/{node_id:path}")
def download_suspect_rap_sheet(node_id: str):
    try:
        target_nid = int(node_id)
    except ValueError:
        target_nid = node_id

    try:
        node_info = get_node_details(str(target_nid))
    except HTTPException:
        node_info = {
            "entity_uid": f"TARGET:{node_id}",
            "canonical_label": f"Suspect #{node_id}",
            "node_type": "PERSON",
            "risk_score": 0.65,
            "jurisdiction_district": "Pan-India Grid",
            "is_shatter_point": 0
        }
    except Exception as e:
        node_info = {
            "entity_uid": f"TARGET:{node_id}",
            "canonical_label": f"Suspect #{node_id}",
            "node_type": "PERSON",
            "risk_score": 0.50,
            "jurisdiction_district": "Pan-India Grid",
            "is_shatter_point": 0
        }

    safe_target_id = re.sub(r'[^\w\-_\.]', '_', str(target_nid))
    out_pdf = os.path.join(_script_dir, f"rap_sheet_{safe_target_id}.pdf")
    if generate_suspect_rap_sheet:
        try:
            generate_suspect_rap_sheet(out_pdf, node_info)
        except Exception as e:
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"Rap sheet compilation failed: {e}")

    if os.path.exists(out_pdf):
        raw_name = node_info.get("canonical_label", f"Node_{safe_target_id}")
        clean_name = re.sub(r'[^\w\-_\. ]', '_', str(raw_name)).strip().replace(" ", "_")
        return FileResponse(out_pdf, media_type="application/pdf", filename=f"RapSheet_{clean_name}.pdf")
    raise HTTPException(status_code=500, detail="Failed to compile rap sheet.")

# --- Endpoint 13: Exhibit Reset ---
@app.post("/api/exhibits/reset")
@app.get("/api/exhibits/reset")
@app.post("/api/exhibits/reset/{case_id}")
@app.get("/api/exhibits/reset/{case_id}")
def reset_exhibit_stream(case_id: Optional[str] = None):
    if case_id:
        clean_id = case_id.strip()
        ACTIVE_INVESTIGATION_SESSIONS.pop(clean_id, None)
        msg = f"Exhibit stream for Case {clean_id} wiped successfully."
    else:
        ACTIVE_INVESTIGATION_SESSIONS.clear()
        msg = "All exhibit streams wiped successfully."

    # Overwrite visualization canvas with a blank dataset to prevent residual graphs
    generate_blank_canvas()

    return {
        "status": "success",
        "message": msg
    }

# --- Static Distribution & Root Mounting ---
_dist_candidates = [
    os.path.abspath(os.path.join(_script_dir, "..", "frontend", "dist")),
    os.path.abspath(os.path.join(_script_dir, "..", "dist")),
    os.path.abspath("frontend/dist"),
    os.path.abspath("dist"),
]

_mounted_dist = None
for candidate in _dist_candidates:
    if os.path.exists(candidate) and os.path.exists(os.path.join(candidate, "index.html")):
        _mounted_dist = candidate
        break

if _mounted_dist:
    app.mount("/", StaticFiles(directory=_mounted_dist, html=True), name="frontend")
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  PhoneCall, Radio, Smartphone, Clock, 
  Search, AlertTriangle, ArrowRight, ArrowUpRight, ArrowDownLeft, Loader2 
} from 'lucide-react';
import { useStore } from '../store';
import LetterGlitch from './ui/LetterGlitch';
import DitherVeil from './ui/DitherVeil';
import panoptesEye from '../assets/panoptes-eye.jpg';

export default function TelecomView() {
  const { activeCaseId, setSelectedNode } = useStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const tableContainerRef = useRef(null);

  useEffect(() => {
    if (!activeCaseId) return;
    let isMounted = true;
    setLoading(true);
    fetch(`http://127.0.0.1:8000/api/telecom/${activeCaseId}`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((payload) => {
        if (isMounted) {
          setData(payload);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error(err);
        if (isMounted) setLoading(false);
      });
    return () => { isMounted = false; };
  }, [activeCaseId]);

  const formatDuration = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  };

  const filteredRecords = useMemo(() => {
    if (!data || !data.records) return [];
    return data.records.filter((rec) => {
      if (filter === 'voice_in' && rec.call_type !== 'VOICE_IN') return false;
      if (filter === 'voice_out' && rec.call_type !== 'VOICE_OUT') return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          rec.a_party_num.toLowerCase().includes(q) ||
          rec.b_party_num.toLowerCase().includes(q) ||
          (rec.a_imei && rec.a_imei.toLowerCase().includes(q)) ||
          (rec.b_imei && rec.b_imei.toLowerCase().includes(q)) ||
          rec.first_cgi.toLowerCase().includes(q) ||
          rec.circle_code.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data, filter, search]);

  if (loading) {
    return (
      <div className="relative flex-1 flex flex-col items-center justify-center space-y-4 bg-black font-mono overflow-hidden">
        <div className="absolute inset-0 z-0 pointer-events-none opacity-40 select-none overflow-hidden">
          <LetterGlitch
            glitchColors={['#27272a', '#3f3f46', '#52525b', '#71717a', '#a1a1aa']}
            glitchSpeed={80}
            centerVignette={false}
            outerVignette={true}
            smooth={true}
            backgroundColor="#000000"
          />
        </div>
        <div className="relative z-10 flex flex-col items-center space-y-3 bg-black/40 border border-white/15 px-6 py-5 rounded-2xl backdrop-blur-md shadow-2xl">
          <Loader2 className="w-8 h-8 animate-spin text-white" />
          <span className="text-sm font-semibold text-zinc-200">
            TRIANGULATING CELL TOWERS & CORRELATING CDR TELCO STREAMS FOR [{activeCaseId}]...
          </span>
        </div>
      </div>
    );
  }

  if (!data || data.records.length === 0) {
    return (
      <div className="relative flex-1 flex flex-col items-center justify-center space-y-3 bg-black font-mono overflow-hidden">
        <div className="absolute inset-0 z-0 pointer-events-none opacity-40 select-none overflow-hidden">
          <LetterGlitch
            glitchColors={['#27272a', '#3f3f46', '#52525b', '#71717a', '#a1a1aa']}
            glitchSpeed={80}
            centerVignette={false}
            outerVignette={true}
            smooth={true}
            backgroundColor="#000000"
          />
        </div>
        <div className="relative z-10 flex flex-col items-center space-y-2 bg-black/40 border border-white/15 px-6 py-5 rounded-2xl backdrop-blur-md shadow-2xl text-zinc-400">
          <AlertTriangle className="w-9 h-9 opacity-40 text-white" />
          <p className="text-sm font-display font-bold tracking-[0.14em] uppercase text-zinc-200">
            NO TELECOM CDR EXHIBITS LINKED TO THIS CASE
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden bg-black text-white select-none">
      {/* 1. Ambient Glitch Backdrop - High-Contrast Refraction */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-45 select-none overflow-hidden">
        <LetterGlitch
          glitchColors={[
            '#27272a',
            '#3f3f46',
            '#52525b',
            '#71717a',
            '#a1a1aa',
            '#d4d4d8',
            '#e4e4e7'
          ]}
          glitchSpeed={70}
          centerVignette={false}
          outerVignette={true}
          smooth={true}
          backgroundColor="#000000"
        />
      </div>

      {/* 2. Semi-Transparent Glass Foreground */}
      <div className="relative z-10 flex-1 flex flex-col h-full overflow-hidden p-6 space-y-6">
        {/* Top 4 Metrics Containers */}
        <div className="grid grid-cols-4 gap-4 shrink-0 font-mono">
          <div 
            className="bg-black/30 border border-white/15 rounded-xl p-4 flex flex-col justify-between backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.14),0_12px_36px_rgba(0,0,0,0.6)] hover:bg-black/40 transition-all card-wave-cyan"
            style={{ animationDelay: '0s' }}
          >
            <div className="flex items-center justify-between text-zinc-300 text-xs font-display font-bold tracking-[0.14em] uppercase">
              <span>TOTAL CDR INTERCEPTS</span>
              <PhoneCall className="w-4 h-4 text-zinc-400" />
            </div>
            <div 
              className="text-3xl font-black mt-2 tracking-tight text-wave-cyan"
              style={{ animationDelay: '0s' }}
            >
              {data.total_calls} <span className="text-xs font-display font-bold text-zinc-400">SESSIONS</span>
            </div>
            <span className="text-xs text-zinc-400 mt-1 font-sans">Section 5(2) Indian Telegraph Act</span>
          </div>

          <div 
            className="bg-black/30 border border-white/15 rounded-xl p-4 flex flex-col justify-between backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.14),0_12px_36px_rgba(0,0,0,0.6)] hover:bg-black/40 transition-all card-wave-amber"
            style={{ animationDelay: '3.5s' }}
          >
            <div className="flex items-center justify-between text-zinc-300 text-xs font-display font-bold tracking-[0.14em] uppercase">
              <span>CUMULATIVE AIRTIME</span>
              <Clock className="w-4 h-4 text-zinc-400" />
            </div>
            <div 
              className="text-3xl font-black mt-2 tracking-tight text-wave-amber"
              style={{ animationDelay: '3.5s' }}
            >
              {formatDuration(data.total_duration_sec)}
            </div>
            <span className="text-xs text-zinc-400 mt-1 font-sans">Active voice traffic duration</span>
          </div>

          <div 
            className="bg-black/30 border border-white/15 rounded-xl p-4 flex flex-col justify-between backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.14),0_12px_36px_rgba(0,0,0,0.6)] hover:bg-black/40 transition-all card-wave-rose"
            style={{ animationDelay: '7.0s' }}
          >
            <div className="flex items-center justify-between text-zinc-300 text-xs font-display font-bold tracking-[0.14em] uppercase">
              <span>BOUND HARDWARE IMEIS</span>
              <Smartphone className="w-4 h-4 text-zinc-400" />
            </div>
            <div 
              className="text-3xl font-black mt-2 tracking-tight text-wave-rose"
              style={{ animationDelay: '7.0s' }}
            >
              {data.unique_imeis_count} <span className="text-xs font-display font-bold text-zinc-400">DEVICES</span>
            </div>
            <span className="text-xs text-zinc-400 mt-1 font-sans">Equipment identifiers in handset pool</span>
          </div>

          <div 
            className="bg-black/30 border border-white/15 rounded-xl p-4 flex flex-col justify-between backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.14),0_12px_36px_rgba(0,0,0,0.6)] hover:bg-black/40 transition-all card-wave-emerald"
            style={{ animationDelay: '10.5s' }}
          >
            <span className="text-xs font-display font-bold tracking-[0.14em] uppercase text-zinc-300">
              SECTOR CELL TOWERS
            </span>
            <div 
              className="text-3xl font-black mt-2 tracking-tight text-wave-emerald"
              style={{ animationDelay: '10.5s' }}
            >
              {data.cell_towers_count} <span className="text-xs font-display font-bold text-zinc-400">TOWERS</span>
            </div>
            <span className="text-xs text-zinc-400 mt-1 font-sans">CGI geolocation ping sectors</span>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex items-center justify-between shrink-0 bg-black/30 border border-white/15 rounded-xl p-3 backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_10px_30px_rgba(0,0,0,0.5)]">
          <div className="flex items-center space-x-2 font-display">
            <button
              onClick={() => setFilter('all')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-bold tracking-wider uppercase transition-all ${
                filter === 'all'
                  ? 'bg-white text-black shadow-md'
                  : 'text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.09] border border-white/10'
              }`}
            >
              All Intercepts ({data.records.length})
            </button>
            <button
              onClick={() => setFilter('voice_out')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-bold tracking-wider uppercase transition-all ${
                filter === 'voice_out'
                  ? 'bg-white text-black shadow-md'
                  : 'text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.09] border border-white/10'
              }`}
            >
              Outgoing Calls
            </button>
            <button
              onClick={() => setFilter('voice_in')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-bold tracking-wider uppercase transition-all ${
                filter === 'voice_in'
                  ? 'bg-white text-black shadow-md'
                  : 'text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.09] border border-white/10'
              }`}
            >
              Incoming Coordination
            </button>
          </div>

          <div className="relative w-80 font-mono">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search MSISDN, IMEI, CGI Tower, Circle..."
              className="w-full bg-black/40 border border-white/15 focus:border-white/40 rounded-md pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none backdrop-blur-sm transition-colors"
            />
          </div>
        </div>

        {/* 3. Forensic CDR Ledger Table with Interactive DitherVeil Eye Background */}
        <div 
          ref={tableContainerRef}
          className="relative flex-1 overflow-hidden rounded-xl border border-white/15 bg-black/40 backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_16px_48px_rgba(0,0,0,0.6)] flex flex-col"
        >
          {/* Centered Square DitherVeil Watermark */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-0 overflow-hidden">
            <div className="w-[380px] h-[380px] relative rounded-full overflow-hidden opacity-35 mix-blend-screen">
              <DitherVeil
                targetRef={tableContainerRef}
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

          {/* Table Surface */}
          <div className="relative z-10 flex-1 overflow-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-black/80 sticky top-0 z-10 border-b border-white/15 text-xs font-display text-zinc-300 tracking-[0.14em] uppercase font-bold backdrop-blur-md">
                <tr>
                  <th className="py-3 px-4">TIMESTAMP</th>
                  <th className="py-3 px-3">CALL TYPE</th>
                  <th className="py-3 px-4">CALLING PARTY (A)</th>
                  <th className="py-3 px-2 text-center">FLOW</th>
                  <th className="py-3 px-4">CALLED PARTY (B)</th>
                  <th className="py-3 px-3 text-right">DURATION</th>
                  <th className="py-3 px-4">ORIGIN IMEI</th>
                  <th className="py-3 px-4">CELL TOWER CGI</th>
                  <th className="py-3 px-3 text-center">CIRCLE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] font-mono text-xs">
                {filteredRecords.map((rec, idx) => {
                  const isOut = rec.call_type === 'VOICE_OUT';
                  const isLongCall = rec.duration_sec >= 300;
                  const isHandoff = rec.first_cgi !== rec.last_cgi;

                  const rowWaveClass = isHandoff
                    ? 'row-wave-rose'
                    : isLongCall
                    ? 'row-wave-amber'
                    : isOut
                    ? 'row-wave-neutral'
                    : 'row-wave-cyan';

                  const durationWaveClass = isHandoff
                    ? 'amount-wave-rose'
                    : isLongCall
                    ? 'amount-wave-amber'
                    : isOut
                    ? 'amount-wave-neutral'
                    : 'amount-wave-cyan';

                  const badgeWaveClass = isHandoff
                    ? 'badge-wave-rose'
                    : isLongCall
                    ? 'badge-wave-amber'
                    : isOut
                    ? 'badge-wave-neutral'
                    : 'badge-wave-cyan';

                  const staggeredDelay = `${((idx % 4) * 2.4).toFixed(1)}s`;

                  return (
                    <tr
                      key={rec.cdr_id}
                      onClick={() => {
                        setSelectedNode({
                          rawId: rec.a_party_num,
                          id: `PHONE_MSISDN:${rec.a_party_num}`,
                          name: rec.a_party_num,
                          type: 'PHONE_MSISDN',
                          status: isLongCall ? 'KEY COORDINATION LINE' : 'MONITORED BURNER SIM',
                          riskScore: isLongCall ? '84.0' : '52.0',
                          district: `${rec.circle_code} Circle Telecom Grid`
                        });
                      }}
                      style={{ animationDelay: staggeredDelay }}
                      className={`${rowWaveClass} hover:bg-white/[0.06] cursor-pointer transition-colors`}
                    >
                      <td className="py-3 px-4 text-zinc-400">
                        {new Date(rec.start_time).toLocaleString('en-IN', {
                          month: 'short',
                          day: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="py-3 px-3">
                        <span 
                          className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-bold border font-display uppercase tracking-wider ${badgeWaveClass}`}
                          style={{ animationDelay: staggeredDelay }}
                        >
                          {isOut ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownLeft className="w-3.5 h-3.5" />}
                          <span>{rec.call_type}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-white font-bold tracking-wide">
                        {rec.a_party_num}
                      </td>
                      <td className="py-3 px-2 text-center text-zinc-500">
                        <ArrowRight className="w-4 h-4 inline" />
                      </td>
                      <td className="py-3 px-4 font-bold text-zinc-200 tracking-wide">
                        {rec.b_party_num}
                      </td>
                      <td 
                        className={`py-3 px-3 text-right font-bold ${durationWaveClass}`}
                        style={{ animationDelay: staggeredDelay }}
                      >
                        {formatDuration(rec.duration_sec)}
                      </td>
                      <td className="py-3 px-4 text-zinc-400">
                        {rec.a_imei || 'N/A'}
                      </td>
                      <td className="py-3 px-4 text-zinc-300 font-semibold">
                        {rec.first_cgi}
                        {isHandoff && (
                          <span className="text-rose-400 text-[11px] block font-sans">Sector Handoff</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="px-2 py-0.5 bg-white/[0.06] text-white rounded text-xs border border-white/15 font-bold font-mono">
                          {rec.circle_code}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
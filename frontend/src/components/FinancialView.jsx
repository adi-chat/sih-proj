import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  CreditCard, AlertTriangle, ShieldAlert, 
  Search, ArrowRight, Loader2 
} from 'lucide-react';
import { useStore } from '../store';
import LetterGlitch from './ui/LetterGlitch';
import DitherVeil from './ui/DitherVeil';
import panoptesEye from '../assets/panoptes-eye.jpg';

export default function FinancialView() {
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
    fetch(`http://127.0.0.1:8000/api/finance/${activeCaseId}`)
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

  const filteredTxns = useMemo(() => {
    if (!data || !data.transactions) return [];
    return data.transactions.filter((tx) => {
      if (filter === 'smurfing' && tx.is_smurfing !== 1) return false;
      if (filter === 'shatter' && tx.is_shatter_point !== 1) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          tx.src_account_or_vpa.toLowerCase().includes(q) ||
          tx.dest_account_or_vpa.toLowerCase().includes(q) ||
          tx.channel.toLowerCase().includes(q) ||
          tx.txn_ref_no.toLowerCase().includes(q)
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
            PARSING PMLA SMURFING LAYERS & BANK TRANCHES FOR [{activeCaseId}]...
          </span>
        </div>
      </div>
    );
  }

  if (!data || data.transactions.length === 0) {
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
            NO FINANCIAL LEDGER RECORDS FOUND FOR THIS CASE
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 flex flex-col h-full overflow-hidden bg-black text-white select-none">
      {/* 1. Global Background Glitch */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-30 select-none overflow-hidden">
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

      {/* 2. Glass Foreground Workspace */}
      <div className="relative z-10 flex-1 flex flex-col h-full overflow-hidden p-6 space-y-5">
        
        {/* Metric Cards */}
        <div className="grid grid-cols-4 gap-4 shrink-0 font-mono">
          <div 
            className="bg-black/30 border border-white/15 rounded-xl p-4 flex flex-col justify-between backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.14),0_12px_36px_rgba(0,0,0,0.6)] hover:bg-black/40 transition-all card-wave-cyan"
            style={{ animationDelay: '0s' }}
          >
            <div className="flex items-center justify-between text-zinc-300 text-xs font-display font-bold tracking-[0.14em] uppercase">
              <span>TOTAL SIPHONED CAPITAL</span>
              <CreditCard className="w-4 h-4 text-zinc-400" />
            </div>
            <div 
              className="text-3xl font-black mt-2 tracking-tight text-wave-cyan"
              style={{ animationDelay: '0s' }}
            >
              ₹ {data.total_volume_inr.toLocaleString('en-IN')}
            </div>
            <span className="text-xs text-zinc-400 mt-1 font-sans">{data.transaction_count} Multi-Hop Routing Tranches</span>
          </div>

          <div 
            className="bg-black/30 border border-white/15 rounded-xl p-4 flex flex-col justify-between backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.14),0_12px_36px_rgba(0,0,0,0.6)] hover:bg-black/40 transition-all card-wave-amber"
            style={{ animationDelay: '3.5s' }}
          >
            <div className="flex items-center justify-between text-zinc-300 text-xs font-display font-bold tracking-[0.14em] uppercase">
              <span>PMLA SMURFING TRANCHES</span>
              <ShieldAlert className="w-4 h-4 text-zinc-400" />
            </div>
            <div 
              className="text-3xl font-black mt-2 tracking-tight text-wave-amber"
              style={{ animationDelay: '3.5s' }}
            >
              {data.smurfing_count} <span className="text-xs font-display font-bold text-zinc-400">ALERTS</span>
            </div>
            <span className="text-xs text-zinc-400 mt-1 font-sans">Split below ₹ 50,000 threshold</span>
          </div>

          <div 
            className="bg-black/30 border border-white/15 rounded-xl p-4 flex flex-col justify-between backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.14),0_12px_36px_rgba(0,0,0,0.6)] hover:bg-black/40 transition-all card-wave-rose"
            style={{ animationDelay: '7.0s' }}
          >
            <div className="flex items-center justify-between text-zinc-300 text-xs font-display font-bold tracking-[0.14em] uppercase">
              <span>TERMINAL SHATTER POINTS</span>
              <AlertTriangle className="w-4 h-4 text-zinc-400" />
            </div>
            <div 
              className="text-3xl font-black mt-2 tracking-tight text-wave-rose"
              style={{ animationDelay: '7.0s' }}
            >
              {data.shatter_point_count} <span className="text-xs font-display font-bold text-zinc-400">CASH EXITS</span>
            </div>
            <span className="text-xs text-zinc-400 mt-1 font-sans">ATM kiosks where digital trail ends</span>
          </div>

          <div 
            className="bg-black/30 border border-white/15 rounded-xl p-4 flex flex-col justify-between backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.14),0_12px_36px_rgba(0,0,0,0.6)] hover:bg-black/40 transition-all card-wave-emerald"
            style={{ animationDelay: '10.5s' }}
          >
            <span className="text-xs font-display font-bold tracking-[0.14em] uppercase text-zinc-300">
              STATUTORY LEGAL ACTION
            </span>
            <div 
              className="text-base font-bold mt-1.5 font-display tracking-wider uppercase text-wave-emerald"
              style={{ animationDelay: '10.5s' }}
            >
              SECTION 106 BNSS
            </div>
            <span className="text-xs text-zinc-400 mt-1 font-sans">Requisition for Lien & Debit-Freeze Ready</span>
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
              All Tranches ({data.transactions.length})
            </button>
            <button
              onClick={() => setFilter('smurfing')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-bold tracking-wider uppercase transition-all ${
                filter === 'smurfing'
                  ? 'bg-white text-black shadow-md'
                  : 'text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.09] border border-white/10'
              }`}
            >
              PMLA Smurfing ({data.smurfing_count})
            </button>
            <button
              onClick={() => setFilter('shatter')}
              className={`px-3.5 py-1.5 rounded-md text-xs font-bold tracking-wider uppercase transition-all ${
                filter === 'shatter'
                  ? 'bg-white text-black shadow-md'
                  : 'text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.09] border border-white/10'
              }`}
            >
              ATM Shatter Exits ({data.shatter_point_count})
            </button>
          </div>

          <div className="relative w-80 font-mono">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search account, VPA, Ref No or Kiosk..."
              className="w-full bg-black/40 border border-white/15 focus:border-white/40 rounded-md pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-zinc-500 focus:outline-none backdrop-blur-sm transition-colors"
            />
          </div>
        </div>

        {/* 3. Table Container with Interactive DitherVeil Eye Background */}
        <div 
          ref={tableContainerRef}
          className="relative flex-1 overflow-hidden rounded-xl border border-white/15 bg-black/40 backdrop-blur-md shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_16px_48px_rgba(0,0,0,0.6)] flex flex-col"
        >
          
          {/* Centered Square DitherVeil Watermark (Interactable via hover/clicks on tableContainerRef) */}
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
                  <th className="py-3 px-3">CHANNEL</th>
                  <th className="py-3 px-4">DEBIT ORIGIN A/C</th>
                  <th className="py-3 px-2 text-center">HOP</th>
                  <th className="py-3 px-4">CREDIT DESTINATION</th>
                  <th className="py-3 px-4 text-right">AMOUNT (INR)</th>
                  <th className="py-3 px-4">FORENSIC CLASSIFICATION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] font-mono text-xs">
                {filteredTxns.map((tx, idx) => {
                  const isSmurf = tx.is_smurfing === 1;
                  const isShatter = tx.is_shatter_point === 1;
                  
                  const rowWaveClass = isShatter 
                    ? 'row-wave-rose' 
                    : isSmurf 
                    ? 'row-wave-amber' 
                    : 'row-wave-neutral';
                  const amountWaveClass = isShatter
                    ? 'amount-wave-rose'
                    : isSmurf
                    ? 'amount-wave-amber'
                    : 'amount-wave-neutral';
                  const badgeWaveClass = isShatter
                    ? 'badge-wave-rose'
                    : isSmurf
                    ? 'badge-wave-amber'
                    : 'badge-wave-neutral';
                  
                  const staggeredDelay = `${((idx % 4) * 2.4).toFixed(1)}s`;

                  return (
                    <tr
                      key={tx.txn_id}
                      onClick={() => {
                        setSelectedNode({
                          rawId: tx.src_account_or_vpa,
                          id: `ACCOUNT_UPI:${tx.src_account_or_vpa}`,
                          name: tx.src_account_or_vpa,
                          type: 'ACCOUNT_UPI',
                          status: isShatter
                            ? 'CRITICAL SHATTER POINT (ATM KIOSK)'
                            : isSmurf
                            ? 'PMLA SMURFING LAYER MULE'
                            : 'MULE ACCOUNT HOP',
                          riskScore: isShatter ? '98.0' : isSmurf ? '88.0' : '45.0',
                          district: 'Financial Trail Routing'
                        });
                      }}
                      style={{ animationDelay: staggeredDelay }}
                      className={`${rowWaveClass} hover:bg-white/[0.08] cursor-pointer transition-colors`}
                    >
                      <td className="py-3 px-4 text-zinc-400">
                        {new Date(tx.timestamp).toLocaleString('en-IN', {
                          month: 'short',
                          day: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2.5 py-1 rounded bg-white/[0.06] text-white border border-white/15 font-bold text-xs uppercase">
                          {tx.channel}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-white font-bold tracking-wide">
                        {tx.src_account_or_vpa}
                      </td>
                      <td className="py-3 px-2 text-center text-zinc-500">
                        <ArrowRight className="w-4 h-4 inline" />
                      </td>
                      <td className="py-3 px-4 font-bold text-zinc-200 tracking-wide">
                        {tx.dest_account_or_vpa}
                      </td>
                      <td 
                        className={`py-3 px-4 text-right font-bold text-sm ${amountWaveClass}`}
                        style={{ animationDelay: staggeredDelay }}
                      >
                        ₹ {Number(tx.amount_inr).toLocaleString('en-IN')}
                      </td>
                      <td className="py-3 px-4 font-display">
                        <span 
                          className={`inline-block px-2.5 py-1 rounded text-xs font-bold tracking-wider uppercase border transition-all ${badgeWaveClass}`}
                          style={{ animationDelay: staggeredDelay }}
                        >
                          {isShatter 
                            ? 'SHATTER POINT EXIT' 
                            : isSmurf 
                            ? 'PMLA SMURFING ALERT' 
                            : 'NORMAL MULE HOP'}
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
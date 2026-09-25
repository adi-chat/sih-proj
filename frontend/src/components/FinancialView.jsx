import React, { useState, useEffect, useMemo } from 'react';
import { 
  CreditCard, AlertTriangle, ShieldAlert, ArrowUpRight, 
  Search, Filter, ExternalLink, FileSpreadsheet, Loader2, ArrowRight
} from 'lucide-react';
import { useStore } from '../store';

export default function FinancialView() {
  const { activeCaseId, setSelectedNode } = useStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'smurfing', 'shatter'
  const [search, setSearch] = useState('');

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
      <div className="flex-1 flex flex-col items-center justify-center space-y-3 bg-zinc-950">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        <span className="text-xs font-mono text-emerald-500/80">
          PARSING PMLA SMURFING LAYERS & BANK TRANCHES FOR [{activeCaseId}]...
        </span>
      </div>
    );
  }

  if (!data || data.transactions.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 space-y-2 bg-zinc-950">
        <AlertTriangle className="w-8 h-8 opacity-40 text-amber-500" />
        <p className="font-mono text-xs">NO FINANCIAL LEDGER RECORDS FOUND FOR THIS CASE</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-zinc-950 text-zinc-300 font-mono p-6 space-y-6">
      {/* Top Header Metrics Strip */}
      <div className="grid grid-cols-4 gap-4 shrink-0">
        {/* Total Capital */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-500 text-[11px]">
            <span>TOTAL SIPHONED CAPITAL</span>
            <CreditCard className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-bold text-zinc-100 mt-2">
            ₹{data.total_volume_inr.toLocaleString('en-IN')}
          </div>
          <span className="text-[10px] text-zinc-600 mt-1">{data.transaction_count} Multi-Hop Routing Tranches</span>
        </div>

        {/* PMLA Smurfing */}
        <div className="bg-zinc-900/60 border border-amber-500/30 rounded-lg p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-amber-400 text-[11px]">
            <span>PMLA SMURFING TRANCHES</span>
            <ShieldAlert className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-amber-400 mt-2">
            {data.smurfing_count} ALERTS
          </div>
          <span className="text-[10px] text-amber-500/80 mt-1">Split below ₹50,000 reporting threshold</span>
        </div>

        {/* Shatter Point ATM Exits */}
        <div className="bg-zinc-900/60 border border-rose-500/30 rounded-lg p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-rose-400 text-[11px]">
            <span>TERMINAL SHATTER POINTS</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-xl font-bold text-rose-400 mt-2">
            {data.shatter_point_count} CASH EXITS
          </div>
          <span className="text-[10px] text-rose-400/80 mt-1">ATM kiosks where digital trail goes cold</span>
        </div>

        {/* Statutory Freeze Directive */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3.5 flex flex-col justify-between">
          <span className="text-[11px] text-zinc-500">STATUTORY LEGAL ACTION</span>
          <div className="text-xs font-semibold text-emerald-400 mt-1">
            Section 106 BNSS
          </div>
          <span className="text-[10px] text-zinc-400 block mt-1">Requisition for Lien & Debit-Freeze Ready</span>
        </div>
      </div>

      {/* Action and Filter Bar */}
      <div className="flex items-center justify-between shrink-0 bg-zinc-900/40 border border-zinc-800 rounded-lg p-2.5">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              filter === 'all'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            All Tranches ({data.transactions.length})
          </button>
          <button
            onClick={() => setFilter('smurfing')}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              filter === 'smurfing'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30 font-semibold'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            PMLA Smurfing ({data.smurfing_count})
          </button>
          <button
            onClick={() => setFilter('shatter')}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              filter === 'shatter'
                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30 font-semibold'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            ATM Shatter Exits ({data.shatter_point_count})
          </button>
        </div>

        <div className="relative w-72">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search account, VPA, RRN or Kiosk..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded pl-8 pr-3 py-1 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Forensic Transaction Ledger Table */}
      <div className="flex-1 overflow-auto rounded-lg border border-zinc-800 bg-zinc-900/30">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-zinc-900/80 sticky top-0 z-10 border-b border-zinc-800 text-[10px] text-zinc-500 tracking-wider">
            <tr>
              <th className="py-2.5 px-4">TIMESTAMP</th>
              <th className="py-2.5 px-3">CHANNEL</th>
              <th className="py-2.5 px-4">DEBIT ORIGIN A/C</th>
              <th className="py-2.5 px-2 text-center">HOP</th>
              <th className="py-2.5 px-4">CREDIT DESTINATION</th>
              <th className="py-2.5 px-4 text-right">AMOUNT (INR)</th>
              <th className="py-2.5 px-4">FORENSIC CLASSIFICATION</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 font-mono text-[11px]">
            {filteredTxns.map((tx) => {
              const isSmurf = tx.is_smurfing === 1;
              const isShatter = tx.is_shatter_point === 1;

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
                  className="hover:bg-zinc-800/40 cursor-pointer transition-colors"
                >
                  <td className="py-2.5 px-4 text-zinc-500 text-[10px]">
                    {new Date(tx.timestamp).toLocaleString('en-IN', {
                      month: 'short',
                      day: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                      isShatter 
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' 
                        : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                    }`}>
                      {tx.channel}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-zinc-200 font-semibold">
                    {tx.src_account_or_vpa}
                  </td>
                  <td className="py-2.5 px-2 text-center text-zinc-600">
                    <ArrowRight className="w-3.5 h-3.5 inline" />
                  </td>
                  <td className="py-2.5 px-4 font-semibold">
                    {isShatter ? (
                      <span className="text-rose-400 flex items-center">
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        {tx.dest_account_or_vpa}
                      </span>
                    ) : (
                      <span className="text-zinc-200">{tx.dest_account_or_vpa}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right font-bold text-zinc-100">
                    ₹{Number(tx.amount_inr).toLocaleString('en-IN')}
                  </td>
                  <td className="py-2.5 px-4">
                    {isShatter ? (
                      <span className="px-2 py-0.5 bg-rose-950/60 border border-rose-800 text-rose-300 rounded text-[10px] font-bold">
                        ⚠️ SHATTER POINT EXIT (CASH-OUT)
                      </span>
                    ) : isSmurf ? (
                      <span className="px-2 py-0.5 bg-amber-950/60 border border-amber-800 text-amber-300 rounded text-[10px] font-bold">
                        ⚡ PMLA SMURFING ALERT
                      </span>
                    ) : (
                      <span className="text-zinc-500 text-[10px]">NORMAL MULE HOP</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
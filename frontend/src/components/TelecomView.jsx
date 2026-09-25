import React, { useState, useEffect, useMemo } from 'react';
import { 
  PhoneCall, Radio, Smartphone, Clock, 
  Search, AlertTriangle, ArrowRight, ArrowUpRight, ArrowDownLeft, Loader2 
} from 'lucide-react';
import { useStore } from '../store';

export default function TelecomView() {
  const { activeCaseId, setSelectedNode } = useStore();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'voice_in', 'voice_out'
  const [search, setSearch] = useState('');

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
      <div className="flex-1 flex flex-col items-center justify-center space-y-3 bg-zinc-950">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        <span className="text-xs font-mono text-emerald-500/80">
          TRIANGULATING CELL TOWERS & CORRELATING CDR TELCO STREAMS FOR [{activeCaseId}]...
        </span>
      </div>
    );
  }

  if (!data || data.records.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 space-y-2 bg-zinc-950">
        <AlertTriangle className="w-8 h-8 opacity-40 text-amber-500" />
        <p className="font-mono text-xs">NO TELECOM CDR EXHIBITS LINKED TO THIS CASE</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-zinc-950 text-zinc-300 font-mono p-6 space-y-6">
      {/* Top Header Metrics Strip */}
      <div className="grid grid-cols-4 gap-4 shrink-0">
        {/* Total Intercepts */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-500 text-[11px]">
            <span>TOTAL CDR INTERCEPTS</span>
            <PhoneCall className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-bold text-zinc-100 mt-2">
            {data.total_calls} SESSIONS
          </div>
          <span className="text-[10px] text-zinc-600 mt-1">DoT Section 5(2) Indian Telegraph Act</span>
        </div>

        {/* Total Airtime */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-500 text-[11px]">
            <span>CUMULATIVE AIRTIME</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold text-amber-400 mt-2">
            {formatDuration(data.total_duration_sec)}
          </div>
          <span className="text-[10px] text-zinc-600 mt-1">Total active voice traffic duration</span>
        </div>

        {/* Bound Hardware IMEIs */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-500 text-[11px]">
            <span>BOUND HARDWARE IMEIS</span>
            <Smartphone className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-emerald-400 mt-2">
            {data.unique_imeis_count} DEVICES
          </div>
          <span className="text-[10px] text-zinc-600 mt-1">Equipment identifiers in handset pool</span>
        </div>

        {/* Cell Tower CGI Footprint */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-3.5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-zinc-500 text-[11px]">
            <span>SECTOR CELL TOWERS</span>
            <Radio className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-xl font-bold text-rose-400 mt-2">
            {data.cell_towers_count} TOWERS
          </div>
          <span className="text-[10px] text-zinc-600 mt-1">CGI geolocation ping sectors</span>
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
            All Intercepts ({data.records.length})
          </button>
          <button
            onClick={() => setFilter('voice_out')}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              filter === 'voice_out'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30 font-semibold'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Outgoing Calls
          </button>
          <button
            onClick={() => setFilter('voice_in')}
            className={`px-3 py-1 rounded text-xs transition-colors ${
              filter === 'voice_in'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Incoming Coordination
          </button>
        </div>

        <div className="relative w-80">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search MSISDN, IMEI, CGI Tower, Circle..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded pl-8 pr-3 py-1 text-xs text-zinc-200 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Forensic CDR Ledger Table */}
      <div className="flex-1 overflow-auto rounded-lg border border-zinc-800 bg-zinc-900/30">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-zinc-900/80 sticky top-0 z-10 border-b border-zinc-800 text-[10px] text-zinc-500 tracking-wider">
            <tr>
              <th className="py-2.5 px-4">TIMESTAMP</th>
              <th className="py-2.5 px-3">CALL TYPE</th>
              <th className="py-2.5 px-4">CALLING PARTY (A)</th>
              <th className="py-2.5 px-2 text-center">FLOW</th>
              <th className="py-2.5 px-4">CALLED PARTY (B)</th>
              <th className="py-2.5 px-3 text-right">DURATION</th>
              <th className="py-2.5 px-4">ORIGIN IMEI</th>
              <th className="py-2.5 px-4">CELL TOWER CGI</th>
              <th className="py-2.5 px-3 text-center">CIRCLE</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 font-mono text-[11px]">
            {filteredRecords.map((rec) => {
              const isOut = rec.call_type === 'VOICE_OUT';
              const isLongCall = rec.duration_sec >= 300;

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
                  className="hover:bg-zinc-800/40 cursor-pointer transition-colors"
                >
                  <td className="py-2.5 px-4 text-zinc-500 text-[10px]">
                    {new Date(rec.start_time).toLocaleString('en-IN', {
                      month: 'short',
                      day: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border flex items-center w-fit space-x-1 ${
                      isOut 
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' 
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    }`}>
                      {isOut ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
                      <span>{rec.call_type}</span>
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-zinc-200 font-semibold">
                    {rec.a_party_num}
                  </td>
                  <td className="py-2.5 px-2 text-center text-zinc-600">
                    <ArrowRight className="w-3.5 h-3.5 inline" />
                  </td>
                  <td className="py-2.5 px-4 font-semibold text-zinc-200">
                    {rec.b_party_num}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <span className={`font-bold ${isLongCall ? 'text-amber-400' : 'text-zinc-400'}`}>
                      {formatDuration(rec.duration_sec)}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-zinc-400 text-[10px]">
                    {rec.a_imei || 'N/A'}
                  </td>
                  <td className="py-2.5 px-4 text-zinc-400 text-[10px]">
                    <span className="text-zinc-300 font-semibold">{rec.first_cgi}</span>
                    {rec.first_cgi !== rec.last_cgi && (
                      <span className="text-rose-400 text-[9px] block">➔ Sector Handoff</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded text-[10px] border border-zinc-700 font-bold">
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
  );
}
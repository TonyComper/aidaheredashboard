// components/AssistantDashboardVapi.tsx
"use client";
import React, { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, orderBy, getDocs, doc, getDoc } from "firebase/firestore";

type CallListItem = {
  id: string;
  assistantId?: string;
  startTime?: string | null;
  endTime?: string | null;
  durationSeconds?: number | null;
  status?: string | null;
  from?: string | null;
  to?: string | null;
};
type CallDetails = CallListItem & { transcript?: string | null; recordingUrl?: string | null; endedReason?: string | null; };

function startOfDay(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0,0,0,0); }
function endOfDay(d = new Date())   { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23,59,59,999); }
function startOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d = new Date()) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999); }
function addMonths(d: Date, n: number) { const x = new Date(d); x.setMonth(d.getMonth()+n); return x; }
function startOfYear(d = new Date()) { return new Date(d.getFullYear(), 0, 1); }
function endOfYear(d = new Date()) { return new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999); }

const PRESETS = [
  { key: "today", label: "Today" },
  { key: "this_month", label: "This Month" },
  { key: "last_month", label: "Last Month" },
  { key: "last_3_months", label: "Last 3 Months" },
  { key: "this_year", label: "This Year" },
  { key: "custom", label: "Custom Range" },
] as const;
type PresetKey = typeof PRESETS[number]["key"];

function resolveRange(preset: PresetKey, custom?: { start?: Date; end?: Date }) {
  const now = new Date();
  switch (preset) {
    case "today": return { start: startOfDay(now), end: endOfDay(now) };
    case "this_month": return { start: startOfMonth(now), end: endOfMonth(now) };
    case "last_month": return { start: startOfMonth(addMonths(now, -1)), end: endOfMonth(addMonths(now, -1)) };
    case "last_3_months": return { start: startOfMonth(addMonths(now, -2)), end: endOfMonth(now) };
    case "this_year": return { start: startOfYear(now), end: endOfYear(now) };
    case "custom":
    default: return { start: custom?.start || startOfMonth(now), end: custom?.end || now };
  }
}

function nf(n: number, opts?: Intl.NumberFormatOptions) { return new Intl.NumberFormat(undefined, opts).format(n); }
function minutesFromSeconds(s?: number | null) { return (s ?? 0) / 60; }
function formatDate(dt?: string | null) { if (!dt) return "—"; return new Date(dt).toLocaleDateString(); }
function formatTime(dt?: string | null) { if (!dt) return "—"; return new Date(dt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

function KpiCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="rounded-2xl shadow p-5 bg-white border border-gray-100">
      <div className="text-gray-500 text-sm">{title}</div>
      <div className="text-3xl font-semibold mt-1">{value}</div>
      {subtitle && <div className="text-xs text-gray-400 mt-1">{subtitle}</div>}
    </div>
  );
}

export default function AssistantDashboard({ assistantId }: { assistantId: string }) {
  const [preset, setPreset] = useState<PresetKey>("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<CallListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [details, setDetails] = useState<CallDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const { start, end } = useMemo(() => {
    const c = { start: customStart ? new Date(customStart) : undefined, end: customEnd ? new Date(customEnd) : undefined };
    return resolveRange(preset, c);
  }, [preset, customStart, customEnd]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        const col = collection(db, "callLogs");
        const qy = query(
          col,
          where("assistantId", "==", assistantId),
          where("startTime", ">=", start),
          where("startTime", "<=", end),
          orderBy("startTime", "desc"),
        );
        const snap = await getDocs(qy);
        if (ignore) return;
        const rows: CallListItem[] = snap.docs.map((d: any) => {
          const x = d.data();
          const startTime = x.startTime?.toDate ? x.startTime.toDate().toISOString() : null;
          const endTime = x.endTime?.toDate ? x.endTime.toDate().toISOString() : null;
          const durationSeconds =
            typeof x.durationSeconds === "number" ? x.durationSeconds :
            typeof x.duration === "string" ? Number(x.duration) : null;
          const from = x.from ?? x.customerPhone ?? null;
          return { id: d.id, assistantId: x.assistantId, startTime, endTime, durationSeconds, status: x.status ?? null, from, to: x.to ?? null };
        });
        setItems(rows);
      } catch (e: any) {
        setError(e?.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
    return () => { ignore = true; };
  }, [assistantId, start, end]);

  const totalCalls = items.length;
  const totalMinutes = useMemo(() => items.reduce((acc, it) => acc + minutesFromSeconds(it.durationSeconds), 0), [items]);
  const avgMinutes = totalCalls ? totalMinutes / totalCalls : 0;

  async function openDetails(id: string) {
    setDrawerId(id); setDetails(null); setDetailsLoading(true);
    try {
      const snap = await getDoc(doc(db, "callLogs", id));
      if (snap.exists()) {
        const x: any = snap.data();
        const startTime = x.startTime?.toDate ? x.startTime.toDate().toISOString() : null;
        const endTime = x.endTime?.toDate ? x.endTime.toDate().toISOString() : null;
        const durationSeconds =
          typeof x.durationSeconds === "number" ? x.durationSeconds :
          typeof x.duration === "string" ? Number(x.duration) : null;
        setDetails({
          id: snap.id,
          assistantId: x.assistantId,
          startTime,
          endTime,
          durationSeconds,
          status: x.status ?? null,
          from: x.from ?? x.customerPhone ?? null,
          to: x.to ?? null,
          recordingUrl: x.recordingUrl ?? x.callAudio ?? null,
          transcript: x.transcript ?? x.viewTranscript ?? null,
        });
      }
    } finally { setDetailsLoading(false); }
  }

  return (
    <div>
      {/* Filters */}
      <div className="grid md:grid-cols-3 gap-3 items-end mb-6">
        <div>
          <label className="text-sm text-gray-600">Time Period</label>
          <select className="w-full border rounded-xl p-2 mt-1" value={preset} onChange={(e) => setPreset(e.target.value as PresetKey)}>
            {PRESETS.map((p) => (<option key={p.key} value={p.key}>{p.label}</option>))}
          </select>
        </div>
        <div>
          <label className="text-sm text-gray-600">Custom Start</label>
          <input type="datetime-local" className="w-full border rounded-xl p-2 mt-1" value={customStart} onChange={(e)=>setCustomStart(e.target.value)} disabled={preset!=="custom"} />
        </div>
        <div>
          <label className="text-sm text-gray-600">Custom End</label>
          <input type="datetime-local" className="w-full border rounded-xl p-2 mt-1" value={customEnd} onChange={(e)=>setCustomEnd(e.target.value)} disabled={preset!=="custom"} />
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-2 text-gray-500 text-sm">
        <span className="opacity-80 font-medium">Metrics</span> — <span className="italic">For Today’s Date</span>
      </div>
      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        <KpiCard title="Number of Calls" value={nf(totalCalls)} />
        <KpiCard title="Total Minutes" value={nf(totalMinutes, { maximumFractionDigits: totalMinutes < 100 ? 1 : 0 })} subtitle="Sum of duration in minutes" />
        <KpiCard title="Average Call Length" value={nf(avgMinutes, { maximumFractionDigits: 2 })} />
      </div>

      {/* Call Log */}
      <div className="rounded-2xl shadow bg-white border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b">
          <div className="font-medium">Call Log</div>
          <div className="text-sm text-gray-500">For the selected date or date range</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr className="text-left text-xs uppercase text-gray-500">
                <th className="py-2 px-3">Date</th>
                <th className="py-2 px-3">Customer Phone</th>
                <th className="py-2 px-3">Start Time</th>
                <th className="py-2 px-3 text-right">Duration</th>
                <th className="py-2 px-3 text-right">Transcript</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="py-6 px-3 text-gray-500" colSpan={5}>Loading…</td></tr>
              ) : error ? (
                <tr><td className="py-6 px-3 text-red-600" colSpan={5}>{error}</td></tr>
              ) : items.length === 0 ? (
                <tr><td className="py-6 px-3 text-gray-400" colSpan={5}>No calls in this period.</td></tr>
              ) : (
                items.map((it) => {
                  const mins = it.durationSeconds ? Math.round(it.durationSeconds / 60) : 0;
                  return (
                    <tr key={it.id} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-2 px-3 whitespace-nowrap text-sm">{formatDate(it.startTime)}</td>
                      <td className="py-2 px-3 text-sm">{it.from || "—"}</td>
                      <td className="py-2 px-3 text-sm">{formatTime(it.startTime)}</td>
                      <td className="py-2 px-3 text-sm text-right">{mins} min</td>
                      <td className="py-2 px-3 text-sm text-right">
                        <button className="underline" onClick={() => openDetails(it.id)}>View</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer */}
      {drawerId && details && (
        <div className="fixed inset-0 bg-black/30 flex" onClick={() => setDrawerId(null)}>
          <div className="ml-auto w-full max-w-xl h-full bg-white p-5 overflow-y-auto" onClick={(e)=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold">Call {drawerId.slice(0,8)}…</div>
              <button className="px-3 py-1 rounded-xl border" onClick={()=>setDrawerId(null)}>Close</button>
            </div>
            <div className="space-y-3 text-sm">
              <div><span className="text-gray-500">Date:</span> {formatDate(details.startTime)}</div>
              <div><span className="text-gray-500">Start:</span> {formatTime(details.startTime)}</div>
              <div><span className="text-gray-500">Duration:</span> {details.durationSeconds ? Math.round(details.durationSeconds/60) + " min" : "—"}</div>
              <div><span className="text-gray-500">From:</span> {details.from || "—"} <span className="text-gray-500 ml-2">To:</span> {details.to || "—"}</div>
              {details.recordingUrl && <div><a className="underline" href={details.recordingUrl} target="_blank" rel="noreferrer">Recording</a></div>}
              {details.transcript && (
                <div>
                  <div className="text-gray-500 mb-1">Transcript</div>
                  <div className="whitespace-pre-wrap bg-gray-50 border rounded-xl p-3 max-h-80 overflow-auto">{details.transcript}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-gray-400 mt-3">Window: {start.toLocaleString()} → {end.toLocaleString()}</div>
    </div>
  );
}

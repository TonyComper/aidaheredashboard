"use client";

import React, { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore";

/* ======================== Types ======================== */
export type CallDoc = {
  id: string;
  assistantId: string;
  startTime: any;          // Firestore Timestamp or ISO string
  endTime?: any;
  callDate?: any;
  durationSeconds?: number | null;
  status?: string | null;
  from?: string | null;
  to?: string | null;
  transcript?: string | null;
  recordingUrl?: string | null;
};

export type CallDetails = CallDoc;

/* =================== Date & UI helpers =================== */
function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function endOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function addMonths(d: Date, n: number) {
  const x = new Date(d);
  x.setMonth(d.getMonth() + n);
  return x;
}
function startOfYear(d = new Date()) {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}
function endOfYear(d = new Date()) {
  return new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
}

const PRESETS = [
  { key: "today", label: "Today" },
  { key: "this_month", label: "This Month" },
  { key: "last_month", label: "Last Month" },
  { key: "last_3_months", label: "Last 3 Months" },
  { key: "this_year", label: "This Year" },
  { key: "custom", label: "Custom Range" },
] as const;
type PresetKey = typeof PRESETS[number]["key"];

function nf(n: number, opts?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(undefined, opts).format(n);
}
function minutesFromSeconds(s?: number | null) {
  return (s ?? 0) / 60;
}
function toDate(val: any | null | undefined): Date | null {
  if (!val) return null;
  // Firestore Timestamp support
  if (typeof val?.toDate === "function") return val.toDate();
  // ISO string
  if (typeof val === "string") return new Date(val);
  // JS Date
  if (val instanceof Date) return val;
  return null;
}
function fmtDate(dt: any) {
  const d = toDate(dt);
  return d ? d.toLocaleDateString() : "—";
}
function fmtTime(dt: any) {
  const d = toDate(dt);
  return d
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";
}

function KpiCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="rounded-2xl shadow p-5 bg-white border border-gray-100">
      <div className="text-gray-500 text-sm">{title}</div>
      <div className="text-3xl font-semibold mt-1">{value}</div>
      {subtitle && <div className="text-xs text-gray-400 mt-1">{subtitle}</div>}
    </div>
  );
}

/* =================== Main Component =================== */
export default function AssistantDashboardVapi({
  assistantId,
  pageLimit = 500,
}: {
  assistantId: string;
  pageLimit?: number;
}) {
  /* ---- Filters ---- */
  const [preset, setPreset] = useState<PresetKey>("this_month");
  const [customStart, setCustomStart] = useState<string>(""); // "YYYY-MM-DD"
  const [customEnd, setCustomEnd] = useState<string>("");     // "YYYY-MM-DD"

  const { start, end } = useMemo(() => {
    const now = new Date();
    if (preset === "custom" && customStart && customEnd) {
      const s = startOfDay(new Date(`${customStart}T00:00:00`));
      const e = endOfDay(new Date(`${customEnd}T00:00:00`));
      return { start: s, end: e };
    }
    switch (preset) {
      case "today":
        return { start: startOfDay(now), end: endOfDay(now) };
      case "this_month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "last_month":
        return {
          start: startOfMonth(addMonths(now, -1)),
          end: endOfMonth(addMonths(now, -1)),
        };
      case "last_3_months":
        return { start: startOfMonth(addMonths(now, -2)), end: endOfMonth(now) };
      case "this_year":
        return { start: startOfYear(now), end: endOfYear(now) };
      default:
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  }, [preset, customStart, customEnd]);

  /* ---- Data state ---- */
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CallDoc[]>([]);
  const [error, setError] = useState<string | null>(null);

  /* ---- Drawer (details) ---- */
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [details, setDetails] = useState<CallDetails | null>(null);

  /* ---- Trigger Vapi→Firestore sync for selected window ---- */
  useEffect(() => {
    let ignore = false;
    async function syncNow() {
      try {
        const qs = new URLSearchParams({
          assistantId,
          start: start.toISOString(),
          end: end.toISOString(),
        });
        await fetch(`/api/vapi/sync?${qs.toString()}`, { method: "GET" });
      } catch (e) {
        // swallow; Firestore fetch will still run
      }
    }
    syncNow();
    return () => {
      ignore = true;
    };
  }, [assistantId, start, end]);

  /* ---- Load filtered rows from Firestore ---- */
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const col = collection(db, "callLogs");
        // NOTE: This requires a composite index: where(assistantId)== + orderBy(startTime) + ranges
        const qy = query(
          col,
          where("assistantId", "==", assistantId),
          where("startTime", ">=", start),
          where("startTime", "<=", end),
          orderBy("startTime", "desc")
        );
        const snap = await getDocs(qy);
        if (cancelled) return;

        const list: CallDoc[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            assistantId: data.assistantId,
            startTime: data.startTime,
            endTime: data.endTime ?? null,
            callDate: data.callDate ?? null,
            durationSeconds: data.durationSeconds ?? null,
            status: data.status ?? null,
            from: data.from ?? null,
            to: data.to ?? null,
            transcript: data.transcript ?? null,
            recordingUrl: data.recordingUrl ?? null,
          };
        });

        // Optional front-end cap (pageLimit)
        setRows(list.slice(0, pageLimit));
      } catch (e: any) {
        setError(e?.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [assistantId, start, end, pageLimit]);

  /* ---- KPIs ---- */
  const totalCalls = rows.length;
  const totalMinutes = useMemo(
    () => rows.reduce((acc, r) => acc + minutesFromSeconds(r.durationSeconds), 0),
    [rows]
  );
  const avgMinutes = totalCalls ? totalMinutes / totalCalls : 0;

  /* ---- Details Drawer ---- */
  function openDetails(row: CallDoc) {
    setDrawerId(row.id);
    setDetails(row as CallDetails);
  }

  /* =================== Render =================== */
  return (
    <div>
      {/* Filters */}
      <div className="grid md:grid-cols-3 gap-3 items-end mb-6">
        <div>
          <label className="text-sm text-gray-600">Time Period</label>
          <select
            className="w-full border rounded-xl p-2 mt-1"
            value={preset}
            onChange={(e) => setPreset(e.target.value as PresetKey)}
          >
            {PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm text-gray-600">Start Date</label>
          <input
            type="date"
            className="w-full border rounded-xl p-2 mt-1"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            disabled={preset !== "custom"}
          />
        </div>

        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-sm text-gray-600">End Date</label>
            <input
              type="date"
              className="w-full border rounded-xl p-2 mt-1"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              disabled={preset !== "custom"}
            />
          </div>
          <button
            onClick={async () => {
              const qs = new URLSearchParams({
                assistantId,
                start: start.toISOString(),
                end: end.toISOString(),
              });
              await fetch(`/api/vapi/sync?${qs}`, { method: "GET" });
              // You can also force a reload here if desired
            }}
            className="px-3 py-2 rounded-xl border"
            title="Pull fresh data from Vapi for this window"
          >
            Sync now
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mb-2 text-gray-500 text-sm">
        <span className="opacity-80 font-medium">Metrics</span> —{" "}
        <span className="italic">For Selected Period</span>
      </div>
      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        <KpiCard title="Number of Calls" value={nf(totalCalls)} />
        <KpiCard
          title="Total Minutes"
          value={nf(totalMinutes, { maximumFractionDigits: totalMinutes < 100 ? 1 : 0 })}
          subtitle="Sum of duration in minutes"
        />
        <KpiCard
          title="Average Call Length"
          value={nf(avgMinutes, { maximumFractionDigits: 2 })}
        />
      </div>

      {/* Call Log Table */}
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
                <tr>
                  <td className="py-6 px-3 text-gray-500" colSpan={5}>
                    Loading…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td className="py-6 px-3 text-red-600" colSpan={5}>
                    {error}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="py-6 px-3 text-gray-400" colSpan={5}>
                    No calls in this period.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const mins = r.durationSeconds
                    ? Math.round((r.durationSeconds ?? 0) / 60)
                    : 0;
                  return (
                    <tr
                      key={r.id}
                      className="border-b last:border-0 hover:bg-gray-50"
                    >
                      <td className="py-2 px-3 whitespace-nowrap text-sm">
                        {fmtDate(r.startTime)}
                      </td>
                      <td className="py-2 px-3 text-sm">{r.from || "—"}</td>
                      <td className="py-2 px-3 text-sm">{fmtTime(r.startTime)}</td>
                      <td className="py-2 px-3 text-sm text-right">{mins} min</td>
                      <td className="py-2 px-3 text-sm text-right">
                        <button className="underline" onClick={() => openDetails(r)}>
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Drawer */}
      {drawerId && details && (
        <div
          className="fixed inset-0 bg-black/30 flex"
          onClick={() => setDrawerId(null)}
        >
          <div
            className="ml-auto w-full max-w-xl h-full bg-white p-5 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold">Call {drawerId.slice(0, 8)}…</div>
              <button
                className="px-3 py-1 rounded-xl border"
                onClick={() => setDrawerId(null)}
              >
                Close
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <span className="text-gray-500">Date:</span> {fmtDate(details.startTime)}
              </div>
              <div>
                <span className="text-gray-500">Start:</span> {fmtTime(details.startTime)}
              </div>
              <div>
                <span className="text-gray-500">Duration:</span>{" "}
                {details.durationSeconds
                  ? Math.round((details.durationSeconds ?? 0) / 60) + " min"
                  : "—"}
              </div>
              <div>
                <span className="text-gray-500">From:</span> {details.from || "—"}{" "}
                <span className="text-gray-500 ml-2">To:</span> {details.to || "—"}
              </div>
              {details.recordingUrl && (
                <div>
                  <a
                    className="underline"
                    href={details.recordingUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Recording
                  </a>
                </div>
              )}
              {details.transcript && (
                <div>
                  <div className="text-gray-500 mb-1">Transcript</div>
                  <div className="whitespace-pre-wrap bg-gray-50 border rounded-xl p-3 max-h-80 overflow-auto">
                    {details.transcript}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-gray-400 mt-3">
        Window: {start.toLocaleString()} → {end.toLocaleString()}
      </div>
    </div>
  );
}

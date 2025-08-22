// components/AssistantDashboardVapi.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  getFirestore,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { app as firebaseApp } from "@/lib/firebase"; // ensure lib/firebase exports `app`
import dynamic from "next/dynamic";

// Recharts (loaded client-side only to keep SSR happy)
const ResponsiveContainer = dynamic(
  async () => (await import("recharts")).ResponsiveContainer,
  { ssr: false }
);
const LineChart = dynamic(async () => (await import("recharts")).LineChart, {
  ssr: false,
});
const Line = dynamic(async () => (await import("recharts")).Line, {
  ssr: false,
});
const XAxis = dynamic(async () => (await import("recharts")).XAxis, {
  ssr: false,
});
const YAxis = dynamic(async () => (await import("recharts")).YAxis, {
  ssr: false,
});
const Tooltip = dynamic(async () => (await import("recharts")).Tooltip, {
  ssr: false,
});
const CartesianGrid = dynamic(
  async () => (await import("recharts")).CartesianGrid,
  { ssr: false }
);

type CallListItem = {
  id: string;
  assistantId: string;
  startTime?: Timestamp | null; // Firestore timestamp
  endTime?: Timestamp | null;
  durationSeconds?: number | null;
  status?: string | null;
  from?: string | null;
  to?: string | null;
  recordingUrl?: string | null;
  transcript?: string | null;
};

type ViewMode = "log" | "hourly";

// ----------------- Date helpers & presets -----------------
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
  const dt = new Date(d);
  dt.setMonth(d.getMonth() + n);
  return dt;
}
function startOfYear(d = new Date()) {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}
function endOfYear(d = new Date()) {
  return new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999);
}

const PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" }, // ← NEW
  { key: "this_month", label: "This Month" },
  { key: "last_month", label: "Last Month" },
  { key: "last_3_months", label: "Last 3 Months" },
  { key: "this_year", label: "This Year" },
  { key: "custom", label: "Custom Range" },
] as const;

type PresetKey = (typeof PRESETS)[number]["key"];

function resolveRange(
  preset: PresetKey,
  custom?: { start?: Date; end?: Date }
) {
  const now = new Date();
  switch (preset) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "yesterday": {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }
    case "this_month":
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case "last_month": {
      const prev = addMonths(now, -1);
      return { start: startOfMonth(prev), end: endOfMonth(prev) };
    }
    case "last_3_months":
      return { start: startOfMonth(addMonths(now, -2)), end: endOfMonth(now) };
    case "this_year":
      return { start: startOfYear(now), end: endOfYear(now) };
    case "custom":
    default:
      return {
        start: custom?.start ?? startOfMonth(now),
        end: custom?.end ?? endOfDay(now),
      };
  }
}

// ----------------- Format helpers -----------------
function nf(n: number, opts?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(undefined, opts).format(n);
}
function minutesFromSeconds(s?: number | null) {
  return (s ?? 0) / 60;
}
function tsToDate(ts?: Timestamp | null): Date | null {
  if (!ts) return null;
  try {
    return ts.toDate();
  } catch {
    return null;
  }
}
function fmtDate(ts?: Timestamp | null) {
  const d = tsToDate(ts);
  return d ? d.toLocaleDateString() : "—";
}
function fmtTime(ts?: Timestamp | null) {
  const d = tsToDate(ts);
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

// ============================================================

export default function AssistantDashboardVapi({
  assistantId,
  pageSize = 200,
}: {
  assistantId: string;
  pageSize?: number;
}) {
  // Period + custom range
  const [preset, setPreset] = useState<PresetKey>("today");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  // Data + UI state
  const [loading, setLoading] = useState<boolean>(false);
  const [rows, setRows] = useState<CallListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Drawer
  const [drawerId, setDrawerId] = useState<string | null>(null);

  // View switch
  const [view, setView] = useState<ViewMode>("log");

  // Resolve the date range (JS Date for Firestore query)
  const { start, end } = useMemo(() => {
    const cs = customStart ? new Date(customStart) : undefined;
    const ce = customEnd ? new Date(customEnd) : undefined;
    return resolveRange(preset, { start: cs, end: ce });
  }, [preset, customStart, customEnd]);

  // Sync now → pull from Vapi to Firestore (server-side)
  async function syncNow() {
    const params = new URLSearchParams({ assistantId });
    const res = await fetch(`/api/vapi/sync?${params}`, { method: "GET" });
    // we intentionally ignore the response body; UI reload happens below
    void loadData(); // refetch after sync
  }

  // Fetch from Firestore (client-side)
  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const db = getFirestore(firebaseApp);

      const col = collection(db, "callLogs");
      // IMPORTANT: Firestore requires a composite index for this query.
      // If you get "This query requires an index", click the link Firestore prints.
      const qy = query(
        col,
        where("assistantId", "==", assistantId),
        where("startTime", ">=", Timestamp.fromDate(start)),
        where("startTime", "<=", Timestamp.fromDate(end)),
        orderBy("startTime", "desc")
      );

      const snap = await getDocs(qy);
      const arr: CallListItem[] = snap.docs.slice(0, pageSize).map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          id: d.id,
          assistantId: String(data.assistantId ?? assistantId),
          startTime: (data.startTime as Timestamp) ?? null,
          endTime: (data.endTime as Timestamp) ?? null,
          durationSeconds:
            typeof data.durationSeconds === "number"
              ? (data.durationSeconds as number)
              : null,
          status: (data.status as string) ?? null,
          from: (data.from as string) ?? null,
          to: (data.to as string) ?? null,
          recordingUrl: (data.recordingUrl as string) ?? null,
          transcript: (data.transcript as string) ?? null,
        };
      });

      setRows(arr);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load calls from Firestore"
      );
    } finally {
      setLoading(false);
    }
  }

  // Initial + whenever range/assistant changes
  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantId, start.getTime(), end.getTime()]);

  // KPI totals
  const totalCalls = rows.length;
  const totalMinutes = useMemo(
    () =>
      rows.reduce(
        (acc, it) => acc + minutesFromSeconds(it.durationSeconds),
        0
      ),
    [rows]
  );
  const avgMinutes = totalCalls ? totalMinutes / totalCalls : 0;

  // Hourly Analysis dataset
  const hourlyData = useMemo(() => {
    // Bucket by hour label
    const map = new Map<string, number>();
    rows.forEach((r) => {
      const d = tsToDate(r.startTime);
      if (!d) return;
      const label = d.toLocaleTimeString([], { hour: "2-digit" }); // "01 AM"
      map.set(label, (map.get(label) ?? 0) + 1);
    });
    // Sort by hour in 24h to preserve order
    const sorted = Array.from(map.entries())
      .map(([k, v]) => {
        // Parse hour from k like "01 AM"/"13"
        const dt = new Date();
        const parsed = new Date(
          `${dt.toDateString()} ${k}`
        ).getHours(); /* fallback if locale varies */
        return { label: k, hour: parsed, calls: v };
      })
      .sort((a, b) => a.hour - b.hour)
      .map(({ label, calls }) => ({ label, calls }));
    return sorted;
  }, [rows]);

  return (
    <div>
      {/* Filters Row */}
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
          <label className="text-sm text-gray-600">Custom Start</label>
          <input
            type="datetime-local"
            className="w-full border rounded-xl p-2 mt-1"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            disabled={preset !== "custom"}
          />
        </div>
        <div>
          <label className="text-sm text-gray-600">Custom End</label>
          <input
            type="datetime-local"
            className="w-full border rounded-xl p-2 mt-1"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            disabled={preset !== "custom"}
          />
        </div>
      </div>

      {/* Actions Row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-5">
        <button
          onClick={syncNow}
          className="px-3 py-2 rounded-xl border bg-white hover:bg-gray-50"
        >
          Sync now
        </button>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-gray-600">View</span>
          <select
            className="border rounded-xl p-2"
            value={view}
            onChange={(e) => setView(e.target.value as ViewMode)}
          >
            <option value="log">Call Log</option>
            <option value="hourly">Hourly Analysis</option>
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-2 text-gray-500 text-sm">
        <span className="opacity-80 font-medium">Metrics</span> —{" "}
        <span className="italic">For Selected Period</span>
      </div>
      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        <KpiCard title="Number of Calls" value={nf(totalCalls)} />
        <KpiCard
          title="Total Minutes"
          value={nf(totalMinutes, {
            maximumFractionDigits: totalMinutes < 100 ? 1 : 0,
          })}
          subtitle="Sum of duration in minutes"
        />
        <KpiCard
          title="Average Call Length"
          value={nf(avgMinutes, { maximumFractionDigits: 2 })}
        />
      </div>

      {/* Conditional Views */}
      {view === "hourly" ? (
        <div className="rounded-2xl shadow bg-white border border-gray-100 p-4">
          <div className="px-1 pb-3">
            <div className="font-medium">Hourly Analysis</div>
            <div className="text-sm text-gray-500">
              Calls grouped by call start time (hour)
            </div>
          </div>
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <LineChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="calls"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl shadow bg-white border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b">
            <div className="font-medium">Call Log</div>
            <div className="text-sm text-gray-500">
              For the selected date or date range
            </div>
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
                    <td
                      className="py-6 px-3 text-gray-400"
                      colSpan={5}
                    >
                      No calls in this period.
                    </td>
                  </tr>
                ) : (
                  rows.map((it) => {
                    const mins = it.durationSeconds
                      ? Math.round(it.durationSeconds / 60)
                      : 0;
                    return (
                      <tr
                        key={it.id}
                        className="border-b last:border-0 hover:bg-gray-50"
                      >
                        <td className="py-2 px-3 whitespace-nowrap text-sm">
                          {fmtDate(it.startTime)}
                        </td>
                        <td className="py-2 px-3 text-sm">
                          {it.from || "—"}
                        </td>
                        <td className="py-2 px-3 text-sm">
                          {fmtTime(it.startTime)}
                        </td>
                        <td className="py-2 px-3 text-sm text-right">
                          {mins} min
                        </td>
                        <td className="py-2 px-3 text-sm text-right">
                          <button
                            className="underline"
                            onClick={() => setDrawerId(it.id)}
                          >
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
      )}

      {/* Drawer */}
      {drawerId && (
        <div
          className="fixed inset-0 bg-black/30 flex"
          onClick={() => setDrawerId(null)}
        >
          <div
            className="ml-auto w-full max-w-xl h-full bg-white p-5 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="text-lg font-semibold">
                Call {drawerId.slice(0, 8)}…
              </div>
              <button
                className="px-3 py-1 rounded-xl border"
                onClick={() => setDrawerId(null)}
              >
                Close
              </button>
            </div>
            {(() => {
              const d = rows.find((r) => r.id === drawerId);
              if (!d) return <div className="text-gray-500">No details.</div>;
              const mins = d.durationSeconds
                ? Math.round(d.durationSeconds / 60)
                : 0;
              return (
                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-gray-500">Date:</span>{" "}
                    {fmtDate(d.startTime)}
                  </div>
                  <div>
                    <span className="text-gray-500">Start:</span>{" "}
                    {fmtTime(d.startTime)}
                  </div>
                  <div>
                    <span className="text-gray-500">Duration:</span>{" "}
                    {mins ? `${mins} min` : "—"}
                  </div>
                  <div>
                    <span className="text-gray-500">From:</span>{" "}
                    {d.from || "—"}{" "}
                    <span className="text-gray-500 ml-2">To:</span>{" "}
                    {d.to || "—"}
                  </div>
                  {d.recordingUrl && (
                    <div>
                      <a
                        className="underline"
                        href={d.recordingUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Recording
                      </a>
                    </div>
                  )}
                  {d.transcript && (
                    <div>
                      <div className="text-gray-500 mb-1">Transcript</div>
                      <div className="whitespace-pre-wrap bg-gray-50 border rounded-xl p-3 max-h-80 overflow-auto">
                        {d.transcript}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      <div className="text-xs text-gray-400 mt-3">
        Window: {start.toLocaleString()} → {end.toLocaleString()}
      </div>
    </div>
  );
}

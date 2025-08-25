// components/AssistantDashboardVapi.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
  type QueryConstraint,
  type DocumentData,
} from "firebase/firestore";
import { app as firebaseApp } from "@/lib/firebase";
import dynamic from "next/dynamic";

// Recharts (client-only)
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

type CallRow = {
  id: string;
  assistantId: string;
  startTime?: Timestamp | null;
  endTime?: Timestamp | null;
  durationSeconds?: number | null;
  status?: string | null;
  from?: string | null;
  to?: string | null;
  recordingUrl?: string | null;
  transcript?: string | null;
};

type ViewMode = "log" | "hourly" | "billing" | "billing_history";

// ----------------- Local-time date helpers -----------------
function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function startOfNextMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
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
  { key: "yesterday", label: "Yesterday" },
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
function usd(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(n);
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

// 24-hr ticks 12 AM → 11 PM
const HOUR_LABELS = Array.from({ length: 24 }, (_, h) =>
  new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric" })
);

// Small UI piece
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
  const db = getFirestore(firebaseApp);

  // Period + custom range
  const [preset, setPreset] = useState<PresetKey>("today");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  // Data + UI state
  const [loading, setLoading] = useState<boolean>(false);
  const [rows, setRows] = useState<CallRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Drawer
  const [drawerId, setDrawerId] = useState<string | null>(null);

  // View switch
  const [view, setView] = useState<ViewMode>("log");

  // Sync state
  const [syncing, setSyncing] = useState(false);

  // Billing state
  const [planName, setPlanName] = useState("-");
  const [planMonthlyCalls, setPlanMonthlyCalls] = useState(0);
  const [planMonthlyFee, setPlanMonthlyFee] = useState(0);
  const [planStartMonth, setPlanStartMonth] = useState<string | null>(null);
  const [planOverageFee, setPlanOverageFee] = useState(0);
  const [callsThisMonth, setCallsThisMonth] = useState(0);
  const [billingHistory, setBillingHistory] = useState<
    {
      monthLabel: string;
      planName: string;
      planMonthlyFee: number;
      planMonthlyCalls: number;
      actualCalls: number;
      balance: number;
      overageCount: number;
      overageAmount: number;
      totalInvoiced: number;
    }[]
  >([]);

  // Resolve the date range (local time)
  const { start, end } = useMemo(() => {
    const cs = customStart ? new Date(customStart) : undefined;
    const ce = customEnd ? new Date(customEnd) : undefined;
    return resolveRange(preset, { start: cs, end: ce });
  }, [preset, customStart, customEnd]);

  // Sync now → pull from Vapi to Firestore (server-side), for THIS window
  async function syncNow() {
    setSyncing(true);
    try {
      const params = new URLSearchParams({
        assistantId,
        start: start.toISOString(),
        end: end.toISOString(),
      });
      await fetch(`/api/vapi/sync?${params}`, { method: "GET" });
    } catch {
      // ignore network errors here; UI will reload regardless
    } finally {
      setSyncing(false);
      void loadData(); // refresh table after sync
      void loadBillingUsage();
      void loadBillingHistory();
    }
  }

  // Fetch from Firestore (client-side) for the selected range
  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const col = collection(db, "callLogs");
      const constraints: QueryConstraint[] = [
        where("assistantId", "==", assistantId),
        orderBy("startTime", "desc"),
        where("startTime", ">=", Timestamp.fromDate(start)),
        where("startTime", "<=", Timestamp.fromDate(end)),
      ];
      const qy = query(col, ...constraints);
      const snap = await getDocs(qy);
      const arr: CallRow[] = snap.docs.slice(0, pageSize).map((d) => {
        const data = d.data() as DocumentData;
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

  // Billing plan (from users collection)
  async function loadBillingPlan() {
    const usersQ = query(
      collection(db, "users"),
      where("assistantId", "==", assistantId),
      limit(1)
    );
    const snap = await getDocs(usersQ);
    if (!snap.empty) {
      const u = snap.docs[0].data() as DocumentData;
      setPlanName(String(u["Plan Name"] ?? u.planName ?? "—"));
      setPlanMonthlyCalls(
        Number(u["Plan Monthly Calls"] ?? u.planMonthlyCalls ?? 0)
      );
      setPlanMonthlyFee(
        Number(u["Plan Monthly Fee"] ?? u.planMonthlyFee ?? 0)
      );
      setPlanOverageFee(
        Number(u["Plan Overage Fee"] ?? u.planOverageFee ?? 0)
      );
      setPlanStartMonth(
        typeof u["Plan Start Month"] === "string"
          ? u["Plan Start Month"]
          : typeof u.planStartMonth === "string"
          ? u.planStartMonth
          : null
      );
    }
  }

  // Calls in current calendar month (strict window: >= firstOfMonth, < firstOfNextMonth)
  async function loadBillingUsage() {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const nextMonthStart = startOfNextMonth(now);

    const snap = await getDocs(
      query(
        collection(db, "callLogs"),
        where("assistantId", "==", assistantId),
        where("startTime", ">=", Timestamp.fromDate(monthStart)),
        where("startTime", "<", Timestamp.fromDate(nextMonthStart))
      )
    );

    setCallsThisMonth(snap.size);
  }

  // Billing History: month-by-month usage & totals
  async function loadBillingHistory() {
    const snap = await getDocs(
      query(
        collection(db, "callLogs"),
        where("assistantId", "==", assistantId),
        orderBy("startTime", "asc")
      )
    );

    const buckets: Record<string, number> = {};
    snap.forEach((doc) => {
      const d = tsToDate(doc.data().startTime as Timestamp);
      if (!d) return;
      const key = `${d.getFullYear()}-${d.getMonth() + 1}`; // e.g., 2025-8
      buckets[key] = (buckets[key] ?? 0) + 1;
    });

    const history = Object.entries(buckets).map(([key, count]) => {
      const [year, m] = key.split("-");
      const monthLabel = new Date(
        parseInt(year, 10),
        parseInt(m, 10) - 1
      ).toLocaleString(undefined, { month: "long", year: "numeric" });

      const balance = planMonthlyCalls - count;
      const overageCount = Math.max(0, -balance);
      const overageAmount = overageCount * planOverageFee;
      const totalInvoiced = planMonthlyFee + overageAmount;

      return {
        monthLabel,
        planName,
        planMonthlyFee,
        planMonthlyCalls,
        actualCalls: count,
        balance,
        overageCount,
        overageAmount,
        totalInvoiced,
      };
    });

    // newest first
    history.sort((a, b) => {
      const ad = new Date(a.monthLabel).getTime();
      const bd = new Date(b.monthLabel).getTime();
      return bd - ad;
    });

    setBillingHistory(history);
  }

  // Initial & when assistant changes
  useEffect(() => {
    void loadBillingPlan(); // for plan labels in billing views
    void loadBillingUsage();
    void loadBillingHistory();
  }, [assistantId]);

  // When plan settings change, recompute history (fees/allowance impact totals)
  useEffect(() => {
    void loadBillingHistory();
  }, [planMonthlyCalls, planMonthlyFee, planOverageFee]);

  // When the range changes, reload the table/metrics
  useEffect(() => {
    void loadData();
  }, [assistantId, start.getTime(), end.getTime()]);

  // KPI totals (for selected window)
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

  // Hourly Analysis dataset (24 buckets, 12 AM → 11 PM)
  const hourlyData = useMemo(() => {
    const buckets = Array.from({ length: 24 }, () => 0);
    rows.forEach((r) => {
      const d = tsToDate(r.startTime);
      if (!d) return;
      buckets[d.getHours()] += 1;
    });
    return buckets.map((value, hour) => ({
      label: HOUR_LABELS[hour],
      calls: value,
    }));
  }, [rows]);

  return (
    <div>
      {/* Actions + Sync Row (no internal Dashboard header) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-5">
        <button
          onClick={syncNow}
          className="px-3 py-2 rounded-xl border bg-white hover:bg-gray-50"
          disabled={syncing}
        >
          {syncing ? "Syncing…" : "Sync now"}
        </button>
        {syncing && (
          <div className="text-sm text-gray-600">
            <span className="animate-pulse">SYNC in PROGRESS. Please wait…</span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-gray-600">View</span>
          <select
            className="border rounded-xl p-2"
            value={view}
            onChange={(e) => setView(e.target.value as ViewMode)}
          >
            <option value="log">Call Log</option>
            <option value="hourly">Hourly Analysis</option>
            <option value="billing">Billing</option>
            <option value="billing_history">Billing History</option>
          </select>
        </div>
      </div>

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

      {/* KPIs (for selected window) */}
      {view !== "billing" && view !== "billing_history" && (
        <>
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
        </>
      )}

      {/* Views */}
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
      ) : view === "billing" ? (
        <div className="rounded-2xl shadow bg-white border border-gray-100 p-5 space-y-4">
          <div className="font-medium text-lg">Billing — Current Month</div>
          <div className="text-sm text-gray-600">
            Plan: <span className="font-medium">{planName}</span> · Plan Start Date —{" "}
            {planStartMonth ?? "—"}
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <KpiCard title="Plan Monthly Calls" value={nf(planMonthlyCalls)} />
            <KpiCard title="Plan Monthly Fee" value={usd(planMonthlyFee)} />
            <KpiCard title="Overage Fee (per call)" value={usd(planOverageFee)} />
            <KpiCard title="Actual Calls (this month)" value={nf(callsThisMonth)} />
            <KpiCard
              title="Call Balance"
              value={nf(planMonthlyCalls - callsThisMonth)}
              subtitle="Plan Calls - Actual Calls"
            />
            <KpiCard
              title="Estimated Overage"
              value={usd(
                Math.max(0, callsThisMonth - planMonthlyCalls) * planOverageFee
              )}
              subtitle="If balance is negative"
            />
          </div>
        </div>
      ) : view === "billing_history" ? (
        <div className="rounded-2xl shadow bg-white border border-gray-100 p-5 space-y-3">
          <div className="font-medium text-lg">Billing History</div>
          <div className="divide-y">
            {billingHistory.length === 0 ? (
              <div className="py-3 text-gray-500 text-sm">No history yet.</div>
            ) : (
              billingHistory.map((h) => (
                <div key={h.monthLabel} className="py-3 text-sm">
                  <div className="font-medium">{h.monthLabel}</div>
                  <div>
                    Plan: {h.planName} · Fee: {usd(h.planMonthlyFee)} · Calls:{" "}
                    {nf(h.actualCalls)} / {nf(h.planMonthlyCalls)} · Balance:{" "}
                    {nf(h.balance)}
                  </div>
                  <div>
                    Overage: {nf(h.overageCount)} calls · {usd(h.overageAmount)}
                  </div>
                  <div className="font-semibold">
                    Total Invoiced: {usd(h.totalInvoiced)}
                  </div>
                </div>
              ))
            )}
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
                    <td className="py-6 px-3 text-gray-400" colSpan={5}>
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
                        <td className="py-2 px-3 text-sm">{it.from || "—"}</td>
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

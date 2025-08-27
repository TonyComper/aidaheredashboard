// components/AssistantDashboardVapi.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { app as firebaseApp } from "@/lib/firebase";
import dynamic from "next/dynamic";
import { useAuth } from "@/components/AuthProvider"; // ← added

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

type ViewMode = "log" | "hourly" | "billing" | "invoice";

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

// Generate an array of month starts from A → B inclusive
function monthRangeInclusive(from: Date, to: Date) {
  const out: Date[] = [];
  let cur = startOfMonth(from);
  const end = startOfMonth(to);
  while (cur <= end) {
    out.push(new Date(cur));
    cur = addMonths(cur, 1);
  }
  return out;
}

// ----------------- Format helpers -----------------
function nf(n: number, opts?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(undefined, opts).format(n);
}
function usd(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
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
function fmtMonth(d: Date) {
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}

// Robust parser for legacy "Plan Start Month" strings
function parsePlanStartMonth(input?: string | null): Date | null {
  if (!input) return null;

  const cleaned = String(input)
    .replace(/[–—]/g, " ")
    .replace(/,/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const m1 = cleaned.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (m1) {
    const months = [
      "january","february","march","april","may","june",
      "july","august","september","october","november","december"
    ];
    const idx = months.indexOf(m1[1].toLowerCase());
    const year = parseInt(m1[2], 10);
    if (idx >= 0 && year >= 1970 && year <= 9999) {
      return new Date(year, idx, 1, 0, 0, 0, 0);
    }
  }

  let m = cleaned.match(/^(\d{4})[-/](\d{1,2})$/);
  if (m) {
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    if (month >= 0 && month < 12) return new Date(year, month, 1, 0, 0, 0, 0);
  }

  m = cleaned.match(/^(\d{1,2})[-/](\d{4})$/);
  if (m) {
    const month = parseInt(m[1], 10) - 1;
    const year = parseInt(m[2], 10);
    if (month >= 0 && month < 12) return new Date(year, month, 1, 0, 0, 0, 0);
  }

  const fallback = new Date(cleaned);
  if (!isNaN(fallback.getTime()))
    return new Date(fallback.getFullYear(), fallback.getMonth(), 1, 0, 0, 0, 0);

  return null;
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
      <div className="text-3xl font-semibold mt-1 break-words">{value}</div>
      {subtitle && <div className="text-xs text-gray-400 mt-1">{subtitle}</div>}
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="w-full h-3 rounded-full bg-gray-200 overflow-hidden">
      <div
        className={`h-full ${clamped >= 100 ? "bg-red-500" : "bg-green-500"}`}
        style={{ width: `${clamped}%` }}
      />
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
  const { profile, signOutUser } = useAuth(); // ← added

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

  // View switch (+ Billing + Invoice)
  const [view, setView] = useState<ViewMode>("log");

  // Sync state
  const [syncing, setSyncing] = useState<boolean>(false);

  // Billing state
  const [planLoading, setPlanLoading] = useState<boolean>(true);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planName, setPlanName] = useState<string>("-");
  const [planMonthlyCalls, setPlanMonthlyCalls] = useState<number>(0);
  const [planMonthlyFee, setPlanMonthlyFee] = useState<number>(0);
  const [planStartMonth, setPlanStartMonth] = useState<string | null>(null); // for header display
  const [planOverageFee, setPlanOverageFee] = useState<number>(0);
  const [callsThisMonth, setCallsThisMonth] = useState<number>(0);

  // INVOICE HISTORY
  type InvoiceRow = {
    month: string; // e.g., "August 2025"
    planName: string;
    planMonthlyFee: number;
    planMonthlyCalls: number;
    actualCalls: number;
    callBalance: number; // remaining (can be negative)
    callOverageFee: number;
    calculatedOverage: number; // $
    totalInvoice: number; // monthly fee + overage
  };
  const [invoiceLoading, setInvoiceLoading] = useState<boolean>(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [invoiceRows, setInvoiceRows] = useState<InvoiceRow[]>([]);

  // Resolve the date range (local time)
  const { start, end } = useMemo(() => {
    const cs = customStart ? new Date(customStart) : undefined;
    const ce = customEnd ? new Date(customEnd) : undefined;
    return resolveRange(preset, { start: cs, end: ce });
  }, [preset, customStart, customEnd]);

  // -------- SYNC (server route) ----------
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
      // ignore
    } finally {
      setSyncing(false);
      void loadData();
      void loadBillingUsage();

      // Ensure plan is fresh; then (if needed) rebuild invoice with fresh plan
      const fresh = await loadBillingPlan();
      if (view === "invoice") {
        await loadInvoiceHistory(fresh ?? undefined);
      }
    }
  }

  // ✅ Auto-sync once on first mount (and whenever assistantId changes)
  const didAutoSyncRef = useRef(false);
  useEffect(() => {
    if (!assistantId) return;
    if (!didAutoSyncRef.current) {
      didAutoSyncRef.current = true;
      // Fire-and-forget; UI shows Syncing… indicator
      void syncNow();
    }
  }, [assistantId]); // runs when dashboard mounts and when assistantId changes

  // -------- DATA (call logs) ----------
  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const db = getFirestore(firebaseApp);
      const col = collection(db, "callLogs");
      const qy = query(
        col,
        where("assistantId", "==", assistantId),
        orderBy("startTime", "desc"),
        where("startTime", ">=", Timestamp.fromDate(start)),
        where("startTime", "<=", Timestamp.fromDate(end))
      );
      const snap = await getDocs(qy);
      const arr: CallRow[] = snap.docs.slice(0, pageSize).map((d) => {
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

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantId, start.getTime(), end.getTime()]);

  // -------- BILLING (plan + usage) ----------
  async function loadBillingPlan(): Promise<{
    planName: string;
    planMonthlyCalls: number;
    planMonthlyFee: number;
    planOverageFee: number;
    planStartMonth: string | null; // label for header
    planStartDate: Date | null;    // normalized first-of-month Date for logic
  } | null> {
    setPlanLoading(true);
    setPlanError(null);
    try {
      const db = getFirestore(firebaseApp);

      // Find the user document by assistantId
      const usersQ = query(
        collection(db, "users"),
        where("assistantId", "==", assistantId),
        limit(1)
      );
      const usersSnap = await getDocs(usersQ);
      if (usersSnap.empty) {
        setPlanError("No user profile found for this assistant.");
        setPlanLoading(false);
        return null;
      }
      const u = usersSnap.docs[0].data() as Record<string, any>;

      // Support both labeled and camelCase fields
      const _planName = String(u["Plan Name"] ?? u.planName ?? "—");
      const _planMonthlyCalls =
        typeof u["Plan Monthly Calls"] === "number"
          ? (u["Plan Monthly Calls"] as number)
          : typeof u.planMonthlyCalls === "number"
          ? (u.planMonthlyCalls as number)
          : 0;
      const _planMonthlyFee =
        typeof u["Plan Monthly Fee"] === "number"
          ? (u["Plan Monthly Fee"] as number)
          : typeof u.planMonthlyFee === "number"
          ? (u.planMonthlyFee as number)
          : 0;
      const _planOverageFee =
        typeof u["Plan Overage Fee"] === "number"
          ? (u["Plan Overage Fee"] as number)
          : typeof u.planOverageFee === "number"
          ? (u.planOverageFee as number)
          : 0;

      // --- Plan Start Month: prefer Timestamp/epoch, fallback to string ---
      // Accept: "Plan Start Month" (Timestamp or string), planStartMonthTs (Timestamp),
      //         planStartMonthMs (number epoch), planStartMonth (string)
      const rawStart =
        u["Plan Start Month"] ??
        u.planStartMonthTs ??
        u.planStartMonthMs ??
        u.planStartMonth;

      let _planStartDate: Date | null = null;
      let _planStartMonthLabel: string | null = null;

      if (rawStart && typeof rawStart?.toDate === "function") {
        // Firestore Timestamp
        _planStartDate = rawStart.toDate();
      } else if (typeof rawStart === "number" && isFinite(rawStart)) {
        // epoch ms
        _planStartDate = new Date(rawStart);
      } else if (typeof rawStart === "string") {
        // legacy string
        const parsed = parsePlanStartMonth(rawStart);
        if (parsed) _planStartDate = parsed;
        else _planStartMonthLabel = rawStart; // at least show in header
      }

      // Normalize to first day of month (local)
      if (_planStartDate) {
        _planStartDate = new Date(
          _planStartDate.getFullYear(),
          _planStartDate.getMonth(),
          1, 0, 0, 0, 0
        );
        _planStartMonthLabel = _planStartDate.toLocaleString(undefined, {
          month: "long",
          year: "numeric",
        });
      }

      // Update header state
      setPlanName(_planName);
      setPlanMonthlyCalls(_planMonthlyCalls);
      setPlanMonthlyFee(_planMonthlyFee);
      setPlanOverageFee(_planOverageFee);
      setPlanStartMonth(_planStartMonthLabel);

      // Return fresh values to callers (used by invoice loader)
      return {
        planName: _planName,
        planMonthlyCalls: _planMonthlyCalls,
        planMonthlyFee: _planMonthlyFee,
        planOverageFee: _planOverageFee,
        planStartMonth: _planStartMonthLabel,
        planStartDate: _planStartDate,
      };
    } catch (e) {
      setPlanError(
        e instanceof Error ? e.message : "Failed to load billing plan."
      );
      return null;
    } finally {
      setPlanLoading(false);
    }
  }

  async function loadBillingUsage() {
    try {
      const db = getFirestore(firebaseApp);
      const now = new Date();
      const ms = startOfMonth(now);
      const me = endOfMonth(now);

      const qy = query(
        collection(db, "callLogs"),
        where("assistantId", "==", assistantId),
        orderBy("startTime", "desc"),
        where("startTime", ">=", Timestamp.fromDate(ms)),
        where("startTime", "<=", Timestamp.fromDate(me))
      );
      const snap = await getDocs(qy);
      setCallsThisMonth(snap.size);
    } catch {
      setCallsThisMonth(0);
    }
  }

  useEffect(() => {
    void loadBillingPlan();
    void loadBillingUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantId]);

  // KPI totals for log/hourly
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

  // Hourly Analysis dataset (midnight → 11 PM)
  const hourlyData = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: new Date(2000, 0, 1, h, 0, 0).toLocaleTimeString([], {
        hour: "numeric",
      }),
      calls: 0,
    }));
    rows.forEach((r) => {
      const d = tsToDate(r.startTime);
      if (!d) return;
      buckets[d.getHours()].calls += 1;
    });
    return buckets;
  }, [rows]);

  // Billing computations
  const monthLabel = useMemo(
    () =>
      new Date().toLocaleString(undefined, {
        month: "long",
        year: "numeric",
      }),
    []
  );
  const callBalance = planMonthlyCalls - callsThisMonth; // positive => remaining
  const overageCount = Math.max(0, -callBalance); // how many calls above plan
  const overageAmount = overageCount * planOverageFee;

  // -------- Invoice History Loader --------
  async function loadInvoiceHistory(override?: {
    planName?: string;
    planMonthlyCalls?: number;
    planMonthlyFee?: number;
    planOverageFee?: number;
    planStartMonth?: string | null; // unused for logic, display only
    planStartDate?: Date | null;    // preferred source for logic
  }) {
    // Only block on planLoading if we DON'T have an override
    if (!override && (planLoading || planError)) return;

    setInvoiceLoading(true);
    setInvoiceError(null);
    try {
      const db = getFirestore(firebaseApp);
      const now = new Date();

      const pName = override?.planName ?? planName;
      const pCalls = override?.planMonthlyCalls ?? planMonthlyCalls;
      const pFee = override?.planMonthlyFee ?? planMonthlyFee;
      const pOver = override?.planOverageFee ?? planOverageFee;

      // Prefer Timestamp-resolved Date if provided; fallback to parsing legacy header label
      const pStartDate = override?.planStartDate ?? null;

      const parsedStart =
        pStartDate ??
        parsePlanStartMonth(override?.planStartMonth ?? planStartMonth ?? undefined);

      const startFromPlan = parsedStart ?? startOfMonth(now);
      const months = monthRangeInclusive(startFromPlan, now);

      const rows: InvoiceRow[] = [];
      for (const m of months) {
        const ms = startOfMonth(m);
        const me = endOfMonth(m);

        const qy = query(
          collection(db, "callLogs"),
          where("assistantId", "==", assistantId),
          orderBy("startTime", "desc"),
          where("startTime", ">=", Timestamp.fromDate(ms)),
          where("startTime", "<=", Timestamp.fromDate(me))
        );
        const snap = await getDocs(qy);
        const actualCalls = snap.size;

        const balance = pCalls - actualCalls;
        const overCount = Math.max(0, -balance);
        const overage = overCount * pOver;
        const total = pFee + overage;

        rows.push({
          month: fmtMonth(ms),
          planName: pName,
          planMonthlyFee: pFee,
          planMonthlyCalls: pCalls,
          actualCalls,
          callBalance: balance,
          callOverageFee: pOver,
          calculatedOverage: overage,
          totalInvoice: total,
        });
      }

      // ✅ Newest month first (current month at top)
      rows.reverse();

      setInvoiceRows(rows);
    } catch (e) {
      setInvoiceError(
        e instanceof Error ? e.message : "Failed to load invoice history."
      );
    } finally {
      setInvoiceLoading(false);
    }
  }

  // Reload plan then invoice when switching to Invoice view (using fresh values)
  useEffect(() => {
    if (view === "invoice") {
      (async () => {
        const fresh = await loadBillingPlan();
        await loadInvoiceHistory(fresh ?? undefined);
      })();
    }
  }, [view, assistantId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
  {/* Plan header (shows on every view) */}
    <div className="rounded-xl bg-white border border-gray-200 p-4 mb-5">
    {planLoading ? (
    <div className="text-sm text-gray-500">Loading plan…</div>
  ) : planError ? (
    <div className="text-sm text-red-600">{planError}</div>
  ) : (
    <div className="space-y-1 text-base">
      <div>
        <span className="font-medium">Plan Type</span> — {planName || "—"}
      </div>
      <div>
        <span className="font-medium">Plan Start Month</span> —{" "}
        {planStartMonth || "—"}
      </div>
    </div>
     )}
    </div>
        {/* existing content below unchanged */}
        {planLoading ? (
          <div className="text-sm text-gray-500">Loading plan…</div>
        ) : planError ? (
          <div className="text-sm text-red-600">{planError}</div>
        ) : (
          <div className="space-y-1 text-base">
            <div>
              <span className="font-medium">Plan Type</span> — {planName || "—"}
            </div>
            <div>
              <span className="font-medium">Plan Start Month</span> —{" "}
              {planStartMonth || "—"}
            </div>
          </div>
        )}
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

      {/* Actions Row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={syncNow}
            className="px-3 py-2 rounded-xl border bg-white hover:bg-gray-50"
            disabled={syncing}
          >
            {syncing ? "Syncing…" : "Sync now"}
          </button>
          {syncing && (
            <div className="text-sm text-blue-600">
              SYNC in PROGRESS. Please wait…
            </div>
          )}
        </div>

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
            <option value="invoice">Invoice History</option>
          </select>
        </div>
      </div>

      {/* KPIs (hide when Billing/Invoice view is active) */}
      {view !== "billing" && view !== "invoice" && (
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
      ) : view === "billing" ? (
        <div className="rounded-2xl shadow bg-white border border-gray-100 p-5 space-y-6">
          <div>
            <div className="font-medium text-lg">Billing</div>
            <div className="text-sm text-gray-500">
              Plan details and this month’s usage
            </div>
          </div>

          {planLoading ? (
            <div className="text-gray-500">Loading plan…</div>
          ) : planError ? (
            <div className="text-red-600">{planError}</div>
          ) : (
            <>
              {/* List-style summary */}
              <div className="rounded-xl border bg-gray-50 p-4 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600">Current Month/Year</span>
                  <span className="font-medium">{monthLabel}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600">Plan Name</span>
                  <span className="font-medium">{planName}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600">Plan Monthly Fee</span>
                  <span className="font-medium">{usd(planMonthlyFee)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600">Plan Monthly Calls</span>
                  <span className="font-medium">{nf(planMonthlyCalls)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600">Actual Monthly Calls</span>
                  <span className="font-medium">{nf(callsThisMonth)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600">Call Balance</span>
                  <span
                    className={`font-medium ${
                      planMonthlyCalls - callsThisMonth < 0
                        ? "text-red-600"
                        : "text-green-700"
                    }`}
                  >
                    {nf(planMonthlyCalls - callsThisMonth)}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600">Call Overage Fee</span>
                  <span className="font-medium">{usd(planOverageFee)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-gray-600">Calculated Overage</span>
                  <span className="font-semibold">
                    {Math.max(0, callsThisMonth - planMonthlyCalls)} calls ·{" "}
                    {usd(
                      Math.max(0, callsThisMonth - planMonthlyCalls) *
                        planOverageFee
                    )}
                  </span>
                </div>
                {planStartMonth && (
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-600">Plan Start Month</span>
                    <span className="font-medium">{planStartMonth}</span>
                  </div>
                )}
              </div>

              {/* Visual usage bar */}
              <div className="space-y-2">
                <div className="text-sm text-gray-600">
                  Monthly usage ({nf(callsThisMonth)} / {nf(planMonthlyCalls)})
                </div>
                <ProgressBar
                  pct={
                    planMonthlyCalls > 0
                      ? Math.min(100, (callsThisMonth / planMonthlyCalls) * 100)
                      : 0
                  }
                />
              </div>
            </>
          )}
        </div>
      ) : view === "invoice" ? (
        <div className="rounded-2xl shadow bg-white border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b">
            <div className="font-medium">Invoice History</div>
            <div className="text-sm text-gray-500">
              Monthly invoices from plan start to current month
            </div>
          </div>
          {planError ? (
            <div className="p-5 text-red-600">{planError}</div>
          ) : invoiceLoading ? (
            <div className="p-5 text-gray-500">Loading invoice history…</div>
          ) : invoiceError ? (
            <div className="p-5 text-red-600">{invoiceError}</div>
          ) : invoiceRows.length === 0 ? (
            <div className="p-5 text-gray-400">No invoice data.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="text-left text-xs uppercase text-gray-500">
                    <th className="py-2 px-3">Month</th>
                    <th className="py-2 px-3">Plan Name</th>
                    <th className="py-2 px-3 text-right">Plan Monthly Fee</th>
                    <th className="py-2 px-3 text-right">Plan Monthly Calls</th>
                    <th className="py-2 px-3 text-right">Actual Calls</th>
                    <th className="py-2 px-3 text-right">Call Balance</th>
                    <th className="py-2 px-3 text-right">Call Overage Fee</th>
                    <th className="py-2 px-3 text-right">Calculated Overage</th>
                    <th className="py-2 px-3 text-right">Total Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceRows.map((r, idx) => (
                    <tr
                      key={`${r.month}-${idx}`}
                      className="border-b last:border-0"
                    >
                      <td className="py-2 px-3 whitespace-nowrap text-sm">
                        {r.month}
                      </td>
                      <td className="py-2 px-3 text-sm">{r.planName}</td>
                      <td className="py-2 px-3 text-sm text-right">
                        {usd(r.planMonthlyFee)}
                      </td>
                      <td className="py-2 px-3 text-sm text-right">
                        {nf(r.planMonthlyCalls)}
                      </td>
                      <td className="py-2 px-3 text-sm text-right">
                        {nf(r.actualCalls)}
                      </td>
                      <td
                        className={`py-2 px-3 text-sm text-right ${
                          r.callBalance < 0 ? "text-red-600" : "text-green-700"
                        }`}
                      >
                        {nf(r.callBalance)}
                      </td>
                      <td className="py-2 px-3 text-sm text-right">
                        {usd(r.callOverageFee)}
                      </td>
                      <td className="py-2 px-3 text-sm text-right">
                        {usd(r.calculatedOverage)}
                      </td>
                      <td className="py-2 px-3 text-sm text-right font-medium">
                        {usd(r.totalInvoice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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

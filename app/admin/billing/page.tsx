'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { auth, firestore } from '@/lib/firebaseClient';

type FirestoreUserDoc = {
  restaurantCode?: string;
  restaurantName?: string;
  assistantId?: string;
  email?: string;
  planName?: string;
  planMonthlyCalls?: number;
  planMonthlyFee?: number;
  planOverageFee?: number;
  planStartMonth?: string;
};

type BillingRow = {
  restaurantCode: string;
  restaurantName: string;
  assistantId: string;
  email: string;
  planName: string;
  planMonthlyCalls: number;
  planMonthlyFee: number;
  planOverageFee: number;
  planStartMonth: string;
  callsThisMonth: number;
  remainingCalls: number;
  overageCalls: number;
  estimatedOverageRevenue: number;
};

const MONTH_OPTIONS = [
  { value: 0, label: 'January' },
  { value: 1, label: 'February' },
  { value: 2, label: 'March' },
  { value: 3, label: 'April' },
  { value: 4, label: 'May' },
  { value: 5, label: 'June' },
  { value: 6, label: 'July' },
  { value: 7, label: 'August' },
  { value: 8, label: 'September' },
  { value: 9, label: 'October' },
  { value: 10, label: 'November' },
  { value: 11, label: 'December' },
];

function buildYearOptions() {
  const currentYear = new Date().getFullYear();
  return [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
}

function formatCurrency(value: number) {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getMonthDateRange(year: number, month: number) {
  const start = new Date(year, month, 1, 0, 0, 0, 0);
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function getBillingStatus(calls: number, plan: number) {
  if (!plan || plan <= 0) {
    return {
      label: 'No Plan',
      color: 'bg-slate-100 text-slate-700',
    };
  }

  const ratio = calls / plan;

  if (ratio < 0.8) {
    return {
      label: 'Within Plan',
      color: 'bg-emerald-100 text-emerald-700',
    };
  }

  if (ratio <= 1) {
    return {
      label: 'Near Limit',
      color: 'bg-amber-100 text-amber-700',
    };
  }

  return {
    label: 'Overage',
    color: 'bg-red-100 text-red-700',
  };
}

function getUsagePercent(calls: number, plan: number) {
  if (!plan || plan <= 0) return 0;
  return (calls / plan) * 100;
}

function formatPercent(value: number) {
  return `${value.toFixed(0)}%`;
}

export default function AdminBillingPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [rows, setRows] = useState<BillingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      if (!firebaseUser) {
        router.replace('/admin/login');
        return;
      }

      try {
        const adminSnap = await getDoc(doc(firestore, 'adminUsers', firebaseUser.uid));

        if (!adminSnap.exists()) {
          setIsAdmin(false);
          setError('You do not have admin access.');
          return;
        }

        const adminData = adminSnap.data();
        const active = adminData?.active === true;
        const role = adminData?.role;

        if (!active || role !== 'admin') {
          setIsAdmin(false);
          setError('You do not have admin access.');
          return;
        }

        setIsAdmin(true);
      } catch (err: any) {
        console.error('Admin check failed:', err);
        setError(err?.message || 'Failed to verify admin access.');
      } finally {
        setCheckingAuth(false);
      }
    });

    return () => unsub();
  }, [router]);

  const loadBilling = async () => {
    setLoading(true);
    setError('');

    try {
      const { start, end } = getMonthDateRange(selectedYear, selectedMonth);

      const usersSnap = await getDocs(collection(firestore, 'users'));

      const builtRows = await Promise.all(
        usersSnap.docs.map(async (d) => {
          const userData = d.data() as FirestoreUserDoc;

          const restaurantCode = String(userData?.restaurantCode || d.id || '').toLowerCase();
          const restaurantName = String(userData?.restaurantName || restaurantCode || '');
          const assistantId = String(userData?.assistantId || '').trim();
          const email = String(userData?.email || '');
          const planName = String(userData?.planName || '');
          const planMonthlyCalls = Number(userData?.planMonthlyCalls || 0);
          const planMonthlyFee = Number(userData?.planMonthlyFee || 0);
          const planOverageFee = Number(userData?.planOverageFee || 0);
          const planStartMonth = String(userData?.planStartMonth || '');

          let callsThisMonth = 0;

          if (assistantId) {
            const logsQuery = query(
              collection(firestore, 'callLogs'),
              where('assistantId', '==', assistantId),
              orderBy('callDate', 'desc'),
              where('callDate', '>=', Timestamp.fromDate(start)),
              where('callDate', '<=', Timestamp.fromDate(end))
            );

            const logsSnap = await getDocs(logsQuery);
            callsThisMonth = logsSnap.size;
          }

          const remainingCalls = Math.max(planMonthlyCalls - callsThisMonth, 0);
          const overageCalls = Math.max(callsThisMonth - planMonthlyCalls, 0);
          const estimatedOverageRevenue = overageCalls * planOverageFee;

          return {
            restaurantCode,
            restaurantName,
            assistantId,
            email,
            planName,
            planMonthlyCalls,
            planMonthlyFee,
            planOverageFee,
            planStartMonth,
            callsThisMonth,
            remainingCalls,
            overageCalls,
            estimatedOverageRevenue,
          };
        })
      );

      builtRows.sort((a, b) => a.restaurantName.localeCompare(b.restaurantName));
      setRows(builtRows);
    } catch (err: any) {
      console.error('Load billing failed:', err);
      setError(err?.message || 'Failed to load billing data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    loadBilling();
  }, [isAdmin, selectedMonth, selectedYear]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/admin/login');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const yearOptions = useMemo(() => buildYearOptions(), []);

  const selectedMonthLabel = useMemo(() => {
    const found = MONTH_OPTIONS.find((m) => m.value === selectedMonth);
    return found ? `${found.label} ${selectedYear}` : `${selectedYear}`;
  }, [selectedMonth, selectedYear]);

  const totalRestaurants = useMemo(() => rows.length, [rows]);

  const totalIncludedCalls = useMemo(
    () => rows.reduce((sum, row) => sum + row.planMonthlyCalls, 0),
    [rows]
  );

  const totalMonthlyFees = useMemo(
    () => rows.reduce((sum, row) => sum + row.planMonthlyFee, 0),
    [rows]
  );

  const totalActualCalls = useMemo(
    () => rows.reduce((sum, row) => sum + row.callsThisMonth, 0),
    [rows]
  );

  const totalOverageCalls = useMemo(
    () => rows.reduce((sum, row) => sum + row.overageCalls, 0),
    [rows]
  );

  const totalEstimatedOverageRevenue = useMemo(
    () => rows.reduce((sum, row) => sum + row.estimatedOverageRevenue, 0),
    [rows]
  );

  const totalProjectedRevenue = useMemo(
    () => totalMonthlyFees + totalEstimatedOverageRevenue,
    [totalMonthlyFees, totalEstimatedOverageRevenue]
  );

  const overageRestaurantCount = useMemo(
    () => rows.filter((row) => row.overageCalls > 0).length,
    [rows]
  );

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-7xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm text-slate-500">Checking admin access…</div>
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-4xl rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <div className="text-lg font-semibold text-red-600">Access denied</div>
          <div className="mt-2 text-sm text-slate-600">
            {error || 'You do not have permission to view this page.'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-[1900px] space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-2xl font-semibold text-slate-900">Billing</div>
              <div className="text-sm text-slate-500">
                Monthly restaurant usage and billing overview for {selectedMonthLabel}.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/admin"
                className="inline-flex rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                ← Dashboard
              </Link>

              <Link
                href="/admin/restaurants"
                className="inline-flex rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Restaurants
              </Link>

              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 outline-none focus:border-slate-500"
              >
                {MONTH_OPTIONS.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>

              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 outline-none focus:border-slate-500"
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>

              <button
                onClick={loadBilling}
                className="inline-flex rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Reload
              </button>

              <button
                onClick={handleLogout}
                className="inline-flex rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Restaurants</div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {totalRestaurants}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Included Calls</div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {totalIncludedCalls}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Actual Calls</div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {totalActualCalls}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Overage Calls</div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {totalOverageCalls}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Overage Accounts</div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {overageRestaurantCount}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Monthly Base Revenue</div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {formatCurrency(totalMonthlyFees)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Est. Overage Revenue</div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {formatCurrency(totalEstimatedOverageRevenue)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Projected Revenue</div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {formatCurrency(totalProjectedRevenue)}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <div className="text-lg font-semibold text-slate-900">Monthly Billing</div>
            <div className="text-sm text-slate-500">
              Plan usage per restaurant for the selected month and year.
            </div>
          </div>

          {loading ? (
            <div className="p-6 text-sm text-slate-500">Loading billing…</div>
          ) : error ? (
            <div className="p-6 text-sm text-red-600">{error}</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">No billing records found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-slate-600">
                    <th className="px-6 py-3 font-medium">Restaurant</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Usage %</th>
                    <th className="px-6 py-3 font-medium">Assistant ID</th>
                    <th className="px-6 py-3 font-medium">Plan</th>
                    <th className="px-6 py-3 font-medium">Included Calls</th>
                    <th className="px-6 py-3 font-medium">Monthly Fee</th>
                    <th className="px-6 py-3 font-medium">Overage Fee</th>
                    <th className="px-6 py-3 font-medium">Calls This Month</th>
                    <th className="px-6 py-3 font-medium">Remaining</th>
                    <th className="px-6 py-3 font-medium">Overage Calls</th>
                    <th className="px-6 py-3 font-medium">Est. Overage</th>
                    <th className="px-6 py-3 font-medium">Plan Start</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const status = getBillingStatus(row.callsThisMonth, row.planMonthlyCalls);
                    const usagePercent = getUsagePercent(
                      row.callsThisMonth,
                      row.planMonthlyCalls
                    );

                    return (
                      <tr
                        key={row.restaurantCode}
                        className="border-t border-slate-100 hover:bg-slate-50"
                      >
                        <td className="px-6 py-4">
                          <div className="font-medium text-slate-900">{row.restaurantName}</div>
                          <div className="text-xs text-slate-500">{row.restaurantCode}</div>
                        </td>

                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${status.color}`}
                          >
                            {status.label}
                          </span>
                        </td>

                        <td className="px-6 py-4 text-slate-700">
                          <div className="min-w-[90px]">
                            <div className="font-medium text-slate-900">
                              {formatPercent(usagePercent)}
                            </div>
                            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                              <div
                                className={`h-full rounded-full ${
                                  usagePercent > 100
                                    ? 'bg-red-500'
                                    : usagePercent >= 80
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.min(usagePercent, 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4 text-slate-700">
                          <div className="max-w-[220px] truncate">{row.assistantId || '—'}</div>
                        </td>

                        <td className="px-6 py-4 text-slate-700">{row.planName || '—'}</td>

                        <td className="px-6 py-4 text-slate-700">{row.planMonthlyCalls}</td>

                        <td className="px-6 py-4 text-slate-700">
                          {formatCurrency(row.planMonthlyFee)}
                        </td>

                        <td className="px-6 py-4 text-slate-700">
                          {formatCurrency(row.planOverageFee)}
                        </td>

                        <td className="px-6 py-4 font-medium text-slate-900">
                          {row.callsThisMonth}
                        </td>

                        <td className="px-6 py-4 text-slate-700">{row.remainingCalls}</td>

                        <td className="px-6 py-4 text-slate-700">{row.overageCalls}</td>

                        <td className="px-6 py-4 font-medium text-slate-900">
                          {formatCurrency(row.estimatedOverageRevenue)}
                        </td>

                        <td className="px-6 py-4 text-slate-700">
                          {row.planStartMonth || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
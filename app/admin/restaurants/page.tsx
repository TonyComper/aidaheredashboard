'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { get, ref } from 'firebase/database';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import { auth, db, firestore } from '@/lib/firebaseClient';

type RestaurantConfig = {
  assistantId?: string;
  timeZone?: string;
  restaurantDisplayName?: string;
  placeName?: string;
  placeId?: string;
  serpDataId?: string;
  reputation?: {
    active?: boolean;
    lastRefreshAt?: string | number;
    lastPhase1At?: string | number;
    lastPhase2At?: string | number;
    restaurantDisplayName?: string;
    googlePlaceId?: string;
    serpDataId?: string;
  };
};

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

type RestaurantRow = {
  restaurantCode: string;
  displayName: string;
  restaurantName: string;
  email: string;
  planName: string;
  planMonthlyCalls: string;
  planMonthlyFee: string;
  planOverageFee: string;
  planStartMonth: string;
  hasConfig: boolean;
  reputationActive: boolean;
};

function formatCurrency(value: string) {
  if (!value) return '—';

  const num = Number(value);
  if (Number.isNaN(num)) return '—';

  return num.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function AdminRestaurantsPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [rows, setRows] = useState<RestaurantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshingCode, setRefreshingCode] = useState<string>('');

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
        setError('Failed to verify admin access.');
      } finally {
        setCheckingAuth(false);
      }
    });

    return () => unsub();
  }, [router]);

  const loadRestaurants = async () => {
    setLoading(true);
    setError('');

    try {
      const [rtdbSnap, usersSnap] = await Promise.all([
        get(ref(db, 'restaurants')),
        getDocs(collection(firestore, 'users')),
      ]);

      const rtdbData = rtdbSnap.exists() ? rtdbSnap.val() : {};
      const usersMap = new Map<string, FirestoreUserDoc>();

      usersSnap.forEach((d) => {
        usersMap.set(d.id.toLowerCase(), d.data() as FirestoreUserDoc);
      });

      const allCodes = new Set<string>([
        ...Object.keys(rtdbData || {}).map((x) => x.toLowerCase()),
        ...Array.from(usersMap.keys()).map((x) => x.toLowerCase()),
      ]);

      const builtRows: RestaurantRow[] = Array.from(allCodes).map((restaurantCode) => {
        const restaurantNode = rtdbData?.[restaurantCode] || {};
        const config: RestaurantConfig = restaurantNode?.config || {};
        const reputation = config?.reputation || {};
        const userData = usersMap.get(restaurantCode) || {};

        const displayName =
          reputation?.restaurantDisplayName ||
          config?.restaurantDisplayName ||
          userData?.restaurantName ||
          restaurantCode;

        return {
          restaurantCode,
          displayName,
          restaurantName: userData?.restaurantName || displayName || '',
          email: userData?.email || '',
          planName: userData?.planName || '',
          planMonthlyCalls:
            userData?.planMonthlyCalls != null ? String(userData.planMonthlyCalls) : '',
          planMonthlyFee:
            userData?.planMonthlyFee != null ? String(userData.planMonthlyFee) : '',
          planOverageFee:
            userData?.planOverageFee != null ? String(userData.planOverageFee) : '',
          planStartMonth: userData?.planStartMonth || '',
          hasConfig: !!restaurantNode?.config,
          reputationActive: reputation?.active === true,
        };
      });

      builtRows.sort((a, b) => a.displayName.localeCompare(b.displayName));
      setRows(builtRows);
    } catch (err: any) {
      console.error('Load restaurants failed:', err);
      setError('Failed to load restaurants.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    loadRestaurants();
  }, [isAdmin]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/admin/login');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  const handleRefreshReputation = async (restaurantCode: string) => {
    setRefreshingCode(restaurantCode);

    try {
      const res = await fetch(
        `https://us-central1-askaida-dashboard.cloudfunctions.net/refreshRestaurantReputation?restaurantCode=${restaurantCode}`,
        {
          method: 'POST',
        }
      );

      const rawText = await res.text();
      console.log(`refreshRestaurantReputation ${restaurantCode}:`, rawText);

      let json: any = {};
      try {
        json = rawText ? JSON.parse(rawText) : {};
      } catch (e) {
        console.error('Failed to parse refresh JSON response:', e);
      }

      if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || rawText || 'Failed to refresh reputation');
      }

      alert(`Reputation refresh completed for ${restaurantCode}`);
      await loadRestaurants();
    } catch (err: any) {
      console.error(err);
      alert(err?.message || 'Failed to refresh reputation');
    } finally {
      setRefreshingCode('');
    }
  };

  const totalRestaurants = useMemo(() => rows.length, [rows]);

  const configuredCount = useMemo(
    () => rows.filter((r) => r.hasConfig).length,
    [rows]
  );

  const reputationActiveCount = useMemo(
    () => rows.filter((r) => r.reputationActive).length,
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
      <div className="mx-auto max-w-[1400px] space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="text-2xl font-semibold text-slate-900">Restaurants</div>
              <div className="text-sm text-slate-500">
                Admin management of restaurant onboarding, billing config, and reputation.
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
    href="/admin/billing"
    className="inline-flex rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
  >
    Billing
  </Link>

  <Link
    href="/admin/restaurants/new"
    className="inline-flex rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
  >
    Add New Restaurant
  </Link>

  <button
    onClick={loadRestaurants}
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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Total Restaurants</div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {totalRestaurants}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Configured in RTDB</div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {configuredCount}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Reputation Active</div>
            <div className="mt-2 text-3xl font-semibold text-slate-900">
              {reputationActiveCount}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <div className="text-lg font-semibold text-slate-900">Restaurant List</div>
            <div className="text-sm text-slate-500">
              Clean admin view of restaurant plan, contact, and reputation status.
            </div>
          </div>

          {loading ? (
            <div className="p-6 text-sm text-slate-500">Loading restaurants…</div>
          ) : error ? (
            <div className="p-6 text-sm text-red-600">{error}</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">No restaurants found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr className="text-left text-slate-600">
                    <th className="px-6 py-3 font-medium">Code</th>
                    <th className="px-6 py-3 font-medium">Restaurant</th>
                    <th className="px-6 py-3 font-medium">Plan</th>
                    <th className="px-6 py-3 font-medium">Monthly Calls</th>
                    <th className="px-6 py-3 font-medium">Monthly Fee</th>
                    <th className="px-6 py-3 font-medium">Overage</th>
                    <th className="px-6 py-3 font-medium">Plan Start Date</th>
                    <th className="px-6 py-3 font-medium">Email</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const statusLabel = !row.hasConfig
                      ? 'Missing Config'
                      : !row.planName
                      ? 'Needs Plan'
                      : row.reputationActive
                      ? 'Active'
                      : 'Config Only';

                    const statusClass = !row.hasConfig
                      ? 'bg-red-100 text-red-700'
                      : !row.planName
                      ? 'bg-amber-100 text-amber-700'
                      : row.reputationActive
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-700';

                    return (
                      <tr
                        key={row.restaurantCode}
                        className="border-t border-slate-100 hover:bg-slate-50"
                      >
                        <td className="px-6 py-4 font-medium text-slate-900">
                          {row.restaurantCode}
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          <div className="font-medium">{row.displayName}</div>
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {row.planName || '—'}
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {row.planMonthlyCalls || '—'}
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {formatCurrency(row.planMonthlyFee)}
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {formatCurrency(row.planOverageFee)}
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {row.planStartMonth || '—'}
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          <div className="max-w-[220px] truncate">{row.email || '—'}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass}`}
                          >
                            {statusLabel}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-2">
                            <Link
                              href={`/admin/restaurants/${row.restaurantCode}`}
                              className="inline-flex rounded-xl border border-slate-300 px-3 py-2 font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Open
                            </Link>

                            <button
                              onClick={() => handleRefreshReputation(row.restaurantCode)}
                              disabled={refreshingCode === row.restaurantCode}
                              className="inline-flex rounded-xl bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-60"
                            >
                              {refreshingCode === row.restaurantCode
                                ? 'Refreshing…'
                                : 'Refresh'}
                            </button>
                          </div>
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
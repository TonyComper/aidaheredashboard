// app/dashboard/page.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import AssistantDashboard from "@/components/AssistantDashboardVapi";

export default function DashboardPage() {
  const router = useRouter();
  const { user, profile, loading, signOutApp } = useAuth();

  if (loading) return <div className="p-6">Loading…</div>;
  if (!user) {
    router.push("/login");
    return null;
  }
  if (!profile?.assistantId) {
    return <div className="p-6">No assistant configured for your account.</div>;
  }

  // Support both camelCase and labeled Firestore fields
  const planName: string =
    (profile?.planName as string) ?? (profile?.["Plan Name"] as string) ?? "—";
  const planStartMonth: string =
    (profile?.planStartMonth as string) ??
    (profile?.["Plan Start Month"] as string) ??
    "—";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-2xl font-semibold">{profile.restaurantName}</div>

            {/* Exact labels requested */}
            <div className="text-gray-700 text-sm">
              <span className="font-medium">Plan Type</span> — {planName}
            </div>
            <div className="text-gray-600 text-sm">
              <span className="font-medium">Plan Start Month</span> — {planStartMonth}
            </div>
          </div>

          <button
            onClick={signOutApp}
            className="px-3 py-2 rounded-xl border hover:bg-gray-50"
          >
            Sign out
          </button>
        </div>

        {/* Assistant Dashboard */}
        <AssistantDashboard assistantId={profile.assistantId} />
      </div>
    </div>
  );
}

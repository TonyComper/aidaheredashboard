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

  // Allow both camelCase and labeled Firestore fields without typing errors
  const planName: string =
    (profile as any)?.planName ??
    (profile as any)?.["Plan Name"] ??
    "—";

  const planStartMonth: string =
    (profile as any)?.planStartMonth ??
    (profile as any)?.["Plan Start Month"] ??
    "—";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Top bar (no Assistant ID shown) */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-2xl font-semibold">{(profile as any)?.restaurantName ?? "—"}</div>
          </div>
          <button
            onClick={signOutApp}
            className="px-3 py-2 rounded-xl border hover:bg-gray-50"
          >
            Sign out
          </button>
        </div>

        {/* Plan card */}
        <div className="rounded-xl bg-white border border-gray-200 p-4 mb-5">
          <div className="space-y-1 text-base">
            <div>
              <span className="font-medium">Plan Type</span> — {planName}
            </div>
            <div>
              <span className="font-medium">Plan Start Month</span> — {planStartMonth}
            </div>
          </div>
        </div>

        {/* Assistant Dashboard */}
        <AssistantDashboard assistantId={profile.assistantId as string} />
      </div>
    </div>
  );
}

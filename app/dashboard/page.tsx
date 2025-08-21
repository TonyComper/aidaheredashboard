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
  if (!user) { router.push("/login"); return null; }
  if (!profile?.assistantId) return <div className="p-6">No assistant configured for your account.</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-2xl font-semibold">{profile.restaurantName}</div>
            <div className="text-gray-500 text-sm">Assistant: <span className="font-mono">{profile.assistantId}</span></div>
          </div>
          <button onClick={signOutApp} className="px-3 py-2 rounded-xl border">Sign out</button>
        </div>

        {/* For first test, we'll read from Firestore so your sample call shows */}
        <AssistantDashboard assistantId={profile.assistantId} />
      </div>
    </div>
  );
}

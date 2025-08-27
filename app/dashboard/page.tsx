// app/dashboard/page.tsx
"use client";

import React from "react";
import { useAuth } from "@/components/AuthProvider";
import AssistantDashboardVapi from "@/components/AssistantDashboardVapi";

export default function DashboardPage() {
  const { loading, profile, error } = useAuth();

  if (loading) {
    return (
      <div className="p-6 text-sm text-gray-500">
        Loading your account…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-sm text-red-600">
        {error}
      </div>
    );
  }

  if (!profile) {
    // Profile not found (rare if you created it already)
    return (
      <div className="p-6 text-sm text-gray-700">
        No profile found. Please contact support.
      </div>
    );
  }

  if (!profile.assistantId) {
    // ✅ Avoid throwing on first paint; show a friendly message instead
    return (
      <div className="p-6 text-sm text-gray-700">
        No assistant configured for your account yet. If this is a new account, try again in a moment or refresh.
      </div>
    );
  }

  return (
    <div className="p-0">
      <AssistantDashboardVapi assistantId={profile.assistantId} />
    </div>
  );
}

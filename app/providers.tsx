// app/providers.tsx
"use client";

import React from "react";
import AuthProvider from "@/components/AuthProvider"; // ⬅️ default import

export function Providers({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

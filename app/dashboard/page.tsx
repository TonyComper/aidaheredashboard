// app/login/page.tsx
"use client";

import React, { useState } from "react";
import Image from "next/image";
import { useAuth } from "@/components/AuthProvider";

export default function LoginPage() {
  const { signInApp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInApp(email, password);
    } catch (err) {
      setError("Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gray-50">
      <div className="w-full max-w-md bg-white p-6 rounded-2xl shadow">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <Image
            src="/logo1.png"   // stored in /public/logo1.png
            alt="AVAI Logo"
            width={120}
            height={120}
            priority
          />
        </div>

        {/* Login form */}
        <h1 className="text-2xl font-bold text-center mb-4">Login</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded-xl p-3"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded-xl p-3"
            required
          />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}

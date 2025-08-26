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
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md bg-white p-6 rounded-2xl shadow">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <Image
            src="/logo1.png"   // 👈 file in /public/logo1.png
            alt="AVAI Logo"
            width={120}
            height={120}
            priority
          />
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-bold text-center mb-4">Log in</h1>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-xl p-3 mt-1"
              placeholder="owner@restaurant.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded-xl p-3 mt-1"
              required
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-black text-white font-semibold hover:bg-gray-800"
          >
            {loading ? "Signing in…" : "Log in"}
          </button>
        </form>

        {/* Footer links */}
        <div className="mt-4 flex justify-between text-sm">
          <a href="#" className="text-blue-600 hover:underline">
            Forgot password?
          </a>
          <a href="#" className="text-blue-600 hover:underline">
            Create one
          </a>
        </div>
      </div>
    </div>
  );
}

// app/login/page.tsx
"use client";

import React, { useState } from "react";
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
        {/* Heading */}
        <h1 className="text-2xl font-bold text-center mb-4">Log in</h1>

        {/* Form */}
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

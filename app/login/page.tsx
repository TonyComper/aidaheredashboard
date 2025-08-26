// app/login/page.tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

// Firebase auth (fallback + password reset)
import {
  getAuth,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { app as firebaseApp } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();

  // Flexible shim so we don't depend on the exact AuthCtx typing
  const authCtx = useAuth() as any;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // UX message after requesting a password reset
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResetMsg(null);
    setLoading(true);

    try {
      // Try your provider first; fallback to Firebase
      if (typeof authCtx?.signInApp === "function") {
        await authCtx.signInApp(email, password);
      } else if (typeof authCtx?.login === "function") {
        await authCtx.login(email, password);
      } else if (typeof authCtx?.signIn === "function") {
        await authCtx.signIn(email, password);
      } else {
        const auth = getAuth(firebaseApp);
        await signInWithEmailAndPassword(auth, email, password);
      }
      router.push("/dashboard");
    } catch (err: any) {
      const msg =
        err?.code === "auth/invalid-credential"
          ? "Invalid email or password."
          : "Sign-in failed. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(e: React.MouseEvent) {
    e.preventDefault();
    setError(null);
    setResetMsg(null);

    // Require an email to send reset link
    if (!email) {
      setError("Enter your email above, then click “Forgot password?”");
      return;
    }

    try {
      setResetLoading(true);
      const auth = getAuth(firebaseApp);
      await sendPasswordResetEmail(auth, email);
      setResetMsg(
        "If an account exists for that email, a reset link has been sent."
      );
    } catch (err: any) {
      // Common Firebase error codes: auth/invalid-email, auth/user-not-found
      setError("Could not send reset email. Please check the address.");
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gray-50">
      <div className="w-full max-w-md bg-white p-6 rounded-2xl shadow">
        {/* Logo */}
        <div className="flex flex-col items-center mb-6">
          <img src="/logo1.png" alt="AVAI Logo" className="h-48 w-auto" />
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-bold text-center mb-4">Log in</h1>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              type="email"
              placeholder="owner@restaurant.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-xl p-3 mt-1"
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded-xl p-3 mt-1"
              required
              autoComplete="current-password"
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}
          {resetMsg && <p className="text-green-700 text-sm">{resetMsg}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-70"
          >
            {loading ? "Signing in…" : "Log in"}
          </button>
        </form>

        {/* Footer actions (Create one removed) */}
        <div className="mt-4 flex justify-start text-sm">
          <button
            onClick={handleForgotPassword}
            disabled={resetLoading}
            className="text-blue-600 hover:underline disabled:opacity-60"
            type="button"
          >
            {resetLoading ? "Sending…" : "Forgot password?"}
          </button>
        </div>
      </div>
    </div>
  );
}

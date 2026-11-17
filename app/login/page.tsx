
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

import {
  getAuth,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "firebase/auth";
import { app as firebaseApp } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();

  // Preserve existing authentication provider
  const authCtx = useAuth() as any;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResetMsg(null);
    setLoading(true);

    try {
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
      setError("Could not send reset email. Please check the address.");
    } finally {
      setResetLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-[#F44324] bg-white p-3 mt-1 " +
    "text-gray-900 outline-none transition-colors " +
    "focus:border-[#F44324] focus:ring-2 focus:ring-[#F44324]/30";

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white p-6 rounded-2xl shadow">
        {/* AgentL7.ai Logo */}
        <div className="flex flex-col items-center mb-6">
          <img
            src="/agentl7-logo.png"
            alt="AgentL7.ai Logo"
            className="h-48 w-auto max-w-full object-contain"
          />
        </div>

        {/* Restaurant Login Heading */}
        <h1 className="text-2xl font-bold text-center text-black mb-6">
          Restaurant Login
        </h1>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="login-email"
              className="block text-sm font-semibold text-black"
            >
              Email
            </label>

            <input
              id="login-email"
              type="email"
              placeholder="owner@restaurant.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-sm font-semibold text-black"
            >
              Password
            </label>

            <input
              id="login-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm">{error}</p>
          )}

          {resetMsg && (
            <p className="text-green-700 text-sm">{resetMsg}</p>
          )}

          {/* Login Button */}
          <button
            type="submit"
            disabled={loading}
            className={
              "w-full py-3 rounded-xl " +
              "bg-[#F44324] text-white font-semibold " +
              "hover:bg-[#D9361B] transition-colors " +
              "disabled:opacity-70"
            }
          >
            {loading ? "Signing in…" : "Log in"}
          </button>
        </form>

        {/* Forgot Password */}
        <div className="mt-4">
          <button
            onClick={handleForgotPassword}
            disabled={resetLoading}
            className={
              "text-sm font-semibold text-[#F44324] " +
              "hover:underline disabled:opacity-60"
            }
            type="button"
          >
            {resetLoading ? "Sending…" : "Forgot password?"}
          </button>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-gray-500">
          Secure login • Your data is protected
        </p>
      </div>

      {/* Override Chrome autofill blue background */}
      <style jsx>{`
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus {
          -webkit-text-fill-color: #111827;
          -webkit-box-shadow: 0 0 0 1000px #ffffff inset;
          box-shadow: 0 0 0 1000px #ffffff inset;
          caret-color: #111827;
          transition: background-color 9999s ease-in-out 0s;
        }
      `}</style>
    </div>
  );
}

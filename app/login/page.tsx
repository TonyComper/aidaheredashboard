// app/login/page.tsx
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

// Fallback to Firebase Auth if your context doesn't expose a sign-in method
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { app as firebaseApp } from "@/lib/firebase";

export default function LoginPage() {
  const router = useRouter();

  // Use a flexible shim so we don't depend on the exact AuthCtx typing
  const authCtx = useAuth() as any;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Try common method names your AuthProvider might expose:
      if (typeof authCtx?.signInApp === "function") {
        await authCtx.signInApp(email, password);
      } else if (typeof authCtx?.login === "function") {
        await authCtx.login(email, password);
      } else if (typeof authCtx?.signIn === "function") {
        await authCtx.signIn(email, password);
      } else {
        // Fallback: use Firebase Auth directly
        const auth = getAuth(firebaseApp);
        await signInWithEmailAndPassword(auth, email, password);
      }

      // If your provider auto-redirects, this is harmless; otherwise it helps.
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

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gray-50">
      <div className="w-full max-w-md bg-white p-6 rounded-2xl shadow">

        {/* Logo (no extra imports; served from /public/logo1.png) */}
        <div className="flex flex-col items-center mb-6">
          <img
            src="/logo1.png"
            alt="AVAI Logo"
            className="h-56 w-auto"
          />
        </div>

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
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded-xl p-3"
            required
            autoComplete="current-password"
          />
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-70"
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

// app/login/page.tsx
"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

export default function LoginPage() {
  const router = useRouter();
  const { signIn, signUp, resetPassword, loading } = useAuth();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setInfo(null);
    try {
      if (mode === "login") await signIn(email, password);
      else await signUp(email, password);
      router.push("/dashboard");
    } catch (e: any) {
      setErr(e?.message || "Auth error");
    }
  }

  async function onForgot() {
    setErr(null); setInfo(null);
    try {
      if (!email) return setErr("Enter your email, then click Forgot password");
      await resetPassword(email);
      setInfo("Password reset email sent.");
    } catch (e: any) {
      setErr(e?.message || "Failed to send reset email");
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-gray-50 p-6">
      <form onSubmit={onSubmit} className="w-full max-w-md bg-white border border-gray-200 rounded-2xl shadow p-6 space-y-4">
        <div className="text-2xl font-semibold">{mode === "login" ? "Log in" : "Create account"}</div>

        <div>
          <label className="text-sm text-gray-600">Email Address</label>
          <input type="email" className="w-full border rounded-xl p-2 mt-1" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="owner@restaurant.com" required />
        </div>

        <div>
          <label className="text-sm text-gray-600">Password</label>
          <input type="password" className="w-full border rounded-xl p-2 mt-1" value={password} onChange={(e)=>setPassword(e.target.value)} required />
        </div>

        {err && <div className="text-red-600 text-sm">{err}</div>}
        {info && <div className="text-green-600 text-sm">{info}</div>}

        <button disabled={loading} className="w-full py-2 rounded-xl bg-black text-white">
          {mode === "login" ? "Log in" : "Create Account"}
        </button>

        {mode === "login" && (
          <div className="text-right">
            <button type="button" onClick={onForgot} className="text-sm underline">Forgot password?</button>
          </div>
        )}

        <div className="text-sm text-gray-600 text-center">
          {mode === "login" ? (
            <>No account? <button type="button" className="underline" onClick={()=>setMode("signup")}>Create one</button></>
          ) : (
            <>Already have an account? <button type="button" className="underline" onClick={()=>setMode("login")}>Log in</button></>
          )}
        </div>
      </form>
    </div>
  );
}

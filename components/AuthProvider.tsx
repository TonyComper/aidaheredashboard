// components/AuthProvider.tsx
"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  PropsWithChildren,
} from "react";
import { auth, db } from "@/lib/firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  doc,
  getDoc,
  getDocFromServer,
  collection,
  query,
  where,
  limit,
  getDocs,
  type DocumentData,
} from "firebase/firestore";

type Profile = {
  id: string;
  email?: string;
  name?: string;
  assistantId?: string;
  [k: string]: any;
};

type AuthContextShape = {
  user: FirebaseUser | null;
  profile: Profile | null;
  loading: boolean;         // ✅ stays true until profile is fetched (or confirmed absent)
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
};

const AuthCtx = createContext<AuthContextShape | undefined>(undefined);

async function fetchProfileByUidOrEmail(user: FirebaseUser): Promise<Profile | null> {
  // 1) Try users/{uid} from SERVER to avoid empty cache on first login
  const uidRef = doc(db, "users", user.uid);
  try {
    const serverSnap = await getDocFromServer(uidRef);
    if (serverSnap.exists()) {
      return { id: serverSnap.id, ...(serverSnap.data() as DocumentData) };
    }
  } catch {
    // ignore network/cached errors and fall back to getDoc
  }

  // 2) Fallback to normal getDoc (cache or server)
  const snap = await getDoc(uidRef);
  if (snap.exists()) {
    return { id: snap.id, ...(snap.data() as DocumentData) };
  }

  // 3) Fallback: search by email (supports arbitrary doc IDs)
  if (user.email) {
    const qy = query(
      collection(db, "users"),
      where("email", "==", user.email),
      limit(1)
    );
    const res = await getDocs(qy);
    if (!res.empty) {
      const d = res.docs[0];
      return { id: d.id, ...(d.data() as DocumentData) };
    }
  }

  // Not found yet
  return null;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);  // ✅ key change: true until profile resolved
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setError(null);

      if (!u) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const p = await fetchProfileByUidOrEmail(u);
        setProfile(p); // can be null (we’ll handle downstream)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load profile");
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  const value = useMemo<AuthContextShape>(() => ({
    user,
    profile,
    loading,
    error,
    async signIn(email: string, password: string) {
      await signInWithEmailAndPassword(auth, email, password);
    },
    async signOutUser() {
      await signOut(auth);
    },
    async resetPassword(email: string) {
      await sendPasswordResetEmail(auth, email);
    },
  }), [user, profile, loading, error]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

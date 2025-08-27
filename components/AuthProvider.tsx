// components/AuthProvider.tsx
"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
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
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
};

const AuthCtx = createContext<AuthContextShape | undefined>(undefined);

async function fetchProfileByUidOrEmail(user: FirebaseUser): Promise<Profile | null> {
  // Try users/{uid} from SERVER to avoid empty cache on first login
  const uidRef = doc(db, "users", user.uid);
  try {
    const serverSnap = await getDocFromServer(uidRef);
    if (serverSnap.exists()) {
      return { id: serverSnap.id, ...(serverSnap.data() as DocumentData) };
    }
  } catch {
    // ignore and fall back to getDoc
  }

  // Fallback to normal getDoc
  const snap = await getDoc(uidRef);
  if (snap.exists()) {
    return { id: snap.id, ...(snap.data() as DocumentData) };
  }

  // Fallback: search by email (supports arbitrary doc IDs)
  if (user.email) {
    const qy = query(collection(db, "users"), where("email", "==", user.email), limit(1));
    const res = await getDocs(qy);
    if (!res.empty) {
      const d = res.docs[0];
      return { id: d.id, ...(d.data() as DocumentData) };
    }
  }

  return null;
}

function AuthProviderImpl({ children }: PropsWithChildren) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
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
        setProfile(p);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load profile");
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  const value = useMemo<AuthContextShape>(
    () => ({
      user,
      profile,
      loading,
      error,
      async signIn(email: string, password: string) {
        await signInWithEmailAndPassword(auth, email, password);
      },
      async signOutUser() {
        await signOut(auth);
        if (typeof window !== "undefined") {
          window.location.href = "/login"; // ✅ Redirect to login after sign out
        }
      }, // ← missing comma fixed here
      async resetPassword(email: string) {
        await sendPasswordResetEmail(auth, email);
      },
    }),
    [user, profile, loading, error]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
// ✅ Default export to match your import in app/providers.tsx
export default function AuthProvider(props: PropsWithChildren) {
  return <AuthProviderImpl {...props} />;
}
// Hook remains a named export
export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

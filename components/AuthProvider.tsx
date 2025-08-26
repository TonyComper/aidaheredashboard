// components/AuthProvider.tsx
"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  PropsWithChildren,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  type User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  limit,
  type DocumentData,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

/** Shape of the profile document we expose to the app */
export type Profile = {
  uid?: string;
  email: string;
  restaurantName: string;
  assistantId: string;

  // Billing fields (all optional; normalized from Firestore)
  planName?: string;            // from "Plan Name"
  planStartMonth?: string;      // from "Plan Start Month"
  planMonthlyCalls?: number;    // from "Plan Monthly Calls"
  planMonthlyFee?: number;      // from "Plan Monthly Fee"
  planOverageFee?: number;      // from "Plan Overage Fee"
};

type AuthCtx = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOutApp: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("AuthProvider missing in the React tree");
  return v;
}

/** Normalize arbitrary Firestore doc -> Profile */
function mapDocToProfile(data: DocumentData, fallback: { email?: string; uid?: string }): Profile {
  // Support both camelCase keys and spaced field names from your screenshot.
  const getS = (k: string, alt?: string) =>
    (data?.[k] ?? (alt ? data?.[alt] : undefined)) as unknown;
  const getN = (k: string, alt?: string) => {
    const v = getS(k, alt);
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const restaurantName =
    (getS("restaurantName") as string) ??
    (getS("name") as string) ??
    "";

  const assistantId =
    (getS("assistantId") as string) ?? "";

  const planName =
    (getS("planName") as string) ??
    (getS("Plan Name") as string) ??
    undefined;

  const planStartMonth =
    (getS("planStartMonth") as string) ??
    (getS("Plan Start Month") as string) ??
    undefined;

  const planMonthlyCalls =
    getN("planMonthlyCalls", "Plan Monthly Calls");

  const planMonthlyFee =
    getN("planMonthlyFee", "Plan Monthly Fee");

  const planOverageFee =
    getN("planOverageFee", "Plan Overage Fee");

  return {
    uid: typeof data?.uid === "string" ? (data.uid as string) : fallback.uid,
    email:
      (getS("email") as string) ??
      (fallback.email ?? ""),
    restaurantName,
    assistantId,
    planName,
    planStartMonth,
    planMonthlyCalls,
    planMonthlyFee,
    planOverageFee,
  };
}

export default function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        let p: Profile | null = null;

        try {
          // Prefer /users/{uid}
          const byUidRef = doc(db, "users", u.uid);
          const byUidSnap = await getDoc(byUidRef);
          if (byUidSnap.exists()) {
            p = mapDocToProfile(byUidSnap.data(), { email: u.email ?? undefined, uid: u.uid });
          } else if (u.email) {
            // Fallback: first doc with email == u.email
            const q = query(
              collection(db, "users"),
              where("email", "==", u.email),
              limit(1)
            );
            const qs = await getDocs(q);
            if (!qs.empty) {
              p = mapDocToProfile(qs.docs[0].data(), { email: u.email, uid: u.uid });
            }
          }
        } catch {
          // ignore; UI will handle missing profile
        }

        setProfile(p);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const value: AuthCtx = {
    user,
    profile,
    loading,
    signIn: async (email: string, password: string) => {
      await signInWithEmailAndPassword(auth, email, password);
    },
    signUp: async (email: string, password: string) => {
      // Optional: you can keep sign-up open; profile should be pre-provisioned in Firestore
      await createUserWithEmailAndPassword(auth, email, password);
    },
    resetPassword: async (email: string) => {
      await sendPasswordResetEmail(auth, email);
    },
    signOutApp: async () => {
      await signOut(auth);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

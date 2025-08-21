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

/** Shape of the profile document in Firestore: `users/{uid or arbitrary}` */
export type Profile = {
  restaurantName: string;
  assistantId: string;
  email: string;
  uid?: string;
};

type AuthCtx = {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  /** Email/password sign-in */
  signIn: (email: string, password: string) => Promise<void>;
  /** Email/password sign-up (optional; profile must already exist in Firestore for dashboard to work) */
  signUp: (email: string, password: string) => Promise<void>;
  /** Send password reset email */
  resetPassword: (email: string) => Promise<void>;
  /** Sign out */
  signOutApp: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("AuthProvider missing in the React tree");
  return v;
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
          // Prefer a profile doc keyed by uid
          const byUidRef = doc(db, "users", u.uid);
          const byUidSnap = await getDoc(byUidRef);
          if (byUidSnap.exists()) {
            p = byUidSnap.data() as Profile;
          } else if (u.email) {
            // Fallback: profile doc keyed arbitrarily but contains "email" field
            const q = query(
              collection(db, "users"),
              where("email", "==", u.email),
              limit(1)
            );
            const qs = await getDocs(q);
            if (!qs.empty) {
              const data = qs.docs[0].data() as DocumentData;
              // Safely map unknown data to Profile shape
              p = {
                restaurantName: String(data.restaurantName ?? ""),
                assistantId: String(data.assistantId ?? ""),
                email: String(data.email ?? u.email),
                uid: typeof data.uid === "string" ? data.uid : u.uid,
              };
            }
          }
        } catch {
          // Ignore profile fetch errors; UI can show a helpful message
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
    signIn: async (email: string, password: string): Promise<void> => {
      await signInWithEmailAndPassword(auth, email, password);
    },
    signUp: async (email: string, password: string): Promise<void> => {
      await createUserWithEmailAndPassword(auth, email, password);
    },
    resetPassword: async (email: string): Promise<void> => {
      await sendPasswordResetEmail(auth, email);
    },
    signOutApp: async (): Promise<void> => {
      await signOut(auth);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

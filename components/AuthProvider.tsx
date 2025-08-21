"use client";
import React, { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  User,
} from "firebase/auth";
import {
  doc, getDoc, collection, query, where, limit, getDocs,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

type Profile = { restaurantName: string; assistantId: string; email: string; uid?: string };

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
export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("AuthProvider missing");
  return v;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        let p: Profile | null = null;
        try {
          const byUid = await getDoc(doc(db, "users", u.uid));
          if (byUid.exists()) {
            p = byUid.data() as Profile;
          } else if (u.email) {
            const qs = await getDocs(
              query(collection(db, "users"), where("email", "==", u.email), limit(1))
            );
            if (!qs.empty) p = qs.docs[0].data() as Profile;
          }
        } catch {}
        setProfile(p);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return (
    <Ctx.Provider
      value={{
        user,
        profile,
        loading,
        signIn: (e, p) => signInWithEmailAndPassword(auth, e, p),
        signUp: (e, p) => createUserWithEmailAndPassword(auth, e, p),
        resetPassword: (e) => sendPasswordResetEmail(auth, e),
        signOutApp: () => signOut(auth),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

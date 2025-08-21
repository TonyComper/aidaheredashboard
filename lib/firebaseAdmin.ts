// lib/firebaseAdmin.ts
import { getApps, initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const rawKey = process.env.FIREBASE_PRIVATE_KEY;

// Support both styles: with literal "\n" or actual newlines
const privateKey = rawKey?.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;

if (!getApps().length) {
  if (projectId && clientEmail && privateKey) {
    initializeApp({
      credential: cert({ projectId, client_email: clientEmail, private_key: privateKey }),
    });
  } else {
    console.warn("Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY");
    // Fallback if you’re running on GCP where ADC is available:
    try { initializeApp({ credential: applicationDefault() }); } catch {}
  }
}

export const adminDb = getFirestore();

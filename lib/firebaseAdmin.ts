// lib/firebaseAdmin.ts
import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY;

// If the key is provided with \n escapes (Vercel / .env style), convert to real newlines
if (privateKey && privateKey.includes("\\n")) {
  privateKey = privateKey.replace(/\\n/g, "\n");
}

if (!getApps().length) {
  if (projectId && clientEmail && privateKey) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,  // ✅ camelCase key
        privateKey,   // ✅ camelCase key
      } as ServiceAccount),
    });
  } else {
    // Won't crash builds if you're missing envs; Firestore usage will fail at runtime instead.
    console.warn("Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY");
  }
}

export const adminDb = getFirestore();

// lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA1W2_1Pa2O9dzZ3gXUqei-cmt5Vzz1Huw",
  authDomain: "askaida-dashboard.firebaseapp.com",
  databaseURL: "https://askaida-dashboard-default-rtdb.firebaseio.com",
  projectId: "askaida-dashboard",
  storageBucket: "askaida-dashboard.firebasestorage.app",
  messagingSenderId: "294355095726",
  appId: "1:294355095726:web:f70af1939503b4576f5d3f"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);

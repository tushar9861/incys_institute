import registeredApp from "../config/firebase.web.json";
import { authMode } from "./auth-config";

// Firebase web configuration is public client metadata, not deployment authority.
// Analytics is deliberately not initialized. Local demo development remains opt-in.
export const firebaseEnabled = authMode === "firebase";
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || registeredApp.apiKey,
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || registeredApp.authDomain,
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || registeredApp.projectId,
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    registeredApp.storageBucket,
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
    registeredApp.messagingSenderId,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || registeredApp.appId,
};

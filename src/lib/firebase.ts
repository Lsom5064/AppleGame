import { initializeApp } from "firebase/app";
import {
  browserSessionPersistence,
  getAuth,
  setPersistence,
  signInAnonymously
} from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean);

const firebaseApp = hasFirebaseConfig ? initializeApp(firebaseConfig) : null;

export const firebaseDatabase = firebaseApp ? getDatabase(firebaseApp) : null;
export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;

export async function ensureFirebaseIdentity(): Promise<string | null> {
  if (!firebaseAuth) {
    return null;
  }

  await setPersistence(firebaseAuth, browserSessionPersistence);

  if (firebaseAuth.currentUser) {
    return firebaseAuth.currentUser.uid;
  }

  const credential = await signInAnonymously(firebaseAuth);
  return credential.user.uid;
}

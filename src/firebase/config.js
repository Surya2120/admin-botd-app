import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCUCS9XJ6n3D8qSQBjwt7GCANuTOvr0XEk",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "botd-in.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "botd-in",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://botd-in-default-rtdb.firebaseio.com",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "botd-in.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "760516612703",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:760516612703:web:b316bd8a8cc8584ff8c1ea"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const realtimeDb = getDatabase(app);
export const storage = getStorage(app);

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your Firebase project config
// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCUCS9XJ6n3D8qSQBjwt7GCANuTOvr0XEk",
  authDomain: "botd-in.firebaseapp.com",
  projectId: "botd-in",
  storageBucket: "botd-in.firebasestorage.app",
  messagingSenderId: "760516612703",
  appId: "1:760516612703:web:b316bd8a8cc8584ff8c1ea"
};

// Initialize
const app = initializeApp(firebaseConfig);

// Export services
export const auth = getAuth(app);
export const db = getFirestore(app);
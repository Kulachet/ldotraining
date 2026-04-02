import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseAppletConfig from '../firebase-applet-config.json';

// User's provided values for reference:
// Project ID: n8n real
// Database ID: ai-studio-e531a3c3-5658-4c01-bd28-93734a3f2c9a

// Use environment variables for Netlify deployment with fallback to local config
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseAppletConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "n8n-real.firebaseapp.com",
  projectId: "n8n-real", // Using n8n-real as the standard slug format
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "n8n-real.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseAppletConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseAppletConfig.appId,
};

// If the user's environment specifically says "n8n real" (with space), we respect that
if (import.meta.env.VITE_FIREBASE_PROJECT_ID === "n8n real") {
  firebaseConfig.projectId = "n8n real";
}

if (!firebaseConfig.apiKey) {
  console.error("Firebase API Key is missing! Please check your environment variables.");
}

const app = initializeApp(firebaseConfig);

// FORCE the Database ID as requested by the user
const databaseId = "ai-studio-e531a3c3-5658-4c01-bd28-93734a3f2c9a";

console.log("Firebase Configuration (FORCED):");
console.log("- Project ID:", firebaseConfig.projectId);
console.log("- Database ID:", databaseId);
console.log("- Auth Domain:", firebaseConfig.authDomain);

export const db = getFirestore(app, databaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);

// Connection test
import { doc, getDocFromCache, getDocFromServer } from 'firebase/firestore';
const testConnection = async () => {
  try {
    // Try to get a non-existent doc just to test connection
    await getDocFromServer(doc(db, '_connection_test', 'test'));
    console.log("Firestore connection successful.");
  } catch (error) {
    console.error("Firestore connection failed:", error);
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration and Database ID.");
    }
  }
};
testConnection();

export default app;

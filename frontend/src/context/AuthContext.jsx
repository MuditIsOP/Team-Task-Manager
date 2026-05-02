import axios from "axios";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { initializeApp } from "firebase/app";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

const googleProvider = new GoogleAuthProvider();
const AuthContext = createContext(null);

async function syncUserWithBackend(user) {
  const token = await user.getIdToken();
  const apiUrl = import.meta.env.VITE_API_URL;

  if (!apiUrl) {
    return;
  }

  await axios.post(
    `${apiUrl}/auth/verify`,
    { token },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch(() => undefined);

    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);

      if (nextUser) {
        try {
          await syncUserWithBackend(nextUser);
        } catch (error) {
          console.error("Failed to sync Firebase user with backend", error);
        }
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      async signInWithGoogle() {
        const result = await signInWithPopup(auth, googleProvider);
        await syncUserWithBackend(result.user);
        return result.user;
      },
      async signInWithEmail(email, password) {
        try {
          const result = await signInWithEmailAndPassword(auth, email, password);
          await syncUserWithBackend(result.user);
          return result.user;
        } catch (error) {
          if (error.code !== "auth/invalid-credential") {
            throw error;
          }

          const created = await createUserWithEmailAndPassword(auth, email, password);
          await syncUserWithBackend(created.user);
          return created.user;
        }
      },
      async signOut() {
        await firebaseSignOut(auth);
      },
    }),
    [loading, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";

export type Role = "cashier" | "admin";
export type SessionUser = {
  token: string;
  user_id: string;
  name: string;
  role: Role;
};

type Ctx = {
  user: SessionUser | null;
  loading: boolean;
  setUser: (u: SessionUser | null) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);
const KEY = "kebab_blasan_session_v1";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) setUserState(JSON.parse(raw));
      } catch {}
      setLoading(false);
    })();
  }, []);

  const setUser = async (u: SessionUser | null) => {
    setUserState(u);
    if (u) await AsyncStorage.setItem(KEY, JSON.stringify(u));
    else await AsyncStorage.removeItem(KEY);
  };

  const logout = async () => setUser(null);

  return <AuthCtx.Provider value={{ user, loading, setUser, logout }}>{children}</AuthCtx.Provider>;
}

export function useAuth(): Ctx {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("AuthProvider missing");
  return c;
}

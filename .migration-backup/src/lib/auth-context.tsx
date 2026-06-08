import React, { createContext, useContext, useEffect, useState } from "react";
import type { UserProfile } from "@/lib/api";

interface AuthContextType {
  user: UserProfile | null;
  login: (user: UserProfile, token?: string) => void;
  setUser: (user: UserProfile | null, remember?: boolean) => void;
  isLoading: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: () => {},
  setUser: () => {},
  isLoading: true,
  logout: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const saved =
      localStorage.getItem("absensi_user") ||
      sessionStorage.getItem("absensi_user");
    if (saved) {
      try {
        setUserState(JSON.parse(saved));
        setIsLoading(false);
        return;
      } catch {}
    }

    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error("Not authenticated");
      })
      .then((data) => setUserState(data))
      .catch(() => setUserState(null))
      .finally(() => setIsLoading(false));
  }, []);

  const login = (u: UserProfile, token?: string) => {
    setUserState(u);
    sessionStorage.setItem("absensi_user", JSON.stringify(u));
    if (token) sessionStorage.setItem("absensi_token", token);
  };

  const setUser = (u: UserProfile | null, remember = false) => {
    setUserState(u);
    if (u) {
      const storage = remember ? localStorage : sessionStorage;
      storage.setItem("absensi_user", JSON.stringify(u));
      if (remember) localStorage.setItem("absensi_remember", "true");
    }
  };

  const logout = () => {
    fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    localStorage.removeItem("absensi_user");
    localStorage.removeItem("absensi_remember");
    sessionStorage.removeItem("absensi_user");
    sessionStorage.removeItem("absensi_token");
    setUserState(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, setUser, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

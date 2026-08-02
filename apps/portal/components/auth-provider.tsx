"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { io, Socket } from "socket.io-client";
import { apiFetch, getRealtimeUrl } from "@/lib/api";
import { AuthUser, LoginResponse } from "@/lib/types";

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  socket: Socket | null;
  isRealtimeConnected: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);

  const clearSession = useCallback(() => {
    localStorage.removeItem("ride_access_token");
    localStorage.removeItem("ride_user");
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem("ride_access_token");

    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const currentUser = await apiFetch<AuthUser>("/auth/me", { token });
      localStorage.setItem("ride_user", JSON.stringify(currentUser));
      setUser(currentUser);
    } catch {
      clearSession();
    } finally {
      setIsLoading(false);
    }
  }, [clearSession]);

  useEffect(() => {
    void refreshUser();

    const handleExpired = () => {
      clearSession();
      setIsLoading(false);
    };

    window.addEventListener("ride-auth-expired", handleExpired);
    return () => window.removeEventListener("ride-auth-expired", handleExpired);
  }, [clearSession, refreshUser]);

  useEffect(() => {
    const token = localStorage.getItem("ride_access_token");

    if (!user || !token) {
      setSocket((current) => {
        current?.disconnect();
        return null;
      });
      setIsRealtimeConnected(false);
      return;
    }

    const realtimeSocket = io(getRealtimeUrl(), {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 10000,
    });

    const handleConnect = () => setIsRealtimeConnected(true);
    const handleDisconnect = () => setIsRealtimeConnected(false);
    const handleAuthError = () => {
      window.dispatchEvent(new Event("ride-auth-expired"));
    };

    realtimeSocket.on("connect", handleConnect);
    realtimeSocket.on("disconnect", handleDisconnect);
    realtimeSocket.on("realtime.auth.error", handleAuthError);

    setSocket(realtimeSocket);

    return () => {
      realtimeSocket.off("connect", handleConnect);
      realtimeSocket.off("disconnect", handleDisconnect);
      realtimeSocket.off("realtime.auth.error", handleAuthError);
      realtimeSocket.disconnect();
      setIsRealtimeConnected(false);
      setSocket((current) =>
        current === realtimeSocket ? null : current
      );
    };
  }, [user?.id]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiFetch<LoginResponse>("/auth/login", {
      method: "POST",
      skipAuth: true,
      body: JSON.stringify({ email, password }),
    });

    localStorage.setItem("ride_access_token", response.accessToken);
    localStorage.setItem("ride_user", JSON.stringify(response.user));
    setUser(response.user);

    return response.user;
  }, []);

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      socket,
      isRealtimeConnected,
      login,
      logout,
      refreshUser,
    }),
    [
      user,
      isLoading,
      socket,
      isRealtimeConnected,
      login,
      logout,
      refreshUser,
    ]
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

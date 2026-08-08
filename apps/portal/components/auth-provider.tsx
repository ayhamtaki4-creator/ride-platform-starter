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
import {
  ApiError,
  apiFetch,
  clearStoredAuth,
  getRealtimeUrl,
  markRefreshCookieSession,
  refreshAccessToken,
} from "@/lib/api";
import { AuthUser, LoginResponse } from "@/lib/types";

type SessionResponse = Omit<LoginResponse, "refreshToken"> & {
  refreshToken?: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  socket: Socket | null;
  isRealtimeConnected: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (input: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    password: string;
    whatsappOptIn: boolean;
  }) => Promise<AuthUser>;
  logout: () => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [authVersion, setAuthVersion] = useState(0);

  const clearSession = useCallback(() => {
    clearStoredAuth();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    let token = localStorage.getItem("ride_access_token");

    if (!token) {
      token = await refreshAccessToken();
    }

    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const currentUser = await apiFetch<AuthUser>("/auth/me", { token });
      localStorage.setItem("ride_user", JSON.stringify(currentUser));
      setUser(currentUser);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        clearSession();
      } else {
        try {
          const cached = localStorage.getItem("ride_user");
          if (cached) setUser(JSON.parse(cached) as AuthUser);
        } catch {
          // Keep the current in-memory user during a temporary network failure.
        }
      }
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
    const handleRefreshed = () => setAuthVersion((current) => current + 1);

    window.addEventListener("ride-auth-expired", handleExpired);
    window.addEventListener("ride-auth-refreshed", handleRefreshed);
    return () => {
      window.removeEventListener("ride-auth-expired", handleExpired);
      window.removeEventListener("ride-auth-refreshed", handleRefreshed);
    };
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
    const handleAuthError = () => void refreshUser();

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
  }, [authVersion, refreshUser, user?.id]);

  const storeSession = useCallback((response: SessionResponse) => {
    localStorage.setItem("ride_access_token", response.accessToken);
    if (response.refreshToken) {
      localStorage.setItem("ride_refresh_token", response.refreshToken);
      markRefreshCookieSession(false);
    } else {
      localStorage.removeItem("ride_refresh_token");
      markRefreshCookieSession(true);
    }
    localStorage.setItem("ride_user", JSON.stringify(response.user));
    setUser(response.user);
    setAuthVersion((current) => current + 1);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiFetch<SessionResponse>("/auth/login", {
      method: "POST",
      skipAuth: true,
      body: JSON.stringify({ email, password }),
    });

    storeSession(response);
    return response.user;
  }, [storeSession]);

  const register = useCallback(async (input: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    password: string;
    whatsappOptIn: boolean;
  }) => {
    const response = await apiFetch<SessionResponse>("/auth/register", {
      method: "POST",
      skipAuth: true,
      body: JSON.stringify(input),
    });

    storeSession(response);
    return response.user;
  }, [storeSession]);

  const logout = useCallback(() => {
    const refreshToken = localStorage.getItem("ride_refresh_token");
    void apiFetch("/auth/logout", {
      method: "POST",
      skipAuth: true,
      body: JSON.stringify(refreshToken ? { refreshToken } : {}),
    }).catch(() => undefined);
    clearSession();
  }, [clearSession]);

  const value = useMemo(
    () => ({
      user,
      isLoading,
      socket,
      isRealtimeConnected,
      login,
      register,
      logout,
      refreshUser,
    }),
    [
      user,
      isLoading,
      socket,
      isRealtimeConnected,
      login,
      register,
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

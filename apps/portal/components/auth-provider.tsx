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
  AuthRefreshUnavailableError,
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

function readCachedUser() {
  try {
    const cached = localStorage.getItem("ride_user");
    return cached ? (JSON.parse(cached) as AuthUser) : null;
  } catch {
    return null;
  }
}

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

  const preserveCachedSession = useCallback(() => {
    const cached = readCachedUser();
    if (cached) setUser(cached);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      let token = localStorage.getItem("ride_access_token");

      if (!token) {
        token = await refreshAccessToken();
      }

      if (!token) {
        setUser(null);
        return;
      }

      const currentUser = await apiFetch<AuthUser>("/auth/me", { token });
      localStorage.setItem("ride_user", JSON.stringify(currentUser));
      setUser(currentUser);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        clearSession();
      } else {
        // Network errors, Render restarts/timeouts, 429 and 5xx refresh failures
        // must not destroy a valid local session. Keep the last known user and
        // allow polling/socket reconnects to recover when the API returns.
        preserveCachedSession();
      }
    } finally {
      setIsLoading(false);
    }
  }, [clearSession, preserveCachedSession]);

  useEffect(() => {
    void refreshUser();

    const handleExpired = () => {
      clearSession();
      setIsLoading(false);
    };
    const handleRefreshed = () => setAuthVersion((current) => current + 1);
    const handleOnline = () => void refreshUser();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refreshUser();
    };

    window.addEventListener("ride-auth-expired", handleExpired);
    window.addEventListener("ride-auth-refreshed", handleRefreshed);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("ride-auth-expired", handleExpired);
      window.removeEventListener("ride-auth-refreshed", handleRefreshed);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
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
      // Polling-first is more tolerant of Render/Cloudflare connection churn;
      // Socket.IO upgrades to WebSocket automatically when the path is healthy.
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 30_000,
      randomizationFactor: 0.5,
      timeout: 12_000,
    });

    const handleConnect = () => setIsRealtimeConnected(true);
    const handleDisconnect = () => setIsRealtimeConnected(false);
    const handleConnectError = () => setIsRealtimeConnected(false);
    const handleAuthError = () => {
      setIsRealtimeConnected(false);
      void (async () => {
        try {
          const refreshedToken = await refreshAccessToken();
          if (!refreshedToken) {
            clearSession();
            setIsLoading(false);
          }
        } catch (caught) {
          if (!(caught instanceof AuthRefreshUnavailableError)) {
            preserveCachedSession();
          }
          // For a transient refresh outage, keep the session. Socket.IO will
          // retry with backoff and a later API poll/visibility event can refresh.
        }
      })();
    };

    realtimeSocket.on("connect", handleConnect);
    realtimeSocket.on("disconnect", handleDisconnect);
    realtimeSocket.on("connect_error", handleConnectError);
    realtimeSocket.on("realtime.auth.error", handleAuthError);

    setSocket(realtimeSocket);

    return () => {
      realtimeSocket.off("connect", handleConnect);
      realtimeSocket.off("disconnect", handleDisconnect);
      realtimeSocket.off("connect_error", handleConnectError);
      realtimeSocket.off("realtime.auth.error", handleAuthError);
      realtimeSocket.disconnect();
      setIsRealtimeConnected(false);
      setSocket((current) =>
        current === realtimeSocket ? null : current
      );
    };
  }, [authVersion, clearSession, preserveCachedSession, user?.id]);

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

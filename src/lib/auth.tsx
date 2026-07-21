/* -.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.
 * File Name   : auth.tsx
 * Created at  : 2026-07-05
 * Author      : jeefo
 * Purpose     : Client-side auth state — the current account, plus login and
 *               logout. The bearer token lives in localStorage (read by the
 *               Apollo auth link); this provider tracks WHO is logged in.
.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.-.*/
import {createContext, useCallback, useContext, useEffect, useState} from "react";
import type {ReactNode} from "react";
import {useApolloClient} from "@apollo/client";
import {TOKEN_KEY} from "../apollo";
import {LOGIN, LOGOUT, ME_QUERY} from "../graphql/auth";
import {getDeviceId} from "./device";

export type Role = "ADMIN" | "DETECTIVE";

export interface AuthUser {
  id       : number;
  username : string;
  fullName : string | null;
  role     : Role;
  active   : boolean;
}

interface AuthState {
  user    : AuthUser | null;
  loading : boolean;
  isAdmin : boolean;
  login   : (username: string, password: string) => Promise<void>;
  logout  : () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({children}: {children: ReactNode}) {
  const client = useApolloClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // On boot, resolve the stored token to an account (or clear it if stale).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) {setLoading(false); return;}
      try {
        const {data} = await client.query({
          query: ME_QUERY, fetchPolicy: "network-only"});
        if (!cancelled) setUser(data?.me ?? null);
        if (!data?.me) localStorage.removeItem(TOKEN_KEY);
      } catch {
        if (!cancelled) {localStorage.removeItem(TOKEN_KEY); setUser(null);}
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {cancelled = true;};
  }, [client]);

  const login = useCallback(async (username: string, password: string) => {
    // Send this device's stable id so DETECTIVE accounts stay locked to it.
    const {data} = await client.mutate({
      mutation: LOGIN,
      variables: {username, password, deviceId: getDeviceId()}});
    const payload = data?.login;
    if (!payload?.token) throw new Error("Нэвтрэхэд алдаа гарлаа");
    localStorage.setItem(TOKEN_KEY, payload.token);
    // Fresh cache under the new identity, then adopt the account.
    await client.resetStore();
    setUser(payload.user);
  }, [client]);

  const logout = useCallback(async () => {
    try {await client.mutate({mutation: LOGOUT});} catch {/* ignore */}
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    await client.clearStore();
  }, [client]);

  return (
    <AuthContext.Provider value={{
      user, loading, isAdmin: user?.role === "ADMIN", login, logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

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
import {
  AuthApiError,
  AuthErrorKind,
  AuthSession,
  getCurrentSession,
  login as requestLogin,
  logout as requestLogout,
} from "@/lib/api/auth";

export type AuthState =
  | { status: "bootstrapping" }
  | { status: "unauthenticated"; error?: AuthErrorKind }
  | { status: "authenticated"; session: AuthSession; error?: AuthErrorKind }
  | { status: "error"; error: Exclude<AuthErrorKind, "unauthenticated"> };

type AuthContextValue = {
  state: AuthState;
  isSubmitting: boolean;
  bootstrap: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function errorKind(error: unknown): AuthErrorKind {
  return error instanceof AuthApiError ? error.kind : "unexpected";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "bootstrapping" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const bootstrap = useCallback(async () => {
    setState({ status: "bootstrapping" });
    try {
      const session = await getCurrentSession();
      setState({ status: "authenticated", session });
    } catch (error) {
      const kind = errorKind(error);
      setState(
        kind === "unauthenticated"
          ? { status: "unauthenticated" }
          : { status: "error", error: kind },
      );
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void getCurrentSession(controller.signal)
      .then((session) => setState({ status: "authenticated", session }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const kind = errorKind(error);
        setState(
          kind === "unauthenticated"
            ? { status: "unauthenticated" }
            : { status: "error", error: kind },
        );
      });

    return () => controller.abort();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setIsSubmitting(true);
    setState({ status: "unauthenticated" });
    try {
      const session = await requestLogin(username, password);
      setState({ status: "authenticated", session });
    } catch (error) {
      setState({ status: "unauthenticated", error: errorKind(error) });
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const logout = useCallback(async () => {
    if (state.status !== "authenticated") return;

    setIsSubmitting(true);
    try {
      await requestLogout(state.session.csrfToken);
      setState({ status: "unauthenticated" });
    } catch (error) {
      const kind = errorKind(error);
      if (kind === "unauthenticated") {
        setState({ status: "unauthenticated" });
      } else {
        setState({ status: "authenticated", session: state.session, error: kind });
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [state]);

  const value = useMemo(
    () => ({ state, isSubmitting, bootstrap, login, logout }),
    [state, isSubmitting, bootstrap, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}

"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/errors";
import { useAuthStore } from "@/stores/auth";
import { loginSchema, type LoginInput } from "./schemas";

type Phase = "idle" | "submitting" | "redirecting";

export function useLogin() {
  const login = useAuthStore((s) => s.login);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");

  const submit = useCallback(
    async (raw: LoginInput) => {
      setError(null);
      const parsed = loginSchema.safeParse(raw);
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Invalid input");
        return;
      }
      setPhase("submitting");
      try {
        await login(parsed.data.email, parsed.data.password);
        setPhase("redirecting");
        // Client navigation: the store is already seeded with the access token
        // from the login response, and the middleware mints the RSC access-token
        // cookie from the just-set refresh cookie on the way to /dashboard.
        // router.refresh() drops any stale router cache from before sign-in.
        router.replace("/dashboard");
        router.refresh();
      } catch (err) {
        setPhase("idle");
        if (err instanceof ApiError) {
          setError(
            err.status === 401
              ? "Incorrect email or password."
              : err.displayMessage || "Unable to sign in. Please try again.",
          );
        } else {
          setError("Unable to sign in. Please check your connection and try again.");
        }
      }
    },
    [login, router],
  );

  return { submit, error, phase, pending: phase !== "idle" };
}

export function useCurrentUser() {
  return useAuthStore((s) => s.user);
}

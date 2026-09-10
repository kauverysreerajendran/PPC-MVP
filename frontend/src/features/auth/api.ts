import { api } from "@/lib/api/client";
import type { TokenResponse, User } from "@/lib/api/types";
import type { LoginInput, RegisterInput } from "./schemas";

export const authApi = {
  register: (input: RegisterInput) => api.post<User>("/auth/register", input),
  login: (input: LoginInput) => api.post<TokenResponse>("/auth/login", input),
  logout: () => api.post<void>("/auth/logout"),
  me: (accessToken?: string) =>
    api.get<User>("/auth/me", accessToken ? { accessToken } : {}),
};

/**
 * Hand-maintained mirror of the backend contract used until `npm run gen:api`
 * generates `schema.d.ts` from ../openapi.json. Feature modules should import
 * from here so a contract change surfaces as a typecheck failure.
 */

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; size: number; total: number; pages: number };
}

export type Role = "owner" | "admin" | "member" | "viewer";

export interface User {
  id: number;
  email: string;
  full_name: string | null;
  role: Role;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
}

export type ProjectStatus = "active" | "archived";

export interface Project {
  id: number;
  owner_id: number;
  name: string;
  description: string | null;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
}

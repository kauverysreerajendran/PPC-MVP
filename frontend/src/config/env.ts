import { z } from "zod";

/**
 * Environment configuration, validated once at module load.
 * Only NEXT_PUBLIC_* is available in the browser; server-only vars are read
 * lazily so they never leak into the client bundle.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().default("TITAN"),
  NEXT_PUBLIC_API_BASE_URL: z.string().default("/api/v1"),
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
});

const serverSchema = z.object({
  API_INTERNAL_BASE_URL: z.string().url().default("http://backend:8000/api/v1"),
});

export function serverEnv() {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() called in the browser");
  }
  return serverSchema.parse({ API_INTERNAL_BASE_URL: process.env.API_INTERNAL_BASE_URL });
}

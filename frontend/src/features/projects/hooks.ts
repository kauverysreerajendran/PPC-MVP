"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Paginated, Project } from "@/lib/api/types";
import { projectsApi, type ListProjectsParams, type ProjectInput } from "./api";

const keys = {
  all: ["projects"] as const,
  list: (params: ListProjectsParams) => ["projects", "list", params] as const,
};

export function useProjects(params: ListProjectsParams = {}) {
  return useQuery({
    queryKey: keys.list(params),
    queryFn: ({ signal }) => projectsApi.list(params, { signal }),
    staleTime: 30_000,
  });
}

export function useCreateProject(params: ListProjectsParams = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProjectInput) => projectsApi.create(input, crypto.randomUUID()),
    // Optimistic add is safe: creation is idempotency-keyed server-side.
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: keys.list(params) });
      const prev = qc.getQueryData<Paginated<Project>>(keys.list(params));
      if (prev) {
        const optimistic: Project = {
          id: -Date.now(),
          owner_id: 0,
          name: input.name,
          description: input.description ?? null,
          status: "active",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        qc.setQueryData<Paginated<Project>>(keys.list(params), {
          ...prev,
          data: [optimistic, ...prev.data],
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.list(params), ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

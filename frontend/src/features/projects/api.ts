import { api, type RequestOptions } from "@/lib/api/client";
import type { Paginated, Project } from "@/lib/api/types";

export interface ListProjectsParams {
  page?: number;
  size?: number;
  sort?: string;
}

export interface ProjectInput {
  name: string;
  description?: string;
}

export const projectsApi = {
  list: (params: ListProjectsParams = {}, opts: RequestOptions = {}) =>
    api.get<Paginated<Project>>("/projects", { ...opts, query: { ...params } }),

  get: (id: number, opts: RequestOptions = {}) => api.get<Project>(`/projects/${id}`, opts),

  create: (input: ProjectInput, idempotencyKey?: string) =>
    api.post<Project>("/projects", input, {
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
    }),

  update: (id: number, input: Partial<ProjectInput> & { status?: string }) =>
    api.patch<Project>(`/projects/${id}`, input),

  remove: (id: number) => api.delete<void>(`/projects/${id}`),
};

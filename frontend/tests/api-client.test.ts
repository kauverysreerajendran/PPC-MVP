import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";

const okJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.restoreAllMocks());

describe("api client", () => {
  it("returns parsed JSON on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson({ id: 1 })));
    await expect(api.get<{ id: number }>("/projects/1")).resolves.toEqual({ id: 1 });
  });

  it("throws a typed ApiError on 4xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        okJson({ error: { code: "not_found", message: "nope", status: 404 } }, 404),
      ),
    );
    await expect(api.get("/projects/999")).rejects.toBeInstanceOf(ApiError);
  });

  it("retries GET on 500 then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okJson({ error: { code: "x", message: "x", status: 500 } }, 500))
      .mockResolvedValueOnce(okJson({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.get("/projects")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

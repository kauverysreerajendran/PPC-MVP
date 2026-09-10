/** Canonical API error shape (mirrors the backend error schema in docs/api.md). */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    status: number;
    request_id?: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId?: string | undefined;
  readonly details?: unknown;

  constructor(body: ApiErrorBody, fallbackStatus: number) {
    super(body?.error?.message ?? "Request failed");
    this.name = "ApiError";
    this.code = body?.error?.code ?? "unknown";
    this.status = body?.error?.status ?? fallbackStatus;
    this.requestId = body?.error?.request_id;
    this.details = body?.error?.details;
  }

  get isAuthError(): boolean {
    return this.status === 401;
  }

  /** Flatten FastAPI/pydantic validation `details` into readable field messages. */
  get fieldMessages(): string[] {
    if (!Array.isArray(this.details)) return [];
    return this.details
      .map((d) => {
        if (d && typeof d === "object" && "msg" in d) {
          const loc = "loc" in d && Array.isArray((d as { loc: unknown[] }).loc)
            ? (d as { loc: unknown[] }).loc.filter((p) => p !== "body").join(".")
            : "";
          const msg = String((d as { msg: unknown }).msg);
          return loc ? `${loc}: ${msg}` : msg;
        }
        return "";
      })
      .filter(Boolean);
  }

  /** Best human-readable summary: validation details if present, else message. */
  get displayMessage(): string {
    const fields = this.fieldMessages;
    return fields.length ? fields.join(" · ") : this.message;
  }
}

export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super("Network request failed");
    this.name = "NetworkError";
    this.cause = cause;
  }
}

/** Uniform error envelope from TECHNICAL_SPEC.md §9: `{ error: { code, message } }`. */

export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "not_found"
  | "conflict"
  | "too_large"
  | "quota_exceeded"
  | "capacity"
  | "upload_failed"
  | "internal";

const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  not_found: 404,
  conflict: 409,
  too_large: 413,
  quota_exceeded: 402,
  // Our shared free pool is full — a service-side limit, not the user's fault.
  capacity: 503,
  upload_failed: 502,
  internal: 500,
};

export function apiError(code: ApiErrorCode, message: string): Response {
  return Response.json({ error: { code, message } }, { status: STATUS[code] });
}

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
  }

  toResponse(): Response {
    return apiError(this.code, this.message);
  }
}

/** Wraps a handler so an unexpected throw still returns the §9 envelope, not an HTML page. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ApiError) return err.toResponse();
    console.error("[api] unhandled", err);
    return apiError("internal", "Something went wrong on our side. Try again.");
  }
}

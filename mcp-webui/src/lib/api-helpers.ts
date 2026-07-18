import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Standardized API error handler. Returns a NextResponse with appropriate
 * status code and JSON body based on the error type.
 */
export function handleApiError(err: unknown): NextResponse {
  if (err instanceof z.ZodError) {
    return NextResponse.json(
      { error: "Validation failed", details: err.errors },
      { status: 400 }
    );
  }
  
  if (err instanceof Error) {
    // We could add custom error classes here for 401, 403, 404
    if (err.message === "Rule not found" || err.message === "Not found") {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err.message === "Provide `access` or `updates`" || err.message === "No paths configured" || err.message === "No commands configured") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
  }

  return NextResponse.json({ error: String(err) }, { status: 500 });
}

/**
 * Validates a body against a Zod schema, throwing standard ZodErrors if invalid.
 */
export async function withValidation<T>(schema: z.ZodSchema<T>, request: Request): Promise<T> {
  const body = await request.json();
  return schema.parse(body);
}

export type RouteHandler<P = any> = (
  request: Request,
  context: { params: Promise<P> }
) => Promise<NextResponse> | NextResponse;

/**
 * Wraps a route handler with standardized try/catch error handling.
 */
export function apiHandler<P = any>(fn: RouteHandler<P>): RouteHandler<P> {
  return async (request, context) => {
    try {
      return await fn(request, context);
    } catch (err) {
      return handleApiError(err);
    }
  };
}

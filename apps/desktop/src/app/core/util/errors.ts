/** Best-effort human message of anything thrown (Error, HttpErrorResponse, string). */
export function errorMessage(err: unknown, fallback: string): string {
  if (typeof err === 'string' && err) return err;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

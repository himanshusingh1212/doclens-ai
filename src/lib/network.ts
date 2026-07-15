/**
 * Network status detection and friendly error messaging.
 *
 * A raw offline fetch surfaces as `TypeError: Failed to fetch`, which is
 * meaningless to end users. These helpers translate that (and other offline
 * states) into a clear, actionable message.
 */

export const OFFLINE_MESSAGE = "No internet connection. Please check your network and try again.";

export function isOnline(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.onLine !== "boolean") return true;
  return navigator.onLine;
}

export function isNetworkError(err: unknown): boolean {
  if (!isOnline()) return true;
  if (err instanceof TypeError) {
    const msg = err.message.toLowerCase();
    return (
      msg.includes("failed to fetch") ||
      msg.includes("network request failed") ||
      msg.includes("networkerror") ||
      msg.includes("load failed")
    );
  }
  return false;
}

export function getFriendlyErrorMessage(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (isNetworkError(err)) return OFFLINE_MESSAGE;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

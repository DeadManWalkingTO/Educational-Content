// --- scheduler.api.js ---
const VERSION = 'v1.0.0';
/*
 * Scheduler API (time-based orchestration)
 * - delay(ms): Promise<void>
 * - repeat(groupId, taskId, fn, intervalMs): start; returns controller
 * - cancel(taskId): void
 * - groupCancel(groupId): void
 * - jitter(ms, rangeMs): number
 * - retry(fn, attempts, backoffMs): Promise<any>
 * No imports, no side-effects.
 */

// --- Export Version ---
export function getVersion() {
  return VERSION;
}

// from line 14: API signatures
export async function delay(ms) {}
export function repeat(groupId, taskId, fn, intervalMs) {}
export function cancel(taskId) {}
export function groupCancel(groupId) {}
export function jitter(ms, rangeMs) {}
export async function retry(fn, attempts, backoffMs) {}

// --- End Of File ---

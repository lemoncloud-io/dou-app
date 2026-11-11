/**
 * What this library's own tests and the app's contract suite reach for, and pages do not: a connection
 * over a channel of the caller's choosing. Not in the published package — its `exports` stop at `.` and
 * `./mock`.
 */
export { connectOver } from './chaticApps';
export type { Transport } from './transport';

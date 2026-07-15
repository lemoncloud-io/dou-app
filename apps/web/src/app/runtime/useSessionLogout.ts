// The relay-logout hook now lives in @chatic/app-runtime (best-effort socket logout + web-core teardown).
// Re-exported here so existing apps/web import paths and their test mocks stay stable.
export { useSessionLogout } from '@chatic/app-runtime';

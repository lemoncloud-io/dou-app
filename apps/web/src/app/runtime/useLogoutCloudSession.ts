// The cloud-logout hook now lives in @chatic/app-runtime (best-effort cloud-socket logout + web-core clear).
// Re-exported here so existing apps/web import paths and their test mocks stay stable.
export { useLogoutCloudSession } from '@chatic/app-runtime';

// The site-switch hook now lives in @chatic/app-runtime (socket-driven SDK `auth.switch`).
// Re-exported here so existing apps/web import paths and their test mocks stay stable.
export { useSiteSwitch } from '@chatic/app-runtime';

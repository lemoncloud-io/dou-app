// The `sync` facade group — the three registration hooks a screen mounts, and the manager handle.
//
// `useSyncTarget` (the generic these three wrap) is deliberately NOT here: every app consumer picks
// one of the three named targets, and the generic is the runtime's own seam (ADR-0076 결정 6 removed
// exactly this category — a public symbol with zero app callers).
export { useChatSync, useChannelSync, usePlaceSync } from './hooks/useSyncTarget';
export { getSyncManager } from './runtime';

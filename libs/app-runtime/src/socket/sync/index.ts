// The `sync` facade group — the three registration hooks a screen mounts, and the manager handle.
//
// `useSyncTarget` (the generic these three wrap) is deliberately NOT here: every app consumer picks
// one of the three named targets, and the generic is the runtime's own seam (ADR-0076 Decision 6 removed
// exactly this category — a public symbol with zero app callers).
export { useChatSync, useChannelSync, usePlaceSync } from './hooks/useSyncTarget';
export { getSyncManager } from './runtime';
// Refusal is a READ for screens — `isChannelRefused` plus its subscription, so a room can say "you
// are not in this conversation" instead of waiting out a timeout it cannot interpret. The writers
// (`recordRefusedChannel` / `clearRefusedChannel`) stay internal: only the sync plans decide what
// the server refused, and an app that could write this could make the room lie.
export { isChannelRefused, subscribeRefusedChannels } from './refusedChannels';

// @chatic/sync — the sync manager, its per-slot runtimes and the plans, and the background receive.
//
// This barrel is what the runtime modules above it read. It sells each module the layers above
// import, whole; a module nothing above imports — `SyncManager`, `BackgroundReceiver`, the plans,
// the timing constants, `unrefTimer` — stays inside. Apps never import it: the root eslint config
// closes it, and they reach sync through `runtime.sync` from @chatic/app-runtime.

// `types.ts` holds no values, so exporting it whole puts only types here.
export * from './types';
export * from './runtime';
export * from './dataGraph';
export * from './refusedChannels';
export * from './roomFeed';
export * from './backgroundDeltas';

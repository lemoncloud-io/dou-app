// Mechanism — the steps a strategy composes. Exported so a caller that needs only one can reach it,
// and so each layer can be tested on its own.
export * from './compress';
export * from './decode';
export * from './package';
export * from './profiles';
export * from './types';

// Strategies — one per output form. Add a form here.
export * from './strategies';

// Policy — a whole request, named. Prefer these at a call site.
export * from './policies';
export * from './prepareImage';

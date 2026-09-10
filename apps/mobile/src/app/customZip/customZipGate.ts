import Config from 'react-native-config';

/**
 * Whether this build may APPLY a custom web zip.
 *
 * A zip URL decides the code the WebView runs next, so it is the same production security surface
 * ADR-0080 결정 13 removed the web-address switcher for. The app's `FloatingMenu` gated the feature
 * with exactly this check — independent of the debug unlock — and moving the controls to the web
 * (결정 11) moves the guard here rather than dropping it.
 *
 * Reads the **baked** `VITE_ENV`, which no web page can set: gating on anything the web supplies
 * would let a compromised bundle unlock the thing being gated (the reason 결정 5 split
 * `env.buildStage` from `env.stage`).
 *
 * A function, not a module-scope constant, so the refusal is testable without reloading modules —
 * the value itself never changes within a run.
 */
export const isCustomZipAllowed = (): boolean => Config.VITE_ENV !== 'PROD';

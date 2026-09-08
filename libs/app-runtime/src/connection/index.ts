// React layer only: hosts, slot binders, and their hooks. Credential recovery used to be wired from
// here as an import side effect — using `RuntimeConnectionHost` was enough to get it — and the cost
// was a boot step that no entry point mentioned and that an import reshuffle could move or drop. It
// now lives in `initAppRuntime`, which is also where the wiring's ordering is stated.

export * from './SocketBinder';
export * from './SocketReauthBinder';
// Both hosts live in one module: they are the same component with guest keep-alive on/off.
export * from './RuntimeConnectionHost';
export * from './hooks/useConnectivity';

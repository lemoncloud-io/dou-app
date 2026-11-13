// @chatic/runtime-mobile/polyfills — the globals React Native's JS engine lacks and the runtime needs.
//
// Imported once, first, from the app's entry file — before anything that draws random numbers is
// loaded, because a module may take its random source when it is evaluated rather than when it is
// called. `createNativeRuntime` checks the result and refuses to build without it.
//
// Hermes has no `crypto.getRandomValues`, and `uuid` and `crypto-js` draw from it (ids, nonces). The
// polyfill asks the OS's secure random generator through a native module — not `Math.random`, which
// is predictable. It leaves an implementation already there alone.
//
// It is the only one: `URL`, `URLSearchParams`, `TextEncoder`, `fetch` and `WebSocket` are React
// Native's own. React Native's `URL` is partial — read-only properties — which is enough for what the
// runtime does with it; the package README says what to watch for.
import 'react-native-get-random-values';

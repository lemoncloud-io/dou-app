// Stub for `@chatic/web-config`. The real module is the repo's single `import.meta.env` holder
// (ADR-0070 결정 6) — isolating env there is what keeps every OTHER module CommonJS-testable, but it
// means this one module cannot be parsed by the transform in tsconfig.spec.json. Same situation as
// `@chatic/assets` above it in jest.config.js, and the same remedy.
//
// Mapped globally rather than mocked per-file because the reach is transitive and grows: any test
// touching `@chatic/app-runtime` pulls DataManager → httpFactory → web-config, so individual
// `jest.mock` calls would be whack-a-mole. Tests that care about a specific env value still override
// with their own `jest.mock('@chatic/web-config', …)`, which takes precedence over this mapping.
//
// Values are shaped by key so callers get something usable rather than `undefined`:
//   WEB_* → a placeholder string (endpoints/ids are only ever concatenated into URLs or compared)
//   get*/has*/is*/clear* → a callable
//
// There is no transport stub here any more: the lemon instance moved to `app-runtime/http/transport`
// (built by `@chatic/http`) and is created lazily, so importing it is inert and suites that exercise
// it mock that module directly.

module.exports = new Proxy(
    {},
    {
        get: (_target, key) => {
            if (key === '__esModule') return true;
            if (typeof key !== 'string') return undefined;
            if (key === 'usePersistentWebStorage') return false;
            if (key === 'LANGUAGE_KEY') return 'i18nextLng';
            if (key.startsWith('WEB_')) return 'https://test.invalid';
            if (/^(get|has|is|clear)/.test(key)) return () => undefined;
            return undefined;
        },
    }
);

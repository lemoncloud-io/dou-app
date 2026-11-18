// Stub for `@chatic/assets`. The real module resolves image URLs with `import.meta.url`, which the
// CommonJS transform in tsconfig.spec.json cannot parse — so requiring it breaks any barrel that
// reaches it (ui/layouts -> PrivateLayout -> @chatic/assets), which is what pushed call sites onto
// barrel-bypassing direct paths.
//
// A recursive Proxy rather than a fixed object: the module exports maps (`Images`, `Logo`, …) whose
// keys grow over time, and tests only ever pass these values to `src`/`href`. Any property — nested
// or not — answers with the stub, and coercing it to a string yields a usable placeholder.
const stub = new Proxy(
    {},
    {
        get: (_target, key) => {
            if (key === '__esModule') return true;
            if (key === Symbol.toPrimitive || key === 'toString') return () => 'test-asset-stub';
            return stub;
        },
    }
);

module.exports = stub;

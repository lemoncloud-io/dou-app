// Stub for `app/utils/buildEnv`. The real module reads `import.meta.env`, which the CommonJS
// transform in tsconfig.spec.json cannot parse — and it is reached from the `app/bridge` barrel
// (push navigation), so without this every test touching the bridge fails to load.
//
// It answers as a production build. A test that needs a development build still mocks the module
// itself (`jest.mock('…/utils/buildEnv', …)`), which replaces this stub.
module.exports = {
    __esModule: true,
    isDevBuild: () => false,
};

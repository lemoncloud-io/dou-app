// `buildEnv.ts` reads `import.meta.env`, which the CommonJS test transform cannot parse. Tests run as a
// release build; one that needs a development build mocks the module itself.
module.exports = { isDevBuild: () => false };

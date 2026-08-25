export * from './chat';
export * from './consts';
export * from './countUnread';
export * from './debounce';
export * from './errors';
// `./phoneNumber` is deliberately absent: it carries libphonenumber's metadata, and this barrel is
// on the eager path, so re-exporting it lands the metadata in the initial chunk (measured). Its
// consumers are all behind lazy routes and import the concrete file.
// `./buildEnv` is deliberately absent: it reads `import.meta.env`, which ts-jest's CommonJS
// transform cannot parse, so re-exporting it here would break every test that touches this barrel.
// `./webVitals` is absent for the same reason — it gates its dev log on `import.meta.env.DEV`.
// Its only consumer is `main.tsx`, which imports the concrete file. `./webVitalsStore` stays:
// it holds the values the debug overlay reads and touches no build-time env.
export * from './placeProfile';
export * from './resolveInAppPushRoute';
export * from './resolvePlaceDisplayName';
export * from './routeTrail';
export * from './sortChannels';
export * from './verification';
export * from './viewport';
export * from './webVitalsStore';

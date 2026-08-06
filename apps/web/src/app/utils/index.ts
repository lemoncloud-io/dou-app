export * from './chat';
export * from './consts';
export * from './debounce';
export * from './errors';
// `./phoneNumber` is deliberately absent: it carries libphonenumber's metadata, and this barrel is
// on the eager path, so re-exporting it lands the metadata in the initial chunk (measured). Its
// consumers are all behind lazy routes and import the concrete file.
// `./buildEnv` is deliberately absent: it reads `import.meta.env`, which ts-jest's CommonJS
// transform cannot parse, so re-exporting it here would break every test that touches this barrel.
export * from './placeProfile';
export * from './webVitals';

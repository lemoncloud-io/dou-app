/**
 * Gateway type mappings, one file per transport — the same axis split the data sources use
 * (`socket-data-sources/` ‖ `http-data-sources/`). See ../../../docs/remote/README.md.
 */
export * from './socket';
export * from './http';

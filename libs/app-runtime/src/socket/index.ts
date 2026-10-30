// The socket layer's own contracts and nothing above them. `socket/auth` and `socket/sync` sit one
// layer higher and are imported by their own paths: re-exporting them here would make this barrel
// an upward edge for anything that only wanted a socket type.
export * from './types';

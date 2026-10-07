// jsdom (jest env) does not expose TextEncoder, which the attachment name check measures with.
// Polyfill globally before any test module imports it.
import { TextEncoder } from 'util';

const globalRef = globalThis as unknown as { TextEncoder?: unknown };
globalRef.TextEncoder = globalRef.TextEncoder ?? TextEncoder;

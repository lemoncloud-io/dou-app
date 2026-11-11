// jsdom (jest env) does not expose TextEncoder/TextDecoder, which the socket lib
// touches at import time. Polyfill globally before any test module imports it.
import { TextDecoder, TextEncoder } from 'util';

const globalRef = globalThis as unknown as { TextEncoder?: unknown; TextDecoder?: unknown };
globalRef.TextEncoder = globalRef.TextEncoder ?? TextEncoder;
globalRef.TextDecoder = globalRef.TextDecoder ?? TextDecoder;

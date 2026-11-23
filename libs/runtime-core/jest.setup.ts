import { TextDecoder, TextEncoder } from 'util';

const globalRef = globalThis as unknown as { TextEncoder?: unknown; TextDecoder?: unknown };
globalRef.TextEncoder = globalRef.TextEncoder ?? TextEncoder;
globalRef.TextDecoder = globalRef.TextDecoder ?? TextDecoder;

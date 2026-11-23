import { TextEncoder } from 'util';

const globalRef = globalThis as unknown as { TextEncoder?: unknown };
globalRef.TextEncoder = globalRef.TextEncoder ?? TextEncoder;

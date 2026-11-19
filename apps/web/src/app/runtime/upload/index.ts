// The native PUT sender an image message can use, taking the bridge it talks through. The page's own
// `xhrPut` lives in `@chatic/runtime-web`; which one a page gets is decided by the files port in
// `src/config/adapters/files.ts`.
export { createNativeTransfers, toPutResult } from './nativePut';
export type { NativeTransfers, NativeTransfersOptions, TransferBridge } from './nativePut';
export { syncFileTransfers } from './transferSync';

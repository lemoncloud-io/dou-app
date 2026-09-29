// The native PUT sender an image message can use, taking the bridge it talks through. The page's own
// `xhrPut` lives in `@chatic/data`; which one a page gets is decided at `bridge/shellUpload.ts`.
export { createNativeTransfers, toPutResult } from './nativePut';
export type { NativeTransfers, NativeTransfersOptions, TransferBridge } from './nativePut';
export { syncFileTransfers } from './transferSync';

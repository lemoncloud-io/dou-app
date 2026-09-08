// @chatic/block-kit — the Block Kit subset this workspace draws, and the reader
// that turns a message body into it.
//
// Two consumers share it: apps/desktop-web renders what the server sends, and
// apps/block-kit-builder composes payloads against the same types. A second copy
// of the renderer would let the builder's preview drift from what a channel
// actually shows, which is the one thing the preview exists to rule out.
export * from './blockKit';
export * from './resolveChatBlocks';
export * from './blocksToPlainText';
export * from './messageClasses';
export * from './renderMrkdwn';
export * from './BlockKitMessage';
export * from './sampleWebhookBlocks';

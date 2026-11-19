import { runtime, type PutPort, type ShellFilePutPort } from '@chatic/runtime';

/**
 * The PUT this host uses, as the host's `files` port says: the app's transfer module where the app moves
 * files, the page's own PUT otherwise.
 */
export const getShellPut = (): PutPort => runtime.files.put;

/**
 * How this shell sends a file it keeps: through the transfer module, from the shell's own folder. Where
 * the page moves files it never has shell files, so it has no such sender.
 */
export const getShellFilePut = (): ShellFilePutPort | undefined => runtime.files.transfers?.putShellFile;

/** Catches up with transfers the shell finished while this page was away. Where the page moves files there are none. */
export const syncShellTransfers = (): Promise<void> => runtime.files.transfers?.syncUploads() ?? Promise.resolve();

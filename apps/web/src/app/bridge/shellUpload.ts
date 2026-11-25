import { runtime, type PutPort, type ShellFilePutPort } from '@chatic/runtime-react';

export const getShellPut = (): PutPort => runtime.files.put;

export const getShellFilePut = (): ShellFilePutPort | undefined => runtime.files.transfers?.putShellFile;

export const syncShellTransfers = (): Promise<void> => runtime.files.transfers?.syncUploads() ?? Promise.resolve();

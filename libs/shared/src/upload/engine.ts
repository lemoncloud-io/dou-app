import { InlineExecutor, PresignedPutExecutor, UploadEngine } from 'lemon-model/upload/engine';

import { toBase64 } from './toBase64';
import { xhrRawPut } from './xhrRawPut';

import type { UploadService } from 'lemon-model/upload';
import type { InlineSendCall, RawPut, UploadTransferExecutor } from 'lemon-model/upload/engine';

export interface BrowserExecutorOptions {
    service: UploadService;
    /** Defaults to the XHR primitive. */
    rawPut?: RawPut;
    /** Defaults to the service's own `send`. */
    inlineSend?: InlineSendCall;
    /**
     * Whether this shell can execute an inline transfer at all.
     *
     * A shell that never holds the bytes in JS — the app, where the native side reads the file and
     * PUTs it — must answer no. Inline would require pulling a whole photo across the bridge as
     * base64, which is the one thing that arrangement exists to avoid, so it is better to declare
     * the method unavailable and let the server refuse the slot outright.
     */
    inline?: boolean;
}

/**
 * The executors a browser shell can run, preferred first.
 *
 * **This array is the declaration.** The engine reports each executor's `kind` as what the client
 * can execute, the server picks the first of those it can also do, and it does NOT fall back. So
 * putting presigned first means presigned for everything the server can presign, and reversing
 * these two lines silently caps every attachment at the inline ceiling (~4.5 MB, the Lambda payload
 * limit minus base64 growth) — below an ordinary phone photo.
 */
export const browserExecutors = ({
    service,
    rawPut = xhrRawPut,
    inlineSend,
    inline = true,
}: BrowserExecutorOptions): UploadTransferExecutor[] => {
    const executors: UploadTransferExecutor[] = [new PresignedPutExecutor(rawPut)];
    if (inline) executors.push(new InlineExecutor(inlineSend ?? ((id, body) => service.send(id, body)), toBase64));
    return executors;
};

export interface UploadEngineOptions extends BrowserExecutorOptions {
    /**
     * Replaces the browser set entirely — for a shell that moves bytes somewhere this process
     * cannot see (a native background session). Such a shell passes its own executor and thereby
     * declares only what it can really do.
     */
    executors?: UploadTransferExecutor[];
}

/**
 * The upload engine for one batch.
 *
 * Inline reports no progress here: its bytes travel through the signed HTTP client, whose request
 * surface deliberately exposes no axios config, so there is nothing to hang an `onprogress` on. The
 * engine treats an unreported file as indeterminate rather than stalled, and the UI shows a spinner
 * for it. Presigned goes out over raw XHR, where progress is real.
 */
export const createUploadEngine = ({ executors, ...options }: UploadEngineOptions): UploadEngine =>
    new UploadEngine(options.service, executors ?? browserExecutors(options));

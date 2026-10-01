import { logger } from '@chatic/bridges';
import type { UploadCompleteInput, UploadStartInput } from '@lemoncloud/chatic-sockets-lib';
import type {
    ChatAttachmentSource,
    PreparedImageMirror,
    PresignedUploadTicket,
    PutResult,
    SendImagePorts,
    UploadPutTarget,
} from './types';
import { UploadResponseShapeError } from './types';

/**
 * The server caps one message at this many attachments; anything past it is left out. The picker
 * is meant to stop the user before this, so here it is a backstop. Exported so the caller can cut
 * the list before it writes the pending row, or the row would show slots that are never sent.
 */
export const IMAGE_MESSAGE_SLOT_MAX = 10;

/** PUTs in flight at once, across the whole message. */
const PUT_CONCURRENCY = 3;

/**
 * Waits before each network retry of the same PUT. Two retries, then the slot fails. Only
 * `no-response: network` is retried — a transfer that answered, or a file that could not be read,
 * will not change by trying again.
 */
const NETWORK_RETRY_DELAYS_MS: readonly number[] = [1000, 3000];

type UploadFailure = NonNullable<UploadCompleteInput['list'][number]['failure']>;

export type SendImageResult =
    /** `failedIndexes`: the picked files left out of the message, by position in the pick. */
    | { status: 'sent'; uploadIds: string[]; failedIndexes: number[] }
    /** Nothing reached `stored`, so no message was sent. */
    | { status: 'failed'; reason: 'no-stored-upload'; failedSlots: number }
    /** A socket operation (start, complete or send) failed; the message as a whole failed. */
    | { status: 'failed'; reason: 'socket'; error: unknown };

export interface SendImageOptions {
    /** Injected for tests. Receives log-safe fields only — never a ticket URL or header. */
    log?: (message: string, data?: Record<string, unknown>) => void;
    /** Injected for tests; defaults to a timer. */
    wait?: (ms: number) => Promise<void>;
}

interface Slot<S extends ChatAttachmentSource = ChatAttachmentSource> {
    index: number;
    prepared: PreparedImageMirror<S> | null;
    uploadId?: string;
    /** The upload is already `stored` on the server: its original has nothing left to send. */
    originalDone: boolean;
    transfer?: UploadPutTarget;
    thumbnailTransfer?: UploadPutTarget;
    /** One re-issue per slot, whichever of its PUTs hit the expiry first. */
    reissued: boolean;
    /** Set when the original did not make it — sent to `complete` so the server can close it. */
    failure?: UploadFailure;
    /** Rejected by `start` validation: nothing was created, so there is nothing to complete. */
    rejectedAtStart: boolean;
}

const defaultWait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const defaultLog = (message: string, data?: Record<string, unknown>) => logger.info('UPLOAD', message, data);

const isSuccess = (result: PutResult) =>
    result.kind === 'responded' &&
    // 412: the object is already there (a retry of a PUT whose answer was lost). Same outcome.
    ((result.httpStatus >= 200 && result.httpStatus < 300) || result.httpStatus === 412);

const STORAGE_CODE_BY_STATUS: Record<number, UploadFailure['code']> = {
    400: 'invalid',
    403: 'expired',
    404: 'not-found',
    409: 'conflict',
    413: 'too-large',
    415: 'unsupported',
};

const toFailure = (result: PutResult): UploadFailure =>
    result.kind === 'responded'
        ? {
              source: 'storage',
              code: STORAGE_CODE_BY_STATUS[result.httpStatus] ?? 'unknown',
              status: result.httpStatus,
              ...(result.providerCode ? { reason: result.providerCode } : {}),
          }
        : { source: 'client', code: result.reason === 'network' ? 'network' : 'unknown', reason: result.reason };

const describeResult = (result: PutResult) =>
    result.kind === 'responded' ? { httpStatus: result.httpStatus } : { noResponse: result.reason };

const toIntent = (
    prepared: PreparedImageMirror<ChatAttachmentSource>,
    fallbackName: string
): UploadStartInput['list'][number] => {
    const { original, thumbnail } = prepared;
    return {
        name: original.file.name || fallbackName,
        // The prepared file's own type and size, not the picked one's: they are what gets signed, and
        // a preparer that re-encodes (a HEIC source into a JPEG, say) changes both.
        contentType: original.file.type,
        contentSize: original.file.size,
        ...(original.width > 0 && original.height > 0 ? { width: original.width, height: original.height } : {}),
        ...(thumbnail
            ? {
                  thumbnail: {
                      contentType: thumbnail.file.type,
                      contentSize: thumbnail.file.size,
                      ...(thumbnail.width > 0 && thumbnail.height > 0
                          ? { width: thumbnail.width, height: thumbnail.height }
                          : {}),
                  },
              }
            : {}),
    };
};

/** Runs `work` over `items` with at most `limit` running at once. */
const runPool = async <T>(items: readonly T[], limit: number, work: (item: T) => Promise<void>) => {
    let next = 0;
    const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const item = items[next++];
            await work(item);
        }
    });
    await Promise.all(lanes);
};

/**
 * Sends picked attachments as one chat message: prepare → `upload.start` → PUT → `upload.complete` →
 * `chat.send`. A pick is page files, shell files (which the PUT port sends from the shell's folder), or
 * both. The pending row is the caller's: this sequence reports the outcome and the caller
 * confirms or fails the row.
 *
 * - **A slot failing is not the message failing.** Whatever reached `stored` is sent; the server
 *   marks the rest. Only when nothing is stored does the message fail.
 * - **A socket operation failing is the message failing.** Retry starts over from preparation, and
 *   uploads already stored by the failed attempt are abandoned — the server clears them in a day.
 * - **The thumbnail never fails a slot.** Without it the server stores the original alone.
 * - Order is the picking order, whatever order the PUTs finish in.
 */
export const sendImageMessage = async <S extends ChatAttachmentSource = File>(
    files: readonly S[],
    ports: SendImagePorts<S>,
    options: SendImageOptions = {}
): Promise<SendImageResult> => {
    const log = options.log ?? defaultLog;
    const wait = options.wait ?? defaultWait;
    const picked = files.slice(0, IMAGE_MESSAGE_SLOT_MAX);
    if (files.length > picked.length) {
        log('image message: extra files left out', { picked: files.length, kept: picked.length });
    }

    try {
        // One at a time: on the native shell a decode holds the whole source in WebView memory.
        const slots: Slot<S>[] = [];
        const intents: UploadStartInput['list'] = [];
        for (const [index, file] of picked.entries()) {
            const prepared = await ports.prepare(file);
            intents.push(toIntent(prepared, file.name));
            slots.push({ index, prepared, originalDone: false, reissued: false, rejectedAtStart: false });
        }

        const started = await ports.start({ list: intents });
        if (started.list.length !== slots.length) throw new UploadResponseShapeError('start', 'list');
        slots.forEach((slot, i) => applyTicket(slot, started.list[i]));

        const reissue = async (slot: Slot<S>): Promise<boolean> => {
            if (slot.reissued || !slot.uploadId) return false;
            slot.reissued = true;
            try {
                const again = await ports.start({ list: [{ ...intents[slot.index], id: slot.uploadId }] });
                const ticket = again.list[0];
                if (!ticket) return false;
                slot.transfer = ticket.transfer;
                slot.thumbnailTransfer = ticket.thumbnailTransfer;
                return true;
            } catch (error) {
                // A failed re-issue fails this slot only: the others still hold valid tickets.
                log('image message: re-issue failed', { slot: slot.index, error: errorName(error) });
                return false;
            }
        };

        const putWithRetry = async (
            slot: Slot<S>,
            payload: 'original' | 'thumbnail',
            file: S
        ): Promise<PutResult | null> => {
            const label = `slot-${slot.index}/${payload}`;
            let networkRetries = 0;
            for (;;) {
                const target = payload === 'original' ? slot.transfer : slot.thumbnailTransfer;
                if (!target) return null;
                const result = await safePut(ports, target, file, label);
                if (isSuccess(result)) return result;
                if (result.kind === 'responded' && result.httpStatus === 403 && (await reissue(slot))) continue;
                if (
                    result.kind === 'no-response' &&
                    result.reason === 'network' &&
                    networkRetries < NETWORK_RETRY_DELAYS_MS.length
                ) {
                    await wait(NETWORK_RETRY_DELAYS_MS[networkRetries++]);
                    continue;
                }
                return result;
            }
        };

        await runPool(
            slots.filter(slot => !slot.rejectedAtStart),
            PUT_CONCURRENCY,
            async slot => {
                const { prepared } = slot;
                if (!prepared) return;
                if (!slot.originalDone) {
                    const result = await putWithRetry(slot, 'original', prepared.original.file);
                    if (!result || !isSuccess(result)) {
                        slot.failure = result
                            ? toFailure(result)
                            : { source: 'api', code: 'unknown', message: 'no transfer issued' };
                        log('image message: slot failed', {
                            slot: slot.index,
                            ...(result ? describeResult(result) : { noTransfer: true }),
                        });
                    }
                }
                if (!slot.failure && prepared.thumbnail && slot.thumbnailTransfer) {
                    const result = await putWithRetry(slot, 'thumbnail', prepared.thumbnail.file);
                    log('image message: thumbnail', {
                        slot: slot.index,
                        ...(result ? describeResult(result) : { noTransfer: true }),
                    });
                }
                // Done with this slot's bytes; let them go before the others finish.
                slot.prepared = null;
            }
        );

        const settle = slots.flatMap(slot =>
            !slot.rejectedAtStart && slot.uploadId
                ? [{ id: slot.uploadId, ...(slot.failure ? { failure: slot.failure } : {}) }]
                : []
        );
        const storedIds = new Set<string>();
        if (settle.length > 0) {
            const completed = await ports.complete({ list: settle });
            for (const upload of completed.list) {
                if (upload.status === 'stored' && upload.id) storedIds.add(upload.id);
            }
        }

        const isStored = (slot: Slot) => !!slot.uploadId && storedIds.has(slot.uploadId);
        const uploadIds = slots.filter(isStored).map(slot => slot.uploadId as string);
        const failedIndexes = slots.filter(slot => !isStored(slot)).map(slot => slot.index);
        if (uploadIds.length === 0) {
            log('image message: nothing stored, not sent', { slots: slots.length });
            return { status: 'failed', reason: 'no-stored-upload', failedSlots: failedIndexes.length };
        }

        await ports.send({ uploadIds });
        log('image message: sent', { stored: uploadIds.length, failedSlots: failedIndexes.length });
        return { status: 'sent', uploadIds, failedIndexes };
    } catch (error) {
        log('image message: socket operation failed', { error: errorName(error) });
        return { status: 'failed', reason: 'socket', error };
    }
};

const applyTicket = (slot: Slot, ticket: PresignedUploadTicket) => {
    const { upload } = ticket;
    slot.uploadId = upload.id;
    if (upload.status === 'failed') {
        slot.rejectedAtStart = true;
        return;
    }
    slot.transfer = ticket.transfer;
    slot.thumbnailTransfer = ticket.thumbnailTransfer;
    // A stored upload (the server recognised these bytes) has no original to send, only perhaps a
    // thumbnail to add.
    slot.originalDone = upload.status === 'stored';
};

/** A port that throws is treated as a transfer that never answered. */
const safePut = async <S extends ChatAttachmentSource>(
    ports: SendImagePorts<S>,
    target: UploadPutTarget,
    file: S,
    label: string
) => {
    try {
        return await ports.put(target, file, label);
    } catch {
        return { kind: 'no-response', reason: 'system' } as const;
    }
};

/** Only the error's name reaches a log: a transport message can quote the request it failed on. */
const errorName = (error: unknown) => (error instanceof Error ? error.name : typeof error);

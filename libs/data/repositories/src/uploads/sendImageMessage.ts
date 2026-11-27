import { logger } from '@chatic/logger';
import type { UploadCompleteInput, UploadStartInput } from '@lemoncloud/chatic-sockets-lib';
import type {
    ChatAttachmentSource,
    PreparedImageMirror,
    PresignedUploadTicket,
    PutProgress,
    PutResult,
    SendImagePorts,
    UploadPutTarget,
} from '@chatic/data-model';
import { UploadResponseShapeError } from '@chatic/data-model';

export const IMAGE_MESSAGE_SLOT_MAX = 10;

const PUT_CONCURRENCY = 3;

const NETWORK_RETRY_DELAYS_MS: readonly number[] = [1000, 3000];

type UploadFailure = NonNullable<UploadCompleteInput['list'][number]['failure']>;

export type SendImageResult =
    | { status: 'sent'; uploadIds: string[]; failedIndexes: number[] }
    | { status: 'failed'; reason: 'no-stored-upload'; failedSlots: number }
    | { status: 'failed'; reason: 'socket'; error: unknown };

export interface SendImageOptions {
    log?: (message: string, data?: Record<string, unknown>) => void;
    wait?: (ms: number) => Promise<void>;
    onProgress?: (slot: number, sentBytes: number, totalBytes: number) => void;
}

interface Slot<S extends ChatAttachmentSource = ChatAttachmentSource> {
    index: number;
    prepared: PreparedImageMirror<S> | null;
    uploadId?: string;
    originalDone: boolean;
    transfer?: UploadPutTarget;
    thumbnailTransfer?: UploadPutTarget;
    reissued: boolean;
    failure?: UploadFailure;
    rejectedAtStart: boolean;
}

const defaultWait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const defaultLog = (message: string, data?: Record<string, unknown>) => logger.info('UPLOAD', message, data);

const isSuccess = (result: PutResult) =>
    result.kind === 'responded' && ((result.httpStatus >= 200 && result.httpStatus < 300) || result.httpStatus === 412);

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
                log('image message: re-issue failed', { slot: slot.index, error: errorName(error) });
                return false;
            }
        };

        const putWithRetry = async (
            slot: Slot<S>,
            payload: 'original' | 'thumbnail',
            file: S,
            onSent: PutProgress
        ): Promise<PutResult | null> => {
            const label = `slot-${slot.index}/${payload}`;
            let networkRetries = 0;
            for (;;) {
                const target = payload === 'original' ? slot.transfer : slot.thumbnailTransfer;
                if (!target) return null;
                onSent(0);
                const result = await safePut(ports, target, file, label, onSent);
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
                const sizeOf = (file: S) => Math.max(0, file.size);
                const originalSize = sizeOf(prepared.original.file);
                const thumbnailSize =
                    prepared.thumbnail && slot.thumbnailTransfer ? sizeOf(prepared.thumbnail.file) : 0;
                let originalSent = slot.originalDone ? originalSize : 0;
                let thumbnailSent = 0;
                const tell = (sent: number, total: number) => {
                    try {
                        options.onProgress?.(slot.index, sent, total);
                    } catch {
                        // An observer only: a screen that fails to draw a count must not fail the send.
                    }
                };
                const report = () => tell(originalSent + thumbnailSent, originalSize + thumbnailSize);
                const counter =
                    (size: number, set: (sent: number) => void): PutProgress =>
                    sent => {
                        if (!Number.isFinite(sent)) return;
                        set(Math.min(Math.max(0, sent), size));
                        report();
                    };
                report();
                if (!slot.originalDone) {
                    const result = await putWithRetry(
                        slot,
                        'original',
                        prepared.original.file,
                        counter(originalSize, sent => (originalSent = sent))
                    );
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
                if (slot.failure) {
                    tell(0, 0);
                    slot.prepared = null;
                    return;
                }
                originalSent = originalSize;
                if (prepared.thumbnail && slot.thumbnailTransfer) {
                    report();
                    const result = await putWithRetry(
                        slot,
                        'thumbnail',
                        prepared.thumbnail.file,
                        counter(thumbnailSize, sent => (thumbnailSent = sent))
                    );
                    log('image message: thumbnail', {
                        slot: slot.index,
                        ...(result ? describeResult(result) : { noTransfer: true }),
                    });
                }
                thumbnailSent = thumbnailSize;
                report();
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
    slot.originalDone = upload.status === 'stored';
};

const safePut = async <S extends ChatAttachmentSource>(
    ports: SendImagePorts<S>,
    target: UploadPutTarget,
    file: S,
    label: string,
    onProgress: PutProgress
) => {
    try {
        return await ports.put(target, file, label, onProgress);
    } catch {
        return { kind: 'no-response', reason: 'system' } as const;
    }
};

const errorName = (error: unknown) => (error instanceof Error ? error.name : typeof error);

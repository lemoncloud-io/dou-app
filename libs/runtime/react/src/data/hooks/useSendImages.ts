import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';

import { logger } from '@chatic/bridges';
import {
    beginMediaSendTiming,
    type ChatAttachmentSource,
    chatAttachmentSourceFormat,
    type ChatMentionBody,
    getCloudRepositories,
    type ChatUploadKind,
    IMAGE_MESSAGE_SLOT_MAX,
    isPendingUploadSlot,
    isShellFileRef,
    judgeChatAttachments,
    type MediaSendTiming,
    type PendingFileDetails,
    type PreparedImageMirror,
    type PutProgress,
    type PutResult,
    sendImageMessage,
    type PutPort,
    type SendImagePorts,
    type SendImageResult,
    type ShellFilePutPort,
    type ShellFileRef,
    type UploadPutTarget,
    withCloudHold,
} from '@chatic/runtime-client';
// eslint-disable-next-line @nx/enforce-module-boundaries -- the image code moved to host-web-browser; this hook read it through @chatic/shared, which now re-exports runtime-react, until the media port's images capability replaces the direct call
import { makeVideoPoster, prepareChatAttachment } from '@chatic/host-web-browser';

import { clearImageSendProgress, setImageSendProgress } from './imageSendProgress';

interface PendingImages {
    cid: string;
    channelId: string;
    parentId?: string;
    files: ChatAttachmentSource[];
    urls: string[];
    thumbnailed: boolean;
    inFlight: boolean;
    detached: boolean;
    inTurn: boolean;
    timing?: MediaSendTiming;
    abort?: AbortController;
}

const pendingImages = new Map<string, PendingImages>();

const goneShellFiles = new Set<string>();
const isGone = (source: ChatAttachmentSource) => isShellFileRef(source) && goneShellFiles.has(source.uri);

export interface PreparedShellVideo {
    file: ShellFileRef;
    width: number;
    height: number;
    poster: { file: ShellFileRef; width: number; height: number; preview: Blob } | null;
}

export type PrepareVideoPort = (video: ShellFileRef) => Promise<PreparedShellVideo>;

export type VideoRefusal = 'too-large' | 'unsupported' | 'not-converted';

const asSent = (source: ChatAttachmentSource): { file: ChatAttachmentSource; kind: ChatUploadKind | null } => {
    const format = chatAttachmentSourceFormat(source);
    if (!format) return { file: source, kind: null };
    if (format.name === source.name && format.type === source.type) return { file: source, kind: format.kind };
    if (isShellFileRef(source)) {
        return {
            file: source.needsExport ? source : { ...source, name: format.name, type: format.type },
            kind: format.kind,
        };
    }
    return {
        file: new File([source], format.name, { type: format.type, lastModified: source.lastModified }),
        kind: format.kind,
    };
};

const pendingFileDetails = (source: ChatAttachmentSource): PendingFileDetails | null => {
    const format = chatAttachmentSourceFormat(source);
    return format && format.kind !== 'image'
        ? { name: format.name, contentType: format.type, size: source.size }
        : null;
};

const previewUrlOf = (source: ChatAttachmentSource): string =>
    isShellFileRef(source) || chatAttachmentSourceFormat(source)?.kind === 'video' ? '' : URL.createObjectURL(source);

const revoke = (url: string) => {
    if (url) URL.revokeObjectURL(url);
};

const prepareAttachment = async (source: ChatAttachmentSource): Promise<PreparedImageMirror<ChatAttachmentSource>> => {
    const sent = asSent(source);
    if (isShellFileRef(sent.file)) return { original: { file: sent.file, width: 0, height: 0 }, thumbnail: null };
    if (sent.kind === 'video') {
        return { original: { file: sent.file, width: 0, height: 0 }, thumbnail: await makeVideoPoster(sent.file) };
    }
    return sent.kind && sent.kind !== 'image'
        ? { original: { file: sent.file, width: 0, height: 0 }, thumbnail: null }
        : prepareChatAttachment(sent.file);
};

const PREPARE_TURN_CEILING_MS = 30_000;

let preparing: Promise<void> = Promise.resolve();
const prepareInTurn = <T>(work: () => Promise<T>): Promise<T> => {
    const turn = preparing.then(work);
    preparing = preparing.then(
        () =>
            new Promise<void>(resolve => {
                const timer = setTimeout(resolve, PREPARE_TURN_CEILING_MS);
                const done = () => {
                    clearTimeout(timer);
                    resolve();
                };
                turn.then(done, done);
            })
    );
    return turn;
};

interface RoomSends {
    tail?: Promise<void>;
    loose: Set<Promise<void>>;
}
const roomSends = new Map<string, RoomSends>();

const forgetIfIdle = (key: string, room: RoomSends) => {
    if (!room.tail && room.loose.size === 0 && roomSends.get(key) === room) roomSends.delete(key);
};

const takeRoomTurn = (key: string, separately: boolean): { ahead: Promise<void> | null; settle: () => void } => {
    const room = roomSends.get(key) ?? { loose: new Set<Promise<void>>() };
    roomSends.set(key, room);
    let settle: () => void = () => undefined;
    const own = new Promise<void>(resolve => (settle = resolve));
    if (!separately) {
        const ahead = room.tail ?? null;
        room.loose.add(own);
        void own.then(() => {
            room.loose.delete(own);
            forgetIfIdle(key, room);
        });
        return { ahead, settle };
    }
    const waits = [...(room.tail ? [room.tail] : []), ...room.loose];
    const ahead = waits.length > 0 ? Promise.all(waits).then(() => undefined) : null;
    const tail = ahead ? Promise.all([ahead, own]).then(() => undefined) : own;
    room.tail = tail;
    void tail.then(() => {
        if (room.tail !== tail) return;
        room.tail = undefined;
        forgetIfIdle(key, room);
    });
    return { ahead, settle };
};

const pastMillisecond = async (since: number): Promise<void> => {
    while (Date.now() <= since) await new Promise(resolve => setTimeout(resolve, 1));
};

const codeOf = (error: unknown) => (error as { code?: string } | null)?.code;

const putFor =
    (put: PutPort, putShellFile: ShellFilePutPort | undefined, signal: AbortSignal) =>
    async (
        target: UploadPutTarget,
        file: ChatAttachmentSource,
        label: string,
        onProgress?: PutProgress
    ): Promise<PutResult> => {
        if (!isShellFileRef(file)) return put(target, file, label, onProgress, signal);
        if (!putShellFile) return { kind: 'no-response', reason: 'system' };
        const result = await putShellFile(target, file, label, onProgress);
        if (result.kind === 'no-response' && result.reason === 'source') goneShellFiles.add(file.uri);
        return result;
    };

const attachedScreens = new Map<string, number>();
const roomKey = (cid: string, channelId: string, parentId?: string) => `${cid}|${channelId}|${parentId ?? ''}`;

let version = 0;
const listeners = new Set<() => void>();
const changed = () => {
    version += 1;
    listeners.forEach(listener => listener());
};
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
};
const getVersion = () => version;

const release = (pendingId: string) => {
    const entry = pendingImages.get(pendingId);
    if (!entry) return;
    clearImageSendProgress(pendingId);
    entry.urls.forEach(revoke);
    entry.files.forEach(file => isShellFileRef(file) && goneShellFiles.delete(file.uri));
    pendingImages.delete(pendingId);
    changed();
};

const log = (message: string, data?: Record<string, unknown>) => logger.info('UPLOAD', message, data);

const keepUnsent = async (sent: PendingImages, files: ChatAttachmentSource[], retryable = true): Promise<void> => {
    const urls = files.map(previewUrlOf);
    const localFiles = files.map(pendingFileDetails);
    const chat = chatOf(sent.cid);
    try {
        const pendingId = await chat.createPendingImageChat({
            channelId: sent.channelId,
            ...(sent.parentId ? { parentId: sent.parentId } : {}),
            localThumbUrls: urls,
            ...(localFiles.some(Boolean) ? { localFiles } : {}),
        });
        await chat.failPendingImageChat(pendingId);
        if (sent.detached || !retryable) {
            urls.forEach(revoke);
            return;
        }
        pendingImages.set(pendingId, { ...sent, files, urls, thumbnailed: false, inFlight: false });
        changed();
    } catch (error) {
        urls.forEach(revoke);
        log('image message: could not keep the unsent files', { error: (error as Error)?.name });
    }
};

const chatOf = (cid: string) => getCloudRepositories(cid).chat;

const switchToThumbnailPreviews = async (pendingId: string, thumbnails: (Blob | null)[]): Promise<void> => {
    const entry = pendingImages.get(pendingId);
    if (!entry || entry.thumbnailed || thumbnails.every(file => !file)) return;
    const next = entry.urls.map((url, i) => {
        const thumbnail = thumbnails[i];
        return thumbnail ? URL.createObjectURL(thumbnail) : url;
    });
    const revokeNew = () => next.forEach((url, i) => url !== entry.urls[i] && revoke(url));
    try {
        await chatOf(entry.cid).createPendingImageChat({
            channelId: entry.channelId,
            ...(entry.parentId ? { parentId: entry.parentId } : {}),
            localThumbUrls: next,
            pendingId,
        });
    } catch {
        revokeNew();
        return;
    }
    entry.urls.forEach((url, i) => url !== next[i] && revoke(url));
    entry.urls = next;
    entry.thumbnailed = true;
};

export interface UseSendImagesInput {
    cid: string;
    channelId: string;
    parentId?: string;
    put: PutPort;
    putShellFile?: ShellFilePutPort;
    prepareVideo?: PrepareVideoPort;
    onVideoRefused?: (reason: VideoRefusal) => void;
    beforeSweep?: () => Promise<void>;
    waitForConnection?: (cid: string) => Promise<boolean>;
    attach?: boolean;
}

export interface SendImagesOptions {
    separately?: boolean;
    content?: string;
    mention?: ChatMentionBody;
}

export const useSendImages = ({
    cid,
    channelId,
    parentId,
    put,
    putShellFile,
    prepareVideo,
    onVideoRefused,
    beforeSweep,
    waitForConnection,
    attach = true,
}: UseSendImagesInput) => {
    const attachedRef = useRef(true);
    const putRef = useRef(put);
    putRef.current = put;
    const putShellFileRef = useRef(putShellFile);
    putShellFileRef.current = putShellFile;
    const prepareVideoRef = useRef(prepareVideo);
    prepareVideoRef.current = prepareVideo;
    const onVideoRefusedRef = useRef(onVideoRefused);
    onVideoRefusedRef.current = onVideoRefused;
    const waitForConnectionRef = useRef(waitForConnection);
    waitForConnectionRef.current = waitForConnection;
    const beforeSweepRef = useRef(beforeSweep);
    beforeSweepRef.current = beforeSweep;
    const currentVersion = useSyncExternalStore(subscribe, getVersion);

    const convertVideos = useCallback(async (entry: PendingImages) => {
        const converted = new Map<number, PreparedShellVideo>();
        const refused: number[] = [];
        const told = new Set<VideoRefusal>();
        const refuse = (index: number, reason?: VideoRefusal) => {
            refused.push(index);
            if (!reason || told.has(reason)) return;
            told.add(reason);
            onVideoRefusedRef.current?.(reason);
        };
        for (const [index, source] of entry.files.entries()) {
            if (!isShellFileRef(source) || chatAttachmentSourceFormat(source)?.kind !== 'video') continue;
            const convert = prepareVideoRef.current;
            if (!convert) {
                refuse(index);
                continue;
            }
            try {
                const video = await convert(source);
                const { rejected } = judgeChatAttachments([video.file], 1);
                if (rejected.length > 0) {
                    goneShellFiles.add(source.uri);
                    refuse(index, rejected[0].reason === 'too-large' ? 'too-large' : 'unsupported');
                    continue;
                }
                converted.set(index, video);
            } catch (error) {
                const code = codeOf(error);
                const unsendable = code === 'SOURCE' || code === 'INVALID';
                if (unsendable || code === 'TOO_LARGE' || code === 'UNSUPPORTED') goneShellFiles.add(source.uri);
                refuse(
                    index,
                    code === 'TOO_LARGE'
                        ? 'too-large'
                        : code === 'UNSUPPORTED'
                          ? 'unsupported'
                          : unsendable
                            ? undefined
                            : 'not-converted'
                );
                log('image message: video not converted', { slot: index, code });
            }
        }
        return { converted, refused };
    }, []);

    const run = useCallback(
        async (pendingId: string) => {
            const entry = pendingImages.get(pendingId);
            if (!entry) return;
            const timing = entry.timing;
            const abort = entry.abort ?? new AbortController();
            entry.abort = abort;
            const settleCancelled = async () => {
                release(pendingId);
                await chatOf(entry.cid)
                    .cacheDelete(pendingId)
                    .catch(error => {
                        log('image message: could not remove the cancelled row', { error: (error as Error)?.name });
                    });
            };
            if (abort.signal.aborted) return settleCancelled();
            const stopIfCancelled = () => {
                if (abort.signal.aborted) throw new Error('image message: cancelled');
            };
            clearImageSendProgress(pendingId);
            const { converted, refused } = await convertVideos(entry);
            if (converted.size > 0) timing?.mark('converted');
            const sending = entry.files.map((_, index) => index).filter(index => !refused.includes(index));
            let result: SendImageResult = { status: 'failed', reason: 'no-stored-upload', failedSlots: refused.length };
            if (sending.length > 0) {
                result = await withCloudHold(entry.cid, async repository => {
                    const wait = waitForConnectionRef.current;
                    if (wait && !(await wait(entry.cid))) log('image message: socket not back in time');
                    timing?.mark('socket');
                    const previews: (Blob | null)[] = entry.files.map(
                        (_, index) => converted.get(index)?.poster?.preview ?? null
                    );
                    let next = 0;
                    const ports: SendImagePorts<ChatAttachmentSource> = {
                        prepare: async source => {
                            const index = sending[next++];
                            const video = converted.get(index);
                            const prepared: PreparedImageMirror<ChatAttachmentSource> = video
                                ? {
                                      original: { file: video.file, width: video.width, height: video.height },
                                      thumbnail: video.poster
                                          ? {
                                                file: video.poster.file,
                                                width: video.poster.width,
                                                height: video.poster.height,
                                            }
                                          : null,
                                  }
                                : await (entry.inTurn
                                      ? prepareInTurn(() => prepareAttachment(source))
                                      : prepareAttachment(source));
                            const thumbnail = prepared.thumbnail?.file;
                            if (!video && thumbnail && !isShellFileRef(thumbnail)) previews[index] = thumbnail;
                            if (next === sending.length) {
                                await switchToThumbnailPreviews(pendingId, previews);
                                timing?.mark('prepared');
                            }
                            return prepared;
                        },
                        start: async payload => {
                            stopIfCancelled();
                            const tickets = await repository.startUploads(payload);
                            timing?.mark('upload_started');
                            return tickets;
                        },
                        complete: async payload => {
                            stopIfCancelled();
                            timing?.mark('bytes_sent');
                            const completed = await repository.completeUploads(payload);
                            timing?.mark('upload_completed');
                            return completed;
                        },
                        put: putFor(putRef.current, putShellFileRef.current, abort.signal),
                        send: async ({ uploadIds }) => {
                            stopIfCancelled();
                            const sent = await repository.sendPendingImageChat(pendingId, { uploadIds });
                            timing?.mark('sent');
                            return sent;
                        },
                    };
                    return sendImageMessage(
                        sending.map(index => entry.files[index]),
                        ports,
                        {
                            onProgress: (slot, sentBytes, totalBytes) =>
                                setImageSendProgress(
                                    pendingId,
                                    sending[slot],
                                    sentBytes,
                                    totalBytes,
                                    entry.files.length
                                ),
                        }
                    );
                }).catch(error => {
                    timing?.end('error');
                    throw error;
                });
            }
            if (result.status === 'sent') {
                const left = [...refused, ...result.failedIndexes.map(slot => sending[slot])].sort((a, b) => a - b);
                const unsent = left.map(index => entry.files[index]).filter(Boolean);
                const lost = unsent.filter(isGone);
                const again = unsent.filter(file => !isGone(file));
                timing?.end(left.length > 0 ? 'partial' : 'ok');
                release(pendingId);
                if (again.length > 0) await keepUnsent(entry, again);
                if (lost.length > 0) await keepUnsent(entry, lost, false);
                return;
            }
            if (abort.signal.aborted) return settleCancelled();
            timing?.end('error');
            await chatOf(entry.cid)
                .failPendingImageChat(pendingId)
                .catch(error => {
                    log('image message: could not mark the row failed', { error: (error as Error)?.name });
                });
            clearImageSendProgress(pendingId);
            entry.inFlight = false;
            changed();
            if (entry.detached || entry.files.every(isGone)) release(pendingId);
        },
        [convertVideos]
    );

    const writePending = useCallback(
        async (
            files: ChatAttachmentSource[],
            inTurn: boolean,
            content: string,
            mention?: ChatMentionBody
        ): Promise<string> => {
            const urls = files.map(previewUrlOf);
            const localFiles = files.map(pendingFileDetails);
            const timing = inTurn ? undefined : beginMediaSendTiming({ files, reply: !!parentId, retry: false });
            let pendingId: string;
            try {
                pendingId = await chatOf(cid).createPendingImageChat({
                    channelId,
                    ...(parentId ? { parentId } : {}),
                    localThumbUrls: urls,
                    ...(localFiles.some(Boolean) ? { localFiles } : {}),
                    ...(content ? { content } : {}),
                    ...(content && mention ? { mention } : {}),
                });
            } catch (error) {
                timing?.end('error');
                urls.forEach(revoke);
                throw error;
            }
            timing?.mark('row');
            pendingImages.set(pendingId, {
                cid,
                channelId,
                parentId,
                files,
                urls,
                thumbnailed: false,
                inFlight: true,
                abort: new AbortController(),
                detached: attach ? !attachedRef.current : !attachedScreens.get(roomKey(cid, channelId, parentId)),
                inTurn,
                timing,
            });
            changed();
            return pendingId;
        },
        [cid, channelId, parentId, attach]
    );

    const sendImages = useCallback(
        async (picked: ChatAttachmentSource[], options: SendImagesOptions = {}) => {
            const files = picked.slice(0, IMAGE_MESSAGE_SLOT_MAX);
            if (files.length === 0) return;
            const separately = options.separately === true && files.length > 1;
            const messages = separately ? files.map(file => [file]) : [files];
            const content = options.content?.trim() ?? '';
            const errors: unknown[] = [];
            const turn = takeRoomTurn(`${cid}/${channelId}/${parentId ?? ''}`, separately);

            try {
                const pendingIds: string[] = [];
                let writtenAt = 0;
                for (const message of messages) {
                    if (pendingIds.length > 0) await pastMillisecond(writtenAt);
                    try {
                        const first = pendingIds.length === 0;
                        pendingIds.push(
                            await writePending(
                                message,
                                separately,
                                first ? content : '',
                                first ? options.mention : undefined
                            )
                        );
                    } catch (error) {
                        errors.push(error);
                        break;
                    }
                    writtenAt = Date.now();
                }

                if (pendingIds.length > 0 && turn.ahead) await turn.ahead;
                for (const pendingId of pendingIds) {
                    const entry = pendingImages.get(pendingId);
                    if (entry && !entry.timing) {
                        entry.timing = beginMediaSendTiming({
                            files: entry.files,
                            reply: !!entry.parentId,
                            retry: false,
                        });
                        entry.timing.mark('row');
                    }
                    await run(pendingId).catch(error => void errors.push(error));
                }
            } finally {
                turn.settle();
            }
            if (errors.length > 0) throw errors[0];
        },
        [cid, channelId, parentId, writePending, run]
    );

    const retry = useCallback(
        async (pendingId: string): Promise<boolean> => {
            const entry = pendingImages.get(pendingId);
            if (!entry || entry.inFlight) return false;
            entry.inFlight = true;
            entry.abort = new AbortController();
            changed();
            const timing = beginMediaSendTiming({ files: entry.files, reply: !!entry.parentId, retry: true });
            try {
                await chatOf(entry.cid).createPendingImageChat({
                    channelId: entry.channelId,
                    ...(entry.parentId ? { parentId: entry.parentId } : {}),
                    localThumbUrls: entry.urls,
                    pendingId,
                });
            } catch {
                timing.end('error');
                release(pendingId);
                return false;
            }
            timing.mark('row');
            entry.timing = timing;
            await run(pendingId);
            return true;
        },
        [run]
    );

    const canRetry = useCallback(
        (pendingId: string) => {
            const entry = pendingImages.get(pendingId);
            return !!entry && !entry.inFlight;
        },
        [currentVersion]
    );

    const discard = useCallback((pendingId: string) => release(pendingId), []);

    const cancel = useCallback((pendingId: string): boolean => {
        const entry = pendingImages.get(pendingId);
        if (!entry?.inFlight || !entry.abort) return false;
        entry.abort.abort();
        return true;
    }, []);

    useEffect(() => {
        if (!attach) return;
        let active = true;
        attachedRef.current = true;
        const key = roomKey(cid, channelId, parentId);
        attachedScreens.set(key, (attachedScreens.get(key) ?? 0) + 1);
        for (const entry of pendingImages.values()) {
            if (entry.cid === cid && entry.channelId === channelId && entry.parentId === parentId) {
                entry.detached = false;
            }
        }
        const attachedAt = Date.now();
        void (async () => {
            await beforeSweepRef.current?.();
            if (!cid || !channelId) return;
            let rows;
            try {
                rows = await chatOf(cid).listPendingImageChats(channelId);
            } catch {
                return;
            }
            for (const row of rows) {
                if (!active) return;
                if (pendingImages.has(row.id) || row.createdAtMs >= attachedAt) continue;
                const stillSending =
                    row.isPending ||
                    row.upload$$?.some(slot => isPendingUploadSlot(slot) && slot.localStatus === 'sending');
                if (!stillSending) continue;
                await chatOf(cid)
                    .failPendingImageChat(row.id)
                    .catch(() => undefined);
            }
        })();

        return () => {
            active = false;
            attachedRef.current = false;
            const left = (attachedScreens.get(key) ?? 1) - 1;
            if (left > 0) attachedScreens.set(key, left);
            else attachedScreens.delete(key);
            for (const [pendingId, entry] of pendingImages) {
                if (entry.cid !== cid || entry.channelId !== channelId || entry.parentId !== parentId) continue;
                if (entry.inFlight) entry.detached = true;
                else release(pendingId);
            }
        };
    }, [cid, channelId, parentId, attach]);

    return { sendImages, retry, canRetry, discard, cancel };
};

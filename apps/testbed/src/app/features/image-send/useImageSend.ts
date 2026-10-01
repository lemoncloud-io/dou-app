import { useCallback, useState } from 'react';
import { runtime } from '@chatic/app-runtime';
import {
    IMAGE_MESSAGE_SLOT_MAX,
    isPendingUploadSlot,
    sendImageMessage,
    xhrPut,
    type DataRepositories,
    type SendImagePorts,
} from '@chatic/data';
import { prepareChatAttachment } from '@chatic/shared';

/** An error as one log-safe line: name, code and message. Socket errors never carry a ticket. */
const describeError = (error: unknown): string => {
    if (!(error instanceof Error)) return String(error);
    const code = (error as { code?: unknown; status?: unknown }).code ?? (error as { status?: unknown }).status;
    return `${error.name}${code !== undefined ? ` [${String(code)}]` : ''}: ${error.message}`;
};

const describeFile = (file: File, width: number, height: number) =>
    `${file.type || '(no type)'} · ${file.size}B · ${width}x${height}`;

/**
 * Sends picked images as one message through the real stack — the same `sendImageMessage` the app
 * runs, on this page's XHR — and records every step it can observe, so a run doubles as a
 * measurement of the server contract. Nothing recorded here is a ticket URL or header: PUT lines
 * carry the label and the status only.
 */
export const useImageSend = (channelId: string) => {
    const repos = runtime.data.useRuntimeRepositories() as unknown as DataRepositories;
    const [log, setLog] = useState<string[]>([]);
    const [isSending, setIsSending] = useState(false);

    const sendImages = useCallback(
        async (picked: File[]) => {
            const files = picked.slice(0, IMAGE_MESSAGE_SLOT_MAX);
            if (files.length === 0) return;
            const add = (line: string) => setLog(lines => [...lines, `${new Date().toLocaleTimeString('ko')} ${line}`]);
            setIsSending(true);
            add(`— send ${files.length} image(s) to ${channelId}`);

            const urls = files.map(file => URL.createObjectURL(file));
            let pendingId: string;
            try {
                pendingId = await repos.chat.createPendingImageChat({ channelId, localThumbUrls: urls });
                add(`pending row ${pendingId}`);
            } catch (error) {
                add(`pending row failed: ${describeError(error)}`);
                urls.forEach(url => URL.revokeObjectURL(url));
                setIsSending(false);
                return;
            }

            const ports: SendImagePorts = {
                prepare: async file => {
                    const prepared = await prepareChatAttachment(file);
                    const { original, thumbnail } = prepared;
                    add(
                        `prepare ${file.name}: original ${describeFile(original.file, original.width, original.height)}` +
                            ` · thumbnail ${thumbnail ? describeFile(thumbnail.file, thumbnail.width, thumbnail.height) : 'none'}`
                    );
                    return prepared;
                },
                start: async payload => {
                    add(
                        `upload.start ${payload.list.length} slot(s)${payload.list.some(s => s.id) ? ' (re-issue)' : ''}`
                    );
                    try {
                        const result = await repos.chat.startUploads(payload);
                        result.list.forEach((ticket, i) =>
                            add(
                                `  slot ${i}: ${ticket.upload.status} id=${ticket.upload.id ?? '—'}` +
                                    ` transfer=${ticket.transfer ? 'yes' : 'no'} thumbnailTransfer=${ticket.thumbnailTransfer ? 'yes' : 'no'}` +
                                    (ticket.upload.error ? ` error=${ticket.upload.error}` : '')
                            )
                        );
                        return result;
                    } catch (error) {
                        add(`upload.start failed: ${describeError(error)}`);
                        throw error;
                    }
                },
                complete: async payload => {
                    add(
                        `upload.complete ${payload.list.map(i => `${i.id}${i.failure ? `(failure:${i.failure.code})` : ''}`).join(', ')}`
                    );
                    try {
                        const result = await repos.chat.completeUploads(payload);
                        result.list.forEach(u => add(`  ${u.id}: ${u.status}${u.error ? ` error=${u.error}` : ''}`));
                        return result;
                    } catch (error) {
                        add(`upload.complete failed: ${describeError(error)}`);
                        throw error;
                    }
                },
                put: async (target, file, label) => {
                    const result = await xhrPut(target, file, label);
                    add(
                        `PUT ${label} (${file.size}B): ` +
                            (result.kind === 'responded'
                                ? `${result.httpStatus}${result.providerCode ? ` ${result.providerCode}` : ''}`
                                : `no response (${result.reason})`)
                    );
                    return result;
                },
                send: async ({ uploadIds }) => {
                    add(`chat.send content='' uploadIds=[${uploadIds.join(', ')}]`);
                    try {
                        const sent = await repos.chat.sendPendingImageChat(pendingId, { uploadIds });
                        const slots = (sent.upload$$ ?? []).map(slot =>
                            isPendingUploadSlot(slot) ? 'pending?' : String((slot as { status?: unknown }).status)
                        );
                        add(
                            `chat.send ok: #${sent.chatNo} content=${JSON.stringify(sent.content)} upload$$=[${slots.join(', ')}]`
                        );
                        return sent;
                    } catch (error) {
                        add(`chat.send failed: ${describeError(error)}`);
                        throw error;
                    }
                },
            };

            const result = await sendImageMessage(files, ports, {
                log: (message, data) => add(`· ${message}${data ? ` ${JSON.stringify(data)}` : ''}`),
            });
            if (result.status === 'sent') {
                urls.forEach(url => URL.revokeObjectURL(url));
                add(`result: sent ${result.uploadIds.length}, failed slots ${result.failedIndexes.length}`);
            } else {
                await repos.chat.failPendingImageChat(pendingId);
                add(
                    `result: failed (${result.reason})` +
                        (result.reason === 'socket'
                            ? ` ${describeError(result.error)}`
                            : ` failed slots ${result.failedSlots}`)
                );
            }
            setIsSending(false);
        },
        [channelId, repos]
    );

    return { sendImages, isSending, log, clearLog: () => setLog([]) };
};

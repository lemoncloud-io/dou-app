import { deflateSync } from 'node:zlib';

import { E2E_ENDPOINTS } from '../support/env';
import { RawBody, type HttpHandler } from './backend';
import { GUEST } from './guest';
import { chatView, type FixtureRoom } from './rooms';

export const LOAD_IMAGE_HOST = E2E_ENDPOINTS.image;

const pad = (n: number, width = 4) => String(n).padStart(width, '0');

export const loadRoomTitle = (n: number): string => `Load room ${pad(n)}`;

export const manyRooms = (count: number, messages = 3): FixtureRoom[] =>
    Array.from({ length: count }, (_, index) => {
        const n = index + 1;
        const id = `e2e-load-room-${pad(n)}`;
        const peer = { uid: `91${pad(n, 5)}`, nick: loadRoomTitle(n) };
        const chats = Array.from({ length: messages }, (_, i) =>
            chatView(id, i + 1, `Message ${i + 1} in ${peer.nick}`, peer.uid)
        );
        return {
            channel: {
                id,
                name: peer.nick,
                stereo: 'dm',
                sid: GUEST.sid,
                $: { sid: GUEST.sid },
                ownerId: peer.uid,
                memberNo: 2,
                chatNo: messages,
                memberIds: [GUEST.uid, peer.uid],
                createdAt: GUEST.createdAt + n * 60_000,
                updatedAt: GUEST.createdAt + n * 60_000,
                $join: { nick: peer.nick, chatNo: n % 3 === 0 ? 0 : messages },
            },
            members: [
                { id: GUEST.uid, name: GUEST.uid },
                { id: peer.uid, name: peer.nick },
            ],
            chats,
        };
    });

export const loadImageUrl = (n: number, variant: 'thumb' | 'org'): string =>
    `${LOAD_IMAGE_HOST}/load/${pad(n)}-${variant}.png`;

export const addImageMessages = (room: FixtureRoom, count: number): void => {
    const start = room.chats.length;
    for (let i = 1; i <= count; i += 1) {
        const n = start + i;
        const row = chatView(room.channel.id, n, '', room.members[1]?.id);
        room.chats.push({
            ...row,
            stereo: 'image',
            upload$$: [
                {
                    id: `e2e-load-upload-${pad(n)}`,
                    stereo: 'image',
                    status: 'stored',
                    contentType: 'image/png',
                    name: `photo-${pad(n)}.png`,
                    size: 4_096,
                    width: 256,
                    height: 256,
                    thumbUrl: loadImageUrl(n, 'thumb'),
                    orgUrl: loadImageUrl(n, 'org'),
                },
            ],
        } as ReturnType<typeof chatView>);
    }
    room.channel.chatNo = room.chats.length;
};

export const imageHost = (): { handlers: Record<string, HttpHandler>; served: string[] } => {
    const served: string[] = [];
    const handler: HttpHandler = request => {
        const path = new URL(request.url()).pathname;
        served.push(path);
        const n = Number(/(\d+)-/.exec(path)?.[1] ?? 0);
        return new RawBody(solidPng(256, 256, colourOf(n)), 'image/png');
    };
    return { handlers: { [`GET ${LOAD_IMAGE_HOST}/load/*`]: handler }, served };
};

const colourOf = (n: number): [number, number, number] => [(n * 47) % 256, (n * 97) % 256, (n * 151) % 256];

const solidPng = (width: number, height: number, [r, g, b]: [number, number, number]): Buffer => {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x += 1) row.set([r, g, b], 1 + x * 3);
    const raw = Buffer.concat(Array.from({ length: height }, () => row));
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header.set([8, 2, 0, 0, 0], 8);
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', header),
        chunk('IDAT', deflateSync(raw)),
        chunk('IEND', Buffer.alloc(0)),
    ]);
};

const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([length, body, crc]);
};

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});

const crc32 = (data: Buffer): number => {
    let c = 0xffffffff;
    for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};

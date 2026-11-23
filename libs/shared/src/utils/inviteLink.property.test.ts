import * as fc from 'fast-check';

import { decodeInviteLink, readInviteLink } from './inviteLink';

const RUNS = { numRuns: 200, seed: 1123 };

const anyText = fc.string({ unit: 'binary', maxLength: 24 });
const coordinate = fc.oneof(fc.stringMatching(/^[a-z0-9]{1,10}$/), anyText);

const payload = fc.record(
    { c: anyText, r: fc.constantFrom(1, 0, true, false), a: coordinate, s: coordinate },
    { requiredKeys: ['c'] }
);

const tail = (codePoint: number, shift: number) => 0x80 | ((codePoint >> shift) & 0x3f);

const wellFormed = fc
    .integer({ min: 0x20, max: 0x10ffff })
    .filter(cp => cp !== 0x22 && cp !== 0x5c && (cp < 0xd800 || cp > 0xdfff))
    .map(cp => [...Buffer.from(String.fromCodePoint(cp), 'utf8')]);

const malformed = fc.oneof(
    fc.integer({ min: 0, max: 0x7f }).map(cp => [0xc0 | (cp >> 6), tail(cp, 0)]),
    fc.integer({ min: 0, max: 0x7ff }).map(cp => [0xe0, tail(cp, 6), tail(cp, 0)]),
    fc.integer({ min: 0xd800, max: 0xdfff }).map(cp => [0xe0 | (cp >> 12), tail(cp, 6), tail(cp, 0)]),
    fc.integer({ min: 0x110000, max: 0x1fffff }).map(cp => [0xf0 | (cp >> 18), tail(cp, 12), tail(cp, 6), tail(cp, 0)]),
    fc.integer({ min: 0x80, max: 0xbf }).map(byte => [byte]),
    fc.integer({ min: 0xf8, max: 0xff }).map(byte => [byte]),
    fc.integer({ min: 0xc2, max: 0xf4 }).map(byte => [byte])
);

const utf8ShapedBytes = fc
    .array(fc.oneof({ arbitrary: wellFormed, weight: 4 }, { arbitrary: malformed, weight: 1 }), { maxLength: 4 })
    .map(units => Uint8Array.from(units.flat()));

const tokenOf = (body: string, padded: boolean): string => {
    const token = Buffer.from(body, 'utf8').toString('base64url');
    return padded ? token.padEnd(Math.ceil(token.length / 4) * 4, '=') : token;
};

const linkOf = (token: string) => `https://app.chatic.io/i?t=${token}`;

const expectedTarget = ({ c, r, a, s }: { c: string; r?: unknown; a?: string; s?: string }) => {
    const code = c.trim();
    if (!code) return null;
    if (r) return { code, relay: true };
    const api = a?.trim() ?? '';
    const stage = s?.trim() ?? '';
    if (!api || !stage) return { code, relay: false };
    return { code, relay: false, backend: `https://${api}.execute-api.ap-northeast-2.amazonaws.com/${stage}` };
};

describe('invite link decoder properties', () => {
    it('decodes any payload the server mints, with or without base64 padding, to the same target', () => {
        fc.assert(
            fc.property(payload, fc.boolean(), (minted, padded) => {
                const json = JSON.stringify(minted);

                expect(decodeInviteLink(linkOf(tokenOf(json, padded)))).toEqual(expectedTarget(minted));
            }),
            RUNS
        );
    });

    it('accepts and refuses the same UTF-8 bytes the platform decoder does', () => {
        const strict = new TextDecoder('utf-8', { fatal: true });
        fc.assert(
            fc.property(utf8ShapedBytes, bytes => {
                const body = Buffer.concat([Buffer.from('{"c":"x'), Buffer.from(bytes), Buffer.from('"}')]);
                let platform: string | null;
                try {
                    platform = strict.decode(body);
                } catch {
                    platform = null;
                }

                const reading = readInviteLink(linkOf(body.toString('base64url')));

                expect(reading.failedAt === 'utf8').toBe(platform === null);
            }),
            RUNS
        );
    });

    it('never throws on a mangled link and always names a failure when it finds no target', () => {
        fc.assert(
            fc.property(fc.string({ maxLength: 60 }), fc.string({ unit: 'binary', maxLength: 60 }), (raw, junk) => {
                for (const url of [linkOf(raw), linkOf(encodeURIComponent(junk)), raw]) {
                    const reading = readInviteLink(url);

                    expect(reading.target === null).toBe(reading.failedAt !== undefined);
                    expect(reading.ignoredChars).toBeGreaterThanOrEqual(0);
                    expect(reading.ignoredChars).toBeLessThanOrEqual(reading.length);
                }
            }),
            RUNS
        );
    });
});

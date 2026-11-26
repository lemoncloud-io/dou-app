import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { LemonHmacSigner } from '../../../libs/auth/src/signing';

type Vector = { name: string } & Record<string, unknown>;
type VectorFile = { source: string; vectors: Vector[] };

const OUT_DIR = join(process.cwd(), 'apps/desktop-native/vectors');
const signer = new LemonHmacSigner();

const signingFile = (): VectorFile => {
    const material = [
        { name: 'relay', authId: 'auth-relay-id', accountId: 'account-relay-1', identityId: 'identity-relay-1' },
        { name: 'cloud', authId: 'token-authid-cloud-1', accountId: 'account-cloud-1', identityId: 'identity-cloud-1' },
        { name: 'unicode-user-agent', authId: 'a', accountId: 'b', identityId: 'c' },
        { name: 'empty-identity', authId: 'auth-relay-id', accountId: 'account-relay-1', identityId: '' },
    ];
    const clocks = [
        { current: '2026-08-27T00:00:00.000Z', userAgent: 'fixture-ua/1.0' },
        { current: '2026-08-27T00:00:00.001Z', userAgent: 'fixture-ua/1.0' },
        { current: '2026-11-26T09:41:07.123Z', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) 한글 é' },
    ];
    const vectors = material.flatMap(m =>
        clocks.map((c, i) => ({
            name: `${m.name}-${i}`,
            authId: m.authId,
            accountId: m.accountId,
            identityId: m.identityId,
            current: c.current,
            userAgent: c.userAgent,
            signature: signer.sign(m, c).signature,
        }))
    );
    return { source: 'libs/auth/src/signing/LemonHmacSigner.ts', vectors };
};

const FILES: Record<string, () => VectorFile> = {
    'signing.json': signingFile,
};

const render = (file: VectorFile): string => `${JSON.stringify(file, null, 2)}\n`;

const main = (): void => {
    const check = process.argv.includes('--check');
    const drifted: string[] = [];
    for (const [name, build] of Object.entries(FILES)) {
        const path = join(OUT_DIR, name);
        const next = render(build());
        if (check) {
            let current = '';
            try {
                current = readFileSync(path, 'utf8');
            } catch {
                current = '';
            }
            if (current.replace(/\r\n/g, '\n') !== next) drifted.push(name);
        } else {
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, next);
        }
    }
    if (drifted.length > 0) {
        console.error(`vectors out of date: ${drifted.join(', ')} — run: npx nx run desktop-native:vectors`);
        process.exit(1);
    }
};

main();

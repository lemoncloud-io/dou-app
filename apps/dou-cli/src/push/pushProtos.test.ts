import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { build } from 'esbuild';

const load = createRequire(__filename);
const { protoTexts, pushProtos } = load('../../scripts/bundle-options.cjs');
const receiverEntry = load.resolve('@liamcottle/push-receiver');
const receiverDir = dirname(receiverEntry);
const protobuf = createRequire(receiverEntry)('protobufjs');

describe('pushProtos', () => {
    it('inlines every proto the receiver loads from its folder', async () => {
        const out = await build({
            entryPoints: [receiverEntry],
            bundle: true,
            platform: 'node',
            format: 'cjs',
            write: false,
            logLevel: 'silent',
            plugins: [pushProtos],
        });
        const text = out.outputFiles[0].text;
        expect(text).not.toMatch(/__dirname, ["'][\w.-]+\.proto/);
        expect(text).toContain('message LoginRequest');
        expect(text).toContain('message AndroidCheckinRequest');
    }, 60_000);

    it('gives texts that parse into the types the receiver looks up', () => {
        const checkin = new protobuf.Root();
        for (const text of protoTexts(join(receiverDir, 'gcm'), 'checkin.proto')) protobuf.parse(text, checkin);
        expect(checkin.lookupType('checkin_proto.AndroidCheckinRequest')).toBeTruthy();
        expect(checkin.lookupType('checkin_proto.AndroidCheckinResponse')).toBeTruthy();

        const mcs = new protobuf.Root();
        for (const text of protoTexts(receiverDir, 'mcs.proto')) protobuf.parse(text, mcs);
        expect(mcs.lookupType('mcs_proto.LoginRequest')).toBeTruthy();
    });
});

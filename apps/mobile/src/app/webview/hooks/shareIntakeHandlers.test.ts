import type { OnFetchShareIntakePayload } from '@chatic/app-messages';
import type { IShareIntakeBridge } from '../../bridge';
import type { ILogService } from '../../services';

import { createShareIntakeHandlers } from './shareIntakeHandlers';

// The real bridge barrel loads every native module wrapper; the handlers receive the intake by
// injection and need nothing else from it at runtime.
jest.mock('../../bridge', () => ({}));

const createLoggerMock = (): jest.Mocked<ILogService> =>
    ({ subscribe: jest.fn(), debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) as any;

const id = '3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d';
const dir = `file:///data/user/0/io.chatic.dou/cache/attach-pick/${id}`;

const intake: OnFetchShareIntakePayload = {
    items: [
        { kind: 'file', uri: `${dir}/IMG_0001.jpg`, name: 'IMG_0001.jpg', contentType: 'image/jpeg', size: 5 },
        { kind: 'video', uri: `${dir}/clip.mp4`, name: 'clip.mp4', contentType: 'video/mp4', size: 1024 },
    ],
    refused: [{ name: 'huge.pdf', kind: 'file', reason: 'too-large' }],
    text: 'https://example.com/article',
};

const createBridge = (overrides: Partial<IShareIntakeBridge> = {}): jest.Mocked<IShareIntakeBridge> =>
    ({
        isAvailable: true,
        fetch: jest.fn().mockResolvedValue(intake),
        release: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    }) as jest.Mocked<IShareIntakeBridge>;

const fetchMessage = (data: unknown) => ({ type: 'FetchShareIntake', data }) as any;
const releaseMessage = (data: unknown) => ({ type: 'ReleaseShareIntake', data }) as any;

describe('createShareIntakeHandlers — FetchShareIntake', () => {
    it('answers with the items, refusals and text the native intake holds for the id', async () => {
        const bridge = createBridge();
        const { handleFetchShareIntake } = createShareIntakeHandlers(bridge, createLoggerMock());

        const reply = await handleFetchShareIntake(fetchMessage({ id }));

        expect(bridge.fetch).toHaveBeenCalledWith(id);
        expect(reply).toEqual({ type: 'OnFetchShareIntake', success: true, data: intake });
    });

    it.each([
        ['a missing id', {}],
        ['a non-string id', { id: 42 }],
        ['a path instead of an id', { id: '../../files/secret' }],
        ['an id with a trailing segment', { id: `${id}/x` }],
    ])('refuses %s as INVALID without asking native', async (_label, data) => {
        const bridge = createBridge();
        const { handleFetchShareIntake } = createShareIntakeHandlers(bridge, createLoggerMock());

        const reply = await handleFetchShareIntake(fetchMessage(data));

        expect(bridge.fetch).not.toHaveBeenCalled();
        expect(reply).toMatchObject({ type: 'OnFetchShareIntake', success: false, error: { code: 'INVALID' } });
    });

    it('keeps GONE when native no longer holds the share', async () => {
        const bridge = createBridge({
            fetch: jest.fn().mockRejectedValue(Object.assign(new Error('no such share'), { code: 'GONE' })),
        });
        const { handleFetchShareIntake } = createShareIntakeHandlers(bridge, createLoggerMock());

        const reply = await handleFetchShareIntake(fetchMessage({ id }));

        expect(reply).toMatchObject({ success: false, error: { code: 'GONE', message: 'no such share' } });
    });

    it('keeps INVALID when native refuses the id itself', async () => {
        const bridge = createBridge({
            fetch: jest.fn().mockRejectedValue(Object.assign(new Error('bad id'), { code: 'INVALID' })),
        });
        const { handleFetchShareIntake } = createShareIntakeHandlers(bridge, createLoggerMock());

        const reply = await handleFetchShareIntake(fetchMessage({ id }));

        expect(reply).toMatchObject({ success: false, error: { code: 'INVALID' } });
    });

    it('turns any other native rejection into INTERNAL, never NOT_FOUND', async () => {
        const bridge = createBridge({
            fetch: jest.fn().mockRejectedValue(Object.assign(new Error('nope'), { code: 'NOT_FOUND' })),
        });
        const { handleFetchShareIntake } = createShareIntakeHandlers(bridge, createLoggerMock());

        const reply = await handleFetchShareIntake(fetchMessage({ id }));

        expect(reply).toMatchObject({ success: false, error: { code: 'INTERNAL' } });
    });

    it('fails as INTERNAL when native answers without the item lists', async () => {
        const bridge = createBridge({ fetch: jest.fn().mockResolvedValue({ text: 'x' }) });
        const { handleFetchShareIntake } = createShareIntakeHandlers(bridge, createLoggerMock());

        const reply = await handleFetchShareIntake(fetchMessage({ id }));

        expect(reply).toMatchObject({ success: false, error: { code: 'INTERNAL' } });
    });

    it('logs counts only, never the shared names or text', async () => {
        const logger = createLoggerMock();
        const { handleFetchShareIntake } = createShareIntakeHandlers(createBridge(), logger);

        await handleFetchShareIntake(fetchMessage({ id }));

        const logged = JSON.stringify(logger.info.mock.calls);
        expect(logged).toContain('2 items');
        expect(logged).not.toContain('IMG_0001');
        expect(logged).not.toContain('example.com');
    });
});

describe('createShareIntakeHandlers — ReleaseShareIntake', () => {
    it('relays the id and the discard flag', async () => {
        const bridge = createBridge();
        const { handleReleaseShareIntake } = createShareIntakeHandlers(bridge, createLoggerMock());

        const reply = await handleReleaseShareIntake(releaseMessage({ id, discard: true }));

        expect(bridge.release).toHaveBeenCalledWith(id, true);
        expect(reply).toEqual({ type: 'OnReleaseShareIntake', success: true, data: {} });
    });

    it('refuses a malformed id or a missing discard flag as INVALID', async () => {
        const bridge = createBridge();
        const { handleReleaseShareIntake } = createShareIntakeHandlers(bridge, createLoggerMock());

        const badId = await handleReleaseShareIntake(releaseMessage({ id: '..', discard: true }));
        const noFlag = await handleReleaseShareIntake(releaseMessage({ id }));

        expect(bridge.release).not.toHaveBeenCalled();
        expect(badId).toMatchObject({ success: false, error: { code: 'INVALID' } });
        expect(noFlag).toMatchObject({ success: false, error: { code: 'INVALID' } });
    });

    it('reports a failed release as INTERNAL, and logs it on this side', async () => {
        const bridge = createBridge({ release: jest.fn().mockRejectedValue(new Error('disk')) });
        const logger = createLoggerMock();
        const { handleReleaseShareIntake } = createShareIntakeHandlers(bridge, logger);

        const reply = await handleReleaseShareIntake(releaseMessage({ id, discard: true }));

        expect(reply).toMatchObject({ success: false, error: { code: 'INTERNAL', message: 'disk' } });
        expect(logger.warn).toHaveBeenCalledWith('file.share_intake_release_failed', expect.stringContaining('true'));
    });
});

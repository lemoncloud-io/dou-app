import { act, renderHook } from '@testing-library/react';

import { releaseShareIntake } from '../../../bridge/shareIntake';
import type { ShareDestination } from './useShareDestinations';
import { useShareSend, type SendFiles } from './useShareSend';

const mockSendChatInCloud = jest.fn();
jest.mock('@chatic/app-runtime', () => ({
    runtime: { data: { sendChatInCloud: (...args: unknown[]) => mockSendChatInCloud(...args) } },
}));
const mockWarn = jest.fn();
jest.mock('@chatic/bridges', () => ({ logger: { warn: (...args: unknown[]) => mockWarn(...args) } }));
jest.mock('../../../bridge/shareIntake', () => ({ releaseShareIntake: jest.fn().mockResolvedValue(undefined) }));
const mockReadPhotos = jest.fn();
jest.mock('../../../bridge/attachmentPicker', () => ({
    attachmentPicker: { readPhotos: (...args: unknown[]) => mockReadPhotos(...args) },
}));
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));
const mockToast = jest.fn();
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options?: Record<string, unknown>) => (options ? `${key}|${JSON.stringify(options)}` : key),
    }),
}));

const intakeId = '3f2b8c1e-9a4d-4c7b-8e21-5d6f7a8b9c0d';
const file = (name: string) => ({
    uri: `file:///cache/attach-pick/${intakeId}/${name}`,
    name,
    type: 'application/pdf',
    size: 1,
    kind: 'file' as const,
});
const room = (id: string, kind: ShareDestination['kind'] = 'group'): ShareDestination => ({
    id,
    cid: 'cloud-a',
    kind,
    title: id,
});

/** Mounts the hook with a sender registered for each room, as `DestinationSender` would. */
const setup = (senders: Record<string, SendFiles>) => {
    const hook = renderHook(() => useShareSend(intakeId));
    for (const [channelId, send] of Object.entries(senders)) hook.result.current.register(channelId, send);
    return hook;
};

beforeEach(() => {
    jest.clearAllMocks();
    mockSendChatInCloud.mockResolvedValue({});
    mockReadPhotos.mockImplementation(async (items: unknown[]) => ({ items, refused: [] }));
});

describe('useShareSend', () => {
    it('sends the files to every room through its own sender, with the text as the caption', async () => {
        const sendA = jest.fn().mockResolvedValue(undefined);
        const sendB = jest.fn().mockResolvedValue(undefined);
        const { result } = setup({ a: sendA, b: sendB });
        const files = [file('a.pdf'), file('b.pdf')];

        await act(async () => result.current.send({ destinations: [room('a'), room('b')], files, content: 'look' }));

        expect(sendA).toHaveBeenCalledWith(files, { content: 'look' });
        expect(sendB).toHaveBeenCalledWith(files, { content: 'look' });
        expect(mockSendChatInCloud).not.toHaveBeenCalled();
    });

    it('keeps sending to the other rooms when one fails, and logs the failure', async () => {
        const sendA = jest.fn().mockRejectedValue(new Error('upload'));
        const sendB = jest.fn().mockResolvedValue(undefined);
        const { result } = setup({ a: sendA, b: sendB });

        await act(async () =>
            result.current.send({ destinations: [room('a'), room('b')], files: [file('a.pdf')], content: '' })
        );

        expect(sendB).toHaveBeenCalledWith([file('a.pdf')], {});
        expect(mockWarn).toHaveBeenCalledWith(
            'chat.share_send_failed',
            expect.any(String),
            expect.objectContaining({ cid: 'cloud-a', channelId: 'a' })
        );
        // A rejected file send left no failed row behind, so the person is told here.
        expect(mockToast).toHaveBeenCalledWith({ title: 'share.sendFailedSome' });
    });

    it('sends text alone as a plain message, with no attachment send', async () => {
        const sendA = jest.fn();
        const { result } = setup({ a: sendA });

        await act(async () => result.current.send({ destinations: [room('a', 'dm')], files: [], content: 'https://example.com' }));

        expect(mockSendChatInCloud).toHaveBeenCalledWith('cloud-a', { channelId: 'a', content: 'https://example.com' });
        expect(sendA).not.toHaveBeenCalled();
    });

    it('releases the share without discarding the copies the uploads still read', async () => {
        const { result } = setup({ a: jest.fn().mockResolvedValue(undefined) });

        await act(async () => result.current.send({ destinations: [room('a')], files: [file('a.pdf')], content: '' }));

        expect(releaseShareIntake).toHaveBeenCalledWith(intakeId, { discard: false });
    });

    it('opens the room when the share went to one', async () => {
        const { result } = setup({ a: jest.fn().mockResolvedValue(undefined) });

        await act(async () => result.current.send({ destinations: [room('a')], files: [file('a.pdf')], content: '' }));

        expect(mockNavigate).toHaveBeenCalledWith('/channels/a/room', { replace: true });
        expect(mockToast).not.toHaveBeenCalled();
    });

    it('says how many rooms it went to and goes home when it went to several', async () => {
        const { result } = setup({
            a: jest.fn().mockResolvedValue(undefined),
            b: jest.fn().mockResolvedValue(undefined),
        });

        await act(async () => result.current.send({ destinations: [room('a'), room('b')], files: [file('a.pdf')], content: '' }));

        expect(mockToast).toHaveBeenCalledWith({ title: 'share.sentMany|{"count":2}', description: undefined });
        expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });

    it('sends once, however many times send is pressed', async () => {
        const sendA = jest.fn().mockResolvedValue(undefined);
        const { result } = setup({ a: sendA });
        const input = { destinations: [room('a')], files: [file('a.pdf')], content: '' };

        await act(async () => {
            void result.current.send(input);
            void result.current.send(input);
        });

        expect(sendA).toHaveBeenCalledTimes(1);
        expect(releaseShareIntake).toHaveBeenCalledTimes(1);
    });

    it('sends nothing without a room or without anything to send', async () => {
        const sendA = jest.fn();
        const { result } = setup({ a: sendA });

        await act(async () => result.current.send({ destinations: [], files: [file('a.pdf')], content: 'x' }));
        await act(async () => result.current.send({ destinations: [room('a')], files: [], content: '' }));

        expect(sendA).not.toHaveBeenCalled();
        expect(mockSendChatInCloud).not.toHaveBeenCalled();
        expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('sends nothing, and reads no photo, when a picked room has no sender, and can try again', async () => {
        const sendA = jest.fn().mockResolvedValue(undefined);
        const { result } = setup({ a: sendA });
        const input = { destinations: [room('a'), room('b')], files: [file('a.pdf')], content: '' };

        await act(async () => result.current.send(input));

        expect(mockReadPhotos).not.toHaveBeenCalled();
        expect(sendA).not.toHaveBeenCalled();
        expect(releaseShareIntake).not.toHaveBeenCalled();
        expect(mockNavigate).not.toHaveBeenCalled();
        expect(mockToast).toHaveBeenCalledWith({ title: 'share.sendFailed' });
        expect(result.current.isSending).toBe(false);
    });

    it('says what was left out in the same notice as the sent count, so neither replaces the other', async () => {
        mockReadPhotos.mockResolvedValue({
            items: [file('a.pdf')],
            refused: [{ name: 'IMG_1.jpg', kind: 'image', reason: 'unreadable' }],
        });
        const { result } = setup({ a: jest.fn().mockResolvedValue(undefined), b: jest.fn().mockResolvedValue(undefined) });

        await act(async () =>
            result.current.send({ destinations: [room('a'), room('b')], files: [file('IMG_1.jpg'), file('a.pdf')], content: '' })
        );

        expect(mockToast).toHaveBeenCalledTimes(1);
        expect(mockToast).toHaveBeenCalledWith({
            title: 'share.sentMany|{"count":2}',
            description: 'share.notSent|{"names":"IMG_1.jpg"}',
        });
    });

    it('reads the photos once, before any room, and sends what was read to every room', async () => {
        const photo = new File(['x'], 'IMG_1.jpg', { type: 'image/jpeg' });
        mockReadPhotos.mockResolvedValue({ items: [photo, file('a.pdf')], refused: [] });
        const sendA = jest.fn().mockResolvedValue(undefined);
        const sendB = jest.fn().mockResolvedValue(undefined);
        const { result } = setup({ a: sendA, b: sendB });
        const shared = [file('IMG_1.jpg'), file('a.pdf')];

        await act(async () => result.current.send({ destinations: [room('a'), room('b')], files: shared, content: '' }));

        expect(mockReadPhotos).toHaveBeenCalledTimes(1);
        expect(mockReadPhotos).toHaveBeenCalledWith(shared);
        expect(sendA).toHaveBeenCalledWith([photo, file('a.pdf')], {});
        expect(sendB).toHaveBeenCalledWith([photo, file('a.pdf')], {});
    });

    it('names a photo it could not read, and sends the rest', async () => {
        mockReadPhotos.mockResolvedValue({
            items: [file('a.pdf')],
            refused: [{ name: 'IMG_1.jpg', kind: 'image', reason: 'unreadable' }],
        });
        const sendA = jest.fn().mockResolvedValue(undefined);
        const { result } = setup({ a: sendA });

        await act(async () =>
            result.current.send({ destinations: [room('a')], files: [file('IMG_1.jpg'), file('a.pdf')], content: '' })
        );

        expect(mockToast).toHaveBeenCalledWith({ title: 'share.notSent|{"names":"IMG_1.jpg"}' });
        expect(sendA).toHaveBeenCalledWith([file('a.pdf')], {});
    });

    it('sends nothing and stays when the photos cannot be read at all, and can try again', async () => {
        mockReadPhotos.mockRejectedValueOnce(Object.assign(new Error('bridge'), { code: 'TIMEOUT' }));
        const sendA = jest.fn().mockResolvedValue(undefined);
        const { result } = setup({ a: sendA });
        const input = { destinations: [room('a')], files: [file('IMG_1.jpg')], content: '' };

        await act(async () => result.current.send(input));

        expect(sendA).not.toHaveBeenCalled();
        expect(mockNavigate).not.toHaveBeenCalled();
        expect(releaseShareIntake).not.toHaveBeenCalled();
        expect(mockToast).toHaveBeenCalledWith({ title: 'share.sendFailed' });
        expect(result.current.isSending).toBe(false);

        await act(async () => result.current.send(input));

        expect(sendA).toHaveBeenCalledTimes(1);
    });
});

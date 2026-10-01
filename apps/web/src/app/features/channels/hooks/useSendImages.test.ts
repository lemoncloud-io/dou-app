import { renderHook } from '@testing-library/react';

import { runtime } from '@chatic/app-runtime';

import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { attachmentPicker } from '../../../bridge/attachmentPicker';
import { useAppForeground } from '../../../bridge/useAppForeground';
import { getShellPut, syncShellTransfers } from '../../../bridge/shellUpload';
import { useSendImages } from './useSendImages';

jest.mock('@chatic/app-runtime', () => ({ runtime: { data: { useSendImages: jest.fn(() => ({})) } } }));
const shellPut = jest.fn();
const shellFilePut = jest.fn();
jest.mock('../../../bridge/shellUpload', () => ({
    getShellPut: jest.fn(() => shellPut),
    getShellFilePut: jest.fn(() => shellFilePut),
    syncShellTransfers: jest.fn(async () => undefined),
}));
jest.mock('../../../bridge/useAppForeground', () => ({ useAppForeground: jest.fn() }));
jest.mock('../../../bridge/attachmentPicker', () => ({ attachmentPicker: { prepareVideo: jest.fn() } }));
let mockNative = true;
jest.mock('@chatic/bridges', () => ({ isNative: () => mockNative }));
jest.mock('@chatic/ui-kit/components/ui/use-toast', () => ({ toast: jest.fn() }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

beforeEach(() => {
    jest.clearAllMocks();
    mockNative = true;
});

describe('useSendImages (web shell)', () => {
    it("binds the runtime's send to this shell's PUT and catch-up", () => {
        renderHook(() => useSendImages({ cid: 'cloud-a', channelId: 'ch-1', parentId: 'root-1' }));

        expect(getShellPut).toHaveBeenCalled();
        expect(runtime.data.useSendImages).toHaveBeenCalledWith({
            cid: 'cloud-a',
            channelId: 'ch-1',
            parentId: 'root-1',
            put: shellPut,
            putShellFile: shellFilePut,
            prepareVideo: attachmentPicker.prepareVideo,
            onVideoRefused: expect.any(Function),
            beforeSweep: syncShellTransfers,
        });
    });

    it('gives a browser no video conversion, since it never holds a shell video', () => {
        mockNative = false;
        renderHook(() => useSendImages({ cid: 'cloud-a', channelId: 'ch-1' }));

        expect((runtime.data.useSendImages as jest.Mock).mock.calls.at(-1)?.[0]).not.toHaveProperty('prepareVideo');
    });

    it('tells the user why the shell refused a video', () => {
        renderHook(() => useSendImages({ cid: 'cloud-a', channelId: 'ch-1' }));
        const [{ onVideoRefused }] = (runtime.data.useSendImages as jest.Mock).mock.calls.at(-1) ?? [{}];

        onVideoRefused('too-large');

        expect(toast).toHaveBeenCalledWith({ title: 'chat.attach.videoRefused.too-large' });
    });

    it('catches up with the shell whenever the app comes back to the front', () => {
        renderHook(() => useSendImages({ cid: 'cloud-a', channelId: 'ch-1' }));

        const onForeground = (useAppForeground as jest.Mock).mock.calls.at(-1)?.[0] as () => void;
        onForeground();

        expect(syncShellTransfers).toHaveBeenCalledTimes(1);
    });
});

import { act, renderHook, waitFor } from '@testing-library/react';

import { webClient } from '@chatic/bridges';

import { isDefaultAppIcon, useAppIcon } from './useAppIcon';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@chatic/bridges', () => ({
    webClient: { request: jest.fn() },
}));
const mockIsNative = jest.fn((): boolean => false);
// Whether the app runs the frame around the page, as the host's `appShell` port says.
jest.mock('@chatic/host', () => ({
    host: {
        get ports() {
            return { appShell: { kind: mockIsNative() ? 'app' : 'page', os: null } };
        },
    },
}));

const requestMock = webClient.request as jest.Mock;

// Resolve each bridge request based on its message type.
const mockBridge = () =>
    requestMock.mockImplementation(({ type }: { type: string }) => {
        switch (type) {
            case 'FetchAppIcon':
                return Promise.resolve({ success: true, data: { supported: true, iconName: 'alt' } });
            case 'FetchAppIconList':
                return Promise.resolve({
                    success: true,
                    data: { availableIcons: [{ id: 'alt', label: 'Alt Icon' }] },
                });
            case 'ChangeAppIcon':
                return Promise.resolve({ success: true, data: { success: true, iconName: 'alt' } });
            default:
                return Promise.resolve({ success: false });
        }
    });

beforeEach(() => {
    jest.clearAllMocks();
});

describe('useAppIcon — 네이티브 앱 아이콘', () => {
    it('비네이티브에서는 브릿지를 호출하지 않고 기본값을 유지한다', () => {
        mockIsNative.mockReturnValue(false);
        const { result } = renderHook(() => useAppIcon());

        expect(requestMock).not.toHaveBeenCalled();
        expect(result.current.isSupported).toBe(false);
        expect(result.current.currentIcon).toBe('default');
    });

    it('네이티브에서는 마운트 시 아이콘 상태와 목록을 불러온다', async () => {
        mockIsNative.mockReturnValue(true);
        mockBridge();
        const { result } = renderHook(() => useAppIcon());

        await waitFor(() => expect(result.current.isSupported).toBe(true));
        expect(result.current.currentIcon).toBe('alt');
        expect(result.current.availableIcons).toEqual([{ id: 'alt', label: 'Alt Icon' }]);
    });

    it('selectIcon이 성공하면 현재 아이콘을 갱신하고 true를 반환한다', async () => {
        mockIsNative.mockReturnValue(true);
        mockBridge();
        const { result } = renderHook(() => useAppIcon());

        let changed: boolean | undefined;
        await act(async () => {
            changed = await result.current.selectIcon('alt');
        });

        expect(changed).toBe(true);
        expect(result.current.currentIcon).toBe('alt');
    });

    it('selectIcon이 실패하면 false를 반환한다', async () => {
        mockIsNative.mockReturnValue(true);
        requestMock.mockResolvedValue({ success: false });
        const { result } = renderHook(() => useAppIcon());

        let changed: boolean | undefined;
        await act(async () => {
            changed = await result.current.selectIcon('alt');
        });

        expect(changed).toBe(false);
    });
});

describe('isDefaultAppIcon', () => {
    it('treats every name the primary icon goes by as the default', () => {
        expect(isDefaultAppIcon(null)).toBe(true);
        expect(isDefaultAppIcon('default')).toBe(true);
        expect(isDefaultAppIcon('DefaultIcon')).toBe(true);
    });

    it('does not treat an alternate as the default', () => {
        expect(isDefaultAppIcon('WhiteIcon')).toBe(false);
    });
});

describe('useAppIcon — the primary icon reported by its stored name', () => {
    it('labels DefaultIcon as the default icon', async () => {
        mockIsNative.mockReturnValue(true);
        requestMock.mockImplementation(({ type }: { type: string }) =>
            Promise.resolve(
                type === 'FetchAppIcon'
                    ? { success: true, data: { supported: true, iconName: 'DefaultIcon' } }
                    : { success: true, data: { availableIcons: [{ id: null, label: 'Default' }] } }
            )
        );
        const { result } = renderHook(() => useAppIcon());

        await waitFor(() => expect(result.current.currentIcon).toBe('DefaultIcon'));
        expect(result.current.currentIconLabel).toBe('mypage.appIcon.default');
    });
});

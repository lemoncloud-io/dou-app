import { act, renderHook, waitFor } from '@testing-library/react';

import { recordAppIconChange } from '../../../runtime/telemetry/appIcon';
import { isDefaultAppIcon, useAppIcon } from './useAppIcon';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@chatic/bridges', () => ({
    logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../../runtime/telemetry/appIcon', () => ({ recordAppIconChange: jest.fn() }));
const mockIsNative = jest.fn((): boolean => false);
const mockAppIcon = { current: jest.fn(), options: jest.fn(), change: jest.fn() };
jest.mock('@chatic/runtime', () => {
    const { browserAppShell, fakeRuntimeModule } = require('@chatic/runtime/testing');
    return fakeRuntimeModule({
        get appShell() {
            return { ...browserAppShell(), appIcon: mockIsNative() ? mockAppIcon : null };
        },
    });
});

const mockFrame = () => {
    mockAppIcon.current.mockResolvedValue({ supported: true, iconName: 'alt' });
    mockAppIcon.options.mockResolvedValue([{ id: 'alt', label: 'Alt Icon' }]);
    mockAppIcon.change.mockResolvedValue({ iconName: 'alt' });
};

const mockSilentFrame = () => {
    mockAppIcon.current.mockResolvedValue(null);
    mockAppIcon.options.mockResolvedValue(null);
    mockAppIcon.change.mockResolvedValue(null);
};

beforeEach(() => {
    jest.clearAllMocks();
});

describe('useAppIcon — 네이티브 앱 아이콘', () => {
    it('비네이티브에서는 브릿지를 호출하지 않고 기본값을 유지한다', () => {
        mockIsNative.mockReturnValue(false);
        const { result } = renderHook(() => useAppIcon());

        expect(mockAppIcon.current).not.toHaveBeenCalled();
        expect(mockAppIcon.options).not.toHaveBeenCalled();
        expect(result.current.isSupported).toBe(false);
        expect(result.current.currentIcon).toBe('default');
    });

    it('네이티브에서는 마운트 시 아이콘 상태와 목록을 불러온다', async () => {
        mockIsNative.mockReturnValue(true);
        mockFrame();
        const { result } = renderHook(() => useAppIcon());

        await waitFor(() => expect(result.current.isSupported).toBe(true));
        expect(result.current.currentIcon).toBe('alt');
        expect(result.current.availableIcons).toEqual([{ id: 'alt', label: 'Alt Icon' }]);
    });

    it('selectIcon이 성공하면 현재 아이콘을 갱신하고 true를 반환한다', async () => {
        mockIsNative.mockReturnValue(true);
        mockFrame();
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
        mockSilentFrame();
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
        mockAppIcon.current.mockResolvedValue({ supported: true, iconName: 'DefaultIcon' });
        mockAppIcon.options.mockResolvedValue([{ id: null, label: 'Default' }]);
        const { result } = renderHook(() => useAppIcon());

        await waitFor(() => expect(result.current.currentIcon).toBe('DefaultIcon'));
        expect(result.current.currentIconLabel).toBe('mypage.appIcon.default');
    });
});

describe('useAppIcon — the change statistic', () => {
    it('records a successful change from the icon in use to the one the app applied', async () => {
        mockIsNative.mockReturnValue(true);
        mockAppIcon.current.mockResolvedValue({ supported: true, iconName: 'DefaultIcon' });
        mockAppIcon.options.mockResolvedValue([]);
        mockAppIcon.change.mockResolvedValue({ iconName: 'MidnightIcon' });
        const { result } = renderHook(() => useAppIcon());
        await waitFor(() => expect(result.current.currentIcon).toBe('DefaultIcon'));

        await act(async () => {
            await result.current.selectIcon('MidnightIcon');
        });

        expect(recordAppIconChange).toHaveBeenCalledWith('DefaultIcon', 'MidnightIcon');
    });

    it('records nothing when the app did not apply the change', async () => {
        mockIsNative.mockReturnValue(true);
        mockAppIcon.current.mockResolvedValue({ supported: true, iconName: 'DefaultIcon' });
        mockAppIcon.options.mockResolvedValue([]);
        mockAppIcon.change.mockResolvedValue(null);
        const { result } = renderHook(() => useAppIcon());

        await act(async () => {
            await result.current.selectIcon('MidnightIcon');
        });

        expect(recordAppIconChange).not.toHaveBeenCalled();
    });
});

describe('useAppIcon — a frame without alternate icons', () => {
    it('changes nothing and reports the change as not made', async () => {
        mockIsNative.mockReturnValue(false);
        const { result } = renderHook(() => useAppIcon());

        let changed: boolean | undefined;
        await act(async () => {
            changed = await result.current.selectIcon('alt');
        });

        expect(changed).toBe(false);
        expect(mockAppIcon.change).not.toHaveBeenCalled();
        expect(recordAppIconChange).not.toHaveBeenCalled();
    });
});

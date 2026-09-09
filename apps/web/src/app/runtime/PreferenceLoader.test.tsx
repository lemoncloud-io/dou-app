import { render } from '@testing-library/react';

import { isNative } from '@chatic/bridges';
import { config } from '@chatic/config';
import { appBridge } from '../bridge';
import { PreferenceLoader } from './PreferenceLoader';

jest.mock('@chatic/bridges', () => ({ isNative: jest.fn() }));
jest.mock('@chatic/config', () => ({
    config: { snapshot: jest.fn(), set: jest.fn() },
}));
jest.mock('../bridge', () => ({ appBridge: { fetchPreference: jest.fn() } }));

const mockIsNative = isNative as jest.MockedFunction<typeof isNative>;
const mockSnapshot = config.snapshot as jest.Mock;
const mockSet = config.set as jest.Mock;
const mockFetchPreference = appBridge.fetchPreference as jest.Mock;

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
    jest.clearAllMocks();
    mockSnapshot.mockReturnValue({ isOverridden: false });
    mockFetchPreference.mockResolvedValue({ data: { value: null } });
});

describe('PreferenceLoader — 구 셸 브릿지 폴백', () => {
    it('네이티브가 아니면 아무 것도 조회하지 않는다', async () => {
        mockIsNative.mockReturnValue(false);
        render(<PreferenceLoader />);
        await flush();

        expect(mockFetchPreference).not.toHaveBeenCalled();
    });

    it('이미 셸/로컬이 답한 키는 조회하지 않는다', async () => {
        mockIsNative.mockReturnValue(true);
        mockSnapshot.mockReturnValue({ isOverridden: true });

        render(<PreferenceLoader />);
        await flush();

        expect(mockFetchPreference).not.toHaveBeenCalled();
    });

    it('답이 없는 키만 레거시 브릿지로 조회한다', async () => {
        mockIsNative.mockReturnValue(true);

        render(<PreferenceLoader />);
        await flush();

        expect(mockFetchPreference).toHaveBeenCalledWith({ key: 'blurLastMessage' });
        expect(mockFetchPreference).toHaveBeenCalledWith({ key: 'isFirstRun' });
        expect(mockFetchPreference).toHaveBeenCalledWith({ key: 'theme' });
        expect(mockFetchPreference).toHaveBeenCalledTimes(3);
    });

    it('블러 설정은 shell 레인으로 그대로 옮긴다', async () => {
        mockIsNative.mockReturnValue(true);
        mockFetchPreference.mockImplementation(({ key }) =>
            Promise.resolve({ data: { key, value: key === 'blurLastMessage' ? true : null } })
        );

        render(<PreferenceLoader />);
        await flush();

        expect(mockSet).toHaveBeenCalledWith('ui.blurLastMessage', true, { lane: 'shell' });
    });

    it('isFirstRun은 극성을 반전해 onboardingCompleted로 옮긴다', async () => {
        mockIsNative.mockReturnValue(true);
        // isFirstRun: true means NOT onboarded yet — the opposite of onboardingCompleted.
        mockFetchPreference.mockImplementation(({ key }) =>
            Promise.resolve({ data: { key, value: key === 'isFirstRun' ? true : null } })
        );

        render(<PreferenceLoader />);
        await flush();

        expect(mockSet).toHaveBeenCalledWith('ui.onboardingCompleted', false, { lane: 'shell' });
    });

    it('모바일 zustand-persist 봉투 형태의 테마도 파싱해 옮긴다', async () => {
        mockIsNative.mockReturnValue(true);
        mockFetchPreference.mockImplementation(({ key }) =>
            Promise.resolve({
                data: { key, value: key === 'theme' ? '{"state":{"theme":"dark"},"version":0}' : null },
            })
        );

        render(<PreferenceLoader />);
        await flush();

        expect(mockSet).toHaveBeenCalledWith('ui.theme', 'dark', { lane: 'shell' });
    });

    it('값이 없거나 해석 불가능하면 쓰지 않는다', async () => {
        mockIsNative.mockReturnValue(true);
        mockFetchPreference.mockImplementation(({ key }) =>
            Promise.resolve({ data: { key, value: key === 'theme' ? 'not-a-theme' : null } })
        );

        render(<PreferenceLoader />);
        await flush();

        expect(mockSet).not.toHaveBeenCalled();
    });
});

import { Platform } from 'react-native';

import { BadgeSyncBridge } from './BadgeSyncBridge';

const mockSetBase = jest.fn().mockResolvedValue(true);

jest.mock('react-native', () => ({
    Platform: { OS: 'android' },
    NativeModules: {
        BadgeSync: { setBase: (count: number) => mockSetBase(count) },
    },
}));

describe('BadgeSyncBridge.setBase — 네이티브 뱃지 base 동기화', () => {
    beforeEach(() => {
        mockSetBase.mockClear();
        Platform.OS = 'android';
    });

    it('Android에서는 네이티브 BadgeSync.setBase로 값을 전달한다', async () => {
        await BadgeSyncBridge.setBase(5);
        expect(mockSetBase).toHaveBeenCalledWith(5);
    });

    it('iOS에서는 네이티브를 호출하지 않는다 (base는 AppDelegate가 캡처하므로)', async () => {
        Platform.OS = 'ios';
        await BadgeSyncBridge.setBase(5);
        expect(mockSetBase).not.toHaveBeenCalled();
    });
});

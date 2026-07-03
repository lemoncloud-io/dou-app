import { Linking } from 'react-native';
import { DeeplinkService } from './DeeplinkService';
import type { ILogService } from '../log';
import type { DeepLinkManager } from './DeepLinkManager';

// Mock react-native
jest.mock('react-native', () => ({
    Linking: {
        canOpenURL: jest.fn().mockResolvedValue(true),
        openURL: jest.fn().mockResolvedValue(true),
        getInitialURL: jest.fn().mockResolvedValue(null),
        addEventListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
    },
    NativeModules: {
        InitialUrlModule: {
            getInitialUniversalLink: jest.fn().mockResolvedValue(null),
        },
    },
    Platform: {
        OS: 'ios',
    },
}));

// Mock react-native-config
jest.mock('react-native-config', () => ({
    default: {
        VITE_ENV: 'DEV',
    },
}));

// Dummy logger
const dummyLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
} as unknown as ILogService;

const dummyManager = {
    getInitialUrl: jest.fn(),
    subscribe: jest.fn(),
    waitForColdStart: jest.fn(),
} as unknown as DeepLinkManager;

describe('DeeplinkService', () => {
    let service: DeeplinkService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new DeeplinkService(dummyManager, dummyLogger);
    });

    it('should normalize and route relative path URLs to custom scheme (dev mode)', async () => {
        await service.handleUrl('/auth/login?code=123');

        expect(Linking.canOpenURL).toHaveBeenCalledWith('chatic-dev://auth/login?code=123');
        expect(Linking.openURL).toHaveBeenCalledWith('chatic-dev://auth/login?code=123');
    });

    it('should open full scheme URLs directly without modification', async () => {
        await service.handleUrl('chatic://s?code=invt:910001:3f9a8b&api=vjgudphpo4');

        expect(Linking.canOpenURL).toHaveBeenCalledWith('chatic://s?code=invt:910001:3f9a8b&api=vjgudphpo4');
        expect(Linking.openURL).toHaveBeenCalledWith('chatic://s?code=invt:910001:3f9a8b&api=vjgudphpo4');
    });

    it('should skip empty URLs gracefully', async () => {
        await service.handleUrl('');
        expect(Linking.canOpenURL).not.toHaveBeenCalled();
        expect(Linking.openURL).not.toHaveBeenCalled();
    });

    it('should log an error if scheme is not supported', async () => {
        (Linking.canOpenURL as jest.Mock).mockResolvedValueOnce(false);

        await service.handleUrl('unsupported://xyz');

        expect(Linking.canOpenURL).toHaveBeenCalledWith('unsupported://xyz');
        expect(Linking.openURL).not.toHaveBeenCalled();
        expect(dummyLogger.error).toHaveBeenCalledWith(
            'DEEPLINK',
            expect.stringContaining('URL scheme is not supported')
        );
    });
});

describe('DeeplinkService.resolveInbound', () => {
    const service = new DeeplinkService(dummyManager, dummyLogger);

    it('초대 링크를 web 결과(provider=invite 포함)로 위임 해석한다', () => {
        const result = service.resolveInbound('chatic://s?code=invt:910001:test&api=dev');

        expect(result.kind).toBe('web');
        if (result.kind === 'web') {
            expect(result.path).toContain('/?code=invt%3A910001%3Atest');
            expect(result.path).toContain('provider=invite');
        }
    });

    it('커스텀 스킴 웹 링크를 host 없는 상대 경로로 축약한다', () => {
        const result = service.resolveInbound('chatic-dev://auth/login?code=123');
        expect(result).toEqual({ kind: 'web', path: '/auth/login?code=123' });
    });

    it('target=native 디버그 링크를 native 상태로 해석한다', () => {
        const result = service.resolveInbound('chatic://debug/DeeplinkTest?target=native&param1=hello');

        expect(result.kind).toBe('native');
        if (result.kind === 'native') {
            expect(result.state.routes[0].name).toBe('Debug');
        }
    });

    it('유효하지 않은 스킴은 invalid를 반환한다', () => {
        const result = service.resolveInbound('unsupported://xyz');
        expect(result.kind).toBe('invalid');
    });
});

describe('DeeplinkService.resolvePushTap', () => {
    const service = new DeeplinkService(dummyManager, dummyLogger);

    it('link와 payload의 cid/sid를 병합한 상대 경로를 반환한다', () => {
        const path = service.resolvePushTap({
            link: 'channel?channelId=room_1',
            payload: { cid: 'c1', sid: 's1' },
        });

        expect(path).toBe('/channel?channelId=room_1&cid=c1&sid=s1');
    });

    it('link가 없으면 null을 반환해 강제 네비게이션을 막는다', () => {
        expect(service.resolvePushTap({ payload: { cid: 'c1' } })).toBeNull();
    });
});

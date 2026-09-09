import { ConfigKvService } from './ConfigKvService';
import type { ILogService } from '../log';
import type { IKeyValueStorage } from '../../database';

describe('ConfigKvService', () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as unknown as ILogService;
    let storage: jest.Mocked<IKeyValueStorage>;
    let service: ConfigKvService;

    beforeEach(() => {
        jest.clearAllMocks();
        storage = {
            set: jest.fn().mockResolvedValue(undefined),
            get: jest.fn(),
            setSync: jest.fn(),
            getSync: jest.fn(),
            remove: jest.fn().mockResolvedValue(undefined),
            clearAll: jest.fn(),
            getAllKeys: jest.fn().mockReturnValue([]),
        };
        service = new ConfigKvService(logger, storage);
    });

    describe('getAll', () => {
        it('config: 접두사가 붙은 키만 접두사를 벗겨 돌려준다', () => {
            storage.getAllKeys.mockReturnValue([
                'config:ui.theme',
                'preference:theme',
                'config:debug.mockService.mode',
            ]);
            storage.getSync.mockImplementation((key: string) => {
                if (key === 'config:ui.theme') return '"dark"';
                if (key === 'config:debug.mockService.mode') return '"off"';
                return null;
            });

            expect(service.getAll()).toEqual({ 'ui.theme': '"dark"', 'debug.mockService.mode': '"off"' });
            // Only the two config-prefixed keys are ever read back — the unrelated preference key
            // is filtered out before a single getSync call, not after.
            expect(storage.getSync).toHaveBeenCalledTimes(2);
        });

        it('접두사가 없는 스토어에서는 빈 봉투를 돌려준다', () => {
            storage.getAllKeys.mockReturnValue(['preference:theme', 'appIcon:selected']);

            expect(service.getAll()).toEqual({});
            expect(storage.getSync).not.toHaveBeenCalled();
        });

        it('getSync가 null을 돌려준 키는 봉투에서 뺀다', () => {
            storage.getAllKeys.mockReturnValue(['config:ui.theme']);
            storage.getSync.mockReturnValue(null);

            expect(service.getAll()).toEqual({});
        });

        it('스토리지가 던지면 로그를 남기고 빈 봉투로 폴백한다 — 부팅 주입을 깨지 않는다', () => {
            storage.getAllKeys.mockImplementation(() => {
                throw new Error('mmkv unavailable');
            });

            expect(service.getAll()).toEqual({});
            expect(logger.error).toHaveBeenCalledWith('CONFIG', 'Failed to read config bag', expect.any(Error));
        });
    });

    describe('set', () => {
        it('config: 접두사를 붙여 저장한다', async () => {
            await service.set('ui.theme', '"dark"');
            expect(storage.set).toHaveBeenCalledWith('config:ui.theme', '"dark"');
        });

        it('저장이 실패하면 로그를 남기고 다시 던진다 — 확인 응답이 실패를 알아야 한다', async () => {
            const error = new Error('mmkv write failed');
            storage.set.mockRejectedValue(error);

            await expect(service.set('ui.theme', '"dark"')).rejects.toBe(error);
            expect(logger.error).toHaveBeenCalledWith('CONFIG', 'Failed to set config value: ui.theme', error);
        });
    });

    describe('remove', () => {
        it('config: 접두사를 붙여 지운다', async () => {
            await service.remove('ui.theme');
            expect(storage.remove).toHaveBeenCalledWith('config:ui.theme');
        });

        it('삭제가 실패하면 로그를 남기고 다시 던진다', async () => {
            const error = new Error('mmkv remove failed');
            storage.remove.mockRejectedValue(error);

            await expect(service.remove('ui.theme')).rejects.toBe(error);
            expect(logger.error).toHaveBeenCalledWith('CONFIG', 'Failed to remove config value: ui.theme', error);
        });
    });
});

import { logBuffer } from '@chatic/logger';
import type { LogEntry, LogPersistence } from '@chatic/logger';
import { LogService } from './LogService';
import { LogBufferService } from './buffer/LogBufferService';
import { ConsoleLogger } from './console/ConsoleLogger';

const createFakePersistence = (initial: LogEntry[] = []): LogPersistence & { saves: LogEntry[][] } => {
    const saves: LogEntry[][] = [];
    return {
        saves,
        load: () => initial,
        save: entries => {
            saves.push(entries);
        },
    };
};

afterEach(() => {
    logBuffer.clear();
});

describe('LogService (core-backed)', () => {
    it('코어 버퍼에 발생 시각이 스탬프된 LogEntry로 적재된다', () => {
        const service = new LogService();
        const before = Date.now();

        service.info('SMS', 'sent', { to: '010' });

        const [entry] = logBuffer.peek();
        expect(entry).toMatchObject({ level: 'info', tag: 'SMS', message: 'sent', data: { to: '010' } });
        expect(entry.timestamp).toBeGreaterThanOrEqual(before);
    });

    it('구독자는 LogEntry 객체 하나를 받는다 (위치 인자 시그니처 제거)', () => {
        const service = new LogService();
        const listener = jest.fn();
        const unsubscribe = service.subscribe(listener);

        service.warn('STORAGE', 'slow');
        unsubscribe();
        service.warn('STORAGE', 'after');

        expect(listener).toHaveBeenCalledTimes(1);
        expect(listener.mock.calls[0][0]).toMatchObject({ level: 'warn', tag: 'STORAGE', message: 'slow' });
    });

    it('error는 raw error 인자와 options 형태 모두 entry.error로 실린다', () => {
        const service = new LogService();
        const raw = new Error('raw');

        service.error('APP', 'legacy', raw);
        service.error('APP', 'options', { error: raw, data: { key: 'v' } });

        const [legacy, options] = logBuffer.peek();
        expect(legacy.error).toBe(raw);
        expect(options.error).toBe(raw);
        expect(options.data).toEqual({ key: 'v' });
    });
});

describe('LogBufferService (core buffer facade)', () => {
    it('init은 저장분을 복원하고, 재호출해도 중복 배선하지 않는다', () => {
        const persisted: LogEntry = { level: 'info', tag: 'APP', message: 'old', timestamp: 1 };
        const persistence = createFakePersistence([persisted]);
        const service = new LogBufferService(persistence);

        service.init();
        service.init();

        expect(service.peek().map(e => e.message)).toEqual(['old']);
        expect(service.getSize()).toBe(1);
        service.teardown();
    });

    it('peek는 순환 참조 data와 Error를 브리지 안전 형태로 평탄화한다', () => {
        const persistence = createFakePersistence();
        const service = new LogBufferService(persistence);
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        const logService = new LogService();

        logService.info('CACHE', 'circular', circular);
        logService.error('CACHE', 'failed', new Error('boom'));

        const [first, second] = service.peek();
        expect(first.data).toBe('[object Object]');
        expect(second.error).toMatchObject({ name: 'Error', message: 'boom' });
        expect(typeof (second.error as { stack?: string }).stack).toBe('string');
    });

    it('poll은 꺼낸 뒤 남은 상태를 즉시 영속화한다', async () => {
        const persistence = createFakePersistence();
        const service = new LogBufferService(persistence);
        const logService = new LogService();
        logService.info('APP', 'one');
        logService.info('APP', 'two');

        const polled = await service.poll(1);

        expect(polled.map(e => e.message)).toEqual(['one']);
        expect(service.getSize()).toBe(1);
        expect(persistence.saves.at(-1)?.map(e => e.message)).toEqual(['two']);
    });

    it('clear는 버퍼를 비우고 빈 상태를 영속화한다', async () => {
        const persistence = createFakePersistence();
        const service = new LogBufferService(persistence);
        new LogService().info('APP', 'gone');

        await service.clear();

        expect(service.getSize()).toBe(0);
        expect(persistence.saves.at(-1)).toEqual([]);
    });
});

describe('ConsoleLogger (entry 기반)', () => {
    const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    afterAll(() => {
        consoleInfoSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    it('dev 모드에서 발생 시각·태그 접두 포맷으로 출력한다', () => {
        const logService = new LogService();
        const consoleLogger = new ConsoleLogger(logService, true);
        consoleLogger.init();

        logService.info('DEVICE', 'model', { name: 'pixel' });
        logService.error('DEVICE', 'broken', new Error('x'));

        expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringMatching(/\[DEVICE\] model$/), { name: 'pixel' });
        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringMatching(/\[DEVICE\] broken$/),
            expect.objectContaining({ message: 'x' }),
            ''
        );
        consoleLogger.teardown();
    });

    // Regression: the error branch used to print only `error` and return, which
    // dropped `data` — exactly where a failed request keeps its status/response
    // (withNetworkLog logs `{ error, data: fields }`). The console then showed the
    // request but never why it failed.
    it('error 엔트리의 data도 함께 출력한다 — 실패 진단 정보가 여기 담긴다', () => {
        jest.clearAllMocks();
        const logService = new LogService();
        const consoleLogger = new ConsoleLogger(logService, true);
        consoleLogger.init();

        logService.error('NET', 'POST /users/0/reg-dev failed (400)', {
            error: new Error('Request failed'),
            data: { status: 400, errorCode: '400', responseData: { error: 'INVALID_TOKEN' } },
        });

        expect(consoleErrorSpy).toHaveBeenCalledWith(
            expect.stringMatching(/\[NET\] POST \/users\/0\/reg-dev failed \(400\)$/),
            expect.objectContaining({ message: 'Request failed' }),
            expect.objectContaining({ status: 400, responseData: { error: 'INVALID_TOKEN' } })
        );
        consoleLogger.teardown();
    });

    it('prod 모드(isDev=false)에서는 출력하지 않는다', () => {
        jest.clearAllMocks();
        const logService = new LogService();
        const consoleLogger = new ConsoleLogger(logService, false);
        consoleLogger.init();

        logService.info('DEVICE', 'quiet');

        expect(consoleInfoSpy).not.toHaveBeenCalled();
        consoleLogger.teardown();
    });
});

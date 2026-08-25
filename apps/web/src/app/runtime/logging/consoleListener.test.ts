import { logger } from '@chatic/bridges';

import { attachConsoleListener } from './consoleListener';

let mockIsNative = false;
jest.mock('@chatic/bridges', () => {
    const actual = jest.requireActual('@chatic/bridges');
    return { ...actual, isNative: () => mockIsNative };
});

let detach: (() => void) | undefined;
let consoleLogSpy: jest.SpyInstance;

beforeEach(() => {
    mockIsNative = false;
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
});

afterEach(() => {
    detach?.();
    detach = undefined;
    jest.restoreAllMocks();
});

describe('attachConsoleListener — 실행당 콘솔 하나', () => {
    it('웹 단독에서는 찍는다', () => {
        detach = attachConsoleListener({ isDev: false });

        logger.info('TEST', 'standalone');

        expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('하이브리드 릴리스에서는 찍지 않는다 — 앱 콘솔이 웹·네이티브를 한 타임라인에 갖는다', () => {
        mockIsNative = true;

        detach = attachConsoleListener({ isDev: false });
        logger.info('TEST', 'hybrid release');

        expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('하이브리드 dev에서는 찍는다 — 웹 debug를 볼 곳이 여기뿐이다', () => {
        // debug는 브릿지를 건너지 않으므로(원칙 13) 앱 콘솔에 나타날 수 없다.
        // 릴리스에는 예외가 없으니 "실행당 콘솔 하나"는 비용이 드는 곳에서 지켜진다.
        mockIsNative = true;

        detach = attachConsoleListener({ isDev: true });
        logger.info('TEST', 'hybrid dev');

        expect(consoleLogSpy).toHaveBeenCalled();
    });

    it('붙이지 않았으면 아무 구독도 남기지 않는다', () => {
        mockIsNative = true;

        const off = attachConsoleListener({ isDev: false });

        expect(() => off()).not.toThrow();
    });
});

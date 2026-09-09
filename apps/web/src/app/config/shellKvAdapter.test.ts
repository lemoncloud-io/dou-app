import { webClient } from '@chatic/bridges';
import { createShellKvAdapter, resetConfigKvSupport } from './shellKvAdapter';

jest.mock('@chatic/bridges', () => ({
    webClient: { post: jest.fn(), request: jest.fn() },
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const requestMock = webClient.request as jest.Mock;

const NOT_FOUND = { code: 'NOT_FOUND', message: 'unknown message type' };

describe('shellKvAdapter — @chatic/config 셸 레인의 브릿지 구현', () => {
    beforeEach(() => {
        requestMock.mockClear();
        requestMock.mockResolvedValue({ success: true, data: {} });
        resetConfigKvSupport();
        delete (window as any).CHATIC_APP_CONFIG_BAG;
    });

    describe('readBag', () => {
        it('주입된 봉투를 그대로 돌려준다', () => {
            (window as any).CHATIC_APP_CONFIG_BAG = { 'ui.theme': '"dark"' };
            expect(createShellKvAdapter().readBag()).toEqual({ 'ui.theme': '"dark"' });
        });

        it('봉투가 없는 구 셸에서는 빈 객체를 돌려준다 — 크래시하지 않는다', () => {
            expect(createShellKvAdapter().readBag()).toEqual({});
        });

        it('봉투가 객체가 아니면 빈 객체로 취급한다', () => {
            (window as any).CHATIC_APP_CONFIG_BAG = 'not-an-object';
            expect(createShellKvAdapter().readBag()).toEqual({});
        });
    });

    describe('write', () => {
        it('SaveConfigValue로 저장하고 성공하면 그걸로 끝난다', async () => {
            const shell = createShellKvAdapter();
            await shell.write('ui.theme', '"dark"');

            expect(requestMock).toHaveBeenCalledTimes(1);
            expect(requestMock).toHaveBeenLastCalledWith({
                type: 'SaveConfigValue',
                data: { key: 'ui.theme', value: '"dark"' },
            });
        });

        it('구 셸의 NOT_FOUND를 학습하면 legacy SavePreference로 강등한다', async () => {
            requestMock.mockRejectedValueOnce(NOT_FOUND);
            requestMock.mockResolvedValueOnce({ success: true, data: { key: 'theme', success: true } });

            await createShellKvAdapter().write('ui.theme', '"dark"');

            expect(requestMock).toHaveBeenCalledTimes(2);
            expect(requestMock).toHaveBeenNthCalledWith(1, {
                type: 'SaveConfigValue',
                data: { key: 'ui.theme', value: '"dark"' },
            });
            expect(requestMock).toHaveBeenNthCalledWith(2, {
                type: 'SavePreference',
                data: { key: 'theme', value: 'dark' },
            });
        });

        it('ui.onboardingCompleted → isFirstRun은 값을 반전해서 강등한다', async () => {
            requestMock.mockRejectedValueOnce(NOT_FOUND);
            requestMock.mockResolvedValueOnce({ success: true, data: {} });

            await createShellKvAdapter().write('ui.onboardingCompleted', 'true');

            expect(requestMock).toHaveBeenNthCalledWith(2, {
                type: 'SavePreference',
                data: { key: 'isFirstRun', value: false },
            });
        });

        it('legacy로 옮길 수 없는 키는 NOT_FOUND를 그대로 던진다', async () => {
            requestMock.mockRejectedValueOnce(NOT_FOUND);

            await expect(createShellKvAdapter().write('debug.mockService.mode', '"off"')).rejects.toMatchObject({
                code: 'NOT_FOUND',
            });
            expect(requestMock).toHaveBeenCalledTimes(1);
        });

        it('NOT_FOUND가 아닌 실패는 강등하지 않고 그대로 던진다', async () => {
            requestMock.mockRejectedValueOnce({ code: 'TIMEOUT', message: 'no response' });

            await expect(createShellKvAdapter().write('ui.theme', '"dark"')).rejects.toMatchObject({
                code: 'TIMEOUT',
            });
            expect(requestMock).toHaveBeenCalledTimes(1);
        });

        it('한 번 NOT_FOUND를 학습하면 이후 쓰기는 SaveConfigValue를 다시 시도하지 않는다', async () => {
            requestMock.mockRejectedValueOnce(NOT_FOUND);
            requestMock.mockResolvedValueOnce({ success: true, data: {} }); // legacy save for ui.theme

            const shell = createShellKvAdapter();
            await shell.write('ui.theme', '"dark"');
            requestMock.mockClear();
            requestMock.mockResolvedValue({ success: true, data: {} });

            await shell.write('ui.blurLastMessage', 'true');

            // Straight to the legacy call — no repeated SaveConfigValue attempt this session.
            expect(requestMock).toHaveBeenCalledTimes(1);
            expect(requestMock).toHaveBeenLastCalledWith({
                type: 'SavePreference',
                data: { key: 'blurLastMessage', value: true },
            });
        });
    });

    describe('clear', () => {
        it('ClearConfigValue로 지우고 성공하면 그걸로 끝난다', async () => {
            await createShellKvAdapter().clear('ui.theme');

            expect(requestMock).toHaveBeenCalledTimes(1);
            expect(requestMock).toHaveBeenLastCalledWith({ type: 'ClearConfigValue', data: { key: 'ui.theme' } });
        });

        it('구 셸의 NOT_FOUND를 학습하면 legacy DeletePreference로 강등한다', async () => {
            requestMock.mockRejectedValueOnce(NOT_FOUND);
            requestMock.mockResolvedValueOnce({ success: true, data: { key: 'theme', success: true } });

            await createShellKvAdapter().clear('ui.theme');

            expect(requestMock).toHaveBeenNthCalledWith(2, { type: 'DeletePreference', data: { key: 'theme' } });
        });

        it('legacy로 옮길 수 없는 키는 조용히 끝난다 — 지울 곳이 없다', async () => {
            requestMock.mockRejectedValueOnce(NOT_FOUND);

            await expect(createShellKvAdapter().clear('debug.mockService.mode')).resolves.toBeUndefined();
            expect(requestMock).toHaveBeenCalledTimes(1);
        });

        it('NOT_FOUND가 아닌 실패는 강등하지 않고 그대로 던진다', async () => {
            requestMock.mockRejectedValueOnce({ code: 'TIMEOUT', message: 'no response' });

            await expect(createShellKvAdapter().clear('ui.theme')).rejects.toMatchObject({ code: 'TIMEOUT' });
        });
    });
});

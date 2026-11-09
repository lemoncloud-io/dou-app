import { webClient } from '@chatic/bridges';
import { createShellKvAdapter } from './shellKvAdapter';

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

        it('passes any failure through, NOT_FOUND included, with no fallback', async () => {
            for (const failure of [NOT_FOUND, { code: 'TIMEOUT', message: 'no response' }]) {
                requestMock.mockClear();
                requestMock.mockRejectedValueOnce(failure);

                await expect(createShellKvAdapter().write('ui.theme', '"dark"')).rejects.toBe(failure);
                expect(requestMock).toHaveBeenCalledTimes(1);
            }
        });
    });

    describe('clear', () => {
        it('ClearConfigValue로 지우고 성공하면 그걸로 끝난다', async () => {
            await createShellKvAdapter().clear('ui.theme');

            expect(requestMock).toHaveBeenCalledTimes(1);
            expect(requestMock).toHaveBeenLastCalledWith({ type: 'ClearConfigValue', data: { key: 'ui.theme' } });
        });

        it('passes any failure through, NOT_FOUND included, with no fallback', async () => {
            for (const failure of [NOT_FOUND, { code: 'TIMEOUT', message: 'no response' }]) {
                requestMock.mockClear();
                requestMock.mockRejectedValueOnce(failure);

                await expect(createShellKvAdapter().clear('ui.theme')).rejects.toBe(failure);
                expect(requestMock).toHaveBeenCalledTimes(1);
            }
        });
    });
});

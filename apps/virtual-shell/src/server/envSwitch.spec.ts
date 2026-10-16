import { checkEnvRequest, type EnvRequest } from './envSwitch';

const valid: EnvRequest = {
    method: 'POST',
    headers: { 'x-virtual-shell': '1', origin: 'http://localhost:5007' },
    remoteAddress: '127.0.0.1',
    body: '{"env":"prod"}',
};

describe('checkEnvRequest', () => {
    it("accepts the shell page's own request", () => {
        expect(checkEnvRequest(valid, 5007)).toEqual({ ok: true, env: 'prod' });
        expect(checkEnvRequest({ ...valid, remoteAddress: '::1' }, 5007)).toMatchObject({ ok: true });
    });

    it('refuses a request from another origin, without the header, or from another machine', () => {
        expect(
            checkEnvRequest({ ...valid, headers: { ...valid.headers, origin: 'https://evil.example' } }, 5007)
        ).toMatchObject({ ok: false, status: 403 });
        expect(checkEnvRequest({ ...valid, headers: { origin: 'http://localhost:5007' } }, 5007)).toMatchObject({
            ok: false,
            status: 403,
        });
        expect(checkEnvRequest({ ...valid, headers: { 'x-virtual-shell': '1' } }, 5007)).toMatchObject({
            ok: false,
            status: 403,
        });
        expect(checkEnvRequest({ ...valid, remoteAddress: '192.168.0.9' }, 5007)).toMatchObject({
            ok: false,
            status: 403,
        });
        expect(checkEnvRequest(valid, 5017)).toMatchObject({ ok: false, status: 403 });
    });

    it('refuses anything but a POST naming a known backend', () => {
        expect(checkEnvRequest({ ...valid, method: 'GET' }, 5007)).toMatchObject({ ok: false, status: 405 });
        expect(checkEnvRequest({ ...valid, body: '{"env":"stage"}' }, 5007)).toMatchObject({ ok: false, status: 400 });
        expect(checkEnvRequest({ ...valid, body: 'env=prod' }, 5007)).toMatchObject({ ok: false, status: 400 });
    });
});

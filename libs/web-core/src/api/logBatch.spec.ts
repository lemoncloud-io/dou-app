// The upload path is the one request in the app that must NOT be logged. If it
// ever goes through the network-logging interceptor, an upload failure becomes
// an error entry, the error entry advances the next flush, and the retry fails
// again — a loop the batching design exists to avoid. These cases pin that.
jest.mock('../session/core', () => ({ DOU_ENDPOINT: 'https://api.test' }));

jest.mock('../transport', () => ({ webTransport: { buildSignedRequest: jest.fn() } }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { webTransport } from '../transport';
import { uploadLogBatch } from './logBatch';
import type { LogEntry } from '@chatic/bridges';

const execute = jest.fn();
const setBody = jest.fn(() => ({ execute }));

const entry = (over: Partial<LogEntry> = {}): LogEntry => ({
    id: 'e-1',
    level: 'info',
    tag: 'TEST',
    message: 'hello',
    timestamp: 1_700_000_000_000,
    ...over,
});

const httpError = (status: number): unknown => Object.assign(new Error(`HTTP ${status}`), { response: { status } });

beforeEach(() => {
    jest.clearAllMocks();
    execute.mockResolvedValue({ data: { total: 1, dropped: 0, list: [] } });
    (webTransport.buildSignedRequest as jest.Mock).mockReturnValue({ setBody });
});

describe('uploadLogBatch — 전송 경로', () => {
    it('서명 요청을 report-bulk로 보낸다', async () => {
        await uploadLogBatch([entry()]);

        expect(webTransport.buildSignedRequest).toHaveBeenCalledWith({
            method: 'POST',
            baseURL: 'https://api.test/hello/report-bulk',
        });
    });

    it('봉투 없이 list 하나에 wire 형태로 담아 보낸다', async () => {
        await uploadLogBatch([entry({ id: 'a' }), entry({ id: 'b', data: { k: 1 } })]);

        const body = setBody.mock.calls.at(-1)?.[0] as { list: { id: string; data?: string }[] };
        expect(Object.keys(body)).toEqual(['list']);
        expect(body.list.map(e => e.id)).toEqual(['a', 'b']);
        // data는 서버 계약대로 문자열이어야 한다.
        expect(typeof body.list[1].data).toBe('string');
    });

    it('빈 배치는 요청조차 하지 않는다', async () => {
        const outcome = await uploadLogBatch([]);

        expect(outcome).toBe('ok');
        expect(webTransport.buildSignedRequest).not.toHaveBeenCalled();
    });

    it('네트워크 로깅 인터셉터를 타지 않는다 — 회귀하면 피드백 루프가 돌아온다', () => {
        // Checked at the source level on purpose: importing `transport/request`
        // to spy on it would pull `import.meta` into CJS jest and break the
        // suite. What must never regress is the choice of entry point — the
        // helpers in `transport/request` are the ones wrapped in
        // `withNetworkLog`, so using any of them would log the upload request
        // and close the failure loop.
        const source = readFileSync(join(__dirname, 'logBatch.ts'), 'utf8');
        // Comments in that file name these helpers to explain why they are
        // avoided, so strip comments before looking for real usage.
        const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

        expect(code).toContain('buildSignedRequest');
        expect(code).not.toMatch(/executeSignedRelayRequest|executeRelayRequest|executeCloudRequest|withNetworkLog/);
    });

    it('자기 실패를 logger가 아니라 console로만 남긴다', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation();
        execute.mockRejectedValue(httpError(500));

        await uploadLogBatch([entry()]);

        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});

describe('uploadLogBatch — 응답 분류', () => {
    beforeEach(() => {
        jest.spyOn(console, 'warn').mockImplementation();
    });

    afterEach(() => {
        (console.warn as jest.Mock).mockRestore?.();
    });

    it('2xx면 ok', async () => {
        await expect(uploadLogBatch([entry()])).resolves.toBe('ok');
    });

    it.each([400, 401, 403, 404, 422])('%s는 재시도하지 않고 폐기한다', async status => {
        execute.mockRejectedValue(httpError(status));

        await expect(uploadLogBatch([entry()])).resolves.toBe('discard');
    });

    it.each([500, 502, 503])('%s는 재시도 대상이다', async status => {
        execute.mockRejectedValue(httpError(status));

        await expect(uploadLogBatch([entry()])).resolves.toBe('retry');
    });

    it('상태 코드가 없는 실패(오프라인·타임아웃)는 재시도 대상이다', async () => {
        execute.mockRejectedValue(new Error('Network Error'));

        await expect(uploadLogBatch([entry()])).resolves.toBe('retry');
    });
});

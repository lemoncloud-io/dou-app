// The upload path is the one request in the app that must NOT be logged. If it
// ever goes through the network-logging interceptor, an upload failure becomes
// an error entry, the error entry advances the next flush, and the retry fails
// again — a loop the batching design exists to avoid. The opt-out itself now
// lives in the gateway (`bypass: ['networkLog']`, pinned in
// libs/http/src/gateways/report.spec.ts); what these cases pin is this side of
// it — the wire body, and the outcome classification the queue depends on.

import { readFileSync } from 'fs';
import { join } from 'path';
import { getRepositories } from '../data/runtime';
import { uploadLogBatch } from './logBatch';
import type { LogEntry } from '@chatic/bridges';

jest.mock('../data/runtime', () => ({ getRepositories: jest.fn() }));

const execute = jest.fn();

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
    execute.mockResolvedValue(undefined);
    (getRepositories as jest.Mock).mockReturnValue({ report: { uploadLogBatch: execute } });
});

describe('uploadLogBatch — 전송 경로', () => {
    it('report repository로 부친다 — 자체 서명 요청을 만들지 않는다', async () => {
        await uploadLogBatch([entry()]);

        expect(getRepositories).toHaveBeenCalled();
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('봉투 없이 list 하나에 wire 형태로 담아 보낸다', async () => {
        await uploadLogBatch([entry({ id: 'a' }), entry({ id: 'b', data: { k: 1 } })]);

        const body = execute.mock.calls.at(-1)?.[0] as { list: { id: string; data?: string }[] };
        expect(Object.keys(body)).toEqual(['list']);
        expect(body.list.map(e => e.id)).toEqual(['a', 'b']);
        // data는 서버 계약대로 문자열이어야 한다.
        expect(typeof body.list[1].data).toBe('string');
    });

    it('빈 배치는 요청조차 하지 않는다', async () => {
        const outcome = await uploadLogBatch([]);

        expect(outcome).toBe('ok');
        expect(execute).not.toHaveBeenCalled();
        expect(getRepositories).not.toHaveBeenCalled();
    });

    it('전송을 스스로 조립하지 않는다 — 우회 경로가 돌아오면 로깅 예외가 깨진다', () => {
        // Checked at the source level on purpose: importing the transport to spy
        // on it would pull `import.meta` into CJS jest and break the suite. What
        // must never regress is that this file has no transport of its own —
        // the single opt-out from network logging is the gateway's `bypass`, and
        // a request built here would sidestep it (in either direction: an
        // unlogged path nobody can see, or a logged one that closes the loop).
        const source = readFileSync(join(__dirname, 'logBatch.ts'), 'utf8');
        // Comments in that file name these helpers to explain why they are
        // avoided, so strip comments before looking for real usage.
        const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

        expect(code).toContain('getRepositories');
        expect(code).not.toMatch(
            /buildSignedRequest|buildRequest|executeSignedRelayRequest|executeRelayRequest|executeCloudRequest|withNetworkLog/
        );
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

    it.each([400, 404, 422])('%s는 재시도하지 않고 폐기한다', async status => {
        execute.mockRejectedValue(httpError(status));

        await expect(uploadLogBatch([entry()])).resolves.toBe('discard');
    });

    // 계정 전환은 흔한 경로고 큐는 로그아웃을 넘겨 살아남는다. 무세션 구간의
    // 401/403에 배치를 버리면, 다음 세션이 부칠 수 있었던 엔트리를 그 직전에
    // 잃는다 — 그것도 세션 문제의 정황이 담긴 바로 그 엔트리들을.
    it.each([401, 403])('%s는 폐기하지 않고 재시도한다 (지나가는 무세션 상태)', async status => {
        execute.mockRejectedValue(httpError(status));

        await expect(uploadLogBatch([entry()])).resolves.toBe('retry');
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

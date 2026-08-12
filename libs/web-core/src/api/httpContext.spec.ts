import { describeHttp } from './httpContext';

/** Shape axios produces for a failed call. */
const axiosError = (over: Record<string, unknown> = {}) => ({
    code: 'ERR_BAD_RESPONSE',
    config: { url: '/hello/chats', baseURL: 'https://api.test/dou-d1', method: 'post', data: '{"text":"hi"}' },
    response: { status: 500, statusText: 'Internal Server Error', data: { error: 'boom' } },
    ...over,
});

describe('describeHttp', () => {
    it('네트워크 에러가 아니면 아무것도 만들지 않는다', () => {
        expect(describeHttp(new Error('plain'))).toBeUndefined();
        expect(describeHttp(undefined)).toBeUndefined();
    });

    // "무엇을 보내고 무엇이 돌아왔나"가 트리아지의 첫 질문이다.
    it('엔드포인트·요청·응답을 한 번에 담는다', () => {
        expect(describeHttp(axiosError())).toEqual({
            url: 'https://api.test/dou-d1/hello/chats',
            method: 'POST',
            requestBody: { text: 'hi' },
            status: 500,
            statusText: 'Internal Server Error',
            code: 'ERR_BAD_RESPONSE',
            reason: 'boom',
            responseData: { error: 'boom' },
        });
    });

    // axios는 body를 문자열로 들고 있다. 파싱해야 사람이 읽을 수 있고, 무엇보다
    // redact가 키를 볼 수 있다.
    it('요청 body의 비밀 필드를 가린다', () => {
        const http = describeHttp(
            axiosError({ config: { url: '/auth/login', method: 'post', data: '{"id":"me","password":"hunter2"}' } })
        );

        expect(http?.requestBody).toEqual({ id: 'me', password: '[REDACTED]' });
    });

    it('응답 body의 비밀 필드도 가린다', () => {
        const http = describeHttp(axiosError({ response: { status: 200, data: { accessToken: 'secret-value' } } }));

        expect(http?.responseData).toEqual({ accessToken: '[REDACTED]' });
    });

    it('JSON이 아닌 body는 문자열 그대로 둔다', () => {
        const http = describeHttp(axiosError({ config: { url: '/x', method: 'post', data: 'raw=not-json' } }));

        expect(http?.requestBody).toBe('raw=not-json');
    });

    it('쿼리 파라미터도 싣고 가린다', () => {
        const http = describeHttp(
            axiosError({ config: { url: '/search', method: 'get', params: { q: 'hi', token: 'abc' } } })
        );

        expect(http?.params).toEqual({ q: 'hi', token: '[REDACTED]' });
    });

    // DNS 실패·타임아웃은 response가 아예 없다 — 그래도 어디로 보냈는지는 남아야 한다.
    it('응답이 없는 실패(네트워크 끊김)도 요청 정보를 남긴다', () => {
        const http = describeHttp({
            code: 'ERR_NETWORK',
            config: { url: '/hello/chats', method: 'post' },
        });

        expect(http).toEqual({ url: '/hello/chats', method: 'POST', code: 'ERR_NETWORK' });
    });

    it('baseURL이 없거나 url이 이미 절대경로면 그대로 쓴다', () => {
        expect(describeHttp({ config: { url: '/x', method: 'get' }, code: 'E' })?.url).toBe('/x');
        expect(
            describeHttp({
                config: { url: 'https://other.test/y', baseURL: 'https://api.test', method: 'get' },
                code: 'E',
            })?.url
        ).toBe('https://other.test/y');
    });

    it('거대한 응답은 잘라서 리포트 크기를 지킨다', () => {
        const http = describeHttp(axiosError({ response: { status: 500, data: { blob: 'x'.repeat(100_000) } } }));

        expect(JSON.stringify(http?.responseData).length).toBeLessThan(20_000);
    });
});

// axios는 본문에 뭐가 있든 "Request failed with status code 500"으로 던진다 —
// 서버가 말한 진짜 사유는 응답 본문에만 있다.
describe('describeHttp — 서버가 말한 실패 사유', () => {
    const withBody = (data: unknown) =>
        describeHttp({ code: 'E', config: { url: '/x', method: 'get' }, response: { status: 500, data } });

    it('{ error } 문자열을 사유로 뽑는다', () => {
        expect(withBody({ error: 'channel not found' })?.reason).toBe('channel not found');
    });

    it('{ message } 도 본다', () => {
        expect(withBody({ message: 'quota exceeded' })?.reason).toBe('quota exceeded');
    });

    it('중첩된 { error: { message } } 도 본다', () => {
        expect(withBody({ error: { message: 'nested reason' } })?.reason).toBe('nested reason');
    });

    it('본문이 문자열이면 그대로 사유', () => {
        expect(withBody('plain text failure')?.reason).toBe('plain text failure');
    });

    it('사유를 못 찾으면 필드를 만들지 않는다', () => {
        expect(withBody({ items: [1, 2] })?.reason).toBeUndefined();
        expect(withBody(undefined)?.reason).toBeUndefined();
    });

    it('지나치게 긴 사유는 잘라서 그룹 키를 지킨다', () => {
        expect(withBody({ error: 'y'.repeat(1_000) })?.reason?.length).toBe(200);
    });
});

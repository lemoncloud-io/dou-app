import { UnfurlService, fetchHtml, isPrivateHost, parseOgMetadata, parseUrl } from './UnfurlService';

const UNFURL_MAX_BYTES = 256 * 1024;

type Listener = (event?: any) => void;

/**
 * Stand-in for RN's XMLHttpRequest, driven manually by the tests. Mirrors the two behaviours the
 * production code depends on: `abort()` clears the response buffer, and progress events carry a
 * cumulative `loaded` byte count.
 */
class FakeXhr {
    static instances: FakeXhr[] = [];

    readyState = 0;
    status = 200;
    responseURL = '';
    responseText = '';
    timeout = 0;
    aborted = false;
    url = '';
    requestHeaders: Record<string, string> = {};

    onload: Listener | null = null;
    onerror: Listener | null = null;
    ontimeout: Listener | null = null;
    onabort: Listener | null = null;

    private listeners: Record<string, Listener[]> = {};
    private responseHeaders: Record<string, string> = { 'content-type': 'text/html; charset=utf-8' };

    constructor() {
        FakeXhr.instances.push(this);
    }

    addEventListener(type: string, cb: Listener) {
        (this.listeners[type] ??= []).push(cb);
    }

    open(_method: string, url: string) {
        this.url = url;
    }

    setRequestHeader(key: string, value: string) {
        this.requestHeaders[key] = value;
    }

    send() {
        /* driven by the helpers below */
    }

    getResponseHeader(name: string) {
        return this.responseHeaders[name.toLowerCase()] ?? null;
    }

    abort() {
        this.aborted = true;
        // RN's abort() resets the internal buffer — this is why the cap branch must snapshot first.
        this.responseText = '';
        this.onabort?.();
    }

    private emit(type: string, event?: any) {
        (this.listeners[type] ?? []).forEach(cb => cb(event));
    }

    // --- test drivers ---

    receiveHeaders(options: { status?: number; contentType?: string | null; responseURL?: string } = {}) {
        if (options.status !== undefined) this.status = options.status;
        if (options.contentType === null) delete this.responseHeaders['content-type'];
        else if (options.contentType !== undefined) this.responseHeaders['content-type'] = options.contentType;
        this.responseURL = options.responseURL ?? this.url;
        this.readyState = 2;
        this.emit('readystatechange');
    }

    receiveChunk(text: string, loaded: number) {
        this.responseText += text;
        this.emit('progress', { loaded });
    }

    complete() {
        this.readyState = 4;
        this.onload?.();
    }
}

const firstXhr = () => FakeXhr.instances[0];

describe('parseUrl', () => {
    it('절대 http(s) URL을 프로토콜·호스트·오리진·경로로 쪼갠다', () => {
        expect(parseUrl('https://Example.COM:8443/a/b?q=1#frag')).toEqual({
            protocol: 'https:',
            hostname: 'example.com',
            origin: 'https://Example.COM:8443',
            path: '/a/b',
        });
    });

    it('경로가 없으면 루트로 채운다', () => {
        expect(parseUrl('https://example.com')?.path).toBe('/');
    });

    it('userinfo 뒤의 실제 호스트를 고른다', () => {
        // `trusted.example`처럼 보이지만 실제로는 127.0.0.1로 붙는 URL.
        expect(parseUrl('http://trusted.example@127.0.0.1/')?.hostname).toBe('127.0.0.1');
        expect(parseUrl('http://a@b@127.0.0.1/')?.hostname).toBe('127.0.0.1');
    });

    it('IPv6 리터럴은 대괄호를 유지한다', () => {
        expect(parseUrl('http://[::1]:8080/x')?.hostname).toBe('[::1]');
    });

    it('스킴이 없거나 호스트가 비면 null이다', () => {
        expect(parseUrl('example.com/a')).toBeNull();
        expect(parseUrl('/relative/path')).toBeNull();
        expect(parseUrl('https:///nohost')).toBeNull();
    });
});

describe('isPrivateHost', () => {
    it.each([
        ['localhost'],
        ['app.localhost'],
        ['printer.local'],
        ['db.internal'],
        ['127.0.0.1'],
        ['0.0.0.0'],
        ['10.1.2.3'],
        ['169.254.169.254'],
        ['172.16.0.1'],
        ['172.31.255.255'],
        ['192.168.1.1'],
        ['[::1]'],
        ['::'],
        ['fc00::1'],
        ['fd12:3456::1'],
        ['fe80::1'],
    ])('%s 는 차단한다', host => {
        expect(isPrivateHost(host)).toBe(true);
    });

    it.each([['example.com'], ['sub.example.co.uk'], ['8.8.8.8'], ['172.15.0.1'], ['172.32.0.1'], ['한국.kr']])(
        '%s 는 통과시킨다',
        host => {
            expect(isPrivateHost(host)).toBe(false);
        }
    );

    it('점4옥텟이 아닌 IP 표기도 차단한다', () => {
        // 2130706433 == 0x7f000001 == 127.0.0.1. 디코딩하지 않고 거절한다.
        expect(isPrivateHost('2130706433')).toBe(true);
        expect(isPrivateHost('0x7f000001')).toBe(true);
        expect(isPrivateHost('017700000001')).toBe(true);
        expect(isPrivateHost('127.1')).toBe(true);
    });

    it('단일 라벨 사내 호스트를 차단한다', () => {
        expect(isPrivateHost('wiki')).toBe(true);
        expect(isPrivateHost('jenkins')).toBe(true);
    });

    it('빈 호스트는 차단한다', () => {
        expect(isPrivateHost('')).toBe(true);
    });

    it('FQDN 후행 점을 무시한다', () => {
        expect(isPrivateHost('example.com.')).toBe(false);
        expect(isPrivateHost('localhost.')).toBe(true);
    });
});

describe('parseOgMetadata', () => {
    const url = 'https://example.com/post/1';

    it('og 태그를 뽑는다', () => {
        const html = `
            <meta property="og:site_name" content="Example">
            <meta property="og:title" content="Hello">
            <meta property="og:description" content="World">
            <meta property="og:image" content="https://cdn.example.com/a.png">
        `;
        expect(parseOgMetadata(html, url, url)).toEqual({
            success: true,
            url,
            title: 'Hello',
            description: 'World',
            imageUrl: 'https://cdn.example.com/a.png',
            siteName: 'Example',
        });
    });

    it('속성 순서가 뒤집혀도 뽑는다', () => {
        const html = `<meta content="Reversed" property="og:title">`;
        expect(parseOgMetadata(html, url, url).title).toBe('Reversed');
    });

    it('name 속성도 property와 같이 취급한다', () => {
        const html = `<meta name="og:title" content="ByName">`;
        expect(parseOgMetadata(html, url, url).title).toBe('ByName');
    });

    it('og:title이 없으면 <title>로 폴백하고 공백을 정리한다', () => {
        const html = `<title>\n  Fallback\n  Title\n</title>`;
        expect(parseOgMetadata(html, url, url).title).toBe('Fallback Title');
    });

    it('제목이 아예 없으면 실패한다', () => {
        expect(parseOgMetadata('<p>no head</p>', url, url)).toEqual({ success: false, url });
    });

    it('HTML 엔티티를 디코드하고 &amp;를 마지막에 처리한다', () => {
        const html = `<meta property="og:title" content="A &amp; B &lt;c&gt; &quot;d&quot; &#39;e&#39;">`;
        expect(parseOgMetadata(html, url, url).title).toBe(`A & B <c> "d" 'e'`);
        // &amp;lt; 는 리터럴 &lt; 로 남아야 한다 (이중 디코딩 금지).
        const doubled = `<meta property="og:title" content="&amp;lt;script&amp;gt;">`;
        expect(parseOgMetadata(doubled, url, url).title).toBe('&lt;script&gt;');
    });

    it('description은 og:description → description 순으로 폴백한다', () => {
        const html = `<meta property="og:title" content="T"><meta name="description" content="Plain">`;
        expect(parseOgMetadata(html, url, url).description).toBe('Plain');
    });

    it('http 이미지는 버린다 (웹뷰가 mixed content로 차단한다)', () => {
        const html = `<meta property="og:title" content="T"><meta property="og:image" content="http://cdn.example.com/a.png">`;
        expect(parseOgMetadata(html, url, url).imageUrl).toBeUndefined();
    });

    it.each([
        ['//cdn.example.com/a.png', 'https://cdn.example.com/a.png'],
        ['/img/a.png', 'https://example.com/img/a.png'],
        ['a.png', 'https://example.com/post/a.png'],
    ])('상대 경로 og:image %s 를 절대 https URL로 해석한다', (raw, expected) => {
        const html = `<meta property="og:title" content="T"><meta property="og:image" content="${raw}">`;
        expect(parseOgMetadata(html, url, url).imageUrl).toBe(expected);
    });

    it('상대 이미지는 리다이렉트 종착지 기준으로 해석한다', () => {
        const html = `<meta property="og:title" content="T"><meta property="og:image" content="/a.png">`;
        const result = parseOgMetadata(html, url, 'https://moved.example.com/final');
        expect(result.imageUrl).toBe('https://moved.example.com/a.png');
    });

    it('종착지가 아니라 요청 URL을 되돌려준다 (웹의 캐시 키)', () => {
        const html = `<meta property="og:title" content="T">`;
        expect(parseOgMetadata(html, url, 'https://moved.example.com/final').url).toBe(url);
    });
});

describe('fetchHtml', () => {
    let originalXhr: any;

    beforeEach(() => {
        FakeXhr.instances = [];
        originalXhr = (global as any).XMLHttpRequest;
        (global as any).XMLHttpRequest = FakeXhr;
    });

    afterEach(() => {
        (global as any).XMLHttpRequest = originalXhr;
    });

    it('타임아웃과 accept 헤더를 걸고 요청한다', async () => {
        const promise = fetchHtml('https://example.com/');
        const xhr = firstXhr();
        expect(xhr.timeout).toBe(3000);
        expect(xhr.requestHeaders.accept).toBe('text/html,application/xhtml+xml');

        xhr.receiveHeaders();
        xhr.responseText = '<title>T</title>';
        xhr.complete();
        await expect(promise).resolves.toEqual({ html: '<title>T</title>', landedUrl: 'https://example.com/' });
    });

    it('content-type이 html이 아니면 본문을 받기 전에 끊는다', async () => {
        const promise = fetchHtml('https://example.com/doc.pdf');
        const xhr = firstXhr();
        xhr.receiveHeaders({ contentType: 'application/pdf' });

        await expect(promise).resolves.toBeNull();
        expect(xhr.aborted).toBe(true);
    });

    it('content-type 헤더가 없으면 실패한다', async () => {
        const promise = fetchHtml('https://example.com/');
        firstXhr().receiveHeaders({ contentType: null });
        await expect(promise).resolves.toBeNull();
    });

    it('2xx가 아니면 실패한다', async () => {
        const promise = fetchHtml('https://example.com/');
        firstXhr().receiveHeaders({ status: 404 });
        await expect(promise).resolves.toBeNull();
    });

    it('리다이렉트 종착지가 사설 호스트면 본문을 받기 전에 끊는다', async () => {
        const promise = fetchHtml('https://example.com/redir');
        const xhr = firstXhr();
        xhr.receiveHeaders({ responseURL: 'http://10.0.0.5/admin' });

        await expect(promise).resolves.toBeNull();
        expect(xhr.aborted).toBe(true);
    });

    it('종착지 URL을 함께 돌려준다', async () => {
        const promise = fetchHtml('https://example.com/redir');
        const xhr = firstXhr();
        xhr.receiveHeaders({ responseURL: 'https://moved.example.com/final' });
        xhr.responseText = '<title>T</title>';
        xhr.complete();

        await expect(promise).resolves.toEqual({
            html: '<title>T</title>',
            landedUrl: 'https://moved.example.com/final',
        });
    });

    it('바이트 캡을 넘으면 그때까지 받은 본문을 유지한 채 끊는다', async () => {
        const promise = fetchHtml('https://example.com/huge');
        const xhr = firstXhr();
        xhr.receiveHeaders();
        xhr.receiveChunk('<head><title>Big</title>', 1024);
        // 캡 도달: abort()가 responseText를 비우므로 스냅샷이 살아남아야 한다.
        xhr.receiveChunk('x'.repeat(16), UNFURL_MAX_BYTES);

        const page = await promise;
        expect(xhr.aborted).toBe(true);
        expect(page?.html).toContain('<title>Big</title>');
        // The point of keeping the partial body: the <head> is still parseable.
        const url = 'https://example.com/huge';
        expect(parseOgMetadata(page?.html ?? '', url, page?.landedUrl ?? url).title).toBe('Big');
    });

    it('캡 이하에서는 완료 시점의 전문을 돌려준다', async () => {
        const promise = fetchHtml('https://example.com/');
        const xhr = firstXhr();
        xhr.receiveHeaders();
        xhr.receiveChunk('<title>Small</title>', 20);
        xhr.complete();

        await expect(promise).resolves.toEqual({ html: '<title>Small</title>', landedUrl: 'https://example.com/' });
    });

    it('네트워크 에러와 타임아웃은 실패로 접는다', async () => {
        const errored = fetchHtml('https://example.com/');
        firstXhr().onerror?.();
        await expect(errored).resolves.toBeNull();

        FakeXhr.instances = [];
        const timedOut = fetchHtml('https://example.com/');
        firstXhr().ontimeout?.();
        await expect(timedOut).resolves.toBeNull();
    });
});

describe('UnfurlService', () => {
    const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), subscribe: jest.fn() };
    let originalXhr: any;

    beforeEach(() => {
        jest.clearAllMocks();
        FakeXhr.instances = [];
        originalXhr = (global as any).XMLHttpRequest;
        (global as any).XMLHttpRequest = FakeXhr;
    });

    afterEach(() => {
        (global as any).XMLHttpRequest = originalXhr;
    });

    const service = () => new UnfurlService(logger as any);

    it.each([['ftp://example.com/f'], ['mailto:a@b.com'], ['javascript:alert(1)'], ['not a url']])(
        'http(s)가 아닌 %s 는 요청조차 하지 않는다',
        async url => {
            await expect(service().fetchUrlMetadata(url)).resolves.toEqual({ success: false, url });
            expect(FakeXhr.instances).toHaveLength(0);
        }
    );

    it('사설 호스트는 요청하지 않고 실패를 돌려준다', async () => {
        const url = 'http://192.168.0.1/admin';
        await expect(service().fetchUrlMetadata(url)).resolves.toEqual({ success: false, url });
        expect(FakeXhr.instances).toHaveLength(0);
        expect(logger.debug).toHaveBeenCalledWith('UNFURL', expect.any(String), { hostname: '192.168.0.1' });
    });

    it('정상 페이지의 메타데이터를 돌려준다', async () => {
        const url = 'https://example.com/post/1';
        const promise = service().fetchUrlMetadata(url);
        const xhr = firstXhr();
        xhr.receiveHeaders();
        xhr.responseText = `<meta property="og:title" content="Hi"><meta property="og:image" content="/a.png">`;
        xhr.complete();

        await expect(promise).resolves.toMatchObject({
            success: true,
            url,
            title: 'Hi',
            imageUrl: 'https://example.com/a.png',
        });
    });

    it('fetch가 실패하면 실패를 돌려준다', async () => {
        const url = 'https://example.com/';
        const promise = service().fetchUrlMetadata(url);
        firstXhr().onerror?.();
        await expect(promise).resolves.toEqual({ success: false, url });
    });
});

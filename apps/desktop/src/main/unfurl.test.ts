import { fetchUrlMetadata, isPrivateHost } from './unfurl';

// `hostname` as `new URL(...)` yields it — the form the fetch path hands to isPrivateHost.
const hostOf = (url: string): string => new URL(url).hostname;

describe('isPrivateHost', () => {
    it.each([
        'http://localhost/',
        'http://localhost./',
        'http://localhost../',
        'http://app.localhost/',
        'http://printer.local/',
        'http://printer.local./',
        'http://db.internal/',
        'http://wiki/',
        'http://wiki./',
        'http://127.0.0.1/',
        'http://0.0.0.0/',
        'http://10.1.2.3/',
        'http://172.16.0.1/',
        'http://172.31.255.255/',
        'http://192.168.1.1/',
        'http://169.254.169.254/',
        // Non-dotted IPv4 spellings reach the filter already normalised by the URL parser.
        'http://2130706433/',
        'http://0x7f.1/',
        'http://[::1]/',
        'http://[::]/',
        'http://[fc00::1]/',
        'http://[fd12:3456::1]/',
        'http://[fe80::1]/',
    ])('rejects %s', url => {
        expect(isPrivateHost(hostOf(url))).toBe(true);
    });

    it.each([
        // IPv4-mapped IPv6 carries an IPv4 address; the same table has to apply to it.
        'http://[::ffff:127.0.0.1]/',
        'http://[::ffff:7f00:1]/',
        'http://[::FFFF:169.254.169.254]/',
        'http://[::ffff:10.0.0.1]/',
        'http://[::ffff:192.168.0.1]/',
        'http://[::ffff:172.20.0.1]/',
        'http://[::ffff:0.0.0.0]/',
        // IPv4-compatible (deprecated) addresses live in ::/96.
        'http://[::127.0.0.1]/',
        'http://[::10.0.0.1]/',
        // fe80::/10 runs to febf, not just the fe8 prefix.
        'http://[fe90::1]/',
        'http://[fea0::1]/',
        'http://[febf:ffff::1]/',
    ])('rejects the bypass %s', url => {
        expect(isPrivateHost(hostOf(url))).toBe(true);
    });

    it.each([
        'https://example.com/',
        'https://fcdn.example.com/',
        'https://fd.example.com/',
        'https://fe80.example.com/',
        'http://8.8.8.8/',
        'http://172.15.0.1/',
        'http://172.32.0.1/',
        'http://[2001:4860:4860::8888]/',
        'http://[::ffff:8.8.8.8]/',
        'http://[::ffff:172.32.0.1]/',
        // Past fe80::/10 and fc00::/7 — outside both ranges.
        'http://[fec0::1]/',
        'http://[fe00::1]/',
        'http://[fb00::1]/',
    ])('allows %s', url => {
        expect(isPrivateHost(hostOf(url))).toBe(false);
    });
});

describe('fetchUrlMetadata', () => {
    const HTML = '<html><head><title>Hello</title></head></html>';
    const originalFetch = global.fetch;
    let fetchMock: jest.Mock;

    const page = (): Response => new Response(HTML, { status: 200, headers: { 'content-type': 'text/html' } });
    const redirect = (location: string | null, status = 302): Response =>
        new Response(null, { status, headers: location === null ? {} : { location } });
    const requested = (): string[] => fetchMock.mock.calls.map(call => String(call[0]));

    beforeEach(() => {
        fetchMock = jest.fn();
        global.fetch = fetchMock as unknown as typeof fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('returns the title of a plain page', async () => {
        fetchMock.mockResolvedValueOnce(page());

        const result = await fetchUrlMetadata('https://example.com/a');

        expect(result).toMatchObject({ success: true, title: 'Hello' });
        expect(requested()).toEqual(['https://example.com/a']);
    });

    it('never requests a private first hop', async () => {
        const result = await fetchUrlMetadata('http://[::ffff:127.0.0.1]/admin');

        expect(result.success).toBe(false);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('fetches with manual redirects so every hop can be checked', async () => {
        fetchMock.mockResolvedValueOnce(page());

        await fetchUrlMetadata('https://example.com/');

        expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
    });

    it.each([
        'http://169.254.169.254/latest/meta-data/',
        'http://[::ffff:169.254.169.254]/',
        'http://[fe90::1]/',
        'http://localhost./',
    ])('does not request a redirect target of %s', async location => {
        fetchMock.mockResolvedValueOnce(redirect(location));

        const result = await fetchUrlMetadata('https://example.com/go');

        expect(result.success).toBe(false);
        // The internal host is never contacted, not merely hidden from the answer.
        expect(requested()).toEqual(['https://example.com/go']);
    });

    it('follows a redirect to a public host', async () => {
        fetchMock.mockResolvedValueOnce(redirect('https://www.example.com/landing')).mockResolvedValueOnce(page());

        const result = await fetchUrlMetadata('https://example.com/short');

        expect(result).toMatchObject({ success: true, url: 'https://example.com/short', title: 'Hello' });
        expect(requested()).toEqual(['https://example.com/short', 'https://www.example.com/landing']);
    });

    it('resolves a relative Location against the current hop', async () => {
        fetchMock.mockResolvedValueOnce(redirect('/next?x=1', 301)).mockResolvedValueOnce(page());

        await fetchUrlMetadata('https://example.com/a/b');

        expect(requested()).toEqual(['https://example.com/a/b', 'https://example.com/next?x=1']);
    });

    it('checks every hop, not only the first and the last', async () => {
        fetchMock
            .mockResolvedValueOnce(redirect('https://cdn.example.com/x'))
            .mockResolvedValueOnce(redirect('http://10.0.0.5/internal'));

        const result = await fetchUrlMetadata('https://example.com/');

        expect(result.success).toBe(false);
        expect(requested()).toEqual(['https://example.com/', 'https://cdn.example.com/x']);
    });

    it('rejects a redirect to a non-http scheme', async () => {
        fetchMock.mockResolvedValueOnce(redirect('file:///etc/passwd'));

        const result = await fetchUrlMetadata('https://example.com/');

        expect(result.success).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('rejects a redirect with no Location', async () => {
        fetchMock.mockResolvedValueOnce(redirect(null));

        const result = await fetchUrlMetadata('https://example.com/');

        expect(result.success).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('stops a redirect loop at the hop cap', async () => {
        fetchMock.mockImplementation(async () => redirect('https://example.com/again'));

        const result = await fetchUrlMetadata('https://example.com/');

        expect(result.success).toBe(false);
        // The first request plus five followed redirects.
        expect(fetchMock).toHaveBeenCalledTimes(6);
    });
});

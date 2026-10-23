import { apiBackendOf, createPerMinuteCap, endpointTemplateOf, statusClassOf, toApiRequestSample } from './apiRequest';

describe('endpointTemplateOf', () => {
    it.each([
        ['https://api.example/dou-d1/clouds/1000002/release?x=1', '/dou-d1/clouds/:id/release'],
        ['https://api.example/dou-d1/users/0/delegate-cloud', '/dou-d1/users/:id/delegate-cloud'],
        ['https://api.example/channels/U:1002053/room', '/channels/:id/room'],
        ['https://api.example/a/3f2504e0-4f89-41d3-9a0c-0305e82c3301/b', '/a/:id/b'],
        ['https://iap.example/validate/GPA.3343-1234-5678-90123', '/validate/:id'],
        ['https://api.example/oauth/google/token', '/oauth/google/token'],
        ['https://api.example/hello/report-bulk#frag', '/hello/report-bulk'],
    ])('%s → %s', (url, template) => {
        expect(endpointTemplateOf(url)).toBe(template);
    });

    it('keeps a word segment, even a long one, unless it carries a digit', () => {
        expect(endpointTemplateOf('https://x/register-user-v2')).toBe('/register-user-v2');
        expect(endpointTemplateOf('https://x/verify-native-token-and-more-words')).toBe(
            '/verify-native-token-and-more-words'
        );
    });

    it('caps the endpoint at 100 characters', () => {
        expect(endpointTemplateOf(`https://x/${'a'.repeat(150)}`)).toHaveLength(100);
    });
});

describe('statusClassOf', () => {
    it('groups by the hundreds, and says none without a response', () => {
        expect(statusClassOf(200)).toBe('2xx');
        expect(statusClassOf(404)).toBe('4xx');
        expect(statusClassOf(503)).toBe('5xx');
        expect(statusClassOf(undefined)).toBe('none');
    });
});

describe('toApiRequestSample', () => {
    it('builds the attributes and metrics from the network log fields', () => {
        expect(
            toApiRequestSample({
                outcome: 'success',
                method: 'get',
                url: 'https://x/clouds/7',
                durationMs: 123.6,
                status: 200,
                responseBytes: 512,
            })
        ).toEqual({
            attrs: { endpoint: '/clouds/:id', method: 'GET', status_class: '2xx', outcome: 'ok' },
            metrics: { rtt_ms: 124, res_bytes: 512 },
        });
    });

    it('carries the backend when one is given, and leaves the key out when not', () => {
        const fields = { outcome: 'success' as const, method: 'get', url: 'https://x/a', durationMs: 1, status: 200 };
        expect(toApiRequestSample(fields, 'cloud').attrs.backend).toBe('cloud');
        expect(toApiRequestSample(fields).attrs).not.toHaveProperty('backend');
    });

    it('leaves the size out when the response carried none', () => {
        const sample = toApiRequestSample({ outcome: 'error', method: 'POST', url: 'https://x/a', durationMs: 5 });
        expect(sample.attrs).toMatchObject({ status_class: 'none', outcome: 'error' });
        expect(sample.metrics).not.toHaveProperty('res_bytes');
    });
});

describe('createPerMinuteCap', () => {
    it('allows the limit per minute, then again once the minute has passed', () => {
        let now = 0;
        const cap = createPerMinuteCap(2, () => now);

        expect([cap(), cap(), cap()]).toEqual([true, true, false]);
        now = 60_000;
        expect(cap()).toBe(true);
    });
});

describe('apiBackendOf', () => {
    const endpoints = { relay: 'https://api.dou.test/d1', others: ['https://oauth.dou.test', 'https://iap.dou.test/'] };

    it('is relay for a request under the relay endpoint, path prefix included', () => {
        expect(apiBackendOf('https://api.dou.test/d1/clouds/0/list', endpoints)).toBe('relay');
        expect(apiBackendOf('https://api.dou.test/d1', endpoints)).toBe('relay');
    });

    it('is cloud for any other absolute host, including a sibling path of the relay host', () => {
        expect(apiBackendOf('https://c1000002.cloud.test/oauth/exchange-token', endpoints)).toBe('cloud');
        expect(apiBackendOf('https://api.dou.test/d10/clouds', endpoints)).toBe('cloud');
    });

    it('names no backend for the oauth and iap hosts, or for a URL that is not absolute', () => {
        expect(apiBackendOf('https://oauth.dou.test/oauth/google/token', endpoints)).toBeUndefined();
        expect(apiBackendOf('https://iap.dou.test/validate/apple', endpoints)).toBeUndefined();
        expect(apiBackendOf('/clouds/0/list', endpoints)).toBeUndefined();
    });

    it('names no relay when the relay endpoint is not configured', () => {
        expect(apiBackendOf('https://api.dou.test/d1/x', { relay: '', others: [] })).toBe('cloud');
    });
});

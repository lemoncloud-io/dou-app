import { INJECT_SCRIPT_PATH, WEB_PATHS, injectShellScript, isHtmlResponse, webUnreachablePage } from './proxyRules';

const tag = `<script src="${INJECT_SCRIPT_PATH}"></script>`;

describe('injectShellScript', () => {
    it('puts the script right after <head>, ahead of the page’s own inline scripts', () => {
        const html = '<!doctype html><html><head lang="en"><script>window.__T0 = 1;</script></head></html>';

        expect(injectShellScript(html)).toBe(
            `<!doctype html><html><head lang="en">${tag}<script>window.__T0 = 1;</script></head></html>`
        );
    });

    it('puts it at the very start of a document without a <head>', () => {
        expect(injectShellScript('<p>hi</p>')).toBe(`${tag}<p>hi</p>`);
    });

    it('leaves a page that already has it alone', () => {
        const once = injectShellScript('<html><head></head></html>');

        expect(injectShellScript(once)).toBe(once);
    });
});

describe('WEB_PATHS', () => {
    const proxied = (url: string) => new RegExp(WEB_PATHS).test(url);

    it('sends every path but the shell’s own to the web', () => {
        expect(proxied('/')).toBe(true);
        expect(proxied('/channels/1/room?cid=%23')).toBe(true);
        expect(proxied('/@vite/client')).toBe(true);
        expect(proxied('/__shellish')).toBe(true);
        expect(proxied('/__shell/')).toBe(false);
        expect(proxied('/__shell/inject.js')).toBe(false);
        expect(proxied('/__shell')).toBe(false);
        expect(proxied('/__shell?x=1')).toBe(false);
    });
});

describe('isHtmlResponse', () => {
    it('reads the content type', () => {
        expect(isHtmlResponse('text/html; charset=utf-8')).toBe(true);
        expect(isHtmlResponse(['text/html'])).toBe(true);
        expect(isHtmlResponse('application/javascript')).toBe(false);
        expect(isHtmlResponse(undefined)).toBe(false);
    });
});

describe('webUnreachablePage', () => {
    it('names the web server and what to do, and carries no script', () => {
        const page = webUnreachablePage('http://localhost:5003');

        expect(page).toContain('http://localhost:5003');
        expect(page).toContain('yarn local');
        expect(page).not.toContain('<script');
    });
});

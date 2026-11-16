/**
 * The main WebView's first address after a session the app's runtime held has ended: the web's base
 * address with the query a page would have navigated home with (`logout=1…`). A page that ends its own
 * session goes to `/` with that query; the base address is the app's `/`, which may be a custom web
 * build's local server rather than the web's origin.
 *
 * Built as a string: a query is appended to whatever the base already carries, and React Native's
 * `URL` rewrites addresses it parses.
 */
export const homeAddress = (baseUrl: string, homeSearch: string | null | undefined): string => {
    const search = homeSearch?.replace(/^\?/, '');
    if (!baseUrl || !search) return baseUrl;
    return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${search}`;
};

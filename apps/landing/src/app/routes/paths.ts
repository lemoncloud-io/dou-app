/**
 * Every absolute path this site links or redirects to.
 *
 * A `<Link to>` or `<Navigate to>` takes its target from here instead of a typed string. These are
 * public URLs that store listings, the sitemap and links already sent to people cite, so a value
 * here changes only together with everything outside the repo that points at it.
 *
 * The route table itself (`CommonRoutes.tsx`) and each feature's own `routes/` still spell their
 * patterns (`policy/*`, `/terms`), the same split the web app keeps: a pattern is matched, a
 * path from here is navigated to.
 */
export const ROUTES = {
    root: '/',
    policy: {
        terms: '/policy/terms',
        privacy: '/policy/privacy',
        child: '/policy/child',
    },
} as const;

import { matchRoutes } from 'react-router-dom';

import { ROUTES } from '../../routes/paths';

/**
 * The route templates the app knows, derived from the `ROUTES` table rather than listed again.
 *
 * A string entry is its own template. A function entry builds a path from ids, so calling it with
 * placeholders gives its template: `room('<id>')` → `/channels/:id/room`. Placeholders are `:id`,
 * `:id2`, … in argument order — the label only has to be stable, not to name the parameter.
 */
const collectTemplates = (node: unknown, out: string[]): string[] => {
    if (typeof node === 'string') out.push(node);
    else if (typeof node === 'function') {
        const args = Array.from({ length: node.length }, (_, i) => (i === 0 ? ':id' : `:id${i + 1}`));
        const built = (node as (...a: string[]) => unknown)(...args);
        if (typeof built === 'string') out.push(built);
    } else if (node && typeof node === 'object') {
        for (const child of Object.values(node)) collectTemplates(child, out);
    }
    return out;
};

const TEMPLATE_ROUTES = [...new Set(collectTemplates(ROUTES, []))].map(path => ({ path }));

/** Paths resolved so far. A run visits a handful of screens, so this stays small; it is bounded anyway. */
const cache = new Map<string, string | undefined>();
const CACHE_LIMIT = 200;

/**
 * The template a path matched — `/channels/U:1002053/room` → `/channels/:id/room`.
 *
 * The router's own ranking picks the match, so a static segment beats a parameter
 * (`/channels/start-dm` is not `/channels/:id`). A path no template matches has **no** template:
 * filling it with the path itself would split a statistics axis into one group per id.
 */
export const routeTemplateOf = (pathname: string | undefined): string | undefined => {
    if (!pathname) return undefined;
    if (cache.has(pathname)) return cache.get(pathname);

    const template = matchRoutes(TEMPLATE_ROUTES, pathname)?.[0]?.route.path;
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(pathname, template);
    return template;
};

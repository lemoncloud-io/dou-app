import { matchRoutes } from 'react-router-dom';

import { ROUTES } from '../../routes/paths';

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

const cache = new Map<string, string | undefined>();
const CACHE_LIMIT = 200;

export const routeTemplateOf = (pathname: string | undefined): string | undefined => {
    if (!pathname) return undefined;
    if (cache.has(pathname)) return cache.get(pathname);

    const template = matchRoutes(TEMPLATE_ROUTES, pathname)?.[0]?.route.path;
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(pathname, template);
    return template;
};

import type { RuntimePorts } from '@chatic/runtime-core';

type AuthPorts = RuntimePorts['auth'];

export type PageLocation = Pick<Location, 'search' | 'origin' | 'replace'>;

export const webAuthPorts = (location: PageLocation = window.location): AuthPorts => ({
    currentSearch: () => location.search,
    leaveToHome: params => {
        const target = new URL('/', location.origin);
        target.search = params.toString();
        location.replace(target.toString());
    },
});

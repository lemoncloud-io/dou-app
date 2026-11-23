import type { HttpRoute } from '../ports';

export interface IStaleCredentialMarker {
    mark<E>(error: E, route: HttpRoute): E;
    routeOf(error: unknown): HttpRoute | null;
    isMarked(error: unknown): boolean;
}

class StaleCredentialMarker implements IStaleCredentialMarker {
    private static readonly KEY = '__chaticStaleCredentialRoute';

    mark<E>(error: E, route: HttpRoute): E {
        if (typeof error !== 'object' || error === null) return error;
        try {
            Object.defineProperty(error, StaleCredentialMarker.KEY, {
                value: route,
                enumerable: false,
                configurable: true,
                writable: true,
            });
        } catch {
            // Frozen/sealed error object — the classification simply falls back to its status-based path.
        }
        return error;
    }

    routeOf(error: unknown): HttpRoute | null {
        const route = (error as Record<string, unknown> | null | undefined)?.[StaleCredentialMarker.KEY];
        return typeof route === 'string' ? (route as HttpRoute) : null;
    }

    isMarked(error: unknown): boolean {
        return this.routeOf(error) !== null;
    }
}

export const staleCredentialMarker: IStaleCredentialMarker = new StaleCredentialMarker();

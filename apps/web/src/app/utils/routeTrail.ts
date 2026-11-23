export const ROUTE_TRAIL_SIZE = 10;

let trail: string[] = [];

export const recordRoute = (path: string): void => {
    if (!path) return;
    if (trail[trail.length - 1] === path) return;
    trail.push(path);
    if (trail.length > ROUTE_TRAIL_SIZE) trail = trail.slice(-ROUTE_TRAIL_SIZE);
};

export const getRouteTrail = (): string[] => [...trail];

export const resetRouteTrail = (): void => {
    trail = [];
};

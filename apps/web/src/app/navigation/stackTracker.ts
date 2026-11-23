export type RouteHistoryAction = 'PUSH' | 'POP' | 'REPLACE';

export interface RouteStackTransition {
    pathname: string;
    action: RouteHistoryAction;
    index: number | null;
}

export interface RouteStackEntry {
    index: number;
    pathname: string | null;
    isCurrent: boolean;
}

export interface RouteStackSnapshot {
    entries: RouteStackEntry[];
    currentIndex: number | null;
    isIndexed: boolean;
}

export interface IRouteStackTracker {
    record(transition: RouteStackTransition): void;
    getSnapshot(): RouteStackSnapshot;
    reset(): void;
}

export const resolveTransitionIndex = (action: RouteHistoryAction, readableIndex: number | null): number | null => {
    if (readableIndex === null) return null;
    return action === 'PUSH' ? readableIndex + 1 : readableIndex;
};

export const asHistoryAction = (value: string): RouteHistoryAction =>
    value === 'PUSH' || value === 'REPLACE' ? value : 'POP';

class RouteStackTracker implements IRouteStackTracker {
    private entries: (string | null)[] = [];
    private currentIndex: number | null = null;
    private isIndexed = true;

    record({ pathname, action, index }: RouteStackTransition): void {
        if (!pathname) return;

        if (index === null) {
            this.isIndexed = false;
            return;
        }

        if (action === 'PUSH' && this.entries.length > index) this.entries.length = index;

        while (this.entries.length < index) this.entries.push(null);

        this.entries[index] = pathname;
        this.currentIndex = index;
    }

    getSnapshot(): RouteStackSnapshot {
        return {
            entries: this.entries.map((pathname, index) => ({
                index,
                pathname,
                isCurrent: index === this.currentIndex,
            })),
            currentIndex: this.currentIndex,
            isIndexed: this.isIndexed,
        };
    }

    reset(): void {
        this.entries = [];
        this.currentIndex = null;
        this.isIndexed = true;
    }
}

export const routeStackTracker: IRouteStackTracker = new RouteStackTracker();

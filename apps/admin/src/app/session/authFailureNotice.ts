type Listener = () => void;

class AuthFailureNotice {
    private raisedAt: number | null = null;
    private readonly listeners = new Set<Listener>();

    raise(): void {
        if (this.raisedAt != null) return;
        this.raisedAt = Date.now();
        this.listeners.forEach(listener => listener());
    }

    clear(): void {
        if (this.raisedAt == null) return;
        this.raisedAt = null;
        this.listeners.forEach(listener => listener());
    }

    subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    getSnapshot = (): boolean => this.raisedAt != null;
}

export const authFailureNotice = new AuthFailureNotice();

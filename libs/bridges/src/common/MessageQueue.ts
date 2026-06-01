export interface IMessageQueue<T> {
    enqueue(item: T): void;
    dequeue(): T | undefined;
    isEmpty(): boolean;
    size(): number;
    clear(): void;
    getAll(): T[];
}

export class MessageQueue<T> implements IMessageQueue<T> {
    private items: T[] = [];

    public enqueue(item: T): void {
        this.items.push(item);
    }

    public dequeue(): T | undefined {
        return this.items.shift();
    }

    public isEmpty(): boolean {
        return this.items.length === 0;
    }

    public size(): number {
        return this.items.length;
    }

    public clear(): void {
        this.items = [];
    }

    public getAll(): T[] {
        return [...this.items];
    }
}

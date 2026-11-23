export interface IConfigKvService {
    getAll(): Record<string, string>;

    set(key: string, value: string): Promise<void>;

    remove(key: string): Promise<void>;
}

export interface IFirebaseCrashlyticsService {
    init(): void;
    setupUser(): Promise<void>;
}

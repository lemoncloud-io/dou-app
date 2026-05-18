export interface IFirebaseInstallationService {
    getFirebaseId(): Promise<string | null>;
}

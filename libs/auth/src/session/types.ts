export interface IRelayCredentialProbe {
    hasSession(): boolean;
    isCredentialExpired(now?: number): boolean;
}

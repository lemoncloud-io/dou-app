export interface AuthPlatformPorts {
    currentSearch(): string;
    leaveToHome(params: URLSearchParams): void;
}

export interface IAuthPlatform {
    configure(ports: AuthPlatformPorts): void;
    ports(): AuthPlatformPorts;
}

class AuthPlatform implements IAuthPlatform {
    private configured: AuthPlatformPorts | null = null;

    configure(ports: AuthPlatformPorts): void {
        this.configured = ports;
    }

    ports(): AuthPlatformPorts {
        if (!this.configured) {
            throw new Error(
                '[auth] the platform ports were used before any were configured — the entry point has to pass ' +
                    '`auth` to createRuntime() before a session ends or the boot reads the logout flag.'
            );
        }
        return this.configured;
    }
}

export const authPlatform: IAuthPlatform = new AuthPlatform();

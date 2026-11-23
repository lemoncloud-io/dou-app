export class EmailVerifyRefusal extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'EmailVerifyRefusal';
    }
}

export const isEmailVerifyRefusal = (e: unknown): e is EmailVerifyRefusal =>
    e instanceof Error && e.name === 'EmailVerifyRefusal';

export const isEmailAlreadyRegistered = (e: unknown): boolean => {
    const message = (e as { message?: unknown } | null)?.message;
    return typeof message === 'string' && /^409 CONFLICT\b/.test(message.trim());
};

import { logger } from '@chatic/logger';

export type AuthFailureReactionFn = (error: unknown, message: string) => void;

export interface IAuthFailureReaction {
    register(fn: AuthFailureReactionFn | null): void;
    react(error: unknown, message: string): void;
}

const defaultReaction: AuthFailureReactionFn = () => undefined;

class AuthFailureReactionRegistry implements IAuthFailureReaction {
    private fn: AuthFailureReactionFn | null = null;

    register(fn: AuthFailureReactionFn | null): void {
        this.fn = fn;
    }

    react(error: unknown, message: string): void {
        try {
            (this.fn ?? defaultReaction)(error, message);
        } catch (reactionError) {
            logger.warn('AUTH', '[authFailureReaction] reaction threw', { error: reactionError });
        }
    }
}

export const authFailureReaction: IAuthFailureReaction = new AuthFailureReactionRegistry();

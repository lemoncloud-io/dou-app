import type { IAuthRepository } from '@chatic/data';

import { runtimeData } from '../data/dataCommands';

/**
 * The account lookups and sign-ups that change no session — an alias lookup or check, a registration,
 * an invite's details — through the engine's auth repository, so they run wherever the runtime does: in
 * this page, or across the bridge in the app's process.
 */
const auth = () => runtimeData().repositories().auth;

export const findAlias = (...args: Parameters<IAuthRepository['findAlias']>) => auth().findAlias(...args);

export const verifyAlias = (...args: Parameters<IAuthRepository['verifyAlias']>) => auth().verifyAlias(...args);

export const registerUser = (...args: Parameters<IAuthRepository['registerUser']>) => auth().registerUser(...args);

export const registerUserV2 = (...args: Parameters<IAuthRepository['registerUserV2']>) =>
    auth().registerUserV2(...args);

export const fetchInviteInfoWithCode = (code: string, backend: string) => auth().fetchInviteInfo({ code, backend });

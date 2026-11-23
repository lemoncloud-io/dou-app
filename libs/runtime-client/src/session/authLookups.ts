import type { IAuthRepository } from '@chatic/data';

import { runtimeData } from '../data/dataCommands';

const auth = () => runtimeData().repositories().auth;

export const findAlias = (...args: Parameters<IAuthRepository['findAlias']>) => auth().findAlias(...args);

export const verifyAlias = (...args: Parameters<IAuthRepository['verifyAlias']>) => auth().verifyAlias(...args);

export const registerUser = (...args: Parameters<IAuthRepository['registerUser']>) => auth().registerUser(...args);

export const registerUserV2 = (...args: Parameters<IAuthRepository['registerUserV2']>) =>
    auth().registerUserV2(...args);

export const fetchInviteInfoWithCode = (code: string, backend: string) => auth().fetchInviteInfo({ code, backend });

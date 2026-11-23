import { authRepositorySource } from './authRepository';
import { keepInviteLogin } from './inviteLogins';
import type { InviteLogin } from './inviteLogins';

import type { IAuthRepository } from '@chatic/data';

const auth = (): IAuthRepository => authRepositorySource.get();

export const registerUser = (...args: Parameters<IAuthRepository['registerUser']>) => auth().registerUser(...args);

export const registerUserV2 = (...args: Parameters<IAuthRepository['registerUserV2']>) =>
    auth().registerUserV2(...args);

export const findAlias = (...args: Parameters<IAuthRepository['findAlias']>) => auth().findAlias(...args);

export const verifyAlias = (...args: Parameters<IAuthRepository['verifyAlias']>) => auth().verifyAlias(...args);

export const registerUserWithInviteCode = async (
    code: string,
    delegatorId: string,
    backend?: string
): Promise<InviteLogin> => keepInviteLogin(await auth().loginWithInviteCode({ code, delegatorId, backend }));

export const fetchInviteInfoWithCode = (code: string, backend: string) => auth().fetchInviteInfo({ code, backend });

export type { FindAliasBody, FindAliasView, VerifyAliasBody, VerifyAliasView } from '@chatic/http';

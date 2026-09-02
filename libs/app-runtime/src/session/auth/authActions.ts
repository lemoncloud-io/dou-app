import { getRepositories } from '../../data/runtime';

import type { IAuthRepositoryV2 } from '@chatic/data';

/**
 * The `AuthRepositoryV2` actions that leave `session/auth` — the app-facing account/alias/invite
 * commands, under the names their call sites already use.
 *
 * This is an adapter, not a data path: two of these (`registerUserWithInviteCode`,
 * `fetchInviteInfoWithCode`) are re-exported from the package barrel and are called by web,
 * desktop-web and testbed with POSITIONAL arguments, while the repository takes an object. Keeping
 * that translation in one named place is the whole reason the file exists. The session-material
 * commands used to sit here too and no longer do — they had exactly one consumer, so they live
 * inline in `services.ts` where `getRepositories()` is now called directly.
 *
 * `getRepositories()` (not the `useRuntimeRepositories` hook) so a non-React caller can use these
 * as well; the hooks that wrap them add react-query, nothing else.
 */
const auth = (): IAuthRepositoryV2 => getRepositories().auth;

export const registerUser = (...args: Parameters<IAuthRepositoryV2['registerUser']>) => auth().registerUser(...args);

export const registerUserV2 = (...args: Parameters<IAuthRepositoryV2['registerUserV2']>) =>
    auth().registerUserV2(...args);

export const findAlias = (...args: Parameters<IAuthRepositoryV2['findAlias']>) => auth().findAlias(...args);

export const verifyAlias = (...args: Parameters<IAuthRepositoryV2['verifyAlias']>) => auth().verifyAlias(...args);

/** `backend` defaults to the dynamic relay host, matching the pre-move `registerUserWithInviteCode`. */
export const registerUserWithInviteCode = (code: string, delegatorId: string, backend?: string) =>
    auth().loginWithInviteCode({ code, delegatorId, backend });

export const fetchInviteInfoWithCode = (code: string, backend: string) => auth().fetchInviteInfo({ code, backend });

export type { FindAliasBody, FindAliasView, VerifyAliasBody, VerifyAliasView } from '@chatic/http';

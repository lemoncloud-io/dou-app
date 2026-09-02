import { useCustomMutation } from '@chatic/shared';
import { verifyAlias } from '../../auth/authActions';
import type { VerifyAliasBody, VerifyAliasView } from '../../auth/authActions';
import type { AxiosError } from 'axios';

export const useVerifyAlias = () => useCustomMutation<VerifyAliasView, AxiosError, VerifyAliasBody>(verifyAlias);

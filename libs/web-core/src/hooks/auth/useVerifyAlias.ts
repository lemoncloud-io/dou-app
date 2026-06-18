import { useCustomMutation } from '@chatic/shared';
import { verifyAlias } from '../../api';
import type { VerifyAliasBody, VerifyAliasView } from '../../api';
import type { AxiosError } from 'axios';

export const useVerifyAlias = () => useCustomMutation<VerifyAliasView, AxiosError, VerifyAliasBody>(verifyAlias);

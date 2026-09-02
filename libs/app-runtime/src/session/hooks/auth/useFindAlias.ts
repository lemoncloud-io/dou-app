import { useCustomMutation } from '@chatic/shared';
import { findAlias } from '../../auth/authActions';
import type { FindAliasBody, FindAliasView } from '../../auth/authActions';
import type { AxiosError } from 'axios';

export const useFindAlias = () => useCustomMutation<FindAliasView, AxiosError, FindAliasBody>(findAlias);

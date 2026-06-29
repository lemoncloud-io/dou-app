import { useCustomMutation } from '@chatic/shared';
import { findAlias } from '../../api';
import type { FindAliasBody, FindAliasView } from '../../api';
import type { AxiosError } from 'axios';

export const useFindAlias = () => useCustomMutation<FindAliasView, AxiosError, FindAliasBody>(findAlias);

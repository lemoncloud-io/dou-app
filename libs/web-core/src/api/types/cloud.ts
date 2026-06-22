import { createQueryKeys } from '@chatic/shared';
import type { Params } from '@lemoncloud/lemon-web-core';

export const usersKeys = createQueryKeys('users');
export const cloudsKeys = createQueryKeys('clouds');

export type UseCloudsParams = Params & {
    enabled?: boolean;
};

export type UseCloudsOptions = {
    enabled?: boolean;
};

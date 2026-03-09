import { useQuery } from '@tanstack/react-query';

import { createQueryKeys } from '@chatic/shared';

import { fetchPlaces } from '../apis';

import type { ListResult } from '@chatic/shared';
import type { Params } from '@lemoncloud/lemon-web-core';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';

export const placesKeys = createQueryKeys('places');

export const usePlaces = (params: Params = {}) =>
    useQuery<ListResult<MySiteView>>({
        queryKey: placesKeys.list(params),
        queryFn: () => fetchPlaces(params),
        refetchOnWindowFocus: false,
    });

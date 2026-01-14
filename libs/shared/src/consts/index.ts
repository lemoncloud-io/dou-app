import type { QueryClient } from '@tanstack/react-query';

const REQUEST_DELAY = 5000;

/**
 * 에러 타입별 UI 메시지 및 설정
 * ErrorFallback, RouterErrorFallback 컴포넌트에서 사용
 */
export const ERROR_MESSAGES = {
    network: {
        title: '연결 오류',
        description: '서버에 연결할 수 없습니다. 인터넷 연결을 확인해주세요.',
        primaryAction: '다시 시도',
        secondaryAction: '새로고침',
    },
    auth: {
        title: '인증 오류',
        description: '세션이 만료되었습니다. 다시 로그인해주세요.',
        primaryAction: '로그인',
        secondaryAction: '홈으로',
    },
    server: {
        title: '서버 오류',
        description: '서버에 문제가 발생했습니다. 잠시 후 다시 시도해주세요.',
        primaryAction: '다시 시도',
        secondaryAction: '홈으로',
    },
    client: {
        title: '요청 오류',
        description: '요청에 문제가 있습니다. 다시 시도해주세요.',
        primaryAction: '다시 시도',
        secondaryAction: '홈으로',
    },
    unknown: {
        title: '오류 발생',
        description: '예상치 못한 오류가 발생했습니다.',
        primaryAction: '다시 시도',
        secondaryAction: '홈으로',
    },
    notFound: {
        title: '페이지를 찾을 수 없습니다',
        description: '요청하신 페이지가 존재하지 않거나 이동되었습니다.',
        primaryAction: '홈으로',
        secondaryAction: '이전 페이지',
    },
} as const;

export type ErrorMessageType = keyof typeof ERROR_MESSAGES;

/**
 * React Query에서 사용할 쿼리 키를 생성하는 함수
 * 리소스별로 일관된 쿼리 키 구조를 제공합니다.
 *
 * @param {string} resource - 리소스 이름 (예: 'projects', 'workspaces')
 * @returns {Object} 쿼리 키 생성 메서드들을 포함한 객체
 *
 * @example
 * const projectKeys = createQueryKeys('projects');
 * projectKeys.all; // ['projects']
 * projectKeys.lists(); // ['projects', 'list']
 * projectKeys.list({ page: 1 }); // ['projects', 'list', { filters: { page: 1 }}]
 * projectKeys.detail('123'); // ['projects', 'detail', '123']
 */
export const createQueryKeys = (resource: string) => {
    const all = [resource] as const;

    return {
        all,
        lists: () => [...all, 'list'] as const,
        list: (filters: Record<string, unknown>) => [...all, 'list', { filters }] as const,
        details: () => [...all, 'detail'] as const,
        detail: (id: string) => [...all, 'detail', id] as const,
        invalidateList: () => ({
            queryKey: [resource, 'list'],
            exact: false,
        }),
    };
};

type CacheUpdateOptions = {
    resource: string;
    queryClient: QueryClient;
    shouldInvalidate?: boolean;
    invalidateDelay?: number;
};

export const updateAllListCaches = async <T = any>(
    { resource, queryClient, shouldInvalidate = true, invalidateDelay = REQUEST_DELAY }: CacheUpdateOptions,
    updateFn: (oldData: T) => T
) => {
    const queryCache = queryClient.getQueryCache();
    const queries = queryCache.findAll({
        predicate: query => {
            const queryKey = query.queryKey;
            return Array.isArray(queryKey) && queryKey[0] === resource && queryKey[1] === 'list';
        },
    });

    const updatePromises = queries.map(query => {
        const currentData = query.state.data;
        if (!currentData) return Promise.resolve();

        return new Promise<void>((resolve, reject) => {
            try {
                queryClient.setQueryData(query.queryKey, updateFn);
                resolve();
            } catch (error) {
                console.error(`Failed to update cache for query ${JSON.stringify(query.queryKey)}:`, error);
                reject(error);
            }
        });
    });

    try {
        await Promise.allSettled(updatePromises);

        if (shouldInvalidate) {
            // 즉시 invalidate 하거나, 필요시에만 지연
            if (invalidateDelay > 0) {
                setTimeout(async () => {
                    await queryClient.invalidateQueries(createQueryKeys(resource).invalidateList());
                }, invalidateDelay as number);
            } else {
                await queryClient.invalidateQueries(createQueryKeys(resource).invalidateList());
            }
        }
    } catch (error) {
        console.error(`Cache update failed for resource ${resource}:`, error);
        // 실패 시 강제로 invalidate
        await queryClient.invalidateQueries(createQueryKeys(resource).invalidateList());
    }
};

import { useCallback, useMemo } from 'react';
import { createStorageAdapter } from '../storages';
import type { JoinView, UserView } from '@lemoncloud/chatic-socials-api';
import type { CacheChannelView } from '@chatic/app-messages';

/**
 * 사용자 데이터의 영속성을 관리하는 리포지토리
 * 서버와의 연동 없이 로컬 DB(IndexedDB 등)와의 직접적인 입출력을 전담
 * @param profileUid 유저별 캐시 파티셔닝용 — default(중계서버) 모드에서만 유저별 캐시 분리
 */
export const useUserRepository = (cloudId: string, profileUid?: string) => {
    const cid = cloudId === 'default' && profileUid ? `${cloudId}:${profileUid}` : cloudId;
    const userDB = useMemo(() => (cloudId ? createStorageAdapter<UserView>('user', cid) : null), [cloudId, cid]);
    const joinDB = useMemo(() => (cloudId ? createStorageAdapter<JoinView>('join', cid) : null), [cloudId, cid]);
    const channelDB = useMemo(
        () => (cloudId ? createStorageAdapter<CacheChannelView>('channel', cid) : null),
        [cloudId, cid]
    );

    /**
     * 단일 유저 조회
     */
    const getUser = useCallback(
        async (userId: string): Promise<UserView | null> => {
            if (!userDB) return null;
            return await userDB.load(userId);
        },
        [userDB]
    );

    /**
     * 다중 유저 조회
     */
    const getUsers = useCallback(
        async (userIds: string[]): Promise<UserView[]> => {
            if (!userDB || !userIds.length) return [];
            const tasks = userIds.map(id => userDB.load(id));
            const results = await Promise.all(tasks);
            return results.filter((user): user is UserView => !!user);
        },
        [userDB]
    );

    /**
     * 채널의 memberIds를 사용하여 멤버 목록을 조회
     * 채널 본체 데이터를 가져와서 유효한 memberIds 추출
     * 추출된 memberIds를 기반으로 유저 정보 로드
     * 읽음 상태 동기화을 위해 joinDB 데이터 매핑
     */
    const getUsersByChannel = useCallback(
        async (channelId: string): Promise<UserView[]> => {
            if (!userDB || !channelDB) return [];

            const channel = await channelDB.load(channelId);
            const memberIds = channel?.memberIds;

            if (!memberIds || memberIds.length === 0) {
                return [];
            }
            const users = await getUsers(memberIds);
            if (joinDB) {
                const allJoins = await joinDB.loadAll();
                const channelJoins = allJoins.filter(j => j.channelId === channelId);

                return users.map(user => {
                    const join = channelJoins.find(j => j.userId === user.id);
                    return { ...user, $join: join };
                });
            }

            return users;
        },
        [userDB, channelDB, joinDB, getUsers]
    );

    /**
     * 단일 유저 저장
     * 유저 정보에 $join이 포함되어 있다면 joinDB에도 동시 저장
     */
    const saveUser = useCallback(
        async (user: UserView): Promise<void> => {
            if (!userDB || !user.id) return;

            const tasks: Promise<void>[] = [userDB.save(user.id, user)];

            if (joinDB && user.$join?.id) {
                tasks.push(joinDB.save(user.$join.id, user.$join));
            }

            await Promise.all(tasks);
        },
        [userDB, joinDB]
    );

    /**
     * 다중 유저 병렬 저장
     */
    const saveUsers = useCallback(
        async (users: UserView[]): Promise<void> => {
            if (!userDB || !users.length) return;

            const tasks: Promise<void>[] = [];

            for (const user of users) {
                if (user.id) {
                    tasks.push(userDB.save(user.id, user));
                }

                if (joinDB && user.$join?.id) {
                    tasks.push(joinDB.save(user.$join.id, user.$join));
                }
            }

            await Promise.all(tasks);
        },
        [userDB, joinDB]
    );

    return useMemo(
        () => ({
            cloudId,
            getUser,
            getUsers,
            getUsersByChannel,
            saveUser,
            saveUsers,
        }),
        [cloudId, getUser, getUsers, getUsersByChannel, saveUser, saveUsers]
    );
};

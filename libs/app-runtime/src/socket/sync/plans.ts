import type { DomainSyncPlan } from '@lemoncloud/chatic-sockets-lib';
import {
    ChannelSyncPlan,
    ChatSyncPlan,
    JoinSyncPlan,
    PlaceSyncPlan,
    ProfileSyncPlan,
} from '@lemoncloud/chatic-sockets-lib';
import { toDomainChannel, toDomainChat, toDomainJoin, toDomainPlace, toDomainProfile } from '@chatic/data';
import { getDataManager, getRepositories } from '../../data/runtime';
import { getSocketManager } from '../runtime';
import type { ChannelView, ProfileView } from '@lemoncloud/chatic-socials-api';
import type { MySiteView } from '@lemoncloud/chatic-backend-api';
import { isForeignContext } from '@chatic/data';

/**
 * Sync plans resolve runtime-heavy dependencies lazily so tests can inject
 * lightweight factories without loading the socket library at module scope.
 *
 * Domain mappers consume the shared DataContext directly (cid/sid/uid live on
 * it), so we read it straight from the manager instead of projecting a separate
 * scope object.
 */
const getContext = () => getDataManager().getContext();

// A cloud switch flips the cache cid to the target optimistically, but the outgoing cloud's
// socket stays attached (same url) until the target's wss commits — and keeps delivering frames.
// getBoundCid() is the cloud that socket was actually bound to; when it differs from the live
// cache cid the frame belongs to a socket that outlived its cloud, so drop it rather than write
// the old cloud's channels under the new cloud's partition (the cross-cloud flicker).
const dropForeignFrame = (): boolean =>
    isForeignContext({ ...getContext(), socketCid: getSocketManager().getBoundCid() ?? undefined });

/**
 * 폴링 plan 공통 옵션: 재연결 시 스냅샷을 리셋하지 않는다 (ADR-0059).
 *
 * 라이브러리 기본값은 리셋이다 — 재연결 직후 첫 폴이 무조건 "변경됨"으로 판정되어 onUpdate가
 * 최소 한 번 보장된다. 우리 소비자는 그 보장이 필요 없다: onUpdate는 캐시 쓰기뿐이고 캐시에는
 * 같은 행이 이미 있으므로, 리셋은 재연결(포그라운드 복귀마다 일어난다)마다 등록된 모든 타깃
 * 수만큼의 동일-데이터 쓰기 → 리이밋 → 재조회 연쇄만 만들었다. 스냅샷을 유지하면 오프라인 동안
 * 실제로 바뀐 행(updatedAt 전진)만 쓴다. 세션 경계(클라우드 전환·로그아웃)는 scheduler의
 * `stopAll`이 스냅샷을 함께 비우므로 낡은 기준선이 세션을 넘어 살아남지 못한다.
 */
const KEEP_SNAPSHOT_ON_RECONNECT = { resetSnapshotOnConnected: false } as const;

// DeviceSyncPlan is no longer created here: createDeviceRuntime injects its own
// DeviceSyncPlan and owns device save, so these plans are passed as `extraSyncPlans`.
export const createSyncPlans = (): DomainSyncPlan[] => {
    return [
        new ChannelSyncPlan<ChannelView>({
            ...KEEP_SNAPSHOT_ON_RECONNECT,
            onUpdate: (_target, view) => {
                if (dropForeignFrame()) return;
                const { channel } = getRepositories();
                void channel.cacheWrite(toDomainChannel(view, getContext()));
            },
            onRemove: target => {
                if (!target.id) return;
                const { channel } = getRepositories();
                void channel.cacheDelete(target.id);
            },
        }),
        // Place sync targets emit MySiteView payloads; parameterize the plan so
        // onUpdate's view matches toDomainPlace's input instead of the default
        // bare SyncableView (id/updatedAt only).
        new PlaceSyncPlan<MySiteView>({
            ...KEEP_SNAPSHOT_ON_RECONNECT,
            onUpdate: (_target, view) => {
                if (dropForeignFrame()) return;
                const { place } = getRepositories();
                void place.cacheWrite(toDomainPlace(view, getContext()));
            },
            onRemove: target => {
                if (!target.id) return;
                const { place } = getRepositories();
                void place.cacheDelete(target.id);
            },
        }),
        new ProfileSyncPlan<ProfileView>({
            ...KEEP_SNAPSHOT_ON_RECONNECT,
            onUpdate: (_target, view) => {
                if (dropForeignFrame()) return;
                const { profile } = getRepositories();
                void profile.cacheWrite(toDomainProfile(view, getContext()));
            },
            onRemove: target => {
                if (!target.id) return;
                const { profile } = getRepositories();
                void profile.cacheDelete(target.id);
            },
        }),
        // chat plan은 도착(onApply)과 변경(onUpdate)을 나눠 넘긴다. 아직 모르는 chatNo는 새 메시지,
        // 이미 해소된 chatNo에 다시 온 payload는 그 메시지의 변경이다(sockets-lib 0.5.1).
        // onRemove는 두지 않는다 — chat plan은 자동 stop되지 않고, 메시지 이력은 lazy-load/오프라인을 위해 유지한다.
        new ChatSyncPlan({
            // 적용된 메시지 델타(오름차순). chatNo 기준 idempotent 머지를 위해 일괄 반영한다.
            onApply: (_target, applied) => {
                if (dropForeignFrame()) return;
                if (!applied.length) return;
                const { chat } = getRepositories();
                const scope = getContext();
                void chat.cacheWriteMany(applied.map(view => toDomainChat(view, scope)));
            },
            /**
             * 남이 한 편집·삭제. 이게 없으면 sync로 들어온 변경은 어디에도 반영되지 않고 다음
             * `chat.feed` 재조회에서야 수렴한다 — 0.5.1 전에는 그 경로 자체가 없었다.
             *
             * **삭제도 쓰기다.** `hidden: true`가 삭제인데, 행을 지우지 않고 그대로 쓴다 —
             * `ChatRepositoryV2.deleteChat`이 내가 한 삭제에 대해 이미 그렇게 하고 그 주석이 이유를
             * 적어뒀다: 지우면 다음 sync에 행이 되살아나므로, 삭제 메시지를 tombstone으로 그리는
             * 화면이 같은 메시지를 잠깐 없음 → 이후 tombstone으로 두 번 보여준다. 즉 들어온 삭제와
             * 내가 한 삭제가 같은 상태로 수렴한다.
             *
             * 창에서 밀려난 메시지에 대해서도 발사되고 같은 변경이 반복될 수 있으므로 id 기준으로
             * 쓴다 — `cacheWrite`가 그렇게 동작하니 반복은 무해하다.
             */
            onUpdate: (_target, changed) => {
                if (dropForeignFrame()) return;
                const { chat } = getRepositories();
                void chat.cacheWrite(toDomainChat(changed, getContext()));
            },
        }),
        // join은 single-join polling plan. join.get 응답의 updatedAt 변화 시 onUpdate가 호출되며,
        // read-state sync 소유권은 이 plan이 갖고 local cache 반영은 JoinRepositoryV2가 맡는다.
        new JoinSyncPlan({
            ...KEEP_SNAPSHOT_ON_RECONNECT,
            onUpdate: (_target, view) => {
                if (dropForeignFrame()) return;
                const { join } = getRepositories();
                void join.cacheWrite(toDomainJoin(view, getContext()));
            },
            // A removed join (membership dropped: leave/kick) tombstones the local cache row so
            // read-state observers (home unread, room read positions) stop counting it.
            onRemove: target => {
                if (!target.id) return;
                const { join } = getRepositories();
                void join.cacheDelete(target.id);
            },
        }),
    ];
};

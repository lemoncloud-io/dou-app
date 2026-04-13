import type { CacheSiteView } from '@chatic/app-messages';
import type { MySiteView, UserView } from '@lemoncloud/chatic-backend-api';
import type { WSSEnvelope, WSSUserActionType } from '@lemoncloud/chatic-sockets-api';
import { notifyAppUpdated } from '../sync-events';

/**
 * userHandler
 * user 액션관련 소켓 수신
 * TODO: user 관련 이벤트 방출 필요
 * @param envelope 소켓 응답 페이로드
 * @param cloudId
 * @param userRepo
 * @param placeRepo
 * @author raine@lemoncloud.io
 */
export const userHandler = async (envelope: WSSEnvelope, cloudId: string, userRepo: any, placeRepo: any) => {
    const action = envelope.action as WSSUserActionType;
    const { payload } = envelope;

    switch (action) {
        /**
         * 접근 가능 사이트 목록 조회
         */
        case 'my-site': {
            const siteList = payload?.list as MySiteView[];
            if (siteList?.length > 0) {
                const cacheSiteList = siteList.map(site => ({ ...site, cid: cloudId }) as CacheSiteView);
                await placeRepo.savePlaces(cacheSiteList);
                notifyAppUpdated({ domain: 'site', action, cid: cloudId, payload });
            }
            break;
        }

        /**
         * make-site: 사이트 생성
         * update-site: 사이트 수정
         */
        case 'make-site':
        case 'update-site': {
            const site = payload?.site$ ?? payload;
            if (site?.id) {
                await placeRepo.savePlace(site.id, { ...site, cid: cloudId } as CacheSiteView);
                notifyAppUpdated({ domain: 'site', action, cid: cloudId, targetId: site.id, payload });
            }
            break;
        }

        /**
         * 프로필 수정
         */
        case 'update-profile': {
            const updatedUser = payload?.user$ ?? payload;
            if (updatedUser && updatedUser.id) {
                await userRepo.saveUser(updatedUser as UserView);
                notifyAppUpdated({ domain: 'user', action, cid: cloudId, targetId: updatedUser.id, payload });
            }
            break;
        }

        /**
         * 유저 초대
         */
        case 'invite': {
            const invitedUser = payload?.user$ ?? payload;
            if (invitedUser && invitedUser.id) {
                await userRepo.saveUser(invitedUser as UserView);
                notifyAppUpdated({ domain: 'user', action, cid: cloudId, targetId: invitedUser.id, payload });
            }
            break;
        }

        /**
         * 에러 응답
         */
        case 'error': {
            console.error(`[User Handler] Server responded with error:`, payload?.error);
            notifyAppUpdated({ domain: 'error', cid: cloudId, action, payload });
            break;
        }

        default:
            console.warn(`[User Handler] Unhandled user action: ${action}`);
    }
};

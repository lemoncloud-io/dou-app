import { runtime } from '@chatic/app-runtime';
import { createMentionRelay, relayMembershipOf, type RelaySnapshot } from './relay';
import { createRelayTransport } from './transport';
import { publishRelaySelfMention } from './selfMentionState';

const relay = import.meta.env.DEV
    ? createMentionRelay({
          ...createRelayTransport((...args) => fetch(...args)),
          isCurrentUser: (cloudId, roomUserId) => runtime.session.getUidInCloud(cloudId) === roomUserId,
          observeMembership: (scope, roomUserId, receive) =>
              runtime.data
                  .getCloudRepositories(scope.cloudId)
                  .join.observeList({ channelId: scope.channelId, activeOnly: false }, result => {
                      receive(relayMembershipOf(result?.list, scope, roomUserId));
                  }),
          observe: (scope, receive) => {
              const offSync = runtime.sync
                  .getSyncManager()
                  .registerChat(scope.channelId, undefined, { cid: scope.cloudId });
              const offRows = runtime.data
                  .getCloudRepositories(scope.cloudId)
                  .chat.observeList({ channelId: scope.channelId, limit: 1000 }, result => {
                      if (result) receive(result.list);
                  });
              const offLogout = runtime.session.registerSessionLogoutCallback(() => relay?.stop());
              return () => {
                  offRows();
                  offSync();
                  offLogout();
              };
          },
          armed: publishRelaySelfMention,
          status: message => console.info('[local mention relay]', message),
      })
    : undefined;

export const offerMentionRelay = (snapshot: RelaySnapshot): Promise<void> | undefined => relay?.offer(snapshot);

// This observer belongs to the dev module, so changing rooms does not release the armed target.
if (import.meta.hot) import.meta.hot.dispose(() => relay?.stop());

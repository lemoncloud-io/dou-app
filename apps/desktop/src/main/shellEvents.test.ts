import { pushedEventErrors, pushedEvents } from './appEventContract';
import { pushDeeplink, pushFcmMessage, pushFcmToken } from './shellEvents';

describe('main-process app → web events', () => {
    let host: { pushEvent: jest.Mock };

    beforeEach(() => {
        host = { pushEvent: jest.fn() };
    });

    // A protocol link, a tray or menu item, and a notification click all arrive this way.
    it("pushes a deeplink as 'OnReceiveNotification' carrying data.deeplink", () => {
        pushDeeplink(host, 'chatic://channels/ch1/room');

        expect(pushedEvents(host.pushEvent)).toEqual([
            {
                type: 'OnReceiveNotification',
                success: true,
                data: { notification: { data: { deeplink: 'chatic://channels/ch1/room' } } },
            },
        ]);
        expect(pushedEventErrors(pushedEvents(host.pushEvent))).toEqual([]);
    });

    // An FcmPush as fcm.ts parses it. Its `deeplink` stays behind: the web routes from `data`.
    it("pushes a cross-cloud push as 'OnReceiveNotification'", () => {
        const push = {
            title: 'title',
            body: 'body',
            deeplink: 'chatic://channels/ch1/room',
            data: { channelId: 'ch1', cid: 'c1' },
        };

        pushFcmMessage(host, push);

        expect(pushedEvents(host.pushEvent)).toEqual([
            {
                type: 'OnReceiveNotification',
                success: true,
                data: { notification: { title: 'title', body: 'body', data: { channelId: 'ch1', cid: 'c1' } } },
            },
        ]);
        expect(pushedEventErrors(pushedEvents(host.pushEvent))).toEqual([]);
    });

    // A data-only push has no title or body; the optional fields are left out on the wire.
    it("pushes a data-only push as 'OnReceiveNotification'", () => {
        pushFcmMessage(host, { data: { type: 'mark' } });

        expect(pushedEvents(host.pushEvent)).toEqual([
            {
                type: 'OnReceiveNotification',
                success: true,
                data: { notification: { title: undefined, body: undefined, data: { type: 'mark' } } },
            },
        ]);
        expect(pushedEventErrors(pushedEvents(host.pushEvent))).toEqual([]);
    });

    it("pushes a re-minted FCM token as the 'OnFetchFcmToken' reply type", () => {
        pushFcmToken(host, 'token');

        expect(pushedEvents(host.pushEvent)).toEqual([
            { type: 'OnFetchFcmToken', success: true, data: { token: 'token' } },
        ]);
        expect(pushedEventErrors(pushedEvents(host.pushEvent))).toEqual([]);
    });
});

import {
    ChaticAppsError,
    type ChaticApps,
    type CloudChannel,
    type CloudChat,
    type CloudProfile,
    type DataSubscription,
} from '@chatic/chatic-apps-sdk';

/**
 * The reference mini-app: one small page that uses each of the library's features once, the way the
 * package guide says to. It is the example a new page starts from, and what the checker, the scenario
 * runner and the app's host conversation test run against — so every action has a `data-action`
 * name they can reach.
 *
 * Screens live in an in-memory stack: Android back is taken while there is a screen to go back to, and
 * given back at the root so it closes the page. A screen that opens a stream stops it when it leaves.
 */

/** How many rows a screen keeps and draws: a list can be far longer than a screen shows. */
const SHOWN_ROWS = 30;
const COUNT_KEY = 'count';

type Screen = { name: 'home' } | { name: 'rooms' } | { name: 'room'; room: CloudChannel } | { name: 'members' };

interface Mounted {
    /** Called once as the screen leaves: stops what it opened. */
    leave(): void;
}

type Child = Node | string | null | undefined | false;

const h = (tag: string, attributes: Record<string, string> = {}, ...children: Child[]): HTMLElement => {
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    for (const child of children) if (child) element.append(child);
    return element;
};

const button = (action: string, label: string, onClick: () => unknown, extra: Record<string, string> = {}) => {
    const element = h('button', { type: 'button', 'data-action': action, ...extra }, label);
    element.addEventListener('click', () => void onClick());
    return element;
};

const codeOf = (error: unknown) => (error instanceof ChaticAppsError ? error.code : null);

/** Waits as long as the app asked before a `RATE_LIMITED` call is tried again, once. */
const retryOnce = async <T>(read: () => Promise<T>): Promise<T> => {
    try {
        return await read();
    } catch (error) {
        if (!(error instanceof ChaticAppsError) || error.code !== 'RATE_LIMITED') throw error;
        const wait = (error.details as { retryAfterMs?: number } | undefined)?.retryAfterMs ?? 1000;
        await new Promise(resolve => setTimeout(resolve, wait));
        return read();
    }
};

/** Starts the page on `root` once `connect()` has answered. */
export const startApp = (apps: ChaticApps, root: HTMLElement): void => {
    const stack: Screen[] = [{ name: 'home' }];
    let mounted: Mounted | null = null;
    let count = 0;
    let notice = '';
    let cloudName = 'Example';
    let dataState: 'off' | 'waiting' | 'refused' | 'on' | 'moved' = 'off';
    let placeName = '';
    let draft = '';

    const applyTheme = (theme: string) => {
        document.documentElement.dataset.theme = theme;
    };
    applyTheme(apps.context?.theme ?? 'light');
    apps.onContextChange(context => applyTheme(context.theme));

    // A notice changes only its own line: drawing the screen again would restart what it opened.
    const say = (text: string) => {
        notice = text;
        const line = root.querySelector('[data-field="notice"]');
        if (line) line.textContent = text;
    };

    /** A failure: a known code is told to the user; anything else is the page's own bug, and reported. */
    const failed = (error: unknown) => {
        const code = codeOf(error);
        if (code) return say(`Not done: ${code}`);
        void apps.reportError(error);
        say('Something went wrong.');
    };

    const run = (action: () => Promise<unknown>) => () => action().then(() => undefined, failed);

    /** Draws the home screen again for new data; another screen keeps what it shows. */
    const refreshHome = () => {
        if (stack[stack.length - 1].name === 'home') render();
    };

    // -- Screens ---------------------------------------------------------------------------------------

    // Android back goes to the page only while a screen is stacked; at the root the app closes the page.
    const syncBack = () => apps.onBack(stack.length > 1 ? back : null);

    // The close guard protects one thing the user would lose: an unsent draft.
    const syncCloseGuard = () =>
        apps.onCloseRequest(
            draft.trim()
                ? () => {
                      say('You have an unsent draft. Close again to discard it.');
                      return false;
                  }
                : null
        );

    function open(screen: Screen) {
        stack.push(screen);
        syncBack();
        render();
    }

    function back() {
        if (stack.length > 1) stack.pop();
        if (stack[stack.length - 1].name !== 'room') draft = '';
        syncBack();
        syncCloseGuard();
        render();
    }

    // -- Storage ---------------------------------------------------------------------------------------

    const save = () => apps.storage.set(COUNT_KEY, count).catch(() => undefined);
    const onVisibility = () => {
        if (document.visibilityState === 'hidden') void save();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // -- The cloud's data ------------------------------------------------------------------------------

    const startData = async () => {
        if (!apps.supports('data')) return;
        dataState = 'waiting';
        refreshHome();
        try {
            await apps.data.connect();
        } catch (error) {
            if (codeOf(error) === 'CONSENT_REFUSED') {
                dataState = 'refused';
                return refreshHome();
            }
            throw error;
        }
        dataState = 'on';
        apps.data.onCloudChanged(() => {
            // Nothing answers after this: say so, and let the user close.
            dataState = 'moved';
            draft = '';
            syncCloseGuard();
            mounted?.leave();
            mounted = null;
            stack.splice(1);
            syncBack();
            render();
        });
        apps.data.onSessionChange(() => void readPlace().catch(failed));
        const cloudId = apps.data.session()?.context.cloud.cloudId;
        if (cloudId && apps.data.can('cloud.getCloud')) {
            const cloud = await retryOnce(() => apps.data.call('cloud.getCloud', { id: cloudId }, { cache: false }));
            cloudName = cloud.name ?? cloudName;
            await apps.setTitle(cloudName).catch(() => undefined);
        }
        await readPlace();
        refreshHome();
    };

    const readPlace = async () => {
        const placeId = apps.data.session()?.committedSiteId;
        if (!placeId || !apps.data.can('place.cacheReadList')) return;
        const places = await retryOnce(() => apps.data.call('place.cacheReadList'));
        placeName = places?.list.find(place => place.id === placeId)?.name ?? '';
        refreshHome();
    };

    // -- Rendering -------------------------------------------------------------------------------------

    const header = (title: string) =>
        h(
            'header',
            {},
            stack.length > 1 ? button('back', '‹ Back', back) : null,
            h('h1', {}, title),
            // The top-right corner stays clear: the app's close button floats there.
            h('span', { class: 'corner' })
        );

    const homeScreen = (body: HTMLElement): Mounted => {
        body.append(
            h('p', { 'data-field': 'place' }, placeName ? `Place: ${placeName}` : ''),
            h(
                'section',
                {},
                h('h2', {}, 'Counter'),
                h('p', { 'data-field': 'count' }, String(count)),
                button('count', '+1', async () => {
                    count += 1;
                    apps.haptic('selection');
                    render();
                    await save();
                }),
                button(
                    'reset',
                    'Reset',
                    run(async () => {
                        count = 0;
                        await apps.storage.remove(COUNT_KEY);
                        const usage = await apps.storage.usage();
                        say(`Storage holds ${usage.used} of ${usage.limit} characters.`);
                    })
                )
            ),
            h(
                'section',
                {},
                h('h2', {}, 'Device'),
                apps.supports('clipboard') || !apps.inApp
                    ? button(
                          'copy',
                          'Copy link',
                          run(async () => {
                              await apps.copy(apps.link({ from: 'example' }));
                              say('Link copied.');
                          })
                      )
                    : null,
                apps.supports('share') || !apps.inApp
                    ? button(
                          'share',
                          'Share',
                          run(async () => {
                              const outcome = await apps.share({ message: 'Try this', url: apps.link({ count }) });
                              say(`Share: ${outcome}`);
                          })
                      )
                    : null,
                apps.supports('openUrl') || !apps.inApp
                    ? button(
                          'open-url',
                          'Open website',
                          run(() => apps.openUrl('https://example.com/'))
                      )
                    : null,
                apps.supports('userKey')
                    ? button(
                          'user-key',
                          'User key',
                          run(async () => say(`Key: ${(await apps.getUserKey()).slice(0, 8)}…`))
                      )
                    : null,
                button(
                    'camera',
                    'Camera',
                    run(async () => {
                        const before = await apps.permissions.query('camera');
                        const state = before === 'granted' ? before : await apps.permissions.request('camera');
                        if (state === 'blocked') {
                            say('The camera is off for this app.');
                            if (apps.inApp) await apps.openSettings();
                            return;
                        }
                        say(`Camera: ${state}`);
                    })
                )
            ),
            h(
                'section',
                {},
                h('h2', {}, 'Cloud'),
                dataState === 'off' ? h('p', {}, 'Reading the cloud needs the DoU app.') : null,
                dataState === 'waiting' ? h('p', {}, 'Waiting for your answer…') : null,
                dataState === 'refused'
                    ? h('p', { 'data-field': 'refused' }, 'This page shows your rooms and members; it needs your OK.')
                    : null,
                dataState === 'moved'
                    ? h('p', { 'data-field': 'moved' }, 'You moved to another cloud. Close this page to continue.')
                    : null,
                dataState === 'on' ? button('rooms', 'Rooms', () => open({ name: 'rooms' })) : null,
                dataState === 'on' ? button('members', 'Members', () => open({ name: 'members' })) : null
            ),
            button(
                'done',
                'Done',
                run(() => apps.finish({ count }))
            )
        );
        return { leave: () => undefined };
    };

    const roomsScreen = (body: HTMLElement): Mounted => {
        const list = h('ul', { 'data-field': 'rooms' });
        const total = h('p', { 'data-field': 'room-total' });
        body.append(total, list);
        let stream: DataSubscription | null = null;
        let left = false;
        const placeId = apps.data.session()?.committedSiteId ?? undefined;
        void apps.data
            .subscribe('channel.observeList', [{ sid: placeId }], result => {
                // Keeps only the rows it draws.
                const rows = (result?.list ?? []).slice(0, SHOWN_ROWS);
                total.textContent = `${result?.meta.total ?? rows.length} rooms`;
                list.replaceChildren(
                    ...rows.map(room =>
                        h(
                            'li',
                            {},
                            button('room', room.name ?? '(no name)', () => open({ name: 'room', room }))
                        )
                    )
                );
            })
            .then(subscription => {
                stream = subscription;
                if (left) void subscription.stop();
            }, failed);
        return {
            leave: () => {
                left = true;
                void stream?.stop();
            },
        };
    };

    const roomScreen = (body: HTMLElement, room: CloudChannel): Mounted => {
        const list = h('ul', { 'data-field': 'messages' });
        const input = h('input', { 'data-field': 'draft', placeholder: 'Message' }) as HTMLInputElement;
        input.value = draft;
        input.addEventListener('input', () => {
            draft = input.value;
            syncCloseGuard();
        });
        const show = (rows: CloudChat[]) =>
            list.replaceChildren(...rows.slice(-SHOWN_ROWS).map(chat => h('li', {}, chat.content ?? '')));
        void run(async () => {
            const page = await retryOnce(() =>
                apps.data.call('chat.cacheReadList', { channelId: room.id, limit: SHOWN_ROWS })
            );
            show(page?.list ?? []);
        })();
        body.append(list);
        if (apps.data.can('chat.sendChat')) {
            const send = run(async () => {
                if (!draft.trim()) return;
                // Sent in the user's name: only on their tap, with the text they typed.
                await apps.data.sendMessage(room.id, draft);
                apps.haptic('success');
                draft = '';
                input.value = '';
                syncCloseGuard();
                say('Sent.');
            });
            body.append(h('form', {}, input, button('send', 'Send', send)));
        }
        return { leave: () => undefined };
    };

    const membersScreen = (body: HTMLElement): Mounted => {
        const me = h('p', { 'data-field': 'me' });
        const picked = h('p', { 'data-field': 'member' });
        const list = h('ul', { 'data-field': 'members' });
        body.append(me, picked, list);
        const streams: Array<Promise<DataSubscription | null>> = [];
        let left = false;
        // A stream that opens after the screen left is stopped as it arrives.
        const keep = (subscription: Promise<DataSubscription>) => {
            const kept = subscription
                .catch(() => null)
                .then(open => {
                    if (left) void open?.stop();
                    return open;
                });
            streams.push(kept);
            return kept;
        };
        const nameOf = (profile: CloudProfile | null) => profile?.nick ?? '(no name here)';

        keep(apps.data.observeMyProfile(profile => (me.textContent = `You: ${nameOf(profile)}`)));
        let following: Promise<DataSubscription | null> | null = null;
        const pick = (userId: string) =>
            run(async () => {
                picked.textContent = nameOf(await apps.data.placeProfile(userId));
                if (left) return;
                // One member at a time: the last one picked is followed, the one before is stopped.
                void following?.then(subscription => subscription?.stop());
                following = keep(
                    apps.data.observePlaceProfile(userId, profile => (picked.textContent = nameOf(profile)))
                );
            });
        void run(async () => {
            const [mine, all] = await Promise.all([apps.data.myProfile(), apps.data.placeProfiles()]);
            me.textContent = `You: ${nameOf(mine)}`;
            list.replaceChildren(
                ...(all?.list ?? [])
                    .slice(0, SHOWN_ROWS)
                    .map(profile => h('li', {}, button('member', nameOf(profile), pick(profile.userId))))
            );
        })();
        return {
            leave: () => {
                left = true;
                streams.forEach(subscription => void subscription.then(open => open?.stop()));
            },
        };
    };

    function render() {
        mounted?.leave();
        const screen = stack[stack.length - 1];
        const body = h('div', { class: 'body' });
        const title = { home: cloudName, rooms: 'Rooms', room: 'Room', members: 'Members' }[screen.name];
        root.replaceChildren(header(title), body, h('p', { class: 'notice', 'data-field': 'notice' }, notice));
        root.dataset.screen = screen.name;
        mounted =
            screen.name === 'home'
                ? homeScreen(body)
                : screen.name === 'rooms'
                  ? roomsScreen(body)
                  : screen.name === 'room'
                    ? roomScreen(body, screen.room)
                    : membersScreen(body);
    }

    syncBack();
    render();
    void run(async () => {
        const stored = await apps.storage.get<number>(COUNT_KEY);
        if (typeof stored === 'number') count = stored;
        refreshHome();
    })();
    void run(startData)();
    root.dataset.state = 'ready';
};

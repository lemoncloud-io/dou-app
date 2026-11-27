(() => {
    const invoke = (command, args) => window.__TAURI_INTERNALS__.invoke(command, args);
    const $ = id => document.getElementById(id);

    const el = (tag, props = {}, ...children) => {
        const node = document.createElement(tag);
        for (const [key, value] of Object.entries(props)) {
            if (key === 'class') node.className = value;
            else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
            else if (value === true) node.setAttribute(key, '');
            else if (value !== false && value != null) node.setAttribute(key, String(value));
        }
        for (const child of children.flat()) node.append(child);
        return node;
    };

    let noticeTimer = 0;
    const notice = (message, isError = false) => {
        const box = $('notice');
        box.textContent = message;
        box.className = 'show' + (isError ? ' error' : '');
        clearTimeout(noticeTimer);
        noticeTimer = setTimeout(() => (box.className = ''), 6000);
    };
    const fail = error => notice(String(error), true);

    const badge = (text, kind) => el('span', { class: 'badge ' + (kind || '') }, text);
    const button = (label, onclick, primary = false, disabled = false) =>
        el('button', { class: 'action' + (primary ? ' primary' : ''), type: 'button', onclick, disabled }, label);

    const tabs = ['account', 'permissions', 'connectors'];
    let current = 'account';
    const show = name => {
        current = name;
        for (const tab of tabs) {
            $('tab-' + tab).setAttribute('aria-selected', String(tab === name));
            $('panel-' + tab).hidden = tab !== name;
        }
        render();
    };
    for (const tab of tabs) $('tab-' + tab).addEventListener('click', () => show(tab));

    let cloudsCache = null;
    let pickedCloud = null;

    const engineText = engine => {
        switch (engine.kind) {
            case 'running':
                return 'Running as ' + engine.me + ' in cloud ' + engine.cloud;
            case 'starting':
                return 'Starting in cloud ' + engine.cloud + '…';
            case 'failed':
                return 'Stopped: ' + engine.message;
            default:
                return 'Not running';
        }
    };

    const renderAccount = async () => {
        const panel = $('panel-account');
        const state = await invoke('agent_state');
        const nodes = [];

        nodes.push(el('h2', {}, 'Engine sign-in'));
        const card = el('div', { class: 'card' });
        card.append(
            el(
                'p',
                {},
                'The engine is the Rust client that serves Claude. It signs in as its own device, approved from the account you are signed in with in the DoU window.'
            )
        );
        card.append(
            el('div', { class: 'row' }, state.signedIn ? badge('signed in', 'ok') : badge('signed out', 'bad'))
        );

        const pairing = state.pairing;
        if (pairing.kind === 'waiting') {
            card.append(
                el('p', {}, 'Approve this code in the DoU window (My page → Pairing → Approve):'),
                el('div', { class: 'code' }, pairing.code),
                el(
                    'div',
                    { class: 'row' },
                    button('Open the approve page', () => invoke('agent_open_approve_page').catch(fail), true)
                )
            );
        } else if (pairing.kind === 'starting' || pairing.kind === 'applying') {
            card.append(
                el(
                    'p',
                    { class: 'muted' },
                    pairing.kind === 'starting' ? 'Requesting a code…' : 'Approved, signing in…'
                )
            );
        } else {
            if (pairing.kind === 'failed') {
                card.append(el('p', {}, badge('pairing failed', 'bad'), ' ' + pairing.message));
            }
            card.append(
                el(
                    'div',
                    { class: 'row' },
                    button(
                        state.signedIn ? 'Sign the engine in again' : 'Sign the engine in',
                        () => invoke('agent_pair_start').catch(fail).then(render),
                        !state.signedIn
                    )
                )
            );
        }
        nodes.push(card);

        if (state.signedIn) {
            nodes.push(el('h2', {}, 'Cloud'));
            const cloudCard = el('div', { class: 'card' });
            const select = el('select', { 'aria-label': 'Cloud' });
            if (cloudsCache) {
                for (const cloud of cloudsCache) {
                    const option = el('option', { value: cloud.id }, cloud.name || cloud.id);
                    if (cloud.id === (pickedCloud ?? state.cloud)) option.selected = true;
                    select.append(option);
                }
            } else {
                select.append(el('option', { value: '' }, 'Loading…'));
                invoke('agent_clouds')
                    .then(list => {
                        cloudsCache = list;
                        render();
                    })
                    .catch(fail);
            }
            select.addEventListener('change', () => {
                pickedCloud = select.value;
                render();
            });
            const running = state.engine.cloud;
            const switching = Boolean(running) && Boolean(select.value) && select.value !== running;
            cloudCard.append(
                el(
                    'div',
                    { class: 'row' },
                    select,
                    button(
                        switching ? 'Switch cloud and restart' : 'Use this cloud',
                        () => {
                            if (!select.value) return;
                            invoke('agent_choose_cloud', { cloud: select.value })
                                .then(restarting => {
                                    pickedCloud = null;
                                    notice(restarting ? 'Restarting the app to switch cloud…' : 'Cloud chosen.');
                                })
                                .catch(fail)
                                .then(render);
                        },
                        true
                    )
                ),
                el('p', {}, engineText(state.engine))
            );
            nodes.push(cloudCard);
        }
        panel.replaceChildren(...nodes);
    };

    let editing = null;
    const renderPermissions = async () => {
        const panel = $('panel-permissions');
        if (editing) return;
        const [settings, state] = await Promise.all([invoke('agent_settings_get'), invoke('agent_state')]);
        let rooms = [];
        if (state.engine.kind === 'running') rooms = await invoke('agent_rooms').catch(() => []);
        editing = { settings };

        const tierNames = {
            off: 'Off — nothing is exposed',
            read: 'Read — rooms and messages',
            write: 'Write — read, plus send in allowed rooms',
            full: 'Full — everything the engine can do',
        };
        const tierBox = el('div', { class: 'card' });
        for (const tier of ['off', 'read', 'write', 'full']) {
            tierBox.append(
                el(
                    'label',
                    { class: 'row' },
                    el('input', { type: 'radio', name: 'tier', value: tier, checked: settings.tier === tier }),
                    tierNames[tier]
                )
            );
        }

        const known = new Set(rooms.map(room => room.id));
        const roomBox = el('div', { class: 'rooms' });
        const rows = [...rooms, ...settings.allowRooms.filter(id => !known.has(id)).map(id => ({ id, title: id }))];
        for (const room of rows) {
            roomBox.append(
                el(
                    'label',
                    {},
                    el('input', {
                        type: 'checkbox',
                        name: 'room',
                        value: room.id,
                        checked: settings.allowRooms.includes(room.id),
                    }),
                    ' ' + (room.title || room.id)
                )
            );
        }
        if (rows.length === 0) {
            roomBox.append(
                el(
                    'p',
                    { class: 'muted' },
                    state.engine.kind === 'running' ? 'No rooms.' : 'Start the engine to list rooms.'
                )
            );
        }

        const perMinute = el('input', {
            type: 'number',
            min: 1,
            max: 600,
            value: settings.rateLimit.perMinute,
            'aria-label': 'Per minute',
        });
        const perHour = el('input', {
            type: 'number',
            min: 1,
            max: 10000,
            value: settings.rateLimit.perHour,
            'aria-label': 'Per hour',
        });

        const save = () => {
            const tier = panel.querySelector('input[name="tier"]:checked')?.value ?? 'off';
            const allowRooms = [...panel.querySelectorAll('input[name="room"]:checked')].map(input => input.value);
            invoke('agent_settings_set', {
                settings: {
                    tier,
                    allowRooms,
                    rateLimit: { perMinute: Number(perMinute.value), perHour: Number(perHour.value) },
                },
            })
                .then(() => {
                    notice('Permissions saved.');
                    editing = null;
                    render();
                })
                .catch(fail);
        };

        panel.replaceChildren(
            el('h2', {}, 'What Claude may do'),
            el('p', { class: 'muted' }, 'Changed only here. Claude cannot change these, and the default is Off.'),
            tierBox,
            el('h2', {}, 'Rooms Claude may write to'),
            roomBox,
            el('h2', {}, 'Rate limit for writes'),
            el('div', { class: 'row' }, perMinute, ' per minute ', perHour, ' per hour'),
            el(
                'div',
                { class: 'row' },
                button('Save', save, true),
                button('Revert', () => {
                    editing = null;
                    render();
                })
            )
        );
    };

    const statusBadge = status => {
        switch (status.kind) {
            case 'registered':
                return badge('registered', 'ok');
            case 'not-registered':
                return badge('not registered');
            case 'not-installed':
                return badge('not installed');
            case 'different':
                return badge('registered to another launcher', 'bad');
            default:
                return badge('unreadable: ' + (status.reason || ''), 'bad');
        }
    };

    const renderConnectors = async () => {
        const panel = $('panel-connectors');
        const info = await invoke('agent_connectors');
        const act = (command, target, done) => () =>
            invoke(command, { target })
                .then(message => {
                    notice(message || done);
                    render();
                })
                .catch(fail);

        const desktop = el(
            'div',
            { class: 'card' },
            el('div', { class: 'row' }, el('strong', {}, 'Claude Desktop'), statusBadge(info.desktop.status)),
            el(
                'p',
                { class: 'muted' },
                'Adds the launcher to claude_desktop_config.json, keeping everything else. Restart Claude Desktop afterwards.'
            ),
            el(
                'div',
                { class: 'row' },
                button(
                    'Register',
                    act('agent_connect', 'desktop'),
                    true,
                    !info.launcher.exists || info.desktop.status.kind === 'not-installed'
                ),
                button(
                    'Remove',
                    act('agent_disconnect', 'desktop'),
                    false,
                    info.desktop.status.kind !== 'registered' && info.desktop.status.kind !== 'different'
                )
            ),
            el('p', { class: 'muted' }, el('code', {}, info.desktop.path))
        );

        const code = el(
            'div',
            { class: 'card' },
            el('div', { class: 'row' }, el('strong', {}, 'Claude Code'), statusBadge(info.code.status)),
            el(
                'p',
                { class: 'muted' },
                info.code.claude
                    ? 'Runs claude mcp add for you (user scope).'
                    : 'The claude command was not found. Copy the command and run it in a terminal.'
            ),
            el(
                'div',
                { class: 'row' },
                button('Register', act('agent_connect', 'code'), true, !info.launcher.exists || !info.code.claude),
                button(
                    'Remove',
                    act('agent_disconnect', 'code'),
                    false,
                    !info.code.claude || info.code.status.kind === 'not-registered'
                ),
                button('Copy command', () =>
                    navigator.clipboard
                        .writeText(info.code.command)
                        .then(() => notice('Copied.'))
                        .catch(fail)
                )
            ),
            el('p', { class: 'muted' }, el('code', {}, info.code.command))
        );

        panel.replaceChildren(
            el('h2', {}, 'Connect an AI client'),
            el(
                'p',
                { class: 'muted' },
                info.launcher.exists
                    ? 'Launcher: ' + info.launcher.command
                    : 'The launcher is missing: ' + info.launcher.command
            ),
            desktop,
            code
        );
    };

    const render = () => {
        const run =
            current === 'account' ? renderAccount : current === 'permissions' ? renderPermissions : renderConnectors;
        return run().catch(fail);
    };

    show('account');
    setInterval(() => {
        if (current === 'account') render();
    }, 1500);
})();

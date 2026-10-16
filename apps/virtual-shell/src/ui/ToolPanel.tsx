import { useState, type ReactNode } from 'react';

import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n/en';
import { DEVICE_PRESETS } from '../shell/devices';
import { newMessageId, pushData, PUSH_KINDS, type PushKind, type PushRoom } from '../shell/pushPresets';
import { roomLink, screenLinks } from '../shell/quickLinks';
import type { KnownRoom, ToolResult, VirtualShell } from '../shell/VirtualShell';
import { BellIcon, CodeIcon, DatabaseIcon, KeyboardIcon, LinkIcon, PhoneIcon, PowerIcon } from './icons';

const RECENT_LINKS = 10;

type Run = (promise: Promise<ToolResult<object>>) => Promise<void>;

/** A card's last result, kept beside it so each tool says what it did where it was used. */
const useResult = () => {
    const [result, setResult] = useState<ToolResult<object> | null>(null);
    const run: Run = async promise => setResult(await promise);
    return { result, run };
};

const Card = ({
    icon,
    title,
    desc,
    children,
    result,
}: {
    icon: ReactNode;
    title: string;
    desc: string;
    children: ReactNode;
    result: ToolResult<object> | null;
}) => (
    <section className="vs-card">
        <header className="vs-card-head">
            <span className="vs-card-icon">{icon}</span>
            <div>
                <h3>{title}</h3>
                <p>{desc}</p>
            </div>
        </header>
        <div className="vs-card-body">{children}</div>
        {result && <ResultLine result={result} />}
    </section>
);

const ResultLine = ({ result }: { result: ToolResult<object> }) => {
    const { t } = useI18n();
    if (!result.ok) {
        return (
            <p className="vs-result vs-result-error" role="status">
                <strong>{t('result.failed')}</strong> {result.error} — {result.message}
            </p>
        );
    }
    return (
        <p className="vs-result vs-result-ok" role="status">
            <strong>{t('result.ok')}</strong> {t('result.sent')}:{' '}
            <code>{result.sent.join(', ') || t('result.nothing')}</code>
            {result.queued && <span className="vs-result-note"> · {t('result.queued')}</span>}
        </p>
    );
};

/** A room's name as people know it: the self chat and an unnamed one-to-one room by what they are. */
const roomName = (room: KnownRoom, t: ReturnType<typeof useI18n>['t']) => {
    if (room.kind === 'self') return t('push.room.selfChat');
    if (room.name) return room.name;
    return room.kind === 'direct' ? t('push.room.direct') : room.channelId;
};

/** Where it lives: the relay, or which cloud — several clouds each have a self chat. */
const roomWhere = (room: KnownRoom, t: ReturnType<typeof useI18n>['t']) =>
    room.relay ? t('push.room.relay') : t('push.room.cloudOf', { cid: room.cid });

/**
 * The rooms the app has cached, most recently active first, in a list that scrolls — an account can
 * have dozens — with a search for the rest. Clicking a room hands it to `onPick`.
 */
const RoomList = ({
    rooms,
    selected,
    onPick,
    actionLabel,
}: {
    rooms: readonly KnownRoom[];
    selected?: KnownRoom | null;
    onPick: (room: KnownRoom) => void;
    /** Shown on each row when picking a room does something at once (the deep link card opens it). */
    actionLabel?: string;
}) => {
    const { t } = useI18n();
    const [query, setQuery] = useState('');
    if (!rooms.length) return <p className="vs-hint">{t('push.room.none')}</p>;
    const needle = query.trim().toLowerCase();
    const shown = needle
        ? rooms.filter(room => `${roomName(room, t)} ${room.channelId} ${room.cid}`.toLowerCase().includes(needle))
        : rooms;
    return (
        <div className="vs-room-picker">
            <input
                aria-label={t('push.room.search')}
                placeholder={t('push.room.search', { count: String(rooms.length) })}
                value={query}
                onChange={event => setQuery(event.target.value)}
            />
            <ul className="vs-room-list" role="listbox" aria-label={t('push.room')}>
                {shown.map(room => {
                    const on = !!selected && sameRoom(selected, room);
                    return (
                        <li key={`${room.cid}|${room.channelId}`}>
                            <button
                                type="button"
                                role="option"
                                aria-selected={on}
                                className={`vs-room ${on ? 'vs-room-on' : ''}`}
                                data-tip={t('push.room.tip', {
                                    id: room.channelId,
                                    cid: room.cid,
                                    sid: room.sid || '—',
                                })}
                                onClick={() => onPick(room)}
                            >
                                <span className="vs-room-avatar" aria-hidden="true">
                                    {roomName(room, t).slice(0, 1)}
                                </span>
                                <span className="vs-room-text">
                                    <strong>{roomName(room, t)}</strong>
                                    <span>{roomWhere(room, t)}</span>
                                </span>
                                {actionLabel && <span className="vs-room-action">{actionLabel}</span>}
                            </button>
                        </li>
                    );
                })}
                {!shown.length && <li className="vs-hint">{t('push.room.noMatch')}</li>}
            </ul>
        </div>
    );
};

const sameRoom = (a: KnownRoom, b: KnownRoom) => a.cid === b.cid && a.channelId === b.channelId;

/** Who a built message comes from: someone else, or the signed-in user (an echo, which shows no banner). */
type Sender = 'other' | 'me';
const OTHER_SENDER = 'virtual-shell-sender';

/**
 * Push, in the three situations people check: a push while the app is open, a tap on one while the app
 * is in the background, and a tap that launches the app. Pick the room, shape the message, press one
 * button. The message is built in the server's shape, with the payload it produces shown as it changes.
 */
export const PushCard = ({ shell }: { shell: VirtualShell }) => {
    const { t } = useI18n();
    const { result, run } = useResult();
    const rooms = shell.knownRooms();
    const [picked, setPicked] = useState<KnownRoom | null>(null);
    const [kind, setKind] = useState<PushKind>('room');
    const [manual, setManual] = useState<PushRoom | null>(null);
    const [json, setJson] = useState('{\n  "type": "chat",\n  "link": "/"\n}');
    const [title, setTitle] = useState<string | null>(null);
    const [body, setBody] = useState<string | null>(null);
    const [sender, setSender] = useState<Sender>('other');
    const [thumbnail, setThumbnail] = useState('');
    const [extra, setExtra] = useState<Array<{ key: string; value: string }>>([]);
    const [asDelivered, setAsDelivered] = useState(true);
    const [messageId, setMessageId] = useState(() => newMessageId());

    // The most recently active room is chosen until someone picks another.
    const selected = (picked && rooms.find(room => sameRoom(room, picked))) ?? rooms[0] ?? null;
    const room: PushRoom = manual ?? selected ?? { channelId: '', cid: '#', sid: '' };
    const channelName = kind === 'room' && selected && !manual ? roomName(selected, t) : '';
    const shownTitle = title ?? (channelName || t('push.defaultTitle'));
    const shownBody = body ?? t('push.defaultBody');
    const message = {
        channelName,
        ownerId: sender === 'me' ? (shell.signedInUserId() ?? '') : OTHER_SENDER,
        thumbnail,
        messageId,
        extra,
        asDelivered,
    };

    let data: Record<string, unknown> | null = null;
    try {
        data = pushData(kind, { room, json, message });
    } catch {
        data = null;
    }
    const target = data ? shell.previewPushTap(data) : undefined;
    const notification = data ? { title: shownTitle, body: shownBody, data } : null;
    // Each push sent gets its own id, so two of them read apart in the log.
    const sent = <T,>(promise: Promise<T>) => {
        setMessageId(newMessageId());
        return promise;
    };

    // A tap on a notification happens while the app is away: send it there first, as the phone would be.
    const tapFromBackground = async () => {
        if (!data) return;
        await shell.appBackground('panel');
        await run(sent(shell.pushTap(data, { launch: 'warm' }, 'panel')));
    };

    return (
        <Card icon={<BellIcon />} title={t('push.title')} desc={t('push.desc')} result={result}>
            <label className="vs-field">
                <span>{t('push.kind')}</span>
                <select
                    value={kind}
                    onChange={event => setKind(event.target.value as PushKind)}
                    data-tip={t('push.kind.tip')}
                >
                    {PUSH_KINDS.map(option => (
                        <option key={option} value={option}>
                            {t(`push.kind.${option}` as MessageKey)}
                        </option>
                    ))}
                </select>
            </label>
            <p className="vs-kind-desc">{t(`push.kind.${kind}.desc` as MessageKey)}</p>

            {kind === 'room' && (
                <>
                    <Step n={1} title={t('push.step.room')}>
                        {manual ? (
                            <div className="vs-grid-3">
                                <TextField
                                    label={t('push.field.channelId')}
                                    value={manual.channelId}
                                    onChange={channelId => setManual({ ...manual, channelId })}
                                />
                                <TextField
                                    label={t('push.field.sid')}
                                    value={manual.sid}
                                    onChange={sid => setManual({ ...manual, sid })}
                                />
                                <TextField
                                    label={t('push.field.cid')}
                                    value={manual.cid}
                                    onChange={cid => setManual({ ...manual, cid })}
                                    placeholder="#"
                                />
                            </div>
                        ) : (
                            <RoomList
                                rooms={rooms}
                                selected={selected}
                                onPick={next => {
                                    setPicked(next);
                                    setTitle(null);
                                }}
                            />
                        )}
                        <label className="vs-check">
                            <input
                                type="checkbox"
                                checked={!!manual}
                                onChange={event =>
                                    setManual(
                                        event.target.checked
                                            ? { channelId: room.channelId, cid: room.cid, sid: room.sid }
                                            : null
                                    )
                                }
                            />
                            <span>{t('push.room.manual')}</span>
                        </label>
                    </Step>

                    <Step n={2} title={t('push.step.message')}>
                        <div className="vs-grid-2">
                            <TextField label={t('push.field.title')} value={shownTitle} onChange={setTitle} />
                            <TextField label={t('push.field.body')} value={shownBody} onChange={setBody} />
                        </div>
                        <div className="vs-inline">
                            <span className="vs-field-label">{t('push.field.sender')}</span>
                            <div className="vs-segment" role="group" aria-label={t('push.field.sender')}>
                                {(['other', 'me'] as const).map(option => (
                                    <button
                                        key={option}
                                        type="button"
                                        aria-pressed={sender === option}
                                        className={sender === option ? 'vs-segment-on' : ''}
                                        onClick={() => setSender(option)}
                                        data-tip={t(`push.sender.${option}.tip` as MessageKey)}
                                    >
                                        {t(`push.sender.${option}` as MessageKey)}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {sender === 'me' && <p className="vs-hint">{t('push.sender.me.hint')}</p>}
                        <TextField
                            label={t('push.field.thumbnail')}
                            value={thumbnail}
                            onChange={setThumbnail}
                            placeholder="https://…"
                        />
                        <div className="vs-extra">
                            {extra.map((row, index) => (
                                <div key={index} className="vs-extra-row">
                                    <input
                                        aria-label={t('push.field.extraKey')}
                                        placeholder={t('push.field.extraKey')}
                                        value={row.key}
                                        onChange={event =>
                                            setExtra(
                                                extra.map((item, at) =>
                                                    at === index ? { ...item, key: event.target.value } : item
                                                )
                                            )
                                        }
                                    />
                                    <input
                                        aria-label={t('push.field.extraValue')}
                                        placeholder={t('push.field.extraValue')}
                                        value={row.value}
                                        onChange={event =>
                                            setExtra(
                                                extra.map((item, at) =>
                                                    at === index ? { ...item, value: event.target.value } : item
                                                )
                                            )
                                        }
                                    />
                                    <button
                                        type="button"
                                        className="vs-btn vs-btn-quiet vs-btn-small"
                                        aria-label={t('push.field.remove')}
                                        onClick={() => setExtra(extra.filter((_, at) => at !== index))}
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                            <button
                                type="button"
                                className="vs-btn vs-btn-small vs-btn-quiet"
                                onClick={() => setExtra([...extra, { key: '', value: '' }])}
                            >
                                + {t('push.field.addExtra')}
                            </button>
                        </div>
                        <label className="vs-check">
                            <input
                                type="checkbox"
                                checked={asDelivered}
                                onChange={event => setAsDelivered(event.target.checked)}
                            />
                            <span>{t('push.asDelivered')}</span>
                        </label>
                    </Step>
                </>
            )}
            {kind === 'custom' && (
                <label className="vs-field">
                    <span>{t('push.field.json')}</span>
                    <textarea
                        rows={6}
                        value={json}
                        onChange={event => setJson(event.target.value)}
                        spellCheck={false}
                    />
                </label>
            )}
            {kind !== 'room' && (
                <div className="vs-grid-2">
                    <TextField label={t('push.field.title')} value={shownTitle} onChange={setTitle} />
                    <TextField label={t('push.field.body')} value={shownBody} onChange={setBody} />
                </div>
            )}

            <Step n={kind === 'room' ? 3 : 1} title={t('push.step.send')}>
                <p className="vs-caption">{t('push.preview.caption')}</p>
                <div className="vs-banner" aria-label={t('push.preview')}>
                    <span className="vs-banner-icon" aria-hidden="true">
                        {thumbnail ? <img src={thumbnail} alt="" /> : 'D'}
                    </span>
                    <div className="vs-banner-text">
                        <div className="vs-banner-top">
                            <span>DoU</span>
                            <span>{t('push.preview.now')}</span>
                        </div>
                        <strong>{shownTitle}</strong>
                        <span>{shownBody}</span>
                    </div>
                </div>
                <p className="vs-target" data-tip={t('push.expected.tip')}>
                    {t('push.expected')}:{' '}
                    <code>
                        {data === null
                            ? t(kind === 'custom' ? 'push.expected.invalid' : 'push.expected.noRoom')
                            : target === null
                              ? t('push.expected.none')
                              : target}
                    </code>
                </p>
                <p className="vs-caption">{t('push.actions.caption')}</p>
                <div className="vs-big-actions">
                    <BigAction
                        disabled={!notification}
                        title={t('push.action.receive')}
                        desc={t('push.action.receive.desc')}
                        onClick={() => notification && void run(sent(shell.pushReceive(notification, 'panel')))}
                    />
                    <BigAction
                        primary
                        disabled={!data}
                        title={t('push.action.tap')}
                        desc={t('push.action.tap.desc')}
                        onClick={() => void tapFromBackground()}
                    />
                    <BigAction
                        disabled={!data}
                        title={t('push.action.cold')}
                        desc={t('push.action.cold.desc')}
                        onClick={() => data && void run(sent(shell.pushTap(data, { launch: 'cold' }, 'panel')))}
                    />
                </div>
                {data && (
                    <details className="vs-more">
                        <summary>{t('push.payload')}</summary>
                        <pre className="vs-payload">{JSON.stringify(data, null, 2)}</pre>
                        <button
                            type="button"
                            className="vs-btn vs-btn-small"
                            onClick={() => {
                                setJson(JSON.stringify(data, null, 2));
                                setKind('custom');
                            }}
                        >
                            {t('push.payload.edit')}
                        </button>
                    </details>
                )}
            </Step>
        </Card>
    );
};

const Step = ({ n, title, children }: { n: number; title: string; children: ReactNode }) => (
    <section className="vs-step">
        <h4>
            <span className="vs-step-n">{n}</span>
            {title}
        </h4>
        <div className="vs-card-body">{children}</div>
    </section>
);

const BigAction = ({
    title,
    desc,
    onClick,
    disabled,
    primary,
}: {
    title: string;
    desc: string;
    onClick: () => void;
    disabled?: boolean;
    primary?: boolean;
}) => (
    <button
        type="button"
        className={`vs-big ${primary ? 'vs-big-primary' : ''}`}
        data-tip={desc}
        disabled={disabled}
        onClick={onClick}
    >
        <strong>{title}</strong>
        <span>{desc}</span>
    </button>
);

const TextField = ({
    label,
    value,
    onChange,
    placeholder,
}: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}) => (
    <label className="vs-field">
        <span>{label}</span>
        <input value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} />
    </label>
);

/** Deep links: the app's screens and every room in one click each, any other link typed in. */
export const LinkCard = ({ shell }: { shell: VirtualShell }) => {
    const { t } = useI18n();
    const { result, run } = useResult();
    const [url, setUrl] = useState('');
    const [recent, setRecent] = useState<string[]>([]);
    const [cold, setCold] = useState(false);
    const preview = url.trim() ? shell.previewDeeplink(url) : null;

    const open = (link: string) => {
        const trimmed = link.trim();
        if (!trimmed) return;
        setRecent([trimmed, ...recent.filter(item => item !== trimmed)].slice(0, RECENT_LINKS));
        void run(shell.deeplink(trimmed, { launch: cold ? 'cold' : 'warm' }, 'panel'));
    };

    return (
        <Card icon={<LinkIcon />} title={t('link.title')} desc={t('link.desc')} result={result}>
            <div className="vs-link-chips">
                {screenLinks().map(link => (
                    <button
                        key={link.id}
                        type="button"
                        className="vs-link-chip"
                        data-tip={link.url}
                        onClick={() => open(link.url)}
                    >
                        {t(`link.quick.${link.id}` as MessageKey)}
                    </button>
                ))}
            </div>
            <RoomList rooms={shell.knownRooms()} onPick={room => open(roomLink(room))} actionLabel={t('link.open')} />
            <label className="vs-check">
                <input type="checkbox" checked={cold} onChange={event => setCold(event.target.checked)} />
                <span>{t('push.cold')}</span>
            </label>
            <details className="vs-more">
                <summary>{t('link.custom')}</summary>
                <div className="vs-card-body">
                    <div className="vs-inline">
                        <input
                            aria-label={t('link.title')}
                            className="vs-grow"
                            placeholder={t('link.placeholder')}
                            list="vs-recent-links"
                            value={url}
                            onChange={event => setUrl(event.target.value)}
                            onKeyDown={event => event.key === 'Enter' && open(url)}
                        />
                        <datalist id="vs-recent-links">
                            {recent.map(link => (
                                <option key={link} value={link} />
                            ))}
                        </datalist>
                        <button
                            type="button"
                            className="vs-btn vs-btn-primary"
                            disabled={!url.trim()}
                            onClick={() => open(url)}
                        >
                            {t('link.open')}
                        </button>
                    </div>
                    {preview && (
                        <p className="vs-target">
                            {preview.kind === 'web' && (
                                <>
                                    {t('link.path')}: <code>{preview.path}</code>
                                </>
                            )}
                            {preview.kind === 'native' && t('link.native')}
                            {preview.kind === 'invalid' && (
                                <>
                                    {t('link.invalid')}: {preview.error}
                                </>
                            )}
                        </p>
                    )}
                </div>
            </details>
        </Card>
    );
};

export const AppCard = ({ shell }: { shell: VirtualShell }) => {
    const { t } = useI18n();
    const { result, run } = useResult();
    const status = shell.status();
    const android = status.platform === 'android';
    return (
        <Card icon={<PowerIcon />} title={t('state.title')} desc={t('state.desc')} result={result}>
            <div className="vs-actions">
                <button
                    type="button"
                    className="vs-btn"
                    data-tip={t('state.background.tip')}
                    onClick={() => void run(shell.appBackground('panel'))}
                >
                    {t('state.background')}
                </button>
                <button
                    type="button"
                    className="vs-btn"
                    data-tip={t('state.foreground.tip')}
                    onClick={() => void run(shell.appForeground('panel'))}
                >
                    {t('state.foreground')}
                </button>
                <button
                    type="button"
                    className="vs-btn"
                    disabled={!android}
                    data-tip={android ? t('state.back.tip') : t('state.backAndroidOnly')}
                    onClick={() => void run(shell.back('panel'))}
                >
                    {t('state.back')}
                </button>
            </div>
            <div className="vs-actions">
                <button
                    type="button"
                    className="vs-btn"
                    data-tip={t('state.restart.tip')}
                    onClick={() => void run(shell.restart({}, 'panel'))}
                >
                    {t('state.restart')}
                </button>
                <button
                    type="button"
                    className="vs-btn vs-btn-quiet"
                    data-tip={t('state.restartClear.tip')}
                    onClick={() => void run(shell.restart({ clearCache: true }, 'panel'))}
                >
                    {t('state.restartClear')}
                </button>
            </div>
            {!android && <p className="vs-hint">{t('state.backIosHint')}</p>}
        </Card>
    );
};

export const DeviceCard = ({ shell }: { shell: VirtualShell }) => {
    const { t } = useI18n();
    const { result, run } = useResult();
    const status = shell.status();
    return (
        <Card icon={<PhoneIcon />} title={t('device.title')} desc={t('device.desc')} result={result}>
            <div className="vs-device-grid" role="group" aria-label={t('device.title')}>
                {DEVICE_PRESETS.map(device => (
                    <button
                        key={device.id}
                        type="button"
                        aria-pressed={status.device === device.id}
                        className={`vs-device ${status.device === device.id ? 'vs-device-on' : ''}`}
                        data-tip={`${t('device.tip')} ${t(`device.source.${device.source}` as MessageKey)}`}
                        onClick={() => void run(shell.deviceSet({ preset: device.id }, 'panel'))}
                    >
                        <strong>{t(`device.${device.id}` as MessageKey)}</strong>
                        <span>
                            {device.width} × {device.height}
                        </span>
                    </button>
                ))}
            </div>
            <div className="vs-inline">
                <span className="vs-field-label">{t('device.theme')}</span>
                <div className="vs-segment" role="group" aria-label={t('device.theme')}>
                    {(['light', 'dark'] as const).map(theme => (
                        <button
                            key={theme}
                            type="button"
                            aria-pressed={status.theme === theme}
                            className={status.theme === theme ? 'vs-segment-on' : ''}
                            data-tip={t('device.theme.tip')}
                            onClick={() => void run(shell.deviceSet({ theme }, 'panel'))}
                        >
                            {t(`device.theme.${theme}` as MessageKey)}
                        </button>
                    ))}
                </div>
            </div>
        </Card>
    );
};

/** The keyboard, up or down — the web lays out above it, as it does when the app reports a keyboard. */
export const KeyboardCard = ({ shell }: { shell: VirtualShell }) => {
    const { t } = useI18n();
    const { result, run } = useResult();
    const status = shell.status();
    const [height, setHeight] = useState('');
    return (
        <Card icon={<KeyboardIcon />} title={t('keyboard.title')} desc={t('keyboard.desc')} result={result}>
            <div className="vs-actions">
                <button
                    type="button"
                    className="vs-btn vs-btn-primary"
                    data-tip={t('keyboard.show.tip')}
                    onClick={() => void run(shell.keyboardShow(height ? Number(height) : undefined, 'panel'))}
                >
                    {t('keyboard.show')}
                </button>
                <button
                    type="button"
                    className="vs-btn"
                    disabled={!status.keyboardHeight}
                    onClick={() => void run(shell.keyboardHide('panel'))}
                >
                    {t('keyboard.hide')}
                </button>
                <input
                    className="vs-number"
                    inputMode="numeric"
                    aria-label={t('keyboard.height')}
                    placeholder={t('keyboard.height.placeholder')}
                    value={height}
                    onChange={event => setHeight(event.target.value.replace(/[^0-9]/g, ''))}
                    data-tip={t('keyboard.height.tip')}
                />
            </div>
            <p className="vs-hint">
                {status.keyboardHeight
                    ? t('keyboard.up', { height: String(status.keyboardHeight) })
                    : t('keyboard.down')}
            </p>
        </Card>
    );
};

/** What the shell keeps for the app, to read: the cache, the settings bag, the preferences. */
export const StorageCard = ({ shell }: { shell: VirtualShell }) => {
    const { t } = useI18n();
    const { result, run } = useResult();
    const view = shell.storageView();
    const total = view.cache.reduce((sum, group) => sum + group.count, 0);
    return (
        <Card icon={<DatabaseIcon />} title={t('storage.title')} desc={t('storage.desc')} result={result}>
            <details className="vs-more">
                <summary>{t('storage.cache', { rows: String(total), groups: String(view.cache.length) })}</summary>
                <ul className="vs-storage-list">
                    {view.cache.map(group => (
                        <li key={`${group.domain}|${group.cloud ?? ''}`}>
                            <details>
                                <summary>
                                    <code>{group.domain}</code> · {group.cloud ?? '—'} · {group.count}
                                </summary>
                                <pre className="vs-payload">{JSON.stringify(group.rows, null, 2)}</pre>
                            </details>
                        </li>
                    ))}
                    {!view.cache.length && <li className="vs-hint">{t('storage.empty')}</li>}
                </ul>
            </details>
            <details className="vs-more">
                <summary>{t('storage.config', { count: String(Object.keys(view.configBag).length) })}</summary>
                <pre className="vs-payload">{JSON.stringify(view.configBag, null, 2)}</pre>
            </details>
            <details className="vs-more">
                <summary>{t('storage.preferences', { count: String(Object.keys(view.preferences).length) })}</summary>
                <pre className="vs-payload">{JSON.stringify(view.preferences, null, 2)}</pre>
            </details>
            <div className="vs-actions">
                <button
                    type="button"
                    className="vs-btn"
                    data-tip={t('storage.clear.tip')}
                    onClick={() => void run(shell.restart({ clearCache: true }, 'panel'))}
                >
                    {t('storage.clear')}
                </button>
            </div>
        </Card>
    );
};

/**
 * Any app → web event, as given — advanced, for exploring. Nothing checks the data against the
 * contract, so the card says so and a result here is not a pass. On prod it asks before sending.
 */
export const EventsCard = ({ shell }: { shell: VirtualShell }) => {
    const { t } = useI18n();
    const { result, run } = useResult();
    const types = shell.eventTypes();
    const [type, setType] = useState('OnUpdateDeviceInfo');
    const [json, setJson] = useState('{}');
    let data: unknown;
    let parsed = true;
    try {
        data = JSON.parse(json);
    } catch {
        parsed = false;
    }
    const send = () => {
        if (!parsed) return;
        if (shell.config.env === 'prod' && !window.confirm(t('events.prodConfirm'))) return;
        void run(shell.eventsPush(type, data, 'panel'));
    };
    return (
        <Card icon={<CodeIcon />} title={t('events.title')} desc={t('events.desc')} result={result}>
            <details className="vs-more">
                <summary>{t('events.open')}</summary>
                <div className="vs-card-body">
                    <p className="vs-kind-desc vs-warn-note">{t('events.unchecked')}</p>
                    <label className="vs-field">
                        <span>{t('events.type')}</span>
                        <select value={type} onChange={event => setType(event.target.value)}>
                            {types.map(item => (
                                <option key={item} value={item}>
                                    {item}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="vs-field">
                        <span>{t('events.data')}</span>
                        <textarea
                            rows={5}
                            value={json}
                            onChange={event => setJson(event.target.value)}
                            spellCheck={false}
                        />
                    </label>
                    {!parsed && <p className="vs-hint">{t('push.expected.invalid')}</p>}
                    <div className="vs-actions">
                        <button type="button" className="vs-btn vs-btn-primary" disabled={!parsed} onClick={send}>
                            {t('events.send')}
                        </button>
                    </div>
                </div>
            </details>
        </Card>
    );
};

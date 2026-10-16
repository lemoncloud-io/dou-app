import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';

import { useI18n } from '../i18n';
import type { MessageKey } from '../i18n/en';
import type { GoogleSignIn } from '../shell/googleSignIn';
import type { VirtualShell } from '../shell/VirtualShell';

const BEZEL = 12;
/** Room the caption under the phone takes. */
const CAPTION = 36;

/**
 * The phone: the web in a frame of the preset's exact CSS size, shrunk as a whole to fit the window.
 * What the OS would draw over the app — the status bar in the top safe area, the island or camera,
 * the home indicator — is drawn on top, without taking clicks, so the web lays out as on a device.
 */
export const Phone = ({ shell, signIn }: { shell: VirtualShell; signIn: GoogleSignIn }) => {
    const { t } = useI18n();
    const device = shell.currentDevice;
    const status = shell.status();
    const area = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);

    useLayoutEffect(() => {
        const element = area.current;
        if (!element) return;
        const fit = () => {
            const width = element.clientWidth - 48;
            const height = element.clientHeight - 48 - CAPTION;
            setScale(Math.min(1, width / (device.width + BEZEL * 2), height / (device.height + BEZEL * 2)));
        };
        fit();
        const observer = new ResizeObserver(fit);
        observer.observe(element);
        return () => observer.disconnect();
    }, [device.width, device.height]);

    const ios = device.platform === 'ios';
    const notch = device.insets.top > 40;

    return (
        <div className="vs-stage" ref={area}>
            <div
                className="vs-phone-box"
                style={{ width: (device.width + BEZEL * 2) * scale, height: (device.height + BEZEL * 2) * scale }}
            >
                <div
                    className={`vs-phone vs-phone-${device.platform} ${notch ? 'vs-phone-notch' : ''}`}
                    style={{
                        width: device.width + BEZEL * 2,
                        height: device.height + BEZEL * 2,
                        transform: `scale(${scale})`,
                    }}
                >
                    <div
                        className={`vs-screen vs-screen-${status.theme}`}
                        style={{ width: device.width, height: device.height }}
                    >
                        {/* A new frame per launch: a relaunch starts from an empty history, as the app does, and the
                        frame carries its launch so a frame of an earlier one cannot attach. */}
                        <iframe
                            key={shell.launchId}
                            data-launch={shell.launchId}
                            title="DoU"
                            src="/"
                            className="vs-frame"
                        />
                        <StatusBar height={device.insets.top} ios={ios} notch={notch} />
                        {status.keyboardHeight > 0 && <Keyboard height={status.keyboardHeight} ios={ios} />}
                        {ios && device.insets.bottom > 0 && <span className="vs-home-indicator" aria-hidden="true" />}
                        {shell.hasExited && (
                            <button type="button" className="vs-exited" onClick={() => void shell.restart({}, 'panel')}>
                                <span>{t('phone.exited')}</span>
                                <strong>{t('phone.exitedTap')}</strong>
                            </button>
                        )}
                        <SignInSheet signIn={signIn} />
                    </div>
                </div>
            </div>
            <div className="vs-toasts" aria-live="polite">
                {shell.toasts.map(toast => (
                    <div key={toast.id} className="vs-toast">
                        {toast.type === 'OAuthLogin' ? t('toast.apple') : t('toast.unsupported', { type: toast.type })}
                    </div>
                ))}
            </div>
            <AppIcon badge={status.badge} />
            <p className="vs-stage-caption">
                {t(`device.${device.id}` as MessageKey)} · {device.width} × {device.height}
            </p>
        </div>
    );
};

/** The app's icon beside the phone, with the badge the web last set — as a home screen would show it. */
const AppIcon = ({ badge }: { badge: number | null }) => {
    const { t } = useI18n();
    return (
        <div className="vs-app-icon" data-tip={t('badge.tip', { count: String(badge ?? 0) })}>
            <span className="vs-logo" aria-hidden="true">
                D
            </span>
            {!!badge && <span className="vs-app-badge">{badge > 99 ? '99+' : badge}</span>}
            <span className="vs-app-icon-label">DoU</span>
        </div>
    );
};

const KEY_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

/**
 * A keyboard drawn over the bottom of the screen at the height the web was told. It takes no clicks:
 * it shows where the keyboard would be, so the web's layout can be judged against it.
 */
const Keyboard = ({ height, ios }: { height: number; ios: boolean }) => (
    <div
        className={`vs-keyboard ${ios ? 'vs-keyboard-ios' : 'vs-keyboard-android'}`}
        style={{ height }}
        aria-hidden="true"
    >
        {KEY_ROWS.map(row => (
            <div key={row} className="vs-key-row">
                {row.split('').map(key => (
                    <span key={key} className="vs-key">
                        {key}
                    </span>
                ))}
            </div>
        ))}
        <div className="vs-key-row">
            <span className="vs-key vs-key-wide">123</span>
            <span className="vs-key vs-key-space">space</span>
            <span className="vs-key vs-key-wide">⏎</span>
        </div>
    </div>
);

/** The OS status bar, in the top safe area: the time, and the island or the punch-hole camera. */
const StatusBar = ({ height, ios, notch }: { height: number; ios: boolean; notch: boolean }) => {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 30_000);
        return () => clearInterval(timer);
    }, []);
    const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: false });
    return (
        <div
            className={`vs-statusbar ${ios ? 'vs-statusbar-ios' : 'vs-statusbar-android'}`}
            style={{ height }}
            aria-hidden="true"
        >
            <span className="vs-statusbar-time">{time}</span>
            {ios && notch && <span className="vs-island" />}
            {!ios && <span className="vs-camera" />}
            <span className="vs-statusbar-icons">
                <svg width="17" height="11" viewBox="0 0 17 11">
                    <rect x="0" y="7" width="3" height="4" rx="1" fill="currentColor" />
                    <rect x="4.5" y="5" width="3" height="6" rx="1" fill="currentColor" />
                    <rect x="9" y="2.5" width="3" height="8.5" rx="1" fill="currentColor" />
                    <rect x="13.5" y="0" width="3" height="11" rx="1" fill="currentColor" />
                </svg>
                <svg width="25" height="12" viewBox="0 0 25 12">
                    <rect
                        x="0.5"
                        y="0.5"
                        width="21"
                        height="11"
                        rx="3"
                        fill="none"
                        stroke="currentColor"
                        opacity="0.4"
                    />
                    <rect x="2" y="2" width="16" height="8" rx="1.5" fill="currentColor" />
                    <rect x="23" y="4" width="1.5" height="4" rx="0.75" fill="currentColor" opacity="0.4" />
                </svg>
            </span>
        </div>
    );
};

/** Where the app's native sign-in sheet would be: Google's own button, and a way out. */
const SignInSheet = ({ signIn }: { signIn: GoogleSignIn }) => {
    const { t } = useI18n();
    const [, tick] = useReducer((count: number) => count + 1, 0);
    const slot = useRef<HTMLDivElement>(null);
    useEffect(() => signIn.onChange(tick), [signIn]);
    const { open, problem } = signIn.state;

    useEffect(() => {
        if (open && slot.current) void signIn.renderButton(slot.current);
    }, [open, signIn]);

    if (!open) return null;
    return (
        <div className="vs-sheet-backdrop">
            <div className="vs-sheet" role="dialog" aria-label={t('sheet.title')}>
                <span className="vs-sheet-grabber" aria-hidden="true" />
                <strong>{t('sheet.title')}</strong>
                <p>{t('sheet.desc')}</p>
                {problem ? (
                    <p className="vs-sheet-problem">{t(`sheet.${problem}` as MessageKey)}</p>
                ) : (
                    <div ref={slot} className="vs-sheet-button" />
                )}
                <button type="button" className="vs-btn vs-btn-quiet" onClick={() => signIn.cancel()}>
                    {t('sheet.cancel')}
                </button>
            </div>
        </div>
    );
};

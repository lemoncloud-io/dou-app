import {
    Bell,
    BellRing,
    ChevronLeft,
    ChevronRight,
    Copy,
    FileText,
    HardDrive,
    Link2,
    LogOut,
    Mail,
    MessageSquare,
    Smartphone,
    Upload,
    XCircle,
} from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { isNative } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { useDeviceInfo } from '@chatic/device-utils';

import { appBridge } from '../../../bridge';
import { buildDeviceInfoRows } from '../lib';
import { useDebugMode } from '../hooks';
import { ROUTES } from '../../../routes/paths';

/** Copy a value using the native bridge inside the app shell, else the Clipboard API. */
const copyText = (value: string | null) => {
    if (!value) return;
    if (isNative()) {
        void appBridge.copyClipBoard(value);
        return;
    }
    void navigator.clipboard?.writeText(value);
};

export const DebugPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const { versionInfo, deviceInfo } = useDeviceInfo();
    const { isEnabled, disable } = useDebugMode();

    useEffect(() => {
        if (!isEnabled) {
            navigate(ROUTES.mypage.root, { replace: true });
        }
    }, [isEnabled, navigate]);

    const handleDisableDebug = () => {
        disable();
        navigate(ROUTES.mypage.root, { replace: true });
    };

    return (
        <div className="flex h-full flex-col bg-background pt-safe-top">
            <header className="flex items-center px-[6px]">
                <button onClick={() => navigate(-1)} className="rounded-full p-[9px]">
                    <ChevronLeft size={26} strokeWidth={2} />
                </button>
                <span className="ml-2 text-[14px] font-medium text-muted-foreground">Debug</span>
            </header>

            <div className="flex-1 overflow-y-auto overscroll-none px-4 pb-safe-bottom">
                <div className="mb-6 mt-6">
                    <h1 className="text-[20px] font-semibold leading-[1.35]">Debug Mode</h1>
                    <p className="mt-1 text-[13px] text-muted-foreground">v{versionInfo?.webVersion ?? '?'}</p>
                </div>

                {/* Device Info — deviceId/installId/platform injected by the native shell */}
                <div className="mb-4 rounded-[18px] bg-card px-4 py-3 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                    <div className="mb-2 flex items-center gap-2">
                        <Smartphone size={16} className="text-muted-foreground" />
                        <span className="text-[13px] font-semibold text-foreground">Device Info</span>
                    </div>
                    <dl className="flex flex-col gap-1.5">
                        {buildDeviceInfoRows(deviceInfo).map(row => (
                            <button
                                key={row.label}
                                type="button"
                                onClick={() => copyText(row.copyValue)}
                                className="flex items-start justify-between gap-2 text-left"
                            >
                                <dt className="w-[92px] shrink-0 text-[12px] text-muted-foreground">{row.label}</dt>
                                <dd className="flex-1 break-all text-[12px] font-medium text-foreground">{row.value}</dd>
                                {row.copyValue && <Copy size={13} className="mt-0.5 shrink-0 text-muted-foreground" />}
                            </button>
                        ))}
                    </dl>
                </div>

                {/* Debug Menu */}
                <div className="flex flex-col gap-3">
                    <div className="rounded-[18px] bg-card px-0.5 py-2 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                        <button
                            onClick={() => navigate(ROUTES.debug.login)}
                            className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                        >
                            <div className="flex items-center gap-3">
                                <Mail size={18} className="text-muted-foreground" />
                                <span className="text-[15px] font-medium text-foreground">
                                    {t('mypageLogin.title', { defaultValue: 'Email Login' })}
                                </span>
                            </div>
                            <ChevronRight size={18} className="text-muted-foreground" />
                        </button>
                        <button
                            onClick={() => navigate(ROUTES.debug.dashboard)}
                            className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                        >
                            <div className="flex items-center gap-3">
                                <MessageSquare size={18} className="text-muted-foreground" />
                                <span className="text-[15px] font-medium text-foreground">Chat Test Dashboard</span>
                            </div>
                            <ChevronRight size={18} className="text-muted-foreground" />
                        </button>
                        <button
                            onClick={() => navigate(ROUTES.debug.logBuffer)}
                            className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                        >
                            <div className="flex items-center gap-3">
                                <FileText size={18} className="text-muted-foreground" />
                                <span className="text-[15px] font-medium text-foreground">Log Buffer</span>
                            </div>
                            <ChevronRight size={18} className="text-muted-foreground" />
                        </button>
                        <button
                            onClick={() => navigate(ROUTES.debug.cacheTest)}
                            className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                        >
                            <div className="flex items-center gap-3">
                                <HardDrive size={18} className="text-muted-foreground" />
                                <span className="text-[15px] font-medium text-foreground">Cache DB Test</span>
                            </div>
                            <ChevronRight size={18} className="text-muted-foreground" />
                        </button>
                        <button
                            onClick={() => navigate(ROUTES.debug.uploadTest)}
                            className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                        >
                            <div className="flex items-center gap-3">
                                <Upload size={18} className="text-muted-foreground" />
                                <span className="text-[15px] font-medium text-foreground">Chunk Upload Test</span>
                            </div>
                            <ChevronRight size={18} className="text-muted-foreground" />
                        </button>
                        <button
                            onClick={() => navigate(ROUTES.debug.badgeCount)}
                            className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                        >
                            <div className="flex items-center gap-3">
                                <Bell size={18} className="text-muted-foreground" />
                                <span className="text-[15px] font-medium text-foreground">Badge Count Test</span>
                            </div>
                            <ChevronRight size={18} className="text-muted-foreground" />
                        </button>
                        <button
                            onClick={() => navigate(ROUTES.debug.push)}
                            className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                        >
                            <div className="flex items-center gap-3">
                                <BellRing size={18} className="text-muted-foreground" />
                                <span className="text-[15px] font-medium text-foreground">Push (Token &amp; Receive)</span>
                            </div>
                            <ChevronRight size={18} className="text-muted-foreground" />
                        </button>
                        <button
                            onClick={() => navigate(ROUTES.debug.inviteRedirect)}
                            className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                        >
                            <div className="flex items-center gap-3">
                                <Link2 size={18} className="text-muted-foreground" />
                                <span className="text-[15px] font-medium text-foreground">Invite Link Converter</span>
                            </div>
                            <ChevronRight size={18} className="text-muted-foreground" />
                        </button>
                        <button
                            onClick={() => navigate(ROUTES.auth.logout)}
                            className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                        >
                            <div className="flex items-center gap-3">
                                <LogOut size={18} className="text-destructive" />
                                <span className="text-[15px] font-medium text-destructive">Logout</span>
                            </div>
                        </button>
                    </div>
                </div>

                {/* Disable Debug Mode */}
                <div className="mt-10 flex justify-center">
                    <button
                        type="button"
                        onClick={handleDisableDebug}
                        className="flex items-center gap-1 text-[13px] font-medium text-destructive"
                    >
                        <XCircle size={14} />
                        <span>Disable Debug Mode</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

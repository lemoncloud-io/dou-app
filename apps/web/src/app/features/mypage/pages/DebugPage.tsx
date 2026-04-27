import { ChevronLeft, ChevronRight, LogOut, Mail, MessageSquare, Database, XCircle } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';
import { useDeviceInfo } from '@chatic/device-utils';
import { useLogout } from '@chatic/auth';

import { DEBUG_STORAGE_KEY } from '../consts';

export const DebugPage = () => {
    const navigate = useNavigateWithTransition();
    const { t } = useTranslation();
    const { versionInfo } = useDeviceInfo();
    const { mutate: logout } = useLogout();

    useEffect(() => {
        if (sessionStorage.getItem(DEBUG_STORAGE_KEY) !== 'true') {
            navigate('/mypage', { replace: true });
        }
    }, [navigate]);

    const handleDisableDebug = () => {
        sessionStorage.removeItem(DEBUG_STORAGE_KEY);
        navigate('/mypage', { replace: true });
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

                {/* Debug Menu */}
                <div className="flex flex-col gap-3">
                    <div className="rounded-[18px] bg-card px-0.5 py-2 shadow-[0px_2px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                        <button
                            onClick={() => navigate('/mypage/debug/login')}
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
                        <div className="mx-4 border-t border-border" />
                        <button
                            onClick={() => navigate('/mypage/debug/dashboard')}
                            className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                        >
                            <div className="flex items-center gap-3">
                                <MessageSquare size={18} className="text-muted-foreground" />
                                <span className="text-[15px] font-medium text-foreground">Chat Test Dashboard</span>
                            </div>
                            <ChevronRight size={18} className="text-muted-foreground" />
                        </button>
                        <div className="mx-4 border-t border-border" />
                        <button
                            onClick={() => navigate('/mypage/debug/state')}
                            className="flex w-full items-center justify-between py-3 pl-4 pr-3"
                        >
                            <div className="flex items-center gap-3">
                                <Database size={18} className="text-muted-foreground" />
                                <span className="text-[15px] font-medium text-foreground">State Info</span>
                            </div>
                            <ChevronRight size={18} className="text-muted-foreground" />
                        </button>
                        <div className="mx-4 border-t border-border" />
                        <button
                            onClick={() => logout()}
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

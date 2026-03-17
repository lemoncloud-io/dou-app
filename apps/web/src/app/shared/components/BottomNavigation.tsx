import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { cn } from '@chatic/lib/utils';
import { useNavigateWithTransition } from '@chatic/page-transition';

import { useTotalUnreadCount } from '../../features/chats/hooks/useTotalUnreadCount';

const IconChat = ({ color }: { color: string }) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M9.49994 2.22012C10.1802 2.07387 10.8741 2.00013 11.5699 2.00012C14.3518 1.98651 17.0031 3.17908 18.8385 5.26958C20.6739 7.36009 21.5134 10.1434 21.1399 12.9001C20.5399 17.5001 15.9999 21.2201 11.3599 21.2201H4.69994C4.13381 21.2204 3.60916 20.9232 3.31819 20.4376C3.02722 19.952 3.0127 19.3492 3.27994 18.8501L3.54994 18.3301C3.81866 17.8293 3.79959 17.2231 3.49994 16.7401C1.82164 14.1017 1.53349 10.8113 2.72768 7.92133C3.92187 5.0314 6.44873 2.90416 9.49994 2.22012ZM11.2799 19.7101C15.3566 19.6458 18.8235 16.7184 19.5699 12.7101C19.909 10.3872 19.2106 8.03257 17.6599 6.27011C16.1239 4.51239 13.9042 3.50279 11.5699 3.50012C10.9787 3.50124 10.3891 3.56155 9.80993 3.68012C7.23508 4.25302 5.09972 6.04239 4.08517 8.4773C3.07063 10.9122 3.30366 13.6884 4.70993 15.9201C5.30823 16.86 5.35032 18.0503 4.81993 19.0301L4.54993 19.5401C4.52795 19.5735 4.52795 19.6167 4.54993 19.6501C4.58993 19.7101 4.64993 19.7101 4.64993 19.7101H11.2799Z"
            fill={color}
        />
    </svg>
);

const IconMy = ({ color }: { color: string }) => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
            d="M16.6406 22H7.36058C6.34976 21.9633 5.40815 21.477 4.79293 20.6742C4.17771 19.8713 3.95315 18.8356 4.18058 17.85L4.42058 16.71C4.69662 15.1668 6.0232 14.0327 7.59058 14H16.4106C17.978 14.0327 19.3045 15.1668 19.5806 16.71L19.8206 17.85C20.048 18.8356 19.8235 19.8713 19.2082 20.6742C18.593 21.477 17.6514 21.9633 16.6406 22Z"
            fill={color}
        />
        <path
            d="M12.5006 12H11.5006C9.29144 12 7.50058 10.2092 7.50058 8.00001V5.36001C7.49792 4.46807 7.85106 3.61189 8.48176 2.98119C9.11246 2.35049 9.96864 1.99735 10.8606 2.00001H13.1406C14.0325 1.99735 14.8887 2.35049 15.5194 2.98119C16.1501 3.61189 16.5033 4.46807 16.5006 5.36001V8.00001C16.5006 9.06088 16.0792 10.0783 15.329 10.8284C14.5789 11.5786 13.5614 12 12.5006 12Z"
            fill={color}
        />
    </svg>
);

const NAV_ITEMS = [
    { path: '/', labelKey: 'bottomNav.chat', Icon: IconChat },
    { path: '/mypage', labelKey: 'bottomNav.my', Icon: IconMy },
] as const;

export const BottomNavigation = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { pathname } = useLocation();
    const totalUnread = useTotalUnreadCount();
    const displayUnread = totalUnread > 999 ? '+999' : totalUnread > 0 ? String(totalUnread) : null;

    return (
        <div
            className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] flex justify-center items-end z-10"
            style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 18px)', pointerEvents: 'none' }}
        >
            <div
                className="relative flex items-center justify-center w-[166px] h-[62px] rounded-[300px] overflow-hidden"
                style={{ backdropFilter: 'blur(20px)', background: 'rgba(243, 243, 243, 0.9)', pointerEvents: 'auto' }}
            >
                <div className="relative flex flex-row items-center justify-center gap-[18px] z-10">
                    {NAV_ITEMS.map(({ path, labelKey, Icon }) => {
                        const isActive =
                            path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(path + '/');
                        const iconColor = isActive ? '#FFFFFF' : '#53555B';
                        return (
                            <button
                                key={path}
                                onClick={() => navigate(path, { replace: true })}
                                className={cn(
                                    'relative flex flex-col items-center justify-center gap-[2px] w-12 h-12 rounded-2xl',
                                    isActive ? 'bg-[rgba(3,13,35,0.7)]' : 'bg-transparent'
                                )}
                            >
                                <Icon color={iconColor} />
                                {path === '/' && displayUnread && (
                                    <span className="absolute -top-[3px] left-[22px] flex h-[17px] min-w-[17px] items-center justify-center rounded-[8.5px] border border-white bg-[#F41F52] px-[5px] text-[11px] font-semibold leading-[10px] tracking-[0.005em] text-[#FEFEFE]">
                                        {displayUnread}
                                    </span>
                                )}
                                <span
                                    className={cn(
                                        'text-[11px] leading-[1.09] tracking-[-0.009em] text-center w-full',
                                        isActive ? 'font-semibold text-white' : 'font-medium text-[#53555B]'
                                    )}
                                >
                                    {t(labelKey)}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

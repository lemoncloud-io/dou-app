import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Hash, Link2, Lock, Plus, SendHorizontal, StickyNote } from 'lucide-react';

import { Logo } from '@chatic/assets';

/*
 * Product UI drawn in markup rather than shipped as screenshots. A screenshot carries one
 * language, one theme and whatever the capture account happened to contain; these follow the
 * page's language and never go stale against a test cloud's data. They are illustrations: nothing
 * here is interactive, so every one of them is hidden from assistive technology by its caller.
 */

const AVATAR_TONES = [
    'bg-lime text-ink',
    'bg-[#FF8A65] text-white',
    'bg-[#7CA7FF] text-white',
    'bg-[#C9B6FF] text-ink',
];

export const Avatar = ({
    label,
    tone = 0,
    size = 'h-8 w-8 text-[11px]',
}: {
    label: string;
    tone?: number;
    size?: string;
}) => (
    <span
        className={`${size} ${AVATAR_TONES[tone % AVATAR_TONES.length]} inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-white`}
    >
        {label}
    </span>
);

export const MemberStack = ({
    labels = ['M', 'J', 'S', 'H'],
    size,
    className = '-space-x-2',
}: {
    labels?: string[];
    size?: string;
    className?: string;
}) => (
    <span className={`inline-flex ${className}`}>
        {labels.map((label, index) => (
            <Avatar key={label} label={label} tone={index} size={size} />
        ))}
    </span>
);

export const PhoneFrame = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
    <div
        className={`relative aspect-[9/19] w-full rounded-[2.75rem] bg-ink p-2.5 shadow-[0_40px_80px_-30px_rgba(13,24,48,0.55)] ${className}`}
    >
        <div className="absolute left-1/2 top-4 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-ink" />
        <div className="relative h-full w-full overflow-hidden rounded-[2.25rem] bg-white">{children}</div>
    </div>
);

const Bubble = ({ mine, children }: { mine?: boolean; children: ReactNode }) => (
    <div
        className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug [word-break:keep-all] ${
            mine ? 'self-end rounded-br-md bg-ink text-white' : 'rounded-bl-md bg-[#F1F2F5] text-ink'
        }`}
    >
        {children}
    </div>
);

export const ChatScreen = () => {
    const { t } = useTranslation();
    return (
        <div className="flex h-full flex-col pt-11">
            <div className="flex items-center gap-3 border-b border-black/5 px-4 pb-3">
                <img src={Logo.logo} alt="" className="h-9 w-9 rounded-xl bg-cream object-contain p-1" />
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] text-ink/50">{t('home.mock.place')}</p>
                    <p className="flex items-center gap-1 truncate text-sm font-semibold text-ink">
                        <Hash className="h-3.5 w-3.5" strokeWidth={2.5} />
                        {t('home.mock.room')}
                    </p>
                </div>
                <MemberStack labels={['M', 'J', 'S']} />
            </div>
            <div className="flex flex-1 flex-col justify-end gap-2.5 px-4 pb-4">
                <span className="self-center rounded-full bg-[#F1F2F5] px-3 py-1 text-[11px] text-ink/50">
                    {t('home.mock.today')}
                </span>
                <div className="flex items-end gap-2">
                    <Avatar label="H" tone={3} size="h-7 w-7 text-[10px]" />
                    <div className="w-[78%] overflow-hidden rounded-2xl rounded-bl-md bg-[#F1F2F5]">
                        <div className="relative h-24 bg-[radial-gradient(circle_at_30%_40%,#D6F27A_0,#B0EA10_22%,#7FB800_45%,#3F6B2A_100%)]">
                            <svg viewBox="0 0 200 96" className="absolute inset-0 h-full w-full" fill="none">
                                <path
                                    d="M14 78 C 50 20, 80 90, 112 44 S 170 18, 188 30"
                                    stroke="white"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeDasharray="2 7"
                                />
                                <circle cx="14" cy="78" r="5" fill="#0D1830" />
                                <circle cx="188" cy="30" r="5" fill="white" stroke="#0D1830" strokeWidth="3" />
                            </svg>
                        </div>
                        <p className="px-3 py-2 text-[12px] font-medium text-ink">{t('home.mock.route')}</p>
                    </div>
                </div>
                <div className="flex items-end gap-2">
                    <Avatar label="J" tone={1} size="h-7 w-7 text-[10px]" />
                    <Bubble>{t('home.mock.message1')}</Bubble>
                </div>
                <Bubble mine>{t('home.mock.message2')}</Bubble>
                <div className="flex items-end gap-2">
                    <Avatar label="S" tone={2} size="h-7 w-7 text-[10px]" />
                    <Bubble>{t('home.mock.message3')}</Bubble>
                </div>
            </div>
            <div className="mx-3 mb-5 flex items-center gap-2 rounded-full bg-[#F1F2F5] py-2 pl-4 pr-2">
                <span className="flex-1 text-[13px] text-ink/40">{t('home.mock.input')}</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-lime text-ink">
                    <SendHorizontal className="h-4 w-4" />
                </span>
            </div>
        </div>
    );
};

export const InviteCard = ({ className = '' }: { className?: string }) => {
    const { t } = useTranslation();
    return (
        <div
            className={`w-64 rounded-3xl bg-white p-4 shadow-[0_24px_60px_-20px_rgba(13,24,48,0.35)] ring-1 ring-black/5 ${className}`}
        >
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-ink/50">
                <Link2 className="h-3.5 w-3.5" />
                {t('home.mock.inviteTitle')}
            </div>
            <p className="mt-2 text-sm font-semibold text-ink">{t('home.mock.inviteBody')}</p>
            <div className="mt-4 flex items-center justify-between">
                <MemberStack />
                <span className="rounded-full bg-ink px-3.5 py-2 text-xs font-semibold text-white">
                    {t('home.mock.inviteAction')}
                </span>
            </div>
        </div>
    );
};

/** Cloud, then places, then chat rooms: the three levels the app itself is organised by. */
export const CloudTree = () => {
    const { t } = useTranslation();
    const places = [
        { name: t('home.mock.place'), rooms: [t('home.mock.room'), t('home.scenes.club.rooms.2')], tone: 0 },
        { name: t('home.scenes.family.name'), rooms: [t('home.scenes.family.rooms.0')], tone: 1 },
        { name: t('home.scenes.study.name'), rooms: [t('home.scenes.study.rooms.1')], tone: 2 },
    ];
    return (
        <div className="w-full max-w-md rounded-[1.75rem] bg-white p-5 shadow-[0_30px_70px_-35px_rgba(13,24,48,0.45)] ring-1 ring-black/5">
            <div className="flex items-center gap-3">
                <img src={Logo.logo} alt="" className="h-11 w-11 rounded-2xl bg-cream object-contain p-1.5" />
                <div>
                    <p className="font-display text-base font-semibold text-ink">{t('home.mock.cloud')}</p>
                    <p className="text-xs text-ink/50">{t('home.mock.members')}</p>
                </div>
            </div>
            <ul className="mt-5 space-y-3">
                {places.map(place => (
                    <li key={place.name} className="rounded-2xl bg-[#F6F6F8] p-3">
                        <div className="flex items-center gap-2.5">
                            <Avatar label={place.name.slice(0, 1)} tone={place.tone} size="h-7 w-7 text-[10px]" />
                            <span className="text-sm font-semibold text-ink">{place.name}</span>
                        </div>
                        <ul className="mt-2 space-y-1 pl-9">
                            {place.rooms.map(room => (
                                <li key={room} className="flex items-center gap-1.5 text-[13px] text-ink/60">
                                    <Hash className="h-3 w-3" />
                                    {room}
                                </li>
                            ))}
                        </ul>
                    </li>
                ))}
            </ul>
            <div className="mt-3 flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-ink/15 py-2.5 text-xs font-medium text-ink/50">
                <Plus className="h-3.5 w-3.5" />
            </div>
        </div>
    );
};

export const SelfChatCard = () => {
    const { t } = useTranslation();
    return (
        <div className="flex w-full max-w-xs flex-col gap-2">
            <div className="self-end rounded-2xl rounded-br-md bg-ink px-4 py-3 text-sm text-white">
                {t('home.mock.selfNote')}
            </div>
            <div className="flex items-center gap-2 self-end rounded-2xl rounded-br-md bg-lime px-4 py-3 text-sm font-medium text-ink">
                <StickyNote className="h-4 w-4" />
                {t('home.mock.selfLink')}
            </div>
        </div>
    );
};

export const LockBadge = () => (
    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-lime">
        <Lock className="h-6 w-6" />
    </span>
);

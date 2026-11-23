import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';
import { runtime } from '@chatic/runtime';

import { cn } from '@chatic/ui-kit';
import { DefaultAvatar, IconChevronRight, IconSettings, IconUserOutline, ListRow, MenuCard } from '@chatic/web-ui-kit';

import { BottomNavSpacer } from '../../../ui/components';
import { useIsAccountGuest, useMyUser, useScrollChrome } from '../../../hooks';
import { ROUTES } from '../../../routes/paths';
import { useNavigateToLogin } from '../../auth/hooks';
import { useDevicePairingEnabled } from '../../../hooks/useDevicePairingEnabled';

const Chevron = () => <IconChevronRight className="size-[18px] text-description" />;

export const MyPage = () => {
    const navigate = useNavigateWithTransition();
    const goToLogin = useNavigateToLogin();
    const { t } = useTranslation();
    const isGuest = useIsAccountGuest();
    const myUser = useMyUser();
    const pairingEnabled = useDevicePairingEnabled();
    const isPairedSession = runtime.session.useIsPairedSession();
    const { approvesPairing, sessionScope } = runtime.signIn;
    const canApprovePairing = pairingEnabled && approvesPairing && !isGuest && !isPairedSession;
    const canListDevices = pairingEnabled && (!isGuest || sessionScope === 'device');
    const canOpenSubscription = !isGuest || runtime.checkout.kind === 'web';
    const { scrolled, track: trackScroll } = useScrollChrome();

    const displayName = myUser?.name;
    const displayImageUrl = myUser?.photo;

    const profileAvatar = (
        <span className="flex h-[60px] w-[60px] items-center justify-center overflow-hidden rounded-full border border-avatar-ring bg-muted">
            {displayImageUrl ? (
                <img src={displayImageUrl} alt="Profile" className="h-full w-full object-cover" />
            ) : (
                <IconUserOutline size={26} className="text-placeholder" />
            )}
        </span>
    );

    const handleProfileClick = () => {
        navigate(ROUTES.mypage.account.info);
    };

    return (
        <div
            className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background"
            onScroll={event => trackScroll(event.currentTarget)}
        >
            <header
                className={cn(
                    'sticky top-0 z-20 flex shrink-0 items-center justify-between border-b bg-background px-4 pb-3 pt-[calc(var(--safe-top,0px)+0.75rem)] transition-colors duration-200 motion-reduce:transition-none',
                    scrolled ? 'border-input-border' : 'border-transparent'
                )}
            >
                <h1
                    data-compact={scrolled}
                    className={cn(
                        'font-bold tracking-[-0.11px] text-foreground transition-[font-size] duration-200 ease-out motion-reduce:transition-none',
                        scrolled ? 'text-[20px]' : 'text-[22px]'
                    )}
                >
                    {t('mypage.title')}
                </h1>
                <button
                    onClick={() => navigate(ROUTES.mypage.settings.root)}
                    aria-label={t('mypage.settings.openLabel')}
                    className="flex size-9 items-center justify-center rounded-full active:bg-muted/50"
                >
                    <IconSettings size={22} className="text-foreground" />
                </button>
            </header>

            <div className="flex flex-col gap-[18px] px-4 pt-2">
                <MenuCard>
                    {isGuest ? (
                        <ListRow
                            leading={<DefaultAvatar size={60} />}
                            title={t('mypage.loginPrompt')}
                            subtitle={t('mypage.loginDescription')}
                            trailing={<Chevron />}
                            onClick={goToLogin}
                            className="py-3"
                        />
                    ) : (
                        <ListRow
                            leading={profileAvatar}
                            title={displayName}
                            subtitle={myUser?.email}
                            trailing={<Chevron />}
                            onClick={handleProfileClick}
                            className="py-3"
                        />
                    )}
                </MenuCard>

                {canOpenSubscription && (
                    <MenuCard>
                        <ListRow
                            title={t('mypage.subscription.hubEntry')}
                            trailing={<Chevron />}
                            onClick={() => navigate(ROUTES.subscription.root)}
                        />
                    </MenuCard>
                )}

                {pairingEnabled && sessionScope === 'device' && isPairedSession && (
                    <p
                        className="px-1 text-[13px] leading-[1.5] text-description"
                        data-testid="mypage-secondary-device"
                    >
                        {t('pairing.secondary.notice')}
                    </p>
                )}

                {(canApprovePairing || canListDevices) && (
                    <MenuCard>
                        {canApprovePairing && (
                            <ListRow
                                title={t('pairing.entry.approve')}
                                trailing={<Chevron />}
                                onClick={() => navigate(ROUTES.mypage.pairing.approve)}
                            />
                        )}
                        {canListDevices && (
                            <ListRow
                                title={t('pairing.entry.devices')}
                                trailing={<Chevron />}
                                onClick={() => navigate(ROUTES.mypage.pairing.devices)}
                            />
                        )}
                    </MenuCard>
                )}

                {!isGuest && (
                    <MenuCard>
                        <ListRow
                            title={t('mypage.cloudManage.hubEntry')}
                            trailing={<Chevron />}
                            onClick={() => navigate(ROUTES.mypage.cloud.manage)}
                        />
                    </MenuCard>
                )}
            </div>

            <BottomNavSpacer />
        </div>
    );
};

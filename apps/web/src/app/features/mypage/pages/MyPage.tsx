import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';
import { host } from '@chatic/host';
import { runtime } from '@chatic/runtime';

import { cn } from '@chatic/ui-kit';
import { DefaultAvatar, IconChevronRight, IconSettings, IconUserOutline, ListRow, MenuCard } from '@chatic/web-ui-kit';

import { BottomNavSpacer } from '../../../ui/components';
import { useIsAccountGuest, useMyUser, useScrollChrome } from '../../../hooks';
import { ROUTES } from '../../../routes/paths';
import { useNavigateToLogin } from '../../auth/hooks';
import { useDevicePairingEnabled } from '../../../hooks/useDevicePairingEnabled';

const Chevron = () => <IconChevronRight className="size-[18px] text-description" />;

/**
 * MY hub — identity and the two account-scoped destinations (subscription, clouds). Device and app
 * preferences moved one depth down behind the header gear (SettingsPage), so this screen stays a
 * short identity card list rather than a settings dump.
 */
export const MyPage = () => {
    const navigate = useNavigateWithTransition();
    const goToLogin = useNavigateToLogin();
    const { t } = useTranslation();
    // The ACCOUNT's guest-ness, not the active session's. Every row on this screen is account-scoped
    // — the profile, the subscription, the clouds you own — and they must read the same subject the
    // header's name does, which is the relay account whichever cloud is connected. `useRuntimeProfile`
    // would answer for the delegated cloud user instead (see useIsAccountGuest).
    const isGuest = useIsAccountGuest();
    const myUser = useMyUser();
    const pairingEnabled = useDevicePairingEnabled();
    // Approving is the apps' job, on an account: approving hands on a sign-in, and a guest has none of
    // its own to give. A device that is itself signed in through an approval never approves another —
    // it would sign out with its own approver.
    // Whether this device is an app that signs in and approves pairings is `host.ports.signIn`'s answer.
    const isPairedSession = runtime.session.useIsPairedSession();
    const appSignsIn = host.ports.signIn.kind === 'shell';
    const canApprovePairing = pairingEnabled && appSignsIn && !isGuest && !isPairedSession;
    // A browser guest has no account to list devices for; an app guest does have its own device.
    const canListDevices = pairingEnabled && (!isGuest || appSignsIn);
    // An app guest signs in before buying, so the row waits for an account. A browser guest is handed
    // to the website like anyone else — it signs the buyer in itself — so the row is there too.
    const canOpenSubscription = !isGuest || !appSignsIn;
    // The same chrome as the other tabs: once the cards pass under the header it gains its divider
    // and the title steps down, so the three tabs read alike as they scroll.
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

    // The header shows the RELAY account's data (name/email/photo) — the same record whichever cloud
    // is connected. It opens My Info, the account hub: profile editing and social links
    // all hang off it, and this row is now their only way in.
    const handleProfileClick = () => {
        navigate(ROUTES.mypage.account.info);
    };

    return (
        // Trailing clearance for the floating nav comes from BottomNavSpacer at the end of the
        // content, not from padding on this container — see BottomNavSpacer for why.
        <div
            className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background"
            onScroll={event => trackScroll(event.currentTarget)}
        >
            {/* The page is the scrollport, so the header sticks, and it carries the safe-area inset
                itself: on the container, the inset would scroll away and leave the cards passing
                under the status bar. The border is always there and only changes colour, so the bar
                never moves by a pixel; the 36px gear sets its height, so the smaller title does not
                shrink it either. */}
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
                {/* Account profile card — account-level profile (name/email/photo), not cloud/site.
                    Signed out, the same card shape carries the sign-in prompt: the default avatar
                    stands in for the photo, so the row keeps its height and the card does not
                    reflow the two below it when a session appears. */}
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
                            // Always the subscription list: it has a state for everyone, including an
                            // empty one whose call to action leads to the cloud guide. Branching here on
                            // `isValid` sent a scheduled cancellation — still paid for — to the pitch.
                            onClick={() => navigate(ROUTES.subscription.root)}
                        />
                    </MenuCard>
                )}

                {/* A secondary device signs out with the app that approved it — said here, where the
                    user looks for who they are signed in as, since nothing else on the screen shows it. */}
                {pairingEnabled && appSignsIn && isPairedSession && (
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

                {/* Every signed-in account, owner or not: cloud management has a state for each —
                    an empty one that starts a subscription, the list, and the lapsed list whose
                    leftover clouds still need releasing. Gating on ownership hid the first. */}
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

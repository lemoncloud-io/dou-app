import { useTranslation } from 'react-i18next';

import { FlaskConical } from 'lucide-react';

import { config } from '@chatic/config';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { IconChevronRight, ListRow, MenuCard, Switch } from '@chatic/web-ui-kit';

import { openSubWebView, resolveSubWebViewAppUrl } from '../../../bridge';
import { useChatInputLockExperiment, usePlaceInviteExperiment } from '../../../hooks';
import { PageHeader } from '../../../ui/components';
import { isDevBuild } from '../../../utils/buildEnv';
import { DebugUnlockDialog, debugOverlayActions, useDebugMode, useDebugUnlock } from '../../debug';
import { IN_APP_PAGES } from '../consts';

/**
 * The user-facing home for experiments: features that work but are not ready to be on for
 * everyone. Each is a `labs` config key, off by default, with a hand-built switch here, together in one
 * Experiments card with the sub WebView pages that are ready to be tried. The debug
 * unlock belongs here too, because it is an opt-in developer experiment rather than an app setting.
 */
export const LabPage = () => {
    const { t } = useTranslation();
    const { isEnabled: isDebugMode } = useDebugMode();
    const placeInvite = usePlaceInviteExperiment();
    const chatInputLock = useChatInputLockExperiment();
    const { toast } = useToast();
    const experimentPages = IN_APP_PAGES.filter(page => page.surface === 'experiment');
    const debugPages = IN_APP_PAGES.filter(page => page.surface === 'debug');
    const { isChallengeOpen, hasError, registerTap, submitCode, cancelChallenge } = useDebugUnlock(
        config.get<string>('debug.entryCode')
    );

    // In the app the page opens in the sub WebView; an older app or a browser opens it elsewhere. It
    // is resolved and opened as a page link is, with its app id, so what it shares names the app.
    const openPage = async (appId: string) => {
        try {
            const url = await resolveSubWebViewAppUrl({ appId, query: '' }, isDevBuild() ? 'dev' : 'prod');
            if (!url) throw new Error(`No page for ${appId}`);
            await openSubWebView({ url, appId });
        } catch {
            toast({ title: t('mypage.lab.inAppOpenFailed'), variant: 'destructive' });
        }
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background">
            <div className="sticky top-0 z-20 shrink-0">
                <PageHeader title={t('mypage.lab.title')} />
            </div>

            <div className="flex flex-col gap-[18px] px-4 pb-8 pt-4">
                <div className="rounded-[18px] bg-primary/10 px-5 py-6">
                    {/* The trigger is intentionally not advertised in the UI. The entry code is a
                        second gate so only internal developers who know both steps can enable it. */}
                    <button
                        type="button"
                        aria-hidden="true"
                        tabIndex={-1}
                        onClick={registerTap}
                        className="mb-4 flex size-11 cursor-default items-center justify-center rounded-[14px] bg-primary/15 text-primary"
                    >
                        <FlaskConical className="size-6" aria-hidden="true" />
                    </button>
                    <h2 className="text-[18px] font-semibold tracking-[-0.36px] text-foreground">
                        {t('mypage.lab.heading')}
                    </h2>
                    <p className="mt-1 text-[14px] leading-[1.5] text-description">{t('mypage.lab.description')}</p>
                </div>

                <MenuCard title={t('mypage.lab.experiments')}>
                    {/* Turning it on only adds the home menu entry. Who can invite where is still
                            the entry's own gate — owner, cloud place, session on that place. */}
                    <ListRow
                        title={t('mypage.lab.placeInvite')}
                        subtitle={t('mypage.lab.placeInviteSubtitle')}
                        trailing={
                            <Switch
                                checked={placeInvite.isEnabled}
                                onCheckedChange={placeInvite.setEnabled}
                                label={t('mypage.lab.placeInvite')}
                            />
                        }
                    />
                    {/* Turning it on only offers the lock in each room's settings; no room is
                            locked until its own row says so. Off again, the locks are kept, not enforced. */}
                    <ListRow
                        title={t('mypage.lab.chatInputLock')}
                        subtitle={t('mypage.lab.chatInputLockSubtitle')}
                        trailing={
                            <Switch
                                checked={chatInputLock.isEnabled}
                                onCheckedChange={chatInputLock.setEnabled}
                                label={t('mypage.lab.chatInputLock')}
                            />
                        }
                    />
                    {/* A page, not a switch: there is nothing to turn on, so it is a row that opens. */}
                    {experimentPages.map(page => (
                        <ListRow
                            key={page.id}
                            title={t(page.titleKey)}
                            subtitle={t(page.subtitleKey)}
                            trailing={<IconChevronRight className="size-[18px] text-description" />}
                            onClick={() => void openPage(page.appId)}
                        />
                    ))}
                </MenuCard>

                {isDebugMode && (
                    <MenuCard title={t('mypage.lab.developerTools')}>
                        <ListRow
                            title={t('mypage.lab.openDebug')}
                            destructive
                            trailing={<IconChevronRight className="size-[18px] text-destructive" />}
                            onClick={() => debugOverlayActions.open('full')}
                        />
                    </MenuCard>
                )}

                {/* Behind debug mode like the developer tools, but not in the panel: pages kept for
                    trying the sub WebView, not experiments anyone turns on. */}
                {isDebugMode && debugPages.length > 0 && (
                    <div className="flex flex-col gap-2">
                        <MenuCard title={t('mypage.lab.inApp')}>
                            {debugPages.map(page => (
                                <ListRow
                                    key={page.id}
                                    title={t(page.titleKey)}
                                    subtitle={t(page.subtitleKey)}
                                    trailing={<IconChevronRight className="size-[18px] text-description" />}
                                    onClick={() => void openPage(page.appId)}
                                />
                            ))}
                        </MenuCard>
                        <p className="px-1 text-[13px] leading-[1.5] text-description">{t('mypage.lab.inAppNote')}</p>
                    </div>
                )}
            </div>

            <DebugUnlockDialog
                isOpen={isChallengeOpen}
                hasError={hasError}
                onSubmit={submitCode}
                onCancel={cancelChallenge}
            />
        </div>
    );
};

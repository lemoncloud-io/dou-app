import { useTranslation } from 'react-i18next';

import { FlaskConical } from 'lucide-react';

import { config } from '@chatic/config';
import { IconChevronRight, ListRow, MenuCard, Switch } from '@chatic/web-ui-kit';

import { usePlaceInviteExperiment } from '../../../hooks';
import { PageHeader } from '../../../ui/components';
import { DebugUnlockDialog, debugOverlayActions, useDebugMode, useDebugUnlock } from '../../debug';

/**
 * The user-facing home for experiments: features that work but are not ready to be on for
 * everyone. Each is a `labs` config key, off by default, with a hand-built switch here. The debug
 * unlock belongs here too, because it is an opt-in developer experiment rather than an app setting.
 */
export const LabPage = () => {
    const { t } = useTranslation();
    const { isEnabled: isDebugMode } = useDebugMode();
    const placeInvite = usePlaceInviteExperiment();
    const { isChallengeOpen, hasError, registerTap, submitCode, cancelChallenge } = useDebugUnlock(
        config.get<string>('debug.entryCode')
    );

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

                <div className="flex flex-col gap-2">
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
                    </MenuCard>
                    {/* Outside the row because a row's subtitle is one truncated line. */}
                    <p className="px-1 text-[13px] leading-[1.5] text-description">{t('mypage.lab.placeInviteNote')}</p>
                </div>

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

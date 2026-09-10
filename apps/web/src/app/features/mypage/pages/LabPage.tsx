import { useTranslation } from 'react-i18next';

import { FlaskConical } from 'lucide-react';

import { config } from '@chatic/config';
import { IconChevronRight, ListRow, MenuCard } from '@chatic/web-ui-kit';

import { PageHeader } from '../../../ui/components';
import { DebugUnlockDialog, debugOverlayActions, useDebugMode, useDebugUnlock } from '../../debug';

/**
 * The user-facing home for experiments. Experiments are intentionally visual-only until their
 * product behaviour is ready; the debug unlock belongs here because it is an opt-in developer
 * experiment rather than a general app setting.
 */
export const LabPage = () => {
    const { t } = useTranslation();
    const { isEnabled: isDebugMode } = useDebugMode();
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

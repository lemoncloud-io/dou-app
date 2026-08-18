import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { usePlanCatalog } from '../hooks';

/**
 * The "꼭 확인해 주세요" block on the plan picker.
 *
 * Says WHEN a change takes effect, not how it is billed: moving up applies immediately, moving down
 * waits for the next renewal. That asymmetry is the thing a user has to know before choosing, and it
 * is the same on both stores — only the last line, where subscriptions are managed, differs.
 */
export const TierChangeNotice = () => {
    const { t } = useTranslation();
    // Platform detection has exactly one owner; sniffing `CHATIC_APP_PLATFORM` again here would be a
    // third copy of the same three lines.
    const { isIOS } = usePlanCatalog();

    const bullets = [
        t('mypage.subscription.notice.upgradeImmediate'),
        t('mypage.subscription.notice.downgradeNextRenewal'),
        t(`mypage.subscription.notice.manageAt.${isIOS ? 'apple' : 'google'}`),
    ];

    return (
        <section className="flex flex-col gap-2 pt-2">
            <div className="flex items-center gap-2">
                <AlertCircle size={20} className="shrink-0 text-foreground" />
                <span className="text-[15px] font-semibold text-foreground">
                    {t('mypage.subscription.notice.title')}
                </span>
            </div>
            <ul className="flex flex-col gap-1">
                {bullets.map(text => (
                    <li key={text} className="flex items-start gap-2 pl-1">
                        <span className="text-[14px] leading-[1.5] text-[#78828A]">•</span>
                        <span className="text-[14px] leading-[1.5] tracking-[-0.015em] text-[#78828A]">{text}</span>
                    </li>
                ))}
            </ul>
        </section>
    );
};

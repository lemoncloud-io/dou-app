import { useTranslation } from 'react-i18next';

import { IconChatAdd, IconGroup, IconUsersGroup } from '@chatic/web-ui-kit';

/**
 * What a subscription gets you — the three benefits the cloud guide used to carry on its own screen.
 *
 * The design has these as placeholders (a repeated icon and lorem copy), so the wording comes from
 * the guide this screen replaces rather than being invented here; the icons are picked from the kit
 * to match what each line actually describes.
 */
const BENEFITS = [
    { key: 'benefit1', Icon: IconGroup },
    { key: 'benefit2', Icon: IconChatAdd },
    { key: 'benefit3', Icon: IconUsersGroup },
] as const;

export const SubscriptionBenefits = () => {
    const { t } = useTranslation();

    return (
        <section className="flex flex-col gap-3">
            <h2 className="text-[18px] font-bold leading-[1.35] tracking-[-0.02em] text-foreground">
                {t('mypage.subscription.benefits.title')}
            </h2>
            <ul className="flex flex-col gap-4">
                {BENEFITS.map(({ key, Icon }) => (
                    <li key={key} className="flex flex-col gap-1">
                        <div className="flex items-center gap-3">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#B0EA10]/20">
                                <Icon className="size-[18px] text-[#6a8a00] dark:text-[#B0EA10]" />
                            </span>
                            <span className="text-[16px] font-semibold leading-[1.4] tracking-[-0.015em] text-foreground">
                                {t(`mypage.subscription.cloudGuide.pro.${key}Title`)}
                            </span>
                        </div>
                        <p className="pl-11 text-[14px] leading-[1.5] tracking-[-0.015em] text-[#78828A]">
                            {t(`mypage.subscription.cloudGuide.pro.${key}Description`)}
                        </p>
                    </li>
                ))}
            </ul>
        </section>
    );
};

import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface NoticeListProps {
    items: string[];
}

/**
 * The "please note" block every subscription screen ends with: a title and bulleted fine print.
 *
 * Read-only prose that wraps freely, so it takes the reading measure rather than the column — on an
 * unfolded phone a full-width bullet runs past a comfortable line length.
 */
export const NoticeList = ({ items }: NoticeListProps) => {
    const { t } = useTranslation();
    if (items.length === 0) return null;

    return (
        <section className="flex w-full max-w-reading flex-col">
            <div className="flex items-center gap-2 px-4 py-2.5">
                <AlertCircle size={24} className="shrink-0 text-foreground" />
                <h2 className="text-[16px] font-semibold tracking-[-0.24px] text-foreground">
                    {t('mypage.subscription.notice.title')}
                </h2>
            </div>
            <ul className="flex flex-col">
                {items.map(text => (
                    <li key={text} className="flex items-start gap-2 px-4 py-[3px]">
                        <span aria-hidden className="text-[16px] font-semibold leading-[1.3] text-placeholder">
                            •
                        </span>
                        <span className="flex-1 whitespace-pre-line text-[13px] font-medium leading-[1.4] tracking-[-0.195px] text-description">
                            {text}
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    );
};

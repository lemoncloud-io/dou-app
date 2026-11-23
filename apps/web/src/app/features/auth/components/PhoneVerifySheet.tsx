import { useTranslation } from 'react-i18next';

import { BottomSheet, Button } from '@chatic/web-ui-kit';

import { usePhoneVerify, type PhoneVerifyShellProps } from '../hooks/usePhoneVerify';
import { PhoneVerifyFields } from './PhoneVerifyFields';

export const PhoneVerifySheet = (props: PhoneVerifyShellProps) => {
    const { t } = useTranslation();
    const { onClose } = props;
    const { fields, submit } = usePhoneVerify(props);

    return (
        <BottomSheet
            open
            onOpenChange={value => !value && onClose()}
            title={t('phoneVerify.sheetTitle')}
            description={t('phoneVerify.sheetDescription')}
            onClose={onClose}
            closeLabel={t('common.close')}
            footer={
                <div className="px-4 pb-4 pt-5">
                    <Button
                        tone="green"
                        size="lg"
                        fullWidth
                        loading={submit.loading}
                        disabled={submit.disabled}
                        onClick={submit.onSubmit}
                    >
                        {t(submit.isRetry ? 'phoneVerify.retry' : 'phoneVerify.complete')}
                    </Button>
                </div>
            }
        >
            <div className="flex flex-col gap-8 pt-2">
                <p
                    aria-hidden
                    className="whitespace-pre-line px-4 text-[15px] font-semibold leading-[22px] text-foreground"
                >
                    {t('phoneVerify.sheetDescription')}
                </p>

                <PhoneVerifyFields state={fields} />
            </div>
        </BottomSheet>
    );
};

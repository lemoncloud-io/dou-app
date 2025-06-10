import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Input } from '@lemon/ui-kit/components/ui/input';
import { Label } from '@lemon/ui-kit/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@lemon/ui-kit/components/ui/select';

export const BannerForm = () => {
    const { t } = useTranslation();
    const { register, setValue } = useFormContext();

    return (
        <>
            <div className="space-y-2">
                <Label>{t('boards.form.common.maxImages')}</Label>
                <Select onValueChange={value => setValue('maxImages', value)}>
                    <SelectTrigger>
                        <SelectValue placeholder="1" />
                    </SelectTrigger>
                    <SelectContent>
                        {[1, 2, 3, 4, 5].map(value => (
                            <SelectItem key={`banner-max-images-${value}`} value={value.toString()}>
                                {value}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label>{t('boards.form.colorLabel')}</Label>
                <Input type="color" {...register('color')} />
            </div>

            <div className="space-y-2">
                <Label>{t('boards.form.orderLabel')}</Label>
                <Input type="number" {...register('order')} min={0} />
            </div>
        </>
    );
};

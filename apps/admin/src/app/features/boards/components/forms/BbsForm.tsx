import { Controller, useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Checkbox } from '@lemon/ui-kit/components/ui/checkbox';
import { Input } from '@lemon/ui-kit/components/ui/input';
import { Label } from '@lemon/ui-kit/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@lemon/ui-kit/components/ui/select';

import { TagInput } from '../../../../shared';

interface BbsFormProps {
    features?: string[];
}

export const BbsForm: React.FC<BbsFormProps> = ({ features }) => {
    const { t } = useTranslation();
    const { register, control, watch, setValue } = useFormContext();

    return (
        <>
            <div className="space-y-2">
                <Label>{t('boards.form.common.maxImages')}</Label>
                <Select onValueChange={value => register('maxImages').onChange(value)}>
                    <SelectTrigger>
                        <SelectValue placeholder="1" />
                    </SelectTrigger>
                    <SelectContent>
                        {[1, 2, 3, 4, 5].map(value => (
                            <SelectItem key={`bbs-max-images-${value}`} value={value.toString()}>
                                {value}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label>{t('boards.form.common.maxCommentDepth')}</Label>
                <Select onValueChange={value => register('maxCommentDepth').onChange(value)}>
                    <SelectTrigger>
                        <SelectValue placeholder={t('boards.form.commentDepth.1')} />
                    </SelectTrigger>
                    <SelectContent>
                        {[0, 1, 2].map(value => (
                            <SelectItem key={`bbs-comment-depth-${value}`} value={value.toString()}>
                                {t(`boards.form.commentDepth.${value}`)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label>{t('boards.form.common.categories')}</Label>
                <TagInput name="categories" control={control} />
            </div>

            <div className="flex items-center space-x-2">
                <Checkbox
                    id="isAnonymous"
                    checked={watch('isAnonymous')}
                    onCheckedChange={checked => setValue('isAnonymous', checked)}
                />
                <Label htmlFor="isAnonymous">{t('boards.form.anonymousLabel')}</Label>
            </div>

            <div className="space-y-2">
                <Label>{t('boards.form.colorLabel')}</Label>
                <Input type="color" {...register('color')} />
            </div>

            {features && features.length > 0 && (
                <div className="space-y-2">
                    <Label>{t('boards.form.common.features')}</Label>
                    <div className="grid grid-cols-2 gap-4">
                        {features.map(key => (
                            <div key={key} className="flex items-center space-x-2">
                                <Controller
                                    name={`feature$.${key}`}
                                    control={control}
                                    defaultValue={false}
                                    render={({ field }) => (
                                        <div className="flex items-center space-x-2">
                                            <Checkbox id={key} checked={field.value} onCheckedChange={field.onChange} />
                                            <Label htmlFor={key}>{key}</Label>
                                        </div>
                                    )}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="space-y-2">
                <Label>{t('boards.form.common.sortBy')}</Label>
                <Select onValueChange={value => register('sortBy').onChange(value)}>
                    <SelectTrigger>
                        <SelectValue placeholder={t('boards.form.sort.latest')} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="createdAt:desc">{t('boards.form.sort.latest')}</SelectItem>
                        <SelectItem value="createdAt:asc">{t('boards.form.sort.oldest')}</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label>{t('boards.form.common.reasons')}</Label>
                <TagInput name="reasons" control={control} />
            </div>
        </>
    );
};

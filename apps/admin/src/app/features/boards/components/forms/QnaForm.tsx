import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Label } from '@lemon/ui-kit/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@lemon/ui-kit/components/ui/select';

import { TagInput } from '../../../../shared';

export const QnaForm = () => {
    const { t } = useTranslation();
    const { register, control } = useFormContext();

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
                            <SelectItem key={`qna-max-images-${value}`} value={value.toString()}>
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
                            <SelectItem key={`qna-comment-depth-${value}`} value={value.toString()}>
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
        </>
    );
};

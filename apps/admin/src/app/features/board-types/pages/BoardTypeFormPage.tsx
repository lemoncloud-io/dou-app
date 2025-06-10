import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';

import { boardTypesKeys, useBoardType, useCreateBoardType, useUpdateBoardType } from '@lemon/board-types';
import { Loader } from '@lemon/shared';
import { Alert, AlertDescription } from '@lemon/ui-kit/components/ui/alert';
import { Button } from '@lemon/ui-kit/components/ui/button';
import { Card } from '@lemon/ui-kit/components/ui/card';
import { Checkbox } from '@lemon/ui-kit/components/ui/checkbox';
import { Input } from '@lemon/ui-kit/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@lemon/ui-kit/components/ui/select';
import { toast } from '@lemon/ui-kit/hooks/use-toast';

import i18n from '../../../../i18n';

import type { TypeBody, TypeView } from '@lemoncloud/lemon-boards-api';

export const ALLOWED_FEATURES = ['투표', '좋아요', '북마크', '댓글', '글작성', '클릭수'];

export const BOARD_TYPE_OPTIONS = [
    { label: i18n.t('boardTypes.types.bbs'), value: 'bbs' },
    { label: i18n.t('boardTypes.types.notice'), value: 'notice' },
    { label: i18n.t('boardTypes.types.qna'), value: 'qna' },
    { label: i18n.t('boardTypes.types.question'), value: 'question' },
    { label: i18n.t('boardTypes.types.banner'), value: 'banner' },
    { label: i18n.t('boardTypes.types.review'), value: 'review' },
];

export const BoardTypeFormPage = () => {
    const { t } = useTranslation();
    const { id } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const { data: boardType, isLoading: isLoadingBoardType, error: fetchError } = useBoardType(id || '');
    const updateBoardType = useUpdateBoardType();
    const createBoardType = useCreateBoardType();

    const { control, handleSubmit, register, setValue, watch } = useForm<TypeBody>({
        defaultValues: {
            name: '',
            boardType: '',
            features: [],
        },
    });

    const selectedBoardType = watch('boardType');
    const selectedFeatures = watch('features');

    useEffect(() => {
        if (boardType) {
            setValue('name', boardType.name);
            setValue('boardType', boardType.boardType);
            setValue('features', boardType.features);
        }
    }, [boardType, setValue]);

    const onSubmit = async (data: TypeBody) => {
        if (id) {
            await updateBoardType.mutateAsync(
                { boardTypeId: id, ...data },
                {
                    onSuccess: async (updated: TypeView) => {
                        await queryClient.invalidateQueries(boardTypesKeys.invalidateList());
                        queryClient.setQueryData(boardTypesKeys.detail(updated.id as string), updated);
                        toast({ description: t('boardTypes.toast.updateSuccess'), duration: 2000 });
                    },
                }
            );
            return;
        }

        await createBoardType.mutateAsync(
            { ...data },
            {
                onSuccess: async (newBoardType: TypeView) => {
                    await queryClient.invalidateQueries(boardTypesKeys.invalidateList());
                    queryClient.setQueryData(boardTypesKeys.detail(newBoardType.id as string), newBoardType);
                    toast({ description: t('boardTypes.toast.createSuccess'), duration: 2000 });
                    navigate(`/board-types/${newBoardType.id}`);
                },
            }
        );
        return;
    };

    const onFeatureChange = (feature: string, checked: boolean) => {
        const currentFeatures = selectedFeatures || [];
        const newFeatures = checked ? [...currentFeatures, feature] : currentFeatures.filter(f => f !== feature);
        setValue('features', newFeatures);
    };

    return (
        <div className="container mx-auto py-10">
            {(fetchError || updateBoardType.error || createBoardType.error) && (
                <Alert variant="destructive" className="mb-4">
                    <AlertDescription>
                        {fetchError instanceof Error
                            ? fetchError.message
                            : updateBoardType.error instanceof Error
                            ? updateBoardType.error.message
                            : createBoardType.error instanceof Error
                            ? createBoardType.error.message
                            : t('generalError')}
                    </AlertDescription>
                </Alert>
            )}

            <Card className="max-w-2xl mx-auto p-6">
                <h1 className="text-2xl font-bold mb-6">
                    {id ? t('boardTypes.form.editTitle') : t('boardTypes.form.createTitle')}
                </h1>
                {isLoadingBoardType ? (
                    <div className="h-[400px] flex items-center justify-center">
                        <Loader />
                    </div>
                ) : fetchError ? (
                    <div className="h-[200px] flex flex-col items-center justify-center gap-4">
                        <p className="text-sm text-destructive text-center">{t('boardTypes.error.loadFailed')}</p>
                        <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="gap-2">
                            <RefreshCw className="h-4 w-4" />
                            {t('common.retry')}
                        </Button>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                        <div className="space-y-2">
                            <label>{t('boardTypes.form.nameLabel')}</label>
                            <Input {...register('name')} />
                        </div>
                        <div className="space-y-2">
                            <label>{t('boardTypes.form.typeLabel')}</label>
                            <Select
                                value={selectedBoardType}
                                onValueChange={value => setValue('boardType', value)}
                                defaultValue={boardType?.boardType}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder={t('boardTypes.form.typePlaceholder')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {BOARD_TYPE_OPTIONS.map(option => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <label className="block mb-2">{t('boardTypes.form.featuresLabel')}</label>
                            <div className="grid grid-cols-2 gap-4">
                                {ALLOWED_FEATURES.map(feature => (
                                    <div key={feature} className="flex items-center space-x-2">
                                        <Checkbox
                                            id={feature}
                                            checked={selectedFeatures?.includes(feature)}
                                            onCheckedChange={checked => onFeatureChange(feature, checked as boolean)}
                                        />
                                        <label htmlFor={feature}>{t(`boardTypes.features.${feature}`)}</label>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex justify-end space-x-2">
                            <Button type="button" variant="outline" onClick={() => navigate('/board-types')}>
                                {t('common.cancel')}
                            </Button>
                            <Button type="submit" disabled={updateBoardType.isPending || createBoardType.isPending}>
                                {updateBoardType.isPending || createBoardType.isPending ? (
                                    <div className="flex items-center gap-2">
                                        <Loader className="text-white" />
                                    </div>
                                ) : id ? (
                                    t('common.update')
                                ) : (
                                    t('common.create')
                                )}
                            </Button>
                        </div>
                    </form>
                )}
            </Card>
        </div>
    );
};

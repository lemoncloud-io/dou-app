import { useEffect, useState } from 'react';
import { FormProvider, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { useQueryClient } from '@tanstack/react-query';

import { useBoardTypes } from '@lemon/board-types';
import { boardsKeys, useBoard, useCreateBoard, useUpdateBoard } from '@lemon/boards';
import { Loader } from '@lemon/shared';
import { Alert, AlertDescription } from '@lemon/ui-kit/components/ui/alert';
import { Button } from '@lemon/ui-kit/components/ui/button';
import { Card } from '@lemon/ui-kit/components/ui/card';
import { Checkbox } from '@lemon/ui-kit/components/ui/checkbox';
import { Input } from '@lemon/ui-kit/components/ui/input';
import { Label } from '@lemon/ui-kit/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@lemon/ui-kit/components/ui/select';
import { toast } from '@lemon/ui-kit/hooks/use-toast';

import { BannerForm } from '../components/forms/BannerForm';
import { BbsForm } from '../components/forms/BbsForm';
import { NoticeForm } from '../components/forms/NoticeForm';
import { QnaForm } from '../components/forms/QnaForm';
import { QuestionForm } from '../components/forms/QuestionForm';

import type { BoardFormData } from '@lemon/boards';
import type { BoardType } from '@lemoncloud/lemon-boards-api/dist/service/backend-types';

export const BoardFormPage = () => {
    const { t } = useTranslation();
    const { id } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [features, setFeatures] = useState<string[]>([]);

    const { data: board, isLoading: isLoadingBoard, error: boardError } = useBoard(id || '');
    const { data: boardTypes } = useBoardTypes({ page: 0, limit: 100 });
    const updateBoard = useUpdateBoard();
    const createBoard = useCreateBoard();

    const methods = useForm<BoardFormData>({
        defaultValues: {
            title: '',
            type: '' as BoardType,
            isHidden: false,
            maxImages: 1,
            maxCommentDepth: 1,
            categories: [],
            sortBy: 'createdAt:desc',
            reasons: [],
            feature$: {},
            useBadage: false,
            badgeColor: '',
            badges: [],
            useMain: false,
            isAnonymous: false,
        },
    });

    const { handleSubmit, register, setValue, watch } = methods;
    const watchBoardType = watch('type');

    useEffect(() => {
        if (!boardTypes?.data) {
            return;
        }

        const selectedType = boardTypes.data.find(type => type.boardType === watchBoardType);
        if (!selectedType) {
            return;
        }

        // Reset form fields when board type changes
        setValue('maxImages', 1);
        setValue('maxCommentDepth', 1);
        setValue('categories', []);
        setValue('reasons', []);
        setValue('feature$', {});
        setValue('useBadage', false);
        setValue('badgeColor', '');
        setValue('badges', []);
        setValue('isAnonymous', false);
        setValue('useMain', false);
        setValue('isHidden', false);

        // Set new values
        setFeatures(selectedType.features);
        setValue('typeId', selectedType.id);

        // Initialize features
        if (board?.feature$ && !id) {
            setValue('feature$', board.feature$);
        } else {
            setValue(
                'feature$',
                selectedType.features.reduce(
                    (acc, feature) => ({
                        ...acc,
                        [feature]: false,
                    }),
                    {}
                )
            );
        }
    }, [watchBoardType, boardTypes?.data, setValue, board, id]);

    useEffect(() => {
        if (board) {
            setValue('title', board.title);
            setValue('type', board.type);
            setValue('isHidden', board.isHidden ?? false);
            setValue('maxImages', board.maxImages);
            setValue('maxCommentDepth', board.maxCommentDepth);
            setValue('categories', board.categories);
            setValue('sortBy', board.sortBy ?? 'createdAt:desc');
            setValue('reasons', board.reasons ?? []);
            setValue('useBadage', board.useBadage ?? false);
            setValue('badgeColor', board.badgeColor ?? '');
            setValue('badges', board.badges ?? []);
            setValue('useMain', board.useMain ?? false);
            setValue('isAnonymous', board.isAnonymous);
            // Set features from board type
            if (board.type$?.features) {
                setFeatures(board.type$.features);
            }
        }
    }, [board, setValue]);

    const onSubmit = async (data: BoardFormData) => {
        const formattedData = {
            ...data,
            maxImages: Number(data.maxImages),
            maxCommentDepth: Number(data.maxCommentDepth),
        };

        if (id) {
            await updateBoard.mutateAsync(
                { boardId: id, ...formattedData },
                {
                    onSuccess: async updated => {
                        await queryClient.invalidateQueries(boardsKeys.invalidateList());
                        queryClient.setQueryData(boardsKeys.detail(updated.id), updated);
                        toast({ description: t('boards.toast.updateSuccess'), duration: 2000 });
                        navigate('/boards');
                    },
                }
            );
            return;
        }

        await createBoard.mutateAsync(formattedData, {
            onSuccess: async newBoard => {
                await queryClient.invalidateQueries(boardsKeys.invalidateList());
                queryClient.setQueryData(boardsKeys.detail(newBoard.id), newBoard);
                toast({ description: t('boards.toast.createSuccess'), duration: 2000 });
                navigate('/boards');
            },
        });
    };

    if (isLoadingBoard) {
        return (
            <div className="h-[400px] flex items-center justify-center">
                <Loader />
            </div>
        );
    }

    if (boardError) {
        return (
            <Alert variant="destructive">
                <AlertDescription>
                    {boardError instanceof Error ? boardError.message : t('boards.error.loadFailed')}
                </AlertDescription>
            </Alert>
        );
    }

    return (
        <div className="container mx-auto py-10">
            <Card className="max-w-3xl mx-auto p-6">
                <h1 className="text-2xl font-bold mb-6">
                    {id ? t('boards.form.editTitle') : t('boards.form.createTitle')}
                </h1>
                <FormProvider {...methods}>
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                        <div className="space-y-2">
                            <Label>{t('boards.form.titleLabel')}</Label>
                            <Input {...register('title', { required: true })} />
                        </div>

                        <div className="space-y-2">
                            <Label>{t('boards.form.typeLabel')}</Label>
                            <Select value={watchBoardType} onValueChange={value => setValue('type', value)}>
                                <SelectTrigger>
                                    <SelectValue placeholder={t('boards.form.typePlaceholder')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {boardTypes?.data.map(type => (
                                        <SelectItem key={type.id} value={type.boardType}>
                                            {type.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {watchBoardType && (
                            <div className="space-y-6 pt-4">
                                {watchBoardType === 'banner' && <BannerForm />}
                                {watchBoardType === 'bbs' && <BbsForm features={features} />}
                                {watchBoardType === 'question' && <QuestionForm />}
                                {watchBoardType === 'notice' && <NoticeForm features={features} />}
                                {watchBoardType === 'qna' && <QnaForm />}
                            </div>
                        )}

                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="isHidden"
                                checked={watch('isHidden')}
                                onCheckedChange={checked => setValue('isHidden', checked)}
                            />
                            <Label htmlFor="isHidden">{t('boards.form.hideLabel')}</Label>
                        </div>

                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="useMain"
                                checked={watch('useMain')}
                                onCheckedChange={checked => setValue('useMain', checked)}
                            />
                            <Label htmlFor="useMain">{t('boards.form.useMainLabel')}</Label>
                        </div>

                        <div className="flex justify-end space-x-2 pt-6">
                            <Button type="button" variant="outline" onClick={() => navigate('/boards')}>
                                {t('common.cancel')}
                            </Button>
                            <Button type="submit" disabled={updateBoard.isLoading || createBoard.isLoading}>
                                {updateBoard.isLoading || createBoard.isLoading ? (
                                    <div className="flex items-center gap-2">
                                        <Loader className="h-4 w-4" />
                                        {id ? t('common.updating') : t('common.creating')}
                                    </div>
                                ) : id ? (
                                    t('common.update')
                                ) : (
                                    t('common.create')
                                )}
                            </Button>
                        </div>
                    </form>
                </FormProvider>
            </Card>
        </div>
    );
};

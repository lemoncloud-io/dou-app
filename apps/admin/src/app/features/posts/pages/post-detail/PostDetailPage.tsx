import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';

import { useQueryClient } from '@tanstack/react-query';

import { useBoard } from '@lemon/boards';
import { usePost, useUpdatePost } from '@lemon/posts';
import { Loader } from '@lemon/shared';
import { Button } from '@lemon/ui-kit/components/ui/button';
import { Card } from '@lemon/ui-kit/components/ui/card';
import { Input } from '@lemon/ui-kit/components/ui/input';
import { Label } from '@lemon/ui-kit/components/ui/label';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@lemon/ui-kit/components/ui/select';
import { Switch } from '@lemon/ui-kit/components/ui/switch';
import { Textarea } from '@lemon/ui-kit/components/ui/textarea';
import { toast } from '@lemon/ui-kit/hooks/use-toast';

import type { PostView } from '@lemoncloud/lemon-boards-api';
export const PostDetailPage = () => {
    const queryClient = useQueryClient();
    const { t } = useTranslation();

    const { id, boardId } = useParams();
    const { data: post, isLoading: isLoadingPost } = usePost(id || '');
    const { data: board, isLoading: isLoadingBoard } = useBoard(boardId || '');
    const { mutateAsync: updatePost, isPending: isUpdating } = useUpdatePost();

    const {
        handleSubmit,
        register,
        reset,
        control,
        formState: { errors },
    } = useForm<PostView>({
        defaultValues: {
            id: '',
            subject: '',
            text: '',
            category: '',
            isHidden: false,
        },
    });

    const onSubmit = (data: PostView) => {
        const postId = data.id;

        const body = { postId, ...data };

        if (!haveCategories) {
            delete body.category;
        }

        updatePost(
            { postId, ...data },
            {
                onSuccess: async updatedPost => {
                    await queryClient.invalidateQueries(boardsKeys.invalidateList());
                    queryClient.setQueryData(boardsKeys.detail(updatedPost.id as string), updatedPost);
                    toast({ description: t('posts.toast.updateSuccess') });
                    navigate(-1);
                },
            }
        );
    };

    const navigate = useNavigate();

    const haveCategories = !!board?.categories && board.categories.length > 0;
    const isLoading = isLoadingBoard || isLoadingPost;

    useEffect(() => {
        if (!post) {
            return;
        }

        reset(post);
    }, [post, reset]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center flex-1 h-full">
                <Loader />
            </div>
        );
    }

    return (
        <div className="container mx-auto py-10">
            <Card className="max-w-2xl mx-auto p-6">
                <h1 className="text-2xl font-bold mb-6">{t('posts.cardTitle.update')}</h1>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <Label>{t('posts.table.id')}</Label>
                        <Input value={post?.id} disabled />
                    </div>
                    <div className="space-y-2">
                        <Label>{t('posts.table.author')}</Label>
                        <Input value={post?.author?.name} disabled />
                    </div>
                    <div className="space-y-2">
                        <Label>{t('posts.table.title')}</Label>
                        <Input
                            {...register('subject', {
                                required: t('posts.requiredMessage.title'),
                            })}
                            placeholder={t('posts.titlePlaceholder')}
                        />
                        {errors.subject && <p className="text-sm text-red-500">{errors.subject.message}</p>}
                    </div>
                    {haveCategories && (
                        <div className="space-y-2">
                            <Label>{t('posts.table.category')}</Label>
                            <Controller
                                name="category"
                                control={control}
                                rules={{ required: t('posts.requiredMessage.category') }}
                                render={({ field }) => (
                                    <Select value={field.value} onValueChange={field.onChange}>
                                        <SelectTrigger className="w-[180px]">
                                            <SelectValue placeholder={t('posts.categoryPlaceholder')} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectGroup>
                                                {board?.categories.map((category, idx) => (
                                                    <SelectItem value={category} key={idx}>
                                                        {category}
                                                    </SelectItem>
                                                ))}
                                            </SelectGroup>
                                        </SelectContent>
                                    </Select>
                                )}
                            />
                            {errors.category && <p className="text-sm text-red-500">{errors.category.message}</p>}
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label>{t('posts.table.text')}</Label>
                        <Textarea
                            className="resize-none h-40"
                            {...register('text', {
                                required: t('posts.requiredMessage.text'),
                            })}
                            placeholder={t('posts.contentPlaceholder')}
                        />
                        {errors.text && <p className="text-sm text-red-500">{errors.text.message}</p>}
                    </div>
                    <Controller
                        name="isHidden"
                        control={control}
                        render={({ field }) => (
                            <div className="flex flex-col gap-y-4  ">
                                <Label>{t('posts.table.hidden')}</Label>
                                <Switch checked={field.value} onCheckedChange={field.onChange} />
                            </div>
                        )}
                    />

                    <div className="flex justify-end space-x-2">
                        <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit" disabled={isUpdating}>
                            {isUpdating ? (
                                <Loader className="text-white" message={t('common.updating')} />
                            ) : (
                                t('common.update')
                            )}
                        </Button>
                    </div>
                </form>
            </Card>
        </div>
    );
};

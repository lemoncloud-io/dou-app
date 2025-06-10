import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { useQueryClient } from '@tanstack/react-query';
import debounce from 'lodash/debounce';
import { PlusCircle } from 'lucide-react';

import { useBoard } from '@lemon/boards';
import { useDeletePost, usePosts } from '@lemon/posts';
import { Loader, useGlobalLoader, usePagination } from '@lemon/shared';
import { Alert, AlertDescription } from '@lemon/ui-kit/components/ui/alert';
import { Button } from '@lemon/ui-kit/components/ui/button';
import { Card, CardHeader, CardTitle } from '@lemon/ui-kit/components/ui/card';
import { Input } from '@lemon/ui-kit/components/ui/input';
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from '@lemon/ui-kit/components/ui/pagination';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@lemon/ui-kit/components/ui/table';
import { toast } from '@lemon/ui-kit/hooks/use-toast';

import { PostItemRow } from '../../components/post-item-row';

import type { PaginationType } from '@lemon/shared';
import type { PostView } from '@lemoncloud/lemon-boards-api';

export const PostListPage = () => {
    const queryClient = useQueryClient();
    const { setIsLoading } = useGlobalLoader();

    const { t } = useTranslation();
    const { boardId } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    const page = parseInt(searchParams.get('page') || '0', 10);
    const title = searchParams.get('title') || '';
    const limit = 10;
    const [searchTerm, setSearchTerm] = useState(title);

    const { data: board, isLoading: isLoadingBoard } = useBoard(boardId || '');

    const queryParams = {
        boardId: boardId || '',
        page,
        limit,
        ...(title && { title }),
    };

    const { data: postsData, isLoading, error, refetch } = usePosts(queryParams);
    const totalCount = postsData?.total || 0;
    const hasNoData = totalCount === 0;

    const { paginationRange } = usePagination({
        totalCount,
        pageSize: limit,
        currentPage: page,
        siblingCount: 1,
    });

    const { mutateAsync: deletePost } = useDeletePost();

    const handlePageChange = (newPage: number) => {
        setSearchParams(prev => {
            prev.set('page', newPage.toString());
            return prev;
        });
    };

    const debouncedSearch = useCallback(
        debounce((value: string) => {
            setSearchParams(prev => {
                if (value) {
                    prev.set('title', value);
                } else {
                    prev.delete('title');
                }
                prev.set('page', '0');
                return prev;
            });
        }, 300),
        []
    );

    const handleSearch = (value: string) => {
        setSearchTerm(value);
        debouncedSearch(value);
    };

    const postRowTapped = (postId: string | undefined) => {
        if (!postId) {
            return;
        }
        navigate(`/boards/${boardId}/posts/${postId}`);
    };

    const postDeleteBtnTapped = (postId: string | undefined) => {
        if (!postId) {
            return;
        }
        // eslint-disable-next-line no-restricted-globals
        const isOkay = confirm(t('posts.deleteConfirmText'));

        if (!isOkay) {
            return;
        }
        setIsLoading(true);

        deletePost(postId, {
            onSuccess: (data: PostView) => {
                queryClient.setQueryData(
                    boardsKeys.list(queryParams),
                    (old: PaginationType<PostView[]> | undefined) => {
                        if (!old) {
                            return {
                                page: 0,
                                total: 0,
                                data: [],
                            };
                        }

                        return {
                            ...old,
                            total: (old.total || 1) - 1,
                            data: old.data.filter(post => post.id !== data.id),
                        };
                    }
                );
                setIsLoading(false);
                toast({ description: t('posts.toast.deleteSuccess') });
            },
            onError: () => {
                setIsLoading(false);
            },
        });
    };

    if (isLoadingBoard || isLoading) {
        return (
            <div className="h-[400px] flex items-center justify-center">
                <Loader />
            </div>
        );
    }

    return (
        <div className="container mx-auto py-10">
            {error && (
                <Alert variant="destructive" className="mb-4">
                    <AlertDescription>
                        {error instanceof Error ? error.message : t('posts.error.loadFailed')}
                    </AlertDescription>
                </Alert>
            )}

            <Card className="mb-4">
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle className="text-2xl font-bold">
                                {board?.title} {t('posts.title')}
                            </CardTitle>
                            <p className="text-sm text-muted-foreground mt-2">{t('posts.description')}</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <Input
                                placeholder={t('posts.searchPlaceholder')}
                                value={searchTerm}
                                onChange={e => handleSearch(e.target.value)}
                                className="w-[200px]"
                            />
                        </div>
                    </div>
                </CardHeader>
            </Card>
            {hasNoData ? (
                <div className="min-h-96 flex items-center justify-center text-gray-600">{t('posts.noData')}</div>
            ) : (
                <Card>
                    <div className="flex p-6 border-b justify-between items-center">
                        <div className="tracking-tight text-base font-medium">
                            {t('posts.totalCount', { count: totalCount })}
                        </div>
                        <Button onClick={() => navigate(`/boards/${boardId}/posts/create`)} className="gap-2">
                            {t('posts.createButton')}
                            <PlusCircle className="h-4 w-4" />
                        </Button>
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted hover:bg-muted">
                                <TableHead className="px-8 py-4 w-[150px] ">{t('posts.table.id')}</TableHead>
                                <TableHead>{t('posts.table.title')}</TableHead>
                                <TableHead className="w-[100px]">{t('posts.table.author')}</TableHead>
                                <TableHead className="w-[100px]">{t('posts.table.category')}</TableHead>
                                <TableHead className="w-[100px]">{t('posts.table.hidden')}</TableHead>
                                <TableHead className="w-[130px]">{t('posts.table.createdAt')}</TableHead>
                                <TableHead className="w-[50px]" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {postsData?.data?.map(post => (
                                <PostItemRow post={post} onClickRow={postRowTapped} onDeleteRow={postDeleteBtnTapped} />
                            ))}
                        </TableBody>
                    </Table>
                </Card>
            )}

            {paginationRange && paginationRange.length > 1 && (
                <Pagination className="mt-4">
                    <PaginationContent>
                        <PaginationItem>
                            <PaginationPrevious onClick={() => handlePageChange(page)} disabled={page === 0} />
                        </PaginationItem>
                        {paginationRange.map((pageNumber, i) => {
                            if (pageNumber === '...') {
                                return (
                                    <PaginationItem key={`ellipsis-${i}`}>
                                        <PaginationEllipsis />
                                    </PaginationItem>
                                );
                            }

                            return (
                                <PaginationItem key={pageNumber}>
                                    <PaginationLink
                                        onClick={() => handlePageChange(Number(pageNumber))}
                                        isActive={page === Number(pageNumber)}
                                    >
                                        {pageNumber}
                                    </PaginationLink>
                                </PaginationItem>
                            );
                        })}
                        <PaginationItem>
                            <PaginationNext
                                onClick={() => handlePageChange(page)}
                                disabled={page >= Math.ceil((postsData?.total || 0) / limit)}
                            />
                        </PaginationItem>
                    </PaginationContent>
                </Pagination>
            )}
        </div>
    );
};

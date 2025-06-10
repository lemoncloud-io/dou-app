import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useQueryClient } from '@tanstack/react-query';
import debounce from 'lodash/debounce';
import { ClipboardX, PlusCircle, RefreshCcw } from 'lucide-react';

import { useBoards } from '@lemon/boards';
import { Loader, usePagination } from '@lemon/shared';
import { Alert, AlertDescription } from '@lemon/ui-kit/components/ui/alert';
import { Badge } from '@lemon/ui-kit/components/ui/badge';
import { Button } from '@lemon/ui-kit/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@lemon/ui-kit/components/ui/card';
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

import i18n from '../../../../i18n';

const BOARD_TYPE_OPTIONS = [
    { label: i18n.t('boardTypes.types.bbs'), value: 'bbs' },
    { label: i18n.t('boardTypes.types.notice'), value: 'notice' },
    { label: i18n.t('boardTypes.types.qna'), value: 'qna' },
    { label: i18n.t('boardTypes.types.question'), value: 'question' },
    { label: i18n.t('boardTypes.types.banner'), value: 'banner' },
    { label: i18n.t('boardTypes.types.review'), value: 'review' },
];

export const BoardListPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const queryClient = useQueryClient();

    const page = parseInt(searchParams.get('page') || '0', 10);
    const name = searchParams.get('name') || '';
    const limit = 10;
    const [searchTerm, setSearchTerm] = useState(name);

    const queryParams = {
        page,
        limit,
        ...(name && { name }),
    };

    const { data: boardsData, isLoading, error, refetch } = useBoards(queryParams);

    const { paginationRange } = usePagination({
        totalCount: boardsData?.total || 0,
        pageSize: limit,
        currentPage: page,
        siblingCount: 1,
    });

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
                    prev.set('name', value);
                } else {
                    prev.delete('name');
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

    const getBoardTypeLabel = (type: string) => {
        return BOARD_TYPE_OPTIONS.find(option => option.value === type)?.label || type;
    };

    return (
        <div className="container mx-auto py-10">
            {error && (
                <Alert variant="destructive" className="mb-4">
                    <AlertDescription>
                        {error instanceof Error ? error.message : t('boards.error.loadFailed')}
                    </AlertDescription>
                </Alert>
            )}

            <Card className="mb-4">
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle className="text-2xl font-bold">{t('boards.title')}</CardTitle>
                            <p className="text-sm text-muted-foreground mt-2">{t('boards.description')}</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <Input
                                placeholder={t('boards.searchPlaceholder')}
                                value={searchTerm}
                                onChange={e => handleSearch(e.target.value)}
                                className="w-[200px]"
                            />
                            <Button onClick={() => navigate('/boards/create')} className="gap-2">
                                <PlusCircle className="h-4 w-4" />
                                {t('boards.createButton')}
                            </Button>
                        </div>
                    </div>
                </CardHeader>
            </Card>

            <Card>
                <CardHeader className="border-b">
                    <CardTitle>
                        <span className="text-sm font-medium">
                            {t('boards.totalCount', { count: boardsData?.total || 0 })}
                        </span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="w-full h-[300px] flex justify-center items-center">
                            <Loader />
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center gap-4 py-8">
                            <p className="text-sm text-destructive text-center">{t('boards.error.loadFailed')}</p>
                            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
                                <RefreshCcw className="h-4 w-4" />
                                {t('common.retry')}
                            </Button>
                        </div>
                    ) : boardsData?.data.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <ClipboardX className="h-12 w-12 text-muted-foreground/50 mb-4" />
                            <p className="text-sm text-muted-foreground">{t('boards.noData')}</p>
                        </div>
                    ) : (
                        <div className="relative">
                            <table className="w-full">
                                <thead className="bg-muted/50">
                                    <tr>
                                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">
                                            {t('boards.table.id')}
                                        </th>
                                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">
                                            {t('boards.table.name')}
                                        </th>
                                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">
                                            {t('boards.table.type')}
                                        </th>
                                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">
                                            {t('boards.table.createdAt')}
                                        </th>
                                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">
                                            {t('boards.table.updatedAt')}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {boardsData?.data.map(board => (
                                        <tr
                                            key={board.id}
                                            onClick={() => navigate(`/boards/${board.id}`)}
                                            className="hover:bg-muted/50 cursor-pointer transition-colors"
                                        >
                                            <td className="p-4 text-sm font-medium">{board.id}</td>
                                            <td className="p-4 text-sm font-medium">{board.title}</td>
                                            <td className="p-4">
                                                <Badge variant="outline">{getBoardTypeLabel(board.type)}</Badge>
                                            </td>
                                            <td className="p-4 text-sm text-muted-foreground">
                                                {new Date(board.createdAt).toLocaleDateString()}
                                            </td>
                                            <td className="p-4 text-sm text-muted-foreground">
                                                {new Date(board.updatedAt).toLocaleDateString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {boardsData?.total !== 0 && (
                <div className="mt-4 flex justify-center">
                    <Pagination>
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious
                                    onClick={() => handlePageChange(page - 1)}
                                    aria-disabled={page <= 0}
                                    tabIndex={page <= 0 ? -1 : undefined}
                                    className={page <= 0 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                                />
                            </PaginationItem>
                            {paginationRange?.map((pageNumber, index) => (
                                <PaginationItem key={index}>
                                    {pageNumber === '...' ? (
                                        <PaginationEllipsis />
                                    ) : (
                                        <PaginationLink
                                            className="cursor-pointer"
                                            onClick={() => handlePageChange(Number(pageNumber))}
                                            isActive={page === Number(pageNumber)}
                                        >
                                            {Number(pageNumber) + 1}
                                        </PaginationLink>
                                    )}
                                </PaginationItem>
                            ))}
                            <PaginationItem>
                                <PaginationNext
                                    onClick={() => handlePageChange(page + 1)}
                                    disabled={page === Math.ceil((boardsData?.total || 0) / limit) - 1}
                                    aria-disabled={page === Math.ceil((boardsData?.total || 0) / limit) - 1}
                                    className={
                                        page === Math.ceil((boardsData?.total || 0) / limit) - 1
                                            ? 'pointer-events-none opacity-50'
                                            : 'cursor-pointer'
                                    }
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </div>
            )}
        </div>
    );
};

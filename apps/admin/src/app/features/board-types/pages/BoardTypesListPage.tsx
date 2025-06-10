import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useQueryClient } from '@tanstack/react-query';
import { ClipboardX, PlusCircle, RefreshCcw } from 'lucide-react';

import { useBoardTypes } from '@lemon/board-types';
import { Loader, useGlobalLoader, usePagination } from '@lemon/shared';
import { Badge } from '@lemon/ui-kit/components/ui/badge';
import { Button } from '@lemon/ui-kit/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@lemon/ui-kit/components/ui/card';
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from '@lemon/ui-kit/components/ui/pagination';

import { BOARD_TYPE_OPTIONS } from './BoardTypeFormPage';

import type { TypeView } from '@lemoncloud/lemon-boards-api';

const getBoardTypeLabel = (value?: string) => {
    if (!value) {
        return '';
    }
    return BOARD_TYPE_OPTIONS.find(option => option.value === value)?.label || value;
};

export const BoardTypesListPage = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { setIsLoading } = useGlobalLoader();
    const [searchParams, setSearchParams] = useSearchParams();
    const queryClient = useQueryClient();

    const page = parseInt(searchParams.get('page') || '0', 10);
    const name = searchParams.get('name') || '';
    const limit = 10;

    const queryParams = {
        page,
        limit,
        ...(name && { name }),
    };

    const { data: boardTypesData, isLoading, error, refetch } = useBoardTypes(queryParams);
    const { paginationRange } = usePagination({
        totalCount: boardTypesData?.total || 0,
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

    const handleBoardTypeClick = (boardTypeId?: string) => {
        if (!boardTypeId) {
            return;
        }
        navigate(`/board-types/${boardTypeId}`);
    };

    return (
        <div className="container mx-auto py-10">
            <Card className="mb-4">
                <CardHeader>
                    <div className="flex justify-between items-center">
                        <div>
                            <CardTitle className="text-2xl font-bold">{t('boardTypes.title')}</CardTitle>
                            <p className="text-sm text-muted-foreground mt-2">{t('boardTypes.description')}</p>
                        </div>
                        <Button onClick={() => navigate('/board-types/create')} className="gap-2">
                            <PlusCircle className="h-4 w-4" />
                            {t('boardTypes.createButton')}
                        </Button>
                    </div>
                </CardHeader>
            </Card>
            <Card>
                <CardHeader className="border-b">
                    <div className="flex justify-between items-center">
                        <CardTitle className="text-base font-medium">
                            {t('boardTypes.totalCount', { count: boardTypesData?.total || 0 })}
                        </CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="w-full h-[300px] flex justify-center items-center">
                            <Loader />
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center gap-4 py-8">
                            <p className="text-sm text-destructive text-center">{t('boardTypes.error.loadFailed')}</p>
                            <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
                                <RefreshCcw className="h-4 w-4" />
                                {t('common.retry')}
                            </Button>
                        </div>
                    ) : boardTypesData?.data.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <ClipboardX className="h-12 w-12 text-muted-foreground/50 mb-4" />
                            <p className="text-sm text-muted-foreground">{t('boardTypes.noData')}</p>
                        </div>
                    ) : (
                        <div className="relative">
                            <table className="w-full">
                                <thead className="bg-muted/50">
                                    <tr>
                                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">
                                            {t('boardTypes.table.id')}
                                        </th>
                                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">
                                            {t('boardTypes.table.name')}
                                        </th>
                                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">
                                            {t('boardTypes.table.type')}
                                        </th>
                                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">
                                            {t('boardTypes.table.features')}
                                        </th>
                                        <th className="text-left p-4 text-sm font-medium text-muted-foreground">
                                            {t('boardTypes.table.createdAt')}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {boardTypesData?.data.map((boardType: TypeView, i) => (
                                        <tr
                                            key={`${boardType.id}_${i}`}
                                            className="hover:bg-muted/50 cursor-pointer transition-colors"
                                            onClick={() => handleBoardTypeClick(boardType.id)}
                                        >
                                            <td className="p-4 text-sm font-mono">{boardType.id}</td>
                                            <td className="p-4 text-sm font-medium">{boardType.name}</td>
                                            <td className="p-4">
                                                <Badge variant="outline" className="font-normal">
                                                    {getBoardTypeLabel(boardType.boardType)}
                                                </Badge>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex flex-wrap gap-1.5">
                                                    {boardType.features?.map(feature => (
                                                        <Badge
                                                            key={feature}
                                                            variant="secondary"
                                                            className="text-xs font-normal"
                                                        >
                                                            {feature}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="p-4 text-sm text-muted-foreground">
                                                {new Date(boardType.createdAt).toLocaleDateString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
            {boardTypesData?.total !== 0 && (
                <Pagination className="py-5">
                    <PaginationContent>
                        <PaginationItem>
                            <PaginationPrevious
                                onClick={() => handlePageChange(page - 1)}
                                aria-disabled={page <= 0}
                                tabIndex={page <= 0 ? -1 : undefined}
                                className={page <= 0 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                            />
                        </PaginationItem>
                        {paginationRange.map((pageNumber, index) => (
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
                                disabled={page === Math.ceil((boardTypesData?.total || 0) / limit) - 1}
                                aria-disabled={page === Math.ceil((boardTypesData?.total || 0) / limit) - 1}
                                className={
                                    page === Math.ceil((boardTypesData?.total || 0) / limit) - 1
                                        ? 'pointer-events-none opacity-50'
                                        : 'cursor-pointer'
                                }
                            />
                        </PaginationItem>
                    </PaginationContent>
                </Pagination>
            )}
        </div>
    );
};

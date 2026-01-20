import { cn } from '@chatic/lib/utils';
import {
    Pagination,
    PaginationContent,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from '@chatic/ui-kit/components/ui/pagination';

interface DevicePaginationProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
}

export const DevicePagination = ({ currentPage, totalPages, onPageChange }: DevicePaginationProps): JSX.Element => {
    const getVisiblePages = (): number[] => {
        const pages: number[] = [];
        const start = Math.max(0, currentPage - 2);
        const end = Math.min(totalPages - 1, currentPage + 2);

        for (let i = start; i <= end; i++) {
            pages.push(i);
        }
        return pages;
    };

    const visiblePages = getVisiblePages();

    return (
        <Pagination className="mt-4">
            <PaginationContent>
                <PaginationItem>
                    <PaginationPrevious
                        onClick={() => onPageChange(currentPage - 1)}
                        className={cn('cursor-pointer', currentPage === 0 && 'pointer-events-none opacity-50')}
                    />
                </PaginationItem>

                {visiblePages.map(pageNum => (
                    <PaginationItem key={pageNum}>
                        <PaginationLink
                            onClick={() => onPageChange(pageNum)}
                            isActive={pageNum === currentPage}
                            className="cursor-pointer"
                        >
                            {pageNum + 1}
                        </PaginationLink>
                    </PaginationItem>
                ))}

                <PaginationItem>
                    <PaginationNext
                        onClick={() => onPageChange(currentPage + 1)}
                        className={cn(
                            'cursor-pointer',
                            currentPage >= totalPages - 1 && 'pointer-events-none opacity-50'
                        )}
                    />
                </PaginationItem>
            </PaginationContent>
        </Pagination>
    );
};

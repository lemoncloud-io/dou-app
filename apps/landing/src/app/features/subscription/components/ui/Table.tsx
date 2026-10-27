import { type HTMLAttributes, type JSX, type TdHTMLAttributes, type ThHTMLAttributes } from 'react';

import { cn } from '../../utils';

/** A plain data table: hairline rows, muted header. Compose with the cells below. */
export const Table = ({ className, ...props }: HTMLAttributes<HTMLTableElement>): JSX.Element => (
    <table className={cn('w-full border-collapse text-sm', className)} {...props} />
);

export const TableHead = (props: HTMLAttributes<HTMLTableSectionElement>): JSX.Element => <thead {...props} />;

export const TableBody = (props: HTMLAttributes<HTMLTableSectionElement>): JSX.Element => <tbody {...props} />;

export const TableRow = ({ className, ...props }: HTMLAttributes<HTMLTableRowElement>): JSX.Element => (
    <tr className={cn('border-b border-border last:border-b-0', className)} {...props} />
);

export const TableHeaderCell = ({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>): JSX.Element => (
    <th className={cn('px-4 py-3 text-left text-xs font-medium text-subtitle', className)} {...props} />
);

export const TableCell = ({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>): JSX.Element => (
    <td className={cn('px-4 py-3.5 text-navy', className)} {...props} />
);

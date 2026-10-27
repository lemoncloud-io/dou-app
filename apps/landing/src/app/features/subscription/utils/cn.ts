import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names, letting a later Tailwind class win over an earlier one for the same property. */
export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));

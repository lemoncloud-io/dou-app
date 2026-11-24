export { formatMoney } from '@chatic/web-checkout';

export const formatDate = (iso: string): string => iso.slice(0, 10).replace(/-/g, '.');

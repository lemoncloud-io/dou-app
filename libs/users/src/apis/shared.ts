import { getCoreEndpoint } from '@chatic/web-core';

export const DOU_ENDPOINT = getCoreEndpoint();

/**
 * A cloud id is the short Lemon id, not a 12-digit AWS account number.
 */
export const isAwsAccountNo = (value: string): boolean => /^\d{12}$/.test(value);

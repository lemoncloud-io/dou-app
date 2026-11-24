export const IN_APP_CHECKOUT_ROUTE = 'checkout';
export const IN_APP_CHECKOUT_PATH = `/subscription/${IN_APP_CHECKOUT_ROUTE}`;

export const checkoutSandbox = (checkout: object): boolean => (checkout as { sandbox?: unknown }).sandbox === true;

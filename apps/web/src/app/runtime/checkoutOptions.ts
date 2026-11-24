export interface CheckoutOption {
    readonly id: string;
    readonly supported: boolean;
}

let options: readonly CheckoutOption[] = [];

export const recordCheckoutOptions = (next: readonly CheckoutOption[]): void => {
    options = next.map(({ id, supported }) => ({ id, supported }));
};

export const readCheckoutOptions = (): readonly CheckoutOption[] => options;

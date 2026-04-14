/**
 * Throws if the API response body contains an error field despite HTTP 200.
 * Some lemoncloud APIs return errors as HTTP 200 + `{ error: "400 INVALID - ..." }`.
 */
export const throwIfApiError = <T>(data: T & { error?: string }): T => {
    if (data.error) throw new Error(data.error);
    return data;
};

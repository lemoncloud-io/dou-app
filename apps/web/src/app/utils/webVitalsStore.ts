/**
 * Latest Web Vitals values, kept in-memory for the debug overlay. Fed by the
 * existing initWebVitals() reporters (which previously only dev-logged them).
 */

export interface VitalSample {
    value: number;
    rating: string;
}

const vitals: Record<string, VitalSample> = {};

export const reportVital = (name: string, value: number, rating: string): void => {
    vitals[name] = { value, rating };
};

export const getVitals = (): Record<string, VitalSample> => ({ ...vitals });

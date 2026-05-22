export interface ISmsService {
    /**
     * Sends an SMS message to one or more phone numbers by opening the device's default SMS app.
     *
     * @param phoneNumbers A single phone number or an array of phone numbers.
     * @param message The prefilled text message.
     * @returns A promise that resolves to `true` if the SMS app was opened successfully, otherwise `false`.
     */
    sendSms(phoneNumbers: string | string[], message: string): Promise<boolean>;
}

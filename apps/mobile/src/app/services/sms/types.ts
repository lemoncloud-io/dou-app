export interface ISmsService {
    sendSms(phoneNumbers: string | string[], message: string): Promise<boolean>;
}

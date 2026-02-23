import { supabase } from '../lib/supabase';

export interface SMSRequest {
    recipient: string;
    message: string;
    companyId?: number;
}

/**
 * Sends an SMS using the Supabase Edge Function 'send-sms'.
 * This bypasses CORS issues and protects the SMS Hub API credentials.
 */
export const sendSMS = async ({ recipient, message, companyId }: SMSRequest) => {
    try {
        console.log('[sendSMS] Invoking Edge Function for:', recipient);

        const { data, error } = await supabase.functions.invoke('send-sms', {
            body: { recipient, message, company_id: companyId },
        });

        if (error) {
            console.error('[sendSMS] Edge Function error:', error);
            throw new Error(`Edge Function error: ${error.message}`);
        }

        console.log('[sendSMS] Success:', data);
        return data;
    } catch (error) {
        console.error('[sendSMS] Critical error:', error);
        throw error;
    }
};

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
        // Normalize recipient: Ensure all non-digits are removed
        let sanitized = recipient.replace(/\D/g, '');

        // Add 244 prefix if it's a standard 9-digit Angola mobile number starting with 9
        if (sanitized.length === 9 && sanitized.startsWith('9')) {
            sanitized = '244' + sanitized;
        }

        console.log('[sendSMS] Invoking Edge Function for:', sanitized);

        const { data, error } = await supabase.functions.invoke('send-sms', {
            body: { recipient: sanitized, message, company_id: companyId },
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

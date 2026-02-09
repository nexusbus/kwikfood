export interface SMSRequest {
    recipient: string;
    message: string;
}

/**
 * Sends an SMS using the SMS Hub Angola API.
 * The credentials and base URL are loaded from environment variables.
 */
export const sendSMS = async ({ recipient, message }: SMSRequest) => {
    const url = import.meta.env.VITE_SMSHUB_BASE_URL;
    const authId = import.meta.env.VITE_SMSHUB_AUTH_ID;
    const secretKey = import.meta.env.VITE_SMSHUB_SECRET_KEY;
    const senderId = import.meta.env.VITE_SMSHUB_SENDER_ID;

    if (!url || !authId || !secretKey) {
        throw new Error('SMS Hub configuration is missing in environment variables.');
    }

    // Parameters based on research of SMS Hub / Conectando LDA patterns
    const params = new URLSearchParams({
        auth_id: authId,
        secret_key: secretKey,
        recipient: recipient, // multiple numbers can be comma-separated
        message: message,
        sender: senderId || 'kwikFood',
    });

    try {
        const fetchUrl = `${url}/sendsms?${params.toString()}`;
        console.log('[sendSMS] Recipient:', recipient);
        console.log('[sendSMS] API Target (masked):', `${url}/sendsms?auth_id=${authId.slice(0, 4)}...&recipient=${recipient}`);

        // Using simple fetch GET request as per likely API pattern
        const response = await fetch(fetchUrl, {
            method: 'GET',
            mode: 'cors',
        });

        console.log('[sendSMS] HTTP Status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[sendSMS] API Error Body:', errorText);
            throw new Error(`SMS Hub API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log('[sendSMS] Success Data:', data);
        return data;
    } catch (error) {
        console.error('[sendSMS] Execution Error:', error);
        throw error;
    }
};

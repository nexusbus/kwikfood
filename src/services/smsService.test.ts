import { sendSMS } from './smsService';

/**
 * Basic test to verify SMSHub integration.
 * In a real environment, this would be part of a proper test suite.
 */
export const testSMSHub = async () => {
    const testNumber = '244900000000'; // Replace with a real number for manual test if needed
    const testMessage = 'KwikFood: Teste de integração SMS Hub Angola';

    console.log('--- SMS Hub Test Start ---');
    try {
        const result = await sendSMS({ recipient: testNumber, message: testMessage });
        console.log('Test Result Success:', result);
        return result;
    } catch (error) {
        console.error('Test Result Failure:', error);
        throw error;
    } finally {
        console.log('--- SMS Hub Test End ---');
    }
};

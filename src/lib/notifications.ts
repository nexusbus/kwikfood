
export const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
        console.warn('Notification API is not available in this browser.');
        return false;
    }

    if (!window.isSecureContext) {
        console.error('Notification API requires a secure context (HTTPS).');
        alert('ERRO DE SEGURANÇA: As notificações só funcionam em sites SEGUROS (HTTPS). Se estiver a usar http://, o browser bloqueia o pedido.');
        return false;
    }

    console.log('Current notification permission:', Notification.permission);

    if (Notification.permission === 'granted') {
        return true;
    }

    if (Notification.permission !== 'denied') {
        try {
            const permission = await Notification.requestPermission();
            console.log('Permission response:', permission);
            return permission === 'granted';
        } catch (error) {
            console.error('Error requesting notification permission:', error);
            return false;
        }
    }

    return false;
};

export const showNotification = (title: string, options?: NotificationOptions) => {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
        new Notification(title, {
            icon: '/favicon.ico', // Adjust icon path if needed
            ...options
        });
    }
};

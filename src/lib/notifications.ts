
export const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
        console.log('Este navegador não suporta notificações desktop');
        return false;
    }

    if (Notification.permission === 'granted') {
        return true;
    }

    if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
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

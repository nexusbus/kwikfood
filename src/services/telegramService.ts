
export const sendTelegramMessage = async (botToken: string, chatId: string, message: string) => {
    if (!botToken || !chatId) {
        console.warn('Telegram Bot Token ou Chat ID não configurado para este estabelecimento.');
        return;
    }

    try {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML'
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Telegram API Error:', errorData);
        }
    } catch (err) {
        console.error('Telegram Fetch Error:', err);
    }
};

export const formatOrderNotification = (order: any, type: 'NEW' | 'STATUS_CHANGE') => {
    const itemsText = order.items?.map((item: any) => `• ${item.quantity}x ${item.name}`).join('\n') || 'Nenhum item';
    const statusEmoji: Record<string, string> = {
        'RECEIVED': '📥',
        'PREPARING': '👨‍🍳',
        'READY': '✅',
        'DELIVERED': '🛵',
        'CANCELLED': '❌'
    };

    const ticketLine = `<b>#${order.ticketCode}</b> - ${order.customerName || 'Cliente'} ${statusEmoji[order.status] || ''}\n`;
    const phoneLine = `📱 Contacto: ${order.customerPhone}\n`;

    if (type === 'NEW') {
        return `${ticketLine}${phoneLine}\n🛒 <b>ITENS DO PEDIDO:</b>\n${itemsText}\n\n💰 Total: ${order.total?.toLocaleString()} Kz`;
    } else {
        const statusText: Record<string, string> = {
            'PREPARING': 'está sendo PREPARADO',
            'READY': 'está PRONTO para levantamento',
            'DELIVERED': 'foi ENTREGUE',
            'CANCELLED': 'foi CANCELADO'
        };
        return `${ticketLine}O pedido ${statusText[order.status] || order.status}.`;
    }
};

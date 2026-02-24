
export const sendTelegramMessage = async (botToken: string, chatId: string, message: string) => {
    if (!botToken || !chatId) {
        console.warn('Telegram Bot Token ou Chat ID não configurado para este estabelecimento.');
        return;
    }

    console.log(`Tentando enviar Telegram para ${chatId}...`);
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

        const resData = await response.json();
        if (!response.ok) {
            console.error('Telegram API Error:', resData);
        } else {
            console.log('Telegram Message Sent Successfully:', resData);
        }
    } catch (err) {
        console.error('Telegram Fetch Error:', err);
    }
};

const escapeHtml = (text: string) => {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

export const formatOrderNotification = (order: any, type: 'NEW' | 'STATUS_CHANGE') => {
    const itemsText = order.items?.map((item: any) => {
        const obs = item.observation ? ` (Obs: ${escapeHtml(item.observation)})` : '';
        return `• ${item.quantity}x ${item.name}${obs}`;
    }).join('\n') || 'Nenhum item';

    const statusEmoji: Record<string, string> = {
        'RECEIVED': '📥',
        'PREPARING': '👨‍🍳',
        'READY': '✅',
        'DELIVERED': '🛵',
        'CANCELLED': '❌'
    };

    const statusText: Record<string, string> = {
        'RECEIVED': 'RECEBIDO',
        'PREPARING': 'em PREPARAÇÃO',
        'READY': 'PRONTO para levantamento',
        'DELIVERED': 'ENTREGUE',
        'CANCELLED': 'CANCELADO'
    };

    const safeName = escapeHtml(order.customerName || 'Cliente');
    const safePhone = order.customerPhone || 'N/A';
    const safeTotal = order.total ? order.total.toLocaleString() : '0';

    const ticketLine = `<b>#${order.ticketCode || '---'}</b> - ${safeName} ${statusEmoji[order.status] || ''}\n`;
    const phoneLine = `📱 Contacto: ${safePhone}\n`;
    const statusLine = `🧾 Estado: <b>${statusText[order.status] || order.status || '---'}</b>\n`;

    const detailsBlock = `\n🛒 <b>ITENS DO PEDIDO:</b>\n${itemsText}\n\n💰 Total: ${safeTotal} Kz`;

    if (type === 'NEW') {
        return `🆕 <b>NOVO PEDIDO</b>\n${ticketLine}${phoneLine}${detailsBlock}`;
    } else {
        return `🔔 <b>ACTUALIZAÇÃO</b>\n${ticketLine}${phoneLine}${statusLine}${detailsBlock}`;
    }
};


import React, { useState, useEffect, useRef } from 'react';
import { Company, Order, OrderStatus, Product, CartItem, OrderType } from '../types';
import { supabase } from '../src/lib/supabase';
import { requestNotificationPermission, showNotification } from '../src/lib/notifications';
import Logo from './Logo';
import { sendTelegramMessage, formatOrderNotification } from '../src/services/telegramService';

interface CustomerTrackingViewProps {
  order: Order;
  onNewOrder: (company?: Company, phone?: string) => void;
}

const CustomerTrackingView: React.FC<CustomerTrackingViewProps> = ({ order: initialOrder, onNewOrder }) => {
  const [order, setOrder] = useState<Order>(initialOrder);
  const [company, setCompany] = useState<Company | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'TPA' | 'TRANSFER' | null>(null);
  const [paymentProofUrl, setPaymentProofUrl] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<1 | 2>(1);
  const [productFilter, setProductFilter] = useState('Todos');
  const categories = ['Todos', 'Hambúrgueres', 'Comida', 'Bebidas', 'Acompanhamentos'];
  const lastStatusRef = useRef<OrderStatus>(initialOrder.status);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const statusMessages: Record<OrderStatus, { title: string; description: string }> = {
    [OrderStatus.PENDING]: {
      title: 'Seja Bem-vindo! 🌟',
      description: 'A sua jornada gastronômica começa aqui. Escolha os seus itens favoritos abaixo.'
    },
    [OrderStatus.RECEIVED]: {
      title: 'Pedido Recebido! ✅',
      description: 'O seu pedido já está no nosso sistema. Aguarde um momento enquanto validamos tudo.'
    },
    [OrderStatus.PREPARING]: {
      title: 'Em Preparo! 🔥',
      description: 'A nossa cozinha já recebeu o seu pedido e estamos a tratar de tudo com prioridade máxima.'
    },
    [OrderStatus.READY]: {
      title: 'Pedido Pronto! 🍔',
      description: 'Estamos aguardando para vires pegar a sua comida! Pode levantar no balcão.'
    },
    [OrderStatus.DELIVERED]: {
      title: 'Bom Apetite! 🍽️',
      description: 'O seu pedido foi entregue com sucesso. Esperamos que goste e volte sempre!'
    },
    [OrderStatus.CANCELLED]: {
      title: 'Pedido Cancelado 😔',
      description: 'Lamentamos imenso, mas o seu pedido teve de ser cancelado. Por favor, contacte-nos para mais detalhes.'
    }
  };

  useEffect(() => {
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    audioRef.current.load();

    const unlockAudio = () => {
      if (audioRef.current) {
        audioRef.current.play().then(() => {
          audioRef.current?.pause();
          audioRef.current!.currentTime = 0;
          window.removeEventListener('click', unlockAudio);
          window.removeEventListener('touchstart', unlockAudio);
        }).catch(() => { });
      }
    };

    window.addEventListener('click', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);

    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  const calculateElapsed = (accumulated: number, lastStarted: string | undefined, status: OrderStatus) => {
    if (status === OrderStatus.READY || status === OrderStatus.DELIVERED || !lastStarted) {
      setElapsedSeconds(accumulated);
    } else {
      const start = new Date(lastStarted).getTime();
      const now = new Date().getTime();
      setElapsedSeconds(accumulated + Math.floor((now - start) / 1000));
    }
  };

  const playNotificationSound = () => {
    if (!audioRef.current) return;
    let count = 0;
    const playNext = () => {
      if (count < 3 && audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(e => console.warn('Audio play failed:', e));
        if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
        count++;
        setTimeout(playNext, 1200);
      }
    };
    playNext();
  };

  const handleRequestPermission = async () => {
    if (!('Notification' in window)) return;
    try {
      const granted = await requestNotificationPermission();
      setNotificationPermission(Notification.permission);
      if (granted) showNotification('Notificações Ativadas! 🔔', { body: 'Você receberá atualizações aqui.' });
    } catch (err) {
      console.error(err);
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const loadData = async () => {
      setLoadingProducts(true);
      try {
        let currentOrder = order;

        // Recovery logic: if no items or default, check localStorage
        if (!currentOrder.items || currentOrder.items.length === 0) {
          const saved = localStorage.getItem('kwikfood_active_order');
          if (saved) {
            const { id } = JSON.parse(saved);
            const { data: recoveredOrder } = await supabase.from('orders').select('*').eq('id', id).single();
            if (recoveredOrder && recoveredOrder.status !== OrderStatus.DELIVERED && recoveredOrder.status !== OrderStatus.CANCELLED) {
              currentOrder = {
                ...recoveredOrder,
                id: recoveredOrder.id,
                companyId: Number(recoveredOrder.company_id),
                customerPhone: recoveredOrder.customer_phone,
                ticketCode: recoveredOrder.ticket_code,
                ticketNumber: recoveredOrder.ticket_number,
                queuePosition: recoveredOrder.queue_position,
                estimatedMinutes: recoveredOrder.estimated_minutes,
                orderType: recoveredOrder.order_type as OrderType,
                items: recoveredOrder.items || [],
                total: recoveredOrder.total || 0,
                timerAccumulatedSeconds: recoveredOrder.timer_accumulated_seconds || 0,
                timerLastStartedAt: recoveredOrder.timer_last_started_at,
                timestamp: recoveredOrder.created_at
              } as Order;
              setOrder(currentOrder);
            }
          }
        }

        const { data: companyData } = await supabase.from('companies').select('*').eq('id', currentOrder.companyId).single();
        if (companyData) {
          setCompany({
            ...companyData,
            logoUrl: companyData.logo_url,
            marketingEnabled: companyData.marketing_enabled,
            isActive: companyData.is_active,
            telegramChatId: companyData.telegram_chat_id,
            telegramBotToken: companyData.telegram_bot_token
          } as Company);
        }

        const { data: productData } = await supabase.from('products').select('*').eq('company_id', currentOrder.companyId);
        if (productData) setProducts(productData.map(p => ({ ...p, imageUrl: p.image_url })));

        const { data: latestOrder } = await supabase
          .from('orders')
          .select('*')
          .eq('id', order.id)
          .single();
        if (latestOrder) {
          setOrder({
            ...order,
            status: latestOrder.status as OrderStatus,
            ticketCode: latestOrder.ticket_code,
            ticketNumber: latestOrder.ticket_number,
            queuePosition: latestOrder.queue_position,
            estimatedMinutes: latestOrder.estimated_minutes,
            timerAccumulatedSeconds: latestOrder.timer_accumulated_seconds || 0,
            timerLastStartedAt: latestOrder.timer_last_started_at,
            paymentMethod: latestOrder.payment_method,
            paymentProofUrl: latestOrder.payment_proof_url,
            items: latestOrder.items,
            total: latestOrder.total,
            timestamp: latestOrder.created_at,
            deliveryAddress: latestOrder.delivery_address,
            deliveryCoords: latestOrder.delivery_coords,
            companyId: latestOrder.company_id // Garantir que temos o ID da empresa para carregar os produtos
          });

          calculateElapsed(latestOrder.timer_accumulated_seconds || 0, latestOrder.timer_last_started_at, latestOrder.status as OrderStatus);

          const { count: posCount } = await supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', order.companyId)
            .in('status', [OrderStatus.RECEIVED, OrderStatus.PREPARING, OrderStatus.READY])
            .lt('created_at', latestOrder.created_at);

          setOrder(prev => ({ ...prev, queuePosition: (posCount || 0) + 1 }));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingProducts(false);
      }
    };

    loadData();

    const channel = supabase
      .channel(`order-${order.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${order.id}` }, (payload) => {
        const updatedOrder = payload.new as any;
        if (!updatedOrder) return;
        const nextStatus = updatedOrder.status as OrderStatus;
        if (nextStatus && nextStatus !== lastStatusRef.current) {
          if ([OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.DELIVERED].includes(nextStatus)) {
            playNotificationSound();
          }
          if (nextStatus === OrderStatus.READY) showNotification('Seu pedido está pronto! 🍔', { body: 'Pode levantar o seu pedido no balcão.' });
          lastStatusRef.current = nextStatus;
        }
        setOrder(prev => ({
          ...prev,
          status: nextStatus || prev.status,
          ticketCode: updatedOrder.ticket_code ?? prev.ticketCode,
          ticketNumber: updatedOrder.ticket_number ?? prev.ticketNumber,
          timerAccumulatedSeconds: updatedOrder.timer_accumulated_seconds ?? prev.timerAccumulatedSeconds,
          timerLastStartedAt: updatedOrder.timer_last_started_at ?? prev.timerLastStartedAt,
          items: updatedOrder.items ?? prev.items,
          total: updatedOrder.total ?? prev.total
        }));
        loadData();
      }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [order.id, order.companyId]);

  useEffect(() => {
    let interval: any;
    if (order.status !== OrderStatus.READY && order.status !== OrderStatus.DELIVERED && order.timerLastStartedAt) {
      interval = setInterval(() => {
        calculateElapsed(order.timerAccumulatedSeconds, order.timerLastStartedAt, order.status);
      }, 1000);
    } else {
      setElapsedSeconds(order.timerAccumulatedSeconds);
    }
    return () => clearInterval(interval);
  }, [order.status, order.timerAccumulatedSeconds, order.timerLastStartedAt]);

  const addToCart = (p: Product) => {
    if (paymentMethod) return; // Bloquear se houver pagamento selecionado
    setCart(prev => {
      const existing = prev.find(item => item.id === p.id);
      if (existing) return prev.map(item => item.id === p.id ? { ...item, quantity: item.quantity + 1 } : item);
      return [...prev, { ...p, observation: '', quantity: 1 }];
    });
  };

  const removeFromCart = (pId: string) => {
    if (paymentMethod) return; // Bloquear se houver pagamento selecionado
    setCart(prev => {
      const existing = prev.find(item => item.id === pId);
      if (existing && existing.quantity > 1) return prev.map(item => item.id === pId ? { ...item, quantity: item.quantity - 1 } : item);
      return prev.filter(item => item.id !== pId);
    });
  };

  const updateObservation = (idx: number, text: string) => {
    const newCart = [...cart];
    newCart[idx].observation = text;
    setCart(newCart);
  };

  const handleUploadProof = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      alert('Por favor, carregue apenas ficheiros PDF.');
      return;
    }

    setUploadingProof(true);
    try {
      const fileName = `${order.id}-${Date.now()}.pdf`;
      const filePath = `proofs/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('order-proofs')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('order-proofs')
        .getPublicUrl(filePath);

      setPaymentProofUrl(data.publicUrl);
    } catch (err: any) {
      alert(`Erro ao carregar comprovativo: ${err.message}`);
    } finally {
      setUploadingProof(false);
    }
  };

  const handleFinishOrder = async () => {
    if (cart.length === 0) return;
    setSubmittingOrder(true);
    try {
      const total = cart.reduce((acc, p) => acc + (p.price * p.quantity), 0);
      const { error } = await supabase.from('orders').update({
        items: cart,
        total: total,
        status: OrderStatus.RECEIVED,
        payment_method: paymentMethod,
        payment_proof_url: paymentProofUrl
      }).eq('id', order.id);
      if (error) throw error;

      // Telegram Notification
      if (company?.telegramChatId && company?.telegramBotToken) {
        const updatedOrder = {
          ...order,
          items: cart,
          total: total,
          status: OrderStatus.RECEIVED,
          paymentMethod: paymentMethod
        };
        const message = formatOrderNotification(updatedOrder, 'NEW');
        sendTelegramMessage(company.telegramBotToken, company.telegramChatId, message);
      }

      setCart([]);
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      // Scroll to top more robustly with a slight delay for mobile layout shifts
      setTimeout(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }, 150);
    } catch (err) {
      alert('Erro ao confirmar pedido.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!confirm('Tem a certeza que deseja cancelar a sua entrada na fila?')) return;
    setSubmittingOrder(true);
    try {
      const { error } = await supabase.from('orders').update({ status: OrderStatus.CANCELLED, cancelled_by: 'customer' }).eq('id', order.id);
      if (error) throw error;

      // Telegram Notification for cancellation
      if (company?.telegramChatId && company?.telegramBotToken) {
        const cancelledOrder = { ...order, status: OrderStatus.CANCELLED };
        const message = formatOrderNotification(cancelledOrder, 'STATUS_CHANGE');
        sendTelegramMessage(company.telegramBotToken, company.telegramChatId, message);
      }

      onNewOrder();
    } catch (err) {
      alert('Erro ao cancelar entrada.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleTestNotification = () => {
    playNotificationSound();
    showNotification('Teste de Alerta 🧪', {
      body: 'Este é um teste para confirmar que os seus alertas estão funcionando.',
      tag: 'test-notification'
    });
  };

  const totalCart = cart.reduce((acc, p) => acc + (p.price * p.quantity), 0);

  return (
    <div className="min-h-screen bg-[#FDFCFD] flex flex-col font-sans selection:bg-primary/10 overflow-x-hidden">
      {/* Header */}
      <header className="w-full max-w-5xl mx-auto px-6 py-6 flex justify-between items-center bg-white sticky top-0 z-[100] border-b border-[#F5F5F5]">
        <div className="flex items-center gap-3">
          <Logo variant="icon" size={32} />
          <span className="text-xl font-black tracking-tight text-[#111111]">KwikFood</span>
        </div>
        <div className="bg-red-50 text-primary px-5 py-2 rounded-2xl font-black text-[13px] tracking-widest shadow-sm">
          #{order.ticketCode}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-[480px] mx-auto px-6 py-10 space-y-10">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-black text-[#111111] tracking-tight animate-fade-in leading-tight">
            {statusMessages[order.status]?.title || 'A carregar...'}
          </h1>
          <p className="text-[#555555] font-medium text-[15px] animate-fade-in leading-relaxed">
            {statusMessages[order.status]?.description || 'Por favor, aguarde um momento.'}
          </p>
        </div>

        {/* Status Dashboard */}
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-6 rounded-[2.5rem] shadow-[0_5px_25px_-5px_rgba(0,0,0,0.04)] border border-[#F5F5F5] flex flex-col items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-xl">sync</span>
                <span className="text-[10px] font-black text-[#BBBBBB] uppercase tracking-widest">Status</span>
              </div>
              <p className="text-lg font-black text-[#111111]">
                {order.status === OrderStatus.PENDING ? 'Entrando' :
                  order.status === OrderStatus.RECEIVED ? 'Pendente' :
                    order.status === OrderStatus.PREPARING ? 'Preparando' :
                      order.status === OrderStatus.READY ? 'Pronto!' : 'Entregue'}
              </p>
            </div>
            <div className="bg-white p-6 rounded-[2.5rem] shadow-[0_5px_25px_-5px_rgba(0,0,0,0.04)] border border-[#F5F5F5] flex flex-col items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-xl">list_alt</span>
                <span className="text-[10px] font-black text-[#BBBBBB] uppercase tracking-widest">Posição</span>
              </div>
              <p className="text-lg font-black text-[#111111] font-sans">
                {order.status === OrderStatus.DELIVERED ? 'N/A' : `${order.queuePosition}º`}
              </p>
            </div>
          </div>

          {/* Timer Card */}
          <div className="bg-secondary p-8 rounded-[2.5rem] shadow-[0_20px_50px_-15px_rgba(0,0,0,0.15)] relative overflow-hidden group">
            <div className="absolute top-1/2 right-0 -translate-y-1/2 opacity-10 translate-x-1/4 group-hover:scale-110 transition-transform duration-[2s]">
              <span className="material-symbols-outlined text-[180px] text-white select-none">timer</span>
            </div>
            <div className="relative z-10 space-y-2">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-white text-xl">schedule</span>
                <span className="text-[11px] font-black text-white/50 uppercase tracking-widest">Tempo Decorrido</span>
              </div>
              <p className="text-5xl font-black text-white tabular-nums tracking-tight">{formatTime(elapsedSeconds)}</p>
            </div>
          </div>
        </div>

        {/* Info Blocks */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/50 p-4 rounded-3xl border border-[#F5F5F5] flex items-center gap-4">
            <div className="size-10 bg-red-50 rounded-2xl flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary text-xl">store</span>
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-black text-[#BBBBBB] uppercase tracking-widest mb-0.5">Local</p>
              <p className="text-[11px] font-black text-[#111111] truncate">{company?.name || 'Carregando...'}</p>
            </div>
          </div>
          <div className="bg-white/50 p-4 rounded-3xl border border-[#F5F5F5] flex items-center gap-4">
            <div className="size-10 bg-red-50 rounded-2xl flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-primary text-xl">call</span>
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-black text-[#BBBBBB] uppercase tracking-widest mb-0.5">Contacto</p>
              <p className="text-[11px] font-black text-[#111111] truncate">{order.customerPhone}</p>
            </div>
          </div>
        </div>

        {/* Shopping Section - Allow adding products in PENDING OR RECEIVED status */}
        {(order.status === OrderStatus.PENDING || order.status === OrderStatus.RECEIVED) && (
          <>
            <div className="space-y-8">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-black text-[#111111] tracking-tight">O que deseja comprar?</h2>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-xl text-[10px] font-black text-secondary/60 uppercase tracking-widest">
                    <span className="material-symbols-outlined text-sm">filter_list</span>
                    Filtrar
                  </div>
                </div>

                {/* Categories Filter Bar */}
                <div className="flex gap-3 overflow-x-auto pb-4 no-scrollbar -mx-6 px-6">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setProductFilter(cat)}
                      className={`px-6 py-3 rounded-2xl whitespace-nowrap text-[11px] font-black uppercase tracking-widest transition-all ${productFilter === cat ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-white border border-[#EEEEEE] text-[#BBBBBB] hover:border-primary/20 hover:text-primary'}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                {products
                  .filter(p => productFilter === 'Todos' || p.category === productFilter)
                  .map(p => (
                    <div key={p.id} className="bg-white p-4 rounded-[2rem] shadow-[0_5px_25px_-5px_rgba(0,0,0,0.04)] border border-[#F8F9FA] flex items-center gap-4 group hover:border-primary/20 transition-all">
                      <div className="size-20 rounded-2xl overflow-hidden bg-[#F8F9FA] shrink-0">
                        <img src={p.imageUrl} alt={p.name} className="size-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-black text-[#111111] leading-snug mb-1">{p.name}</h3>
                        <p className="text-primary font-black text-base">Kz {p.price.toLocaleString()}</p>
                      </div>
                      <button
                        onClick={() => addToCart(p)}
                        disabled={checkoutStep === 2}
                        className={`size-12 rounded-2xl shadow-lg transition-all flex items-center justify-center ${checkoutStep === 2 ? 'bg-[#EEEEEE] text-[#BBBBBB] cursor-not-allowed' : 'bg-primary text-white shadow-primary/20 hover:bg-primary/90 active:scale-95'}`}
                      >
                        <span className="material-symbols-outlined text-2xl">add</span>
                      </button>
                    </div>
                  ))}

                {products.filter(p => productFilter === 'Todos' || p.category === productFilter).length === 0 && (
                  <div className="py-12 text-center bg-white rounded-[2rem] border-2 border-dashed border-slate-100">
                    <span className="material-symbols-outlined text-4xl text-slate-200 mb-3">inventory_2</span>
                    <p className="text-[11px] font-black text-[#BBBBBB] uppercase tracking-widest">Nenhum produto nesta categoria</p>
                  </div>
                )}
              </div>
            </div>

            {/* Cart Section */}
            {cart.length > 0 && (
              <div className="bg-white rounded-[2.5rem] shadow-[0_20px_50px_-15px_rgba(0,0,0,0.08)] border border-[#F5F5F5] p-8 space-y-8 animate-slide-up">
                <div className="flex items-center justify-between border-b border-[#F5F5F5] pb-6">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className="size-14 bg-secondary rounded-[1.25rem] flex items-center justify-center text-white">
                        <span className="material-symbols-outlined text-2xl">shopping_bag</span>
                      </div>
                      <span className="absolute -top-2 -right-2 size-6 bg-primary text-white text-[10px] font-black rounded-lg flex items-center justify-center ring-4 ring-white">
                        {cart.reduce((acc, item) => acc + item.quantity, 0)}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-xl font-black text-[#111111] tracking-tight">O Meu Pedido</h3>
                      <p className="text-[10px] font-black text-primary uppercase tracking-widest mt-1">Total: Kz {totalCart.toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {/* Items List */}
                <div className="space-y-4">
                  {cart.map((item, idx) => (
                    <div key={`${item.id}-${idx}`} className="bg-[#FDFCFD] rounded-3xl border border-[#F5F5F5] p-5 space-y-4">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center bg-white rounded-[1rem] p-1 border border-[#F5F5F5]">
                            <button
                              onClick={() => removeFromCart(item.id)}
                              disabled={paymentMethod !== null}
                              className={`size-8 rounded-lg flex items-center justify-center transition-colors ${paymentMethod ? 'text-[#EEEEEE] cursor-not-allowed' : 'text-[#BBBBBB] hover:text-primary'}`}
                            >
                              <span className="material-symbols-outlined text-lg">remove</span>
                            </button>
                            <span className="w-8 text-center font-black text-[#111111] text-sm">{item.quantity}</span>
                            <button
                              onClick={() => addToCart(item)}
                              disabled={paymentMethod !== null}
                              className={`size-8 rounded-lg flex items-center justify-center transition-all ${paymentMethod !== null ? 'text-[#EEEEEE] cursor-not-allowed' : 'text-[#BBBBBB] hover:text-primary'}`}
                              title={paymentMethod !== null ? 'Aumento desativado após selecionar pagamento' : ''}
                            >
                              <span className="material-symbols-outlined text-lg">add</span>
                            </button>
                          </div>
                          <span className="font-black text-sm text-[#111111]">{item.name}</span>
                        </div>
                        <button
                          onClick={() => setCart(cart.filter((_, i) => i !== idx))}
                          disabled={paymentMethod !== null}
                          className={`transition-colors ${paymentMethod ? 'text-[#EEEEEE] cursor-not-allowed' : 'text-[#BBBBBB] hover:text-primary'}`}
                        >
                          <span className="material-symbols-outlined text-xl">close</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder="Restrições or observações?"
                        value={item.observation}
                        onChange={(e) => updateObservation(idx, e.target.value)}
                        className="w-full bg-white border border-[#F5F5F5] rounded-xl px-4 py-3 text-xs font-bold focus:border-primary outline-none transition-all placeholder:text-[#BBBBBB]/60"
                      />
                    </div>
                  ))}
                </div>

                <div className="h-[1px] bg-[#F5F5F5] w-full"></div>

                {checkoutStep === 1 ? (
                  <button
                    onClick={() => {
                      setCheckoutStep(2);
                      const el = document.getElementById('checkout-target');
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="w-full h-16 bg-secondary text-white rounded-2xl font-black text-[13px] uppercase tracking-widest shadow-lg hover:bg-secondary/95 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    AVANÇAR PARA PAGAMENTO
                    <span className="material-symbols-outlined text-lg">arrow_forward</span>
                  </button>
                ) : (
                  <>
                    <div id="checkout-target" className="space-y-6 scroll-mt-24">
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <p className="text-[10px] font-black text-secondary uppercase tracking-[0.2em] ml-1">Método de Pagamento</p>
                          <button onClick={() => setCheckoutStep(1)} className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Voltar e Editar</button>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { id: 'CASH', label: 'CASH', icon: 'payments' },
                            { id: 'TPA', label: 'TPA', icon: 'credit_card' },
                            { id: 'TRANSFER', label: 'TRANSFER', icon: 'account_balance' }
                          ].map((m) => (
                            <button
                              key={m.id}
                              onClick={() => setPaymentMethod(prev => prev === m.id ? null : m.id as any)}
                              className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${paymentMethod === m.id ? 'border-primary bg-red-50 text-primary' : 'border-[#F5F5F5] hover:border-primary/20 text-[#BBBBBB]'}`}
                            >
                              <span className="material-symbols-outlined text-2xl">{m.icon}</span>
                              <span className="text-[10px] font-black">{m.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {paymentMethod === 'TRANSFER' && (
                        <div className="space-y-6 animate-fade-in mb-4">
                          {/* Dados Bancários do Parceiro */}
                          {(company?.iban || company?.expressNumber || company?.kwikNumber) && (
                            <div className="bg-slate-900 rounded-[2rem] p-8 space-y-4 shadow-xl">
                              <p className="text-[10px] font-black text-primary uppercase tracking-[0.3em] font-sans">Dados Bancários para Pagamento</p>

                              {company.iban && (
                                <div className="space-y-1">
                                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">IBAN de Recebimento</p>
                                  <p className="text-white font-black text-sm tracking-tight break-all font-mono bg-white/5 p-3 rounded-lg border border-white/10">{company.iban}</p>
                                </div>
                              )}

                              <div className="grid grid-cols-2 gap-4">
                                {company.expressNumber && (
                                  <div className="space-y-1">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Número Express</p>
                                    <p className="text-white font-black text-sm tracking-tight font-mono bg-white/5 p-3 rounded-lg border border-white/10">{company.expressNumber}</p>
                                  </div>
                                )}
                                {company.kwikNumber && (
                                  <div className="space-y-1">
                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Número Kwik</p>
                                    <p className="text-white font-black text-sm tracking-tight font-mono bg-white/5 p-3 rounded-lg border border-white/10">{company.kwikNumber}</p>
                                  </div>
                                )}
                              </div>
                              <p className="text-[9px] font-bold text-slate-400 mt-2 italic">* Após a transferência, carregue o comprovativo PDF abaixo.</p>
                            </div>
                          )}

                          <div className="space-y-3">
                            <p className="text-[10px] font-black text-secondary uppercase tracking-[0.2em] ml-1">Comprovativo Transferência (PDF)</p>
                            <div className="relative">
                              <input
                                type="file"
                                accept=".pdf"
                                onChange={handleUploadProof}
                                className="hidden"
                                id="proof-upload"
                                disabled={uploadingProof}
                              />
                              <label
                                htmlFor="proof-upload"
                                className={`w-full h-16 border-2 border-dashed rounded-2xl flex items-center justify-center gap-3 cursor-pointer transition-all ${paymentProofUrl ? 'border-green-500 bg-green-50 text-green-600' : 'border-[#E0E0E0] hover:border-primary/50 text-[#BBBBBB]'}`}
                              >
                                {uploadingProof ? (
                                  <div className="size-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                                ) : paymentProofUrl ? (
                                  <>
                                    <span className="material-symbols-outlined">check_circle</span>
                                    <span className="text-[11px] font-black uppercase tracking-widest">PDF CARREGADO</span>
                                  </>
                                ) : (
                                  <>
                                    <span className="material-symbols-outlined">upload_file</span>
                                    <span className="text-[11px] font-black uppercase tracking-widest">CARREGAR PDF</span>
                                  </>
                                )}
                              </label>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={handleFinishOrder}
                      disabled={submittingOrder || !paymentMethod || (paymentMethod === 'TRANSFER' && !paymentProofUrl)}
                      className="w-full h-16 bg-primary hover:bg-primary/95 text-white rounded-2xl font-black text-[13px] uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submittingOrder ? (
                        <div className="size-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-lg">check_circle</span>
                          CONFIRMAR PEDIDO
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* Existing Order Detail if items present */}
        {(order.status !== OrderStatus.PENDING && order.items && order.items.length > 0) && (
          <div className="bg-white rounded-[2.5rem] shadow-[0_20px_50px_-15px_rgba(0,0,0,0.08)] border border-[#F5F5F5] p-8 space-y-8 animate-fade-in">
            <div className="flex items-center gap-4 border-b border-[#F5F5F5] pb-6">
              <div className="size-14 bg-red-50 rounded-[1.25rem] flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-2xl">receipt_long</span>
              </div>
              <div>
                <h3 className="text-xl font-black text-[#111111] tracking-tight">Detalhes do Pedido</h3>
                <p className="text-[10px] font-black text-[#BBBBBB] uppercase tracking-widest mt-1">Pendente</p>
              </div>
            </div>
            <div className="space-y-4">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between items-center py-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-black text-primary bg-red-50 px-2 py-1 rounded-lg">{item.quantity}x</span>
                    <span className="font-bold text-sm text-[#111111]">{item.name}</span>
                  </div>
                  <span className="font-black text-sm text-secondary">Kz {(item.price * item.quantity).toLocaleString()}</span>
                </div>
              ))}
              <div className="pt-4 mt-4 border-t border-[#F5F5F5] flex justify-between items-center">
                <span className="text-[11px] font-black text-[#BBBBBB] uppercase tracking-widest">Total do Pedido</span>
                <span className="text-2xl font-black text-primary tracking-tighter">Kz {order.total?.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* SMS Notification Banner */}
        <div className="bg-red-50/50 p-8 rounded-[2.5rem] flex items-start gap-5 border border-red-100/30">
          <div className="size-10 bg-primary rounded-full flex items-center justify-center shrink-0 shadow-lg shadow-primary/20">
            <span className="material-symbols-outlined text-white text-base">info</span>
          </div>
          <p className="text-[#555555] text-sm font-medium leading-relaxed pt-1">
            Iremos enviar-lhe uma notificação via SMS assim que o seu pedido estiver quase pronto.
          </p>
        </div>

        {/* Footer Actions */}
        <div className="space-y-8 pt-6">
          {(order.status === OrderStatus.PENDING || order.status === OrderStatus.RECEIVED) && (
            <button
              onClick={handleCancelOrder}
              disabled={submittingOrder}
              className="w-full h-16 border-2 border-[#F5F5F5] text-[#BBBBBB] hover:border-red-500 hover:text-red-500 rounded-[1.5rem] font-black text-xs uppercase tracking-widest transition-all shadow-sm active:scale-95 disabled:opacity-50"
            >
              CANCELAR ENTRADA
            </button>
          )}

          {order.status === OrderStatus.DELIVERED && (
            <button
              onClick={() => {
                localStorage.removeItem('kwikfood_active_order');
                onNewOrder(company || undefined, order.customerPhone);
              }}
              className="w-full h-16 bg-primary text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-lg">add_circle</span>
              FAZER UM NOVO PEDIDO
            </button>
          )}

          {/* Botão Encerrar Sessão sempre visível */}
          <button
            onClick={() => {
              if (order.status !== OrderStatus.DELIVERED && order.status !== OrderStatus.CANCELLED) {
                if (!confirm('Você tem um pedido ativo em andamento. Deseja realmente encerrar a sessão e sair da fila?')) return;
              }
              localStorage.removeItem('kwikfood_active_order');
              onNewOrder();
            }}
            className="w-full h-10 flex items-center justify-center gap-2 text-[#E31B44] hover:opacity-80 transition-all font-black text-[13px]"
          >
            <span className="material-symbols-outlined text-lg">logout</span>
            Encerrar Sessão
          </button>
        </div>

        <div className="text-center space-y-2 pt-10">
          <p className="text-[10px] font-black text-primary/30 uppercase tracking-[0.4em]">PREMIUM QUEUE SYSTEM</p>
          <p className="text-[10px] text-[#BBBBBB] font-black uppercase tracking-widest">
            © {new Date().getFullYear()} <span className="text-[#E31B44]">KwikFood Angola</span>.<br />
            Todos os direitos reservados.
          </p>
        </div>
      </main>

      {/* Floating Notification Button (Discreet) */}
      <div className="fixed bottom-8 left-8 z-[150] flex flex-col gap-3">
        {notificationPermission !== 'granted' ? (
          <button
            onClick={handleRequestPermission}
            className="size-14 bg-white border border-[#F5F5F5] text-primary rounded-2xl shadow-premium hover:shadow-2xl transition-all flex items-center justify-center animate-bounce-soft"
            title="Ativar Notificações"
          >
            <span className="material-symbols-outlined text-2xl">notifications_active</span>
          </button>
        ) : (
          <button
            onClick={handleTestNotification}
            className="size-14 bg-white/80 backdrop-blur-md border border-[#F5F5F5] text-secondary rounded-2xl shadow-premium hover:shadow-2xl transition-all flex items-center justify-center"
            title="Testar Alerta"
          >
            <span className="material-symbols-outlined text-2xl">vibration</span>
          </button>
        )}
      </div>
    </div >
  );
};

export default CustomerTrackingView;

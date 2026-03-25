
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
  const [categories, setCategories] = useState<any[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [serverTimeOffset, setServerTimeOffset] = useState<number>(0);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'TPA' | 'TRANSFER' | null>(null);
  const [paymentProofUrl, setPaymentProofUrl] = useState<string | null>(null);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<1 | 2>(1);
  const [productFilter, setProductFilter] = useState('Todos');
  const [activeCategoryIndex, setActiveCategoryIndex] = useState(0);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const categoryOptions = ['Todos', ...categories.map(c => c.name)];
  const lastStatusRef = useRef<OrderStatus>(initialOrder.status);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const getStatusMessage = (status: OrderStatus) => {
    const isDelivery = order.orderType === OrderType.DELIVERY;

    const messages: Record<OrderStatus, { title: string; description: string }> = {
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
        title: isDelivery ? 'A Caminho! 🛵' : 'Pedido Pronto! 🍔',
        description: isDelivery
          ? 'O seu pedido já saiu para entrega. Prepare a mesa, estamos a chegar!'
          : 'Estamos aguardando para vires pegar a sua comida! Pode levantar no balcão.'
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
    return messages[status] || { title: 'A carregar...', description: 'Por favor, aguarde.' };
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

  const getDynamicElapsed = () => {
    const accumulated = order.timerAccumulatedSeconds || 0;
    if (order.status !== OrderStatus.PREPARING || !order.timerLastStartedAt) {
      return accumulated;
    }
    const start = new Date(order.timerLastStartedAt).getTime();
    const current = now.getTime() + serverTimeOffset;
    const elapsed = accumulated + Math.floor((current - start) / 1000);
    return elapsed > 0 ? elapsed : 0;
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
        // First, handle company and products which don't depend on live order state
        const { data: initialOrderData } = await supabase.from('orders').select('company_id').eq('id', order.id).single();
        const effectiveCompanyId = initialOrderData?.company_id || order.companyId;

        if (effectiveCompanyId) {
          const { data: companyData } = await supabase.from('companies').select('*').eq('id', effectiveCompanyId).single();
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

          const { data: productData } = await supabase.from('products').select('*').eq('company_id', effectiveCompanyId).eq('status', 'ACTIVE');
          if (productData) setProducts(productData.map(p => ({ ...p, imageUrl: p.image_url, details: p.details })));

          const { data: catData } = await supabase.from('categories').select('*').eq('company_id', effectiveCompanyId).order('sort_order');
          if (catData) setCategories(catData);
        }

        // Now load/sync the order data using functional updates to avoid stale closures
        const { data: latestOrder } = await supabase.from('orders').select('*').eq('id', order.id).single();

        if (latestOrder) {
          const { count: posCount } = await supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', latestOrder.company_id)
            .in('status', [OrderStatus.RECEIVED, OrderStatus.PREPARING, OrderStatus.READY])
            .lt('created_at', latestOrder.created_at);

          setOrder(prev => ({
            ...prev,
            status: latestOrder.status as OrderStatus,
            ticketCode: latestOrder.ticket_code,
            ticketNumber: latestOrder.ticket_number,
            queuePosition: (posCount || 0) + 1,
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
            companyId: latestOrder.company_id,
            orderType: latestOrder.order_type as OrderType // Crucial: was missing
          }));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingProducts(false);
      }
    };

    loadData();

    const channel = supabase
      .channel(`order-live-${order.id}`) // Distinguir canal
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${order.id}` }, (payload) => {
        const updatedOrder = (payload.new || payload.old) as any;
        if (!updatedOrder) return;

        // Trigger redundancy load
        loadData();

        const nextStatus = updatedOrder.status as OrderStatus;

        // Force notification logic
        if (nextStatus && nextStatus !== lastStatusRef.current) {
          if ([OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.DELIVERED].includes(nextStatus)) {
            playNotificationSound();
          }
          if (nextStatus === OrderStatus.READY) {
            setOrder(current => {
              const isDelivery = current.orderType === OrderType.DELIVERY;
              showNotification(isDelivery ? 'Seu pedido está a caminho! 🛵' : 'Seu pedido está pronto! 🍔', {
                body: isDelivery ? 'Prepare-se para receber a sua refeição.' : 'Pode levantar o seu pedido no balcão.'
              });
              return current;
            });
          }
          lastStatusRef.current = nextStatus;
        }

        // Apply fields to state (Instant update)
        setOrder(prev => {
          const newStatus = nextStatus || prev.status;
          const isFinished = [OrderStatus.READY, OrderStatus.DELIVERED, OrderStatus.CANCELLED].includes(newStatus);

          return {
            ...prev,
            status: newStatus,
            timerLastStartedAt: isFinished ? null : (updatedOrder.timer_last_started_at !== undefined ? updatedOrder.timer_last_started_at : prev.timerLastStartedAt),
            orderType: updatedOrder.order_type !== undefined ? updatedOrder.order_type : prev.orderType,
            queuePosition: updatedOrder.queue_position !== undefined ? updatedOrder.queue_position : prev.queuePosition
          };
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `company_id=eq.${order.companyId}` }, () => {
        loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: `company_id=eq.${order.companyId}` }, () => {
        loadData();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [order.id]);

  useEffect(() => {
    setElapsedSeconds(getDynamicElapsed());
  }, [now, order.status, order.timerAccumulatedSeconds, order.timerLastStartedAt]);

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
  const categoriesToDisplay = categories.filter(c => products.some(p => p.category === c.name));

  const scrollToCategory = (index: number) => {
    if (scrollRef.current) {
      const scrollAmount = index * scrollRef.current.offsetWidth;
      scrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
      setActiveCategoryIndex(index);
    }
  };

  const onScroll = () => {
    if (scrollRef.current) {
      const index = Math.round(scrollRef.current.scrollLeft / scrollRef.current.offsetWidth);
      if (index !== activeCategoryIndex) setActiveCategoryIndex(index);
    }
  };

  const toggleCategoryExpansion = (catName: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(catName)) next.delete(catName);
      else next.add(catName);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 bg-[#FDFCFD] flex flex-col font-sans selection:bg-primary/10 overflow-hidden z-[60]">
      {/* Header */}
      <header className="flex-shrink-0 w-full px-6 py-6 flex justify-between items-center bg-white border-b border-[#F5F5F5] z-[70]">
        <div className="flex items-center gap-3">
          <Logo variant="icon" size={32} />
          <span className="text-xl font-black tracking-tight text-[#111111]">KwikFood</span>
        </div>
        <div className="bg-red-50 text-primary px-5 py-2 rounded-2xl font-black text-[13px] tracking-widest shadow-sm">
          #{order.ticketCode}
        </div>
      </header>

      {/* Main Content - Fixed Height Flex Container */}
      <main className="flex-1 flex flex-col overflow-hidden w-full max-w-5xl mx-auto min-h-0">
        
        {/* Top Scrollable Info Area (Status & Timer) */}
        <div className="flex-shrink-0 overflow-y-auto max-h-[35vh] px-6 py-4 space-y-6 custom-scrollbar bg-white/30">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-black text-[#111111] tracking-tight leading-tight">
              {getStatusMessage(order.status).title}
            </h1>
            <p className="text-[#888888] font-medium text-[13px] leading-relaxed">
              {getStatusMessage(order.status).description}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white p-4 rounded-3xl shadow-sm border border-[#F5F5F5] flex flex-col items-center gap-2">
              <span className="text-[9px] font-black text-[#BBBBBB] uppercase tracking-widest">Status</span>
              <p className="text-sm font-bold text-[#111111]">
                {order.status === OrderStatus.PENDING ? 'Entrando' :
                  order.status === OrderStatus.RECEIVED ? 'Pendente' :
                    order.status === OrderStatus.PREPARING ? 'Preparando' :
                      order.status === OrderStatus.READY ? (order.orderType === OrderType.DELIVERY ? 'A caminho' : 'Pronto!') : 'Entregue'}
              </p>
            </div>
            <div className="bg-white p-4 rounded-3xl shadow-sm border border-[#F5F5F5] flex flex-col items-center gap-2">
              <span className="text-[9px] font-black text-[#BBBBBB] uppercase tracking-widest">Posição</span>
              <p className="text-sm font-bold text-[#111111]">{order.status === OrderStatus.DELIVERED ? 'N/A' : `${order.queuePosition}º`}</p>
            </div>
          </div>

          <div className="bg-secondary p-6 rounded-[2rem] shadow-lg relative overflow-hidden group">
            <div className="relative z-10 flex items-center justify-between">
              <div className="space-y-1">
                <span className="text-[10px] font-black text-white/50 uppercase tracking-widest">Tempo Decorrido</span>
                <p className="text-3xl font-black text-white tabular-nums tracking-tight">{formatTime(elapsedSeconds)}</p>
              </div>
              <span className="material-symbols-outlined text-white/20 text-4xl">timer</span>
            </div>
          </div>
        </div>

        {/* Shopping Section with Carousel */}
        {(order.status === OrderStatus.PENDING || order.status === OrderStatus.RECEIVED) && (
          <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-white border-t border-zinc-100">
            {/* Category Navigation (Sticky) */}
            <div className="flex-shrink-0 px-6 py-4 bg-white/80 backdrop-blur-xl border-b border-zinc-50 z-20">
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide justify-start">
                {categoriesToDisplay.map((cat, idx) => (
                  <button
                    key={cat.id}
                    onClick={() => scrollToCategory(idx)}
                    className={`px-6 py-2.5 rounded-full whitespace-nowrap text-[10px] font-black uppercase tracking-widest transition-all ${activeCategoryIndex === idx ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-105' : 'bg-transparent border border-zinc-100 text-[#BBBBBB] hover:border-primary/20 hover:text-primary'}`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Horizontal Product Carousel */}
            <div className="flex-1 overflow-hidden relative">
              <div 
                ref={scrollRef}
                onScroll={onScroll}
                className="size-full flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-0"
                style={{ scrollBehavior: 'auto' }}
              >
                {categoriesToDisplay.map((cat) => {
                  const catProducts = products.filter(p => p.category === cat.name);
                  const isExpanded = expandedCategories.has(cat.name);
                  const displayedProducts = isExpanded ? catProducts : catProducts.slice(0, 5);

                  return (
                    <div 
                      key={cat.id} 
                      className="min-w-full h-full snap-center px-4"
                    >
                      <div className="h-full flex flex-col">
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                          {displayedProducts.map(p => (
                            <div key={p.id} className="bg-white p-4 rounded-[1.5rem] shadow-sm border border-[#F8F9FA] flex items-center gap-4 group hover:border-primary/20 transition-all">
                              <div className="size-16 rounded-xl overflow-hidden bg-[#F8F9FA] shrink-0">
                                <img src={p.imageUrl} alt={p.name} className="size-full object-cover" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="text-[13px] font-black text-[#111111] leading-tight mb-0.5">{p.name}</h3>
                                <p className="text-primary font-black text-[13px]">Kz {p.price.toLocaleString()}</p>
                              </div>
                              <button
                                onClick={() => addToCart(p)}
                                disabled={checkoutStep === 2}
                                className="size-10 rounded-xl bg-primary text-white shadow-lg shadow-primary/10 flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all"
                              >
                                <span className="material-symbols-outlined text-xl">add</span>
                              </button>
                            </div>
                          ))}

                          {catProducts.length > 5 && (
                            <button 
                              onClick={() => toggleCategoryExpansion(cat.name)}
                              className="w-full py-4 bg-zinc-50 rounded-2xl text-[10px] font-black text-zinc-400 uppercase tracking-widest hover:bg-zinc-100 transition-all flex items-center justify-center gap-2"
                            >
                              {isExpanded ? 'Ver Menos' : `Ver Mais (${catProducts.length - 5} itens)`}
                              <span className="material-symbols-outlined text-sm">{isExpanded ? 'expand_less' : 'expand_more'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Existing Order Detail (Non-Shopping View) */}
        {(order.status !== OrderStatus.PENDING && (!order.items || order.items.length === 0)) && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
             <span className="material-symbols-outlined text-6xl text-zinc-100">restaurant</span>
             <p className="text-zinc-400 font-medium text-sm">O seu pedido está a ser processado.</p>
          </div>
        )}

        {/* Footer Area with SMS Note and Actions */}
        <div className="flex-shrink-0 bg-white border-t border-zinc-50 p-6 space-y-4 z-30">
          <div className="bg-red-50/50 p-4 rounded-2xl flex items-start gap-3 border border-red-100/30">
            <span className="material-symbols-outlined text-primary text-sm mt-0.5">info</span>
            <p className="text-[#555555] text-[11px] font-medium leading-relaxed">
              Receberá avisos por SMS sobre o estado do seu pedido.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                if (order.status !== OrderStatus.DELIVERED && order.status !== OrderStatus.CANCELLED) {
                  if (!confirm('Deseja realmente encerrar a sessão e sair da fila?')) return;
                }
                localStorage.removeItem('kwikfood_active_order');
                onNewOrder();
              }}
              className="flex items-center justify-center gap-2 text-[#E31B44] bg-red-50 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest"
            >
              <span className="material-symbols-outlined text-lg">logout</span>
              Sair
            </button>
            {(order.status === OrderStatus.PENDING || order.status === OrderStatus.RECEIVED) && (
              <button
                onClick={handleCancelOrder}
                disabled={submittingOrder}
                className="flex items-center justify-center gap-2 bg-zinc-900 text-white py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest"
              >
                CANCELAR
              </button>
            )}
          </div>
        </div>
      </main>

      {/* Cart Modal Overlay (If items present) */}
      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 bg-white shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.15)] border-t border-zinc-100 p-6 z-[100] animate-slide-up rounded-t-[2.5rem]">
           <div className="max-w-xl mx-auto flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                 <div className="size-10 bg-secondary rounded-xl flex items-center justify-center text-white">
                    <span className="material-symbols-outlined text-xl">shopping_cart</span>
                 </div>
                 <div>
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest leading-none">Subtotal</p>
                    <p className="text-lg font-black text-secondary">Kz {totalCart.toLocaleString()}</p>
                 </div>
              </div>
              <button onClick={() => setCheckoutStep(checkoutStep === 1 ? 2 : 1)} className="text-[10px] font-black text-primary uppercase tracking-widest">
                 {checkoutStep === 1 ? 'Pagar' : 'Voltar'}
              </button>
           </div>
           <button 
             onClick={handleFinishOrder} 
             disabled={submittingOrder || (checkoutStep === 2 && !paymentMethod)}
             className="w-full py-4 bg-primary text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-95 transition-all"
           >
             {submittingOrder ? 'Processando...' : checkoutStep === 1 ? 'CONCLUIR ADIÇÃO' : 'CONFIRMAR PAGAMENTO'}
           </button>
        </div>
      )}
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
    </div>
  );
};

export default CustomerTrackingView;

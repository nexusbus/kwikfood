
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
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategoryIndex, setActiveCategoryIndex] = useState(0);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [customizationLoading, setCustomizationLoading] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [selectedExtras, setSelectedExtras] = useState<Record<string, string[]>>({});
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
        description: 'Lamentamos imenso, mas o seu pedido teve de ser cancelado e a sua posição foi removida. Por favor, contacte-nos para mais detalhes.'
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
              telegramBotToken: companyData.telegram_bot_token,
              ownerName: companyData.owner_name,
              bankHolder: companyData.bank_holder,
              expressNumber: companyData.express_number,
              kwikNumber: companyData.kwik_number,
              companyPhone: companyData.company_phone
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
  const categoriesToDisplay = [
    { id: 'all', name: 'Todos' },
    ...categories.filter(c => products.some(p => p.category === c.name))
  ];

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

  const handleOpenCustomization = async (product: Product) => {
    setSelectedProduct(product);
    setIsCustomizing(true);
    setCustomizationLoading(true);
    setQuantity(1);
    setSelectedExtras({});

    try {
      const { data: groupsData, error: groupsError } = await supabase
        .from('product_to_accompaniment_groups')
        .select(`
          group_id,
          accompaniment_groups (
            id,
            name,
            isRequired:is_required,
            minSelection:min_selection,
            maxSelection:max_selection,
            accompaniment_items (
              id,
              name,
              price,
              isActive:is_active
            )
          )
        `)
        .eq('product_id', product.id);

      if (groupsError) throw groupsError;

      if (groupsData) {
        const enrichedGroups = groupsData.map((g: any) => {
          const group = g.accompaniment_groups;
          if (!group) return null;
          return {
            ...group,
            items: (group.accompaniment_items || []).filter((i: any) => i.isActive)
          };
        }).filter(Boolean);
        
        setSelectedProduct({ ...product, accompanimentGroups: enrichedGroups });
      }
    } catch (err) {
      console.error('Error loading accompaniments:', err);
    } finally {
      setCustomizationLoading(false);
    }
  };

  const calculateCustomTotal = () => {
    if (!selectedProduct) return 0;
    let total = selectedProduct.price;
    Object.values(selectedExtras).flat().forEach(extraId => {
      const item = selectedProduct.accompanimentGroups?.flatMap(g => g.items || []).find(i => i.id === extraId);
      if (item) total += item.price;
    });
    return total * quantity;
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
    <div className="min-h-screen bg-[#FDFCFD] flex flex-col font-sans selection:bg-primary/10 overflow-x-hidden pb-32">
      {/* Header */}
      <header className="w-full max-w-5xl mx-auto px-6 py-6 flex justify-between items-center bg-white sticky top-0 z-[100] border-b border-[#F5F5F5]">
        <div className="flex items-center gap-3">
          <Logo variant="icon" size={32} />
          <span className="text-xl font-black tracking-tight text-[#111111]">KwikFood</span>
        </div>
        <div className="bg-red-50 text-primary px-5 py-2 rounded-2xl font-black text-[11px] tracking-widest shadow-sm flex items-center gap-2">
          <span className="text-[9px] opacity-50 uppercase">Ticket</span>
          #{order.ticketCode}
        </div>
      </header>

      {/* Main Content - Vertical Scrolling Page */}
      <main className="flex-1 w-full max-w-[480px] mx-auto px-6 py-10 space-y-10">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-black text-[#111111] tracking-tight animate-fade-in leading-tight">
            {getStatusMessage(order.status).title}
          </h1>
          <p className="text-[#555555] font-medium text-[15px] animate-fade-in leading-relaxed">
            {getStatusMessage(order.status).description}
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
                      order.status === OrderStatus.READY ? (order.orderType === OrderType.DELIVERY ? 'A caminho' : 'Pronto!') : 'Entregue'}
              </p>
            </div>
            <div className="bg-white p-6 rounded-[2.5rem] shadow-[0_5px_25px_-5px_rgba(0,0,0,0.04)] border border-[#F5F5F5] flex flex-col items-center justify-center gap-1">
              <span className="text-6xl font-black text-secondary tracking-tighter italic">
                {order.status === OrderStatus.CANCELLED || order.queuePosition === 0 ? 'n/a' : `${order.queuePosition}º`}
              </span>
              <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] mt-2">Posição na Fila</span>
            </div>
          </div>

          <div className="bg-secondary p-8 rounded-[2.5rem] shadow-[0_20px_50px_-15px_rgba(0,0,0,0.15)] relative overflow-hidden group">
            <div className="relative z-10 space-y-2">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-white text-xl">schedule</span>
                <span className="text-[11px] font-black text-white/50 uppercase tracking-widest">Tempo Decorrido</span>
              </div>
              <p className="text-5xl font-black text-white tabular-nums tracking-tight">{formatTime(elapsedSeconds)}</p>
            </div>
            <span className="absolute top-1/2 right-0 -translate-y-1/2 opacity-10 translate-x-1/4 material-symbols-outlined text-[180px] text-white">timer</span>
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
              <p className="text-[9px] font-black text-[#BBBBBB] uppercase tracking-widest mb-0.5">Contacto do Espaço</p>
              <p className="text-[11px] font-black text-[#111111] truncate">{company?.companyPhone || company?.expressNumber || 'N/A'}</p>
            </div>
          </div>
        </div>

        {/* Shopping Section with Carousel (Hybrid: Horizontal Swipe inside Vertical Page) */}
        {(order.status === OrderStatus.PENDING || order.status === OrderStatus.RECEIVED) && (
          <div className="space-y-6">
            <div className="space-y-4">
              <h2 className="text-2xl font-black text-[#111111] tracking-tight">O que deseja comprar?</h2>
              
              {/* Search Bar */}
              <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-zinc-400 group-focus-within:text-primary transition-colors">search</span>
                <input
                  type="text"
                  placeholder="Pesquisar por nome..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-white border border-[#F0F0F0] rounded-2xl text-sm font-bold focus:border-primary outline-none transition-all placeholder:text-zinc-300 shadow-sm"
                />
              </div>
            </div>
            
            <div className="bg-white rounded-none border border-transparent overflow-hidden shadow-sm flex flex-col min-h-[400px] h-[550px]">
              {/* Category Navigation (Horizontal) */}
              <div className="px-6 py-4 bg-white border-b border-zinc-50 z-20 overflow-x-auto scrollbar-hide">
                <div className="flex gap-2 justify-start items-center">
                  {categoriesToDisplay.map((cat, idx) => (
                    <button
                      key={cat.id}
                      onClick={() => scrollToCategory(idx)}
                      className={`px-5 py-2 rounded-xl whitespace-nowrap text-[9px] font-black uppercase tracking-widest transition-all ${activeCategoryIndex === idx ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-105' : 'bg-transparent border border-zinc-100 text-zinc-400 hover:border-primary/20 hover:text-primary'}`}
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
                >
                  {categoriesToDisplay.map((cat) => {
                    // Filter: Search Query + Category (if not "all")
                    const filteredProducts = products.filter(p => {
                      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
                      const matchesCategory = cat.id === 'all' || p.category === cat.name;
                      return matchesSearch && matchesCategory;
                    });

                    return (
                      <div 
                        key={cat.id} 
                        className="min-w-full h-full snap-center"
                      >
                        <div className="h-full overflow-y-auto p-4 space-y-3 custom-scrollbar">
                          {filteredProducts.map(p => (
                            <div key={p.id} className="bg-white p-3 rounded-none shadow-sm border border-transparent flex items-center gap-3 transition-all hover:border-primary/20 active:bg-zinc-50">
                              <div className="size-12 rounded-xl overflow-hidden bg-transparent shrink-0 shadow-inner">
                                <img src={p.imageUrl || company?.logoUrl} alt={p.name} className="size-full object-cover" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="text-[12px] font-black text-[#111111] leading-tight mb-0.5">{p.name}</h3>
                                {p.details && <p className="text-[10px] text-zinc-400 mt-0.5 leading-tight">{p.details}</p>}
                                <p className="text-primary font-black text-[11px] mt-1">Kz {p.price.toLocaleString()}</p>
                              </div>
                              <button
                                onClick={() => handleOpenCustomization(p)}
                                disabled={checkoutStep === 2}
                                className="size-10 rounded-xl bg-primary text-white shadow-lg shadow-primary/10 flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all"
                              >
                                <span className="material-symbols-outlined text-xl font-black">add</span>
                              </button>
                            </div>
                          ))}

                          {filteredProducts.length === 0 && (
                            <div className="h-40 flex flex-col items-center justify-center text-center p-8">
                               <span className="material-symbols-outlined text-3xl text-zinc-100 mb-2">search_off</span>
                               <p className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">Nenhum item encontrado</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Existing Order Detail if items present */}
        {(order.status !== OrderStatus.PENDING && order.items && order.items.length > 0) && (
          <div className="bg-white rounded-[2.5rem] shadow-[0_20px_50px_-15px_rgba(0,0,0,0.08)] border border-[#F5F5F5] p-8 space-y-8 animate-fade-in">
            <div className="flex items-center gap-4 border-b border-[#F5F5F5] pb-6">
              <div className="size-14 bg-red-50 rounded-[1.25rem] flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-2xl">receipt_long</span>
              </div>
              <h3 className="text-xl font-black text-[#111111] tracking-tight">Detalhes do Pedido</h3>
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
                <span className="text-[11px] font-black text-[#BBBBBB] uppercase tracking-widest">Total</span>
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
            Receberá avisos por SMS sobre o estado do seu pedido.
          </p>
        </div>

        {/* Footer Actions (Standard scrolling section) */}
        <div className="space-y-6 pt-6">
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => {
                if (order.status !== OrderStatus.DELIVERED && order.status !== OrderStatus.CANCELLED) {
                  if (!confirm('Deseja realmente encerrar a sessão e sair da fila?')) return;
                }
                localStorage.removeItem('kwikfood_active_order');
                onNewOrder();
              }}
              className="flex items-center justify-center gap-2 text-[#E31B44] bg-red-50 py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-widest transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-lg">logout</span>
              Sair
            </button>
            {(order.status === OrderStatus.PENDING || order.status === OrderStatus.RECEIVED) && (
              <button
                onClick={handleCancelOrder}
                disabled={submittingOrder}
                className="flex items-center justify-center gap-2 bg-zinc-900 text-white py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-widest transition-all active:scale-95"
              >
                CANCELAR
              </button>
            )}
          </div>
          
          <div className="text-center space-y-2 pt-6">
            <p className="text-[10px] font-black text-primary/30 uppercase tracking-[0.4em]">PREMIUM QUEUE SYSTEM</p>
            <p className="text-[10px] text-[#BBBBBB] font-black uppercase tracking-widest">© {new Date().getFullYear()} KwikFood Angola</p>
          </div>
        </div>
      </main>

      {/* Cart Modal Overlay (If items present) */}
      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 bg-white shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.15)] border-t border-zinc-100 p-6 z-[100] animate-slide-up rounded-t-[2.5rem] flex flex-col gap-6 max-h-[90vh]">
           <div className="max-w-xl mx-auto w-full flex items-center justify-between">
              <div className="flex items-center gap-3">
                 <div className="size-10 bg-secondary rounded-xl flex items-center justify-center text-white">
                    <span className="material-symbols-outlined text-xl">shopping_cart</span>
                 </div>
                 <div>
                    <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest leading-none">Subtotal</p>
                    <p className="text-lg font-black text-secondary">Kz {totalCart.toLocaleString()}</p>
                 </div>
              </div>
              <button onClick={() => setCheckoutStep(checkoutStep === 1 ? 2 : 1)} className="px-4 py-2 bg-zinc-50 rounded-xl text-[10px] font-black text-primary uppercase tracking-widest hover:bg-zinc-100 transition-all">
                 {checkoutStep === 1 ? 'Revisar e Pagar' : 'Voltar'}
              </button>
           </div>

           {/* Step 2: Review & Payment Selection */}
           {checkoutStep === 2 && (
             <div className="flex-1 overflow-y-auto space-y-6 custom-scrollbar pb-4">
                {/* Item List */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Revisar Itens</h4>
                  {cart.map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-zinc-50 rounded-2xl">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-secondary truncate">{item.name}</p>
                        <p className="text-[10px] text-zinc-400 truncate italic">{item.observation || 'Sem observações'}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center bg-white rounded-xl p-1 shadow-sm border border-zinc-100">
                          <button onClick={() => removeFromCart(item.id)} className="size-8 flex items-center justify-center text-zinc-400 hover:text-primary">
                            <span className="material-symbols-outlined text-sm">remove</span>
                          </button>
                          <span className="w-6 text-center text-xs font-black text-secondary">{item.quantity}</span>
                          <button onClick={() => addToCart(item)} className="size-8 flex items-center justify-center text-zinc-400 hover:text-primary">
                            <span className="material-symbols-outlined text-sm">add</span>
                          </button>
                        </div>
                        <span className="min-w-[60px] text-right text-xs font-black text-primary">Kz {(item.price * item.quantity).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Payment Selection */}
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Método de Pagamento</h4>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'CASH', label: 'Dinheiro', icon: 'payments' },
                      { id: 'TPA', label: 'Multicaixa', icon: 'credit_card' },
                      { id: 'TRANSFER', label: 'Transferência', icon: 'account_balance' }
                    ].map((method) => (
                      <button
                        key={method.id}
                        onClick={() => setPaymentMethod(method.id as any)}
                        className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${paymentMethod === method.id ? 'border-primary bg-red-50 text-primary' : 'border-zinc-50 bg-zinc-50 text-zinc-400 hover:border-zinc-100'}`}
                      >
                        <span className="material-symbols-outlined text-xl">{method.icon}</span>
                        <span className="text-[9px] font-black uppercase tracking-widest">{method.label}</span>
                      </button>
                    ))}
                  </div>

                  {paymentMethod === 'TRANSFER' && (
                    <div className="p-4 bg-zinc-900 rounded-2xl space-y-4 animate-fade-in">
                       <div className="flex justify-between items-center">
                          <p className="text-[10px] font-black text-white/50 uppercase tracking-widest">Dados Bancários</p>
                          <span className="material-symbols-outlined text-primary text-xl">account_balance</span>
                       </div>
                        <div className="text-xs font-medium text-white/90 leading-relaxed">
                          {company?.iban && (
                            <div className="flex justify-between items-center py-1 border-b border-white/5">
                              <span className="text-white/40">IBAN</span>
                              <span className="font-black text-primary">{company.iban}</span>
                            </div>
                          )}
                          {(company?.bankHolder || company?.name) && (
                            <div className="flex justify-between items-center py-1 border-b border-white/5">
                              <span className="text-white/40">Titular</span>
                              <span className="font-black text-white">{company?.bankHolder || company?.name}</span>
                            </div>
                          )}
                          {company?.expressNumber && (
                            <div className="flex justify-between items-center py-1 border-b border-white/5">
                              <span className="text-white/40">Express</span>
                              <span className="font-black text-white">{company.expressNumber}</span>
                            </div>
                          )}
                          {company?.kwikNumber && (
                            <div className="flex justify-between items-center py-1">
                              <span className="text-white/40">Kwik</span>
                              <span className="font-black text-white">{company.kwikNumber}</span>
                            </div>
                          )}
                        </div>
                       
                       <div className="pt-2">
                          <p className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-3">Upload do Comprovativo (Obrigatório)</p>
                          <label className={`w-full h-14 rounded-xl border-2 border-dashed flex items-center justify-center gap-3 transition-all cursor-pointer ${paymentProofUrl ? 'bg-green-500/10 border-green-500/50 text-green-500' : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:border-white/20'}`}>
                             <span className="material-symbols-outlined">{paymentProofUrl ? 'check_circle' : 'upload_file'}</span>
                             <span className="text-[10px] font-black uppercase tracking-widest">
                                {uploadingProof ? 'Enviando...' : paymentProofUrl ? 'Comprovativo Enviado' : 'Selecionar PDF'}
                             </span>
                             <input type="file" onChange={handleUploadProof} accept="application/pdf" className="hidden" />
                          </label>
                       </div>
                    </div>
                  )}
                </div>
             </div>
           )}

           <button 
             onClick={() => checkoutStep === 1 ? setCheckoutStep(2) : handleFinishOrder()} 
             disabled={submittingOrder || (checkoutStep === 2 && !paymentMethod) || (checkoutStep === 2 && paymentMethod === 'TRANSFER' && !paymentProofUrl)}
             className="w-full py-5 bg-primary text-white rounded-2xl font-black text-[12px] uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale"
           >
             {submittingOrder ? 'Processando...' : checkoutStep === 1 ? 'CONCLUIR PEDIDO' : 'ENVIAR PARA COZINHA'}
           </button>
        </div>
      )}

      {/* Product Customization Modal */}
      {isCustomizing && selectedProduct && (
        <div className="fixed inset-0 z-[150] bg-zinc-900/90 backdrop-blur-xl flex items-end sm:items-center justify-center p-0 sm:p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-lg h-[90vh] sm:h-auto sm:max-h-[85vh] rounded-t-[2.5rem] sm:rounded-3xl overflow-hidden flex flex-col relative animate-in slide-in-from-bottom-10 duration-500">
            {/* Modal Header/Image */}
            <div className="relative h-48 sm:h-64 flex-shrink-0">
              <img src={selectedProduct.imageUrl} className="size-full object-cover" alt={selectedProduct.name} />
              <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent"></div>
              <button 
                onClick={() => setIsCustomizing(false)}
                className="absolute top-6 right-6 size-12 bg-white shadow-2xl rounded-full flex items-center justify-center text-secondary hover:text-primary transition-all z-[110] border border-zinc-100 group"
              >
                <span className="material-symbols-outlined text-2xl group-active:scale-90 transition-transform">close</span>
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto px-6 py-8 space-y-8 custom-scrollbar">
              <header className="space-y-2">
                <span className="text-[10px] font-black text-primary uppercase tracking-[0.3em]">{selectedProduct.category}</span>
                <div className="flex justify-between items-start gap-4">
                  <h2 className="text-2xl font-black text-secondary tracking-tight">{selectedProduct.name}</h2>
                  <span className="text-xl font-black text-primary">Kz {selectedProduct.price.toLocaleString()}</span>
                </div>
                {selectedProduct.details && (
                  <p className="text-zinc-500 font-medium text-sm italic leading-relaxed">{selectedProduct.details}</p>
                )}
              </header>

              {/* Customization Groups */}
              {customizationLoading ? (
                <div className="py-10 flex flex-col items-center gap-4">
                  <div className="size-8 border-2 border-primary/10 border-t-primary rounded-full animate-spin"></div>
                  <p className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">Carregando...</p>
                </div>
              ) : (
                <div className="space-y-8">
                  {selectedProduct.accompanimentGroups?.map(group => (
                    <section key={group.id} className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-[11px] font-black text-secondary uppercase tracking-widest">{group.name}</h4>
                          <p className="text-[10px] text-zinc-400 font-bold mt-1">
                            {group.isRequired ? `Mínimo ${group.minSelection}` : `Até ${group.maxSelection}`}
                          </p>
                        </div>
                        {group.isRequired && (
                          <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-full text-[8px] font-black uppercase tracking-widest">Obrigatório</span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {group.items?.map(item => {
                          const isSelected = selectedExtras[group.id]?.includes(item.id);
                          return (
                            <button
                              key={item.id}
                              onClick={() => {
                                setSelectedExtras(prev => {
                                  const current = prev[group.id] || [];
                                  if (isSelected) return { ...prev, [group.id]: current.filter(id => id !== item.id) };
                                  if (group.maxSelection === 1) return { ...prev, [group.id]: [item.id] };
                                  if (current.length < group.maxSelection) return { ...prev, [group.id]: [...current, item.id] };
                                  return prev;
                                });
                              }}
                              className={`w-full p-4 rounded-2xl border flex items-center justify-between transition-all ${isSelected ? 'border-primary bg-rose-50' : 'border-zinc-50 bg-zinc-50 hover:border-zinc-100'}`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`size-4 rounded-full border flex items-center justify-center transition-all ${isSelected ? 'border-primary bg-primary' : 'border-zinc-300 bg-white'}`}>
                                  {isSelected && <span className="material-symbols-outlined text-white text-[10px] font-black">check</span>}
                                </div>
                                <span className={`font-bold text-xs ${isSelected ? 'text-primary' : 'text-zinc-700'}`}>{item.name}</span>
                              </div>
                              {item.price > 0 && <span className={`text-[10px] font-black ${isSelected ? 'text-primary' : 'text-zinc-400'}`}>+ {item.price.toLocaleString()} Kz</span>}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                  
                  {/* Observation Field */}
                  <div className="space-y-3">
                    <h4 className="text-[11px] font-black text-secondary uppercase tracking-widest">Observações</h4>
                    <textarea 
                      placeholder="Ex: Sem cebola, bem passado..."
                      className="w-full p-4 bg-zinc-50 border border-zinc-100 rounded-2xl text-xs font-medium outline-none focus:border-primary/20 transition-all min-h-[100px] resize-none"
                      onChange={(e) => {
                         // We store observation directly in the adding logic
                      }}
                      id="product-observation"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="p-6 bg-white border-t border-zinc-50 flex items-center gap-4">
               <div className="flex items-center bg-zinc-50 p-1.5 rounded-xl gap-3">
                  <button onClick={() => quantity > 1 && setQuantity(quantity - 1)} className="size-10 rounded-lg bg-white shadow-sm flex items-center justify-center text-zinc-400 hover:text-primary transition-all active:scale-90">
                    <span className="material-symbols-outlined text-sm">remove</span>
                  </button>
                  <span className="w-6 text-center font-black text-sm text-secondary">{quantity}</span>
                  <button onClick={() => setQuantity(quantity + 1)} className="size-10 rounded-lg bg-white shadow-sm flex items-center justify-center text-zinc-400 hover:text-primary transition-all active:scale-90">
                    <span className="material-symbols-outlined text-sm">add</span>
                  </button>
               </div>
               <button 
                 onClick={() => {
                    const obs = (document.getElementById('product-observation') as HTMLTextAreaElement)?.value || '';
                    const extraNames = Object.entries(selectedExtras).flatMap(([gid, ids]) => {
                      const group = selectedProduct?.accompanimentGroups?.find(g => g.id === gid);
                      return (ids as string[]).map(id => group?.items?.find(i => i.id === id)?.name);
                    }).filter(Boolean).join(', ');

                    const finalObs = [extraNames, obs].filter(Boolean).join(' | ');

                    setCart(prev => {
                      const existing = prev.find(item => item.id === selectedProduct.id && item.observation === finalObs);
                      if (existing) return prev.map(item => item.id === selectedProduct.id && item.observation === finalObs ? { ...item, quantity: item.quantity + quantity } : item);
                      return [...prev, { ...selectedProduct, quantity, observation: finalObs }];
                    });
                    setIsCustomizing(false);
                 }}
                 className="flex-1 h-14 bg-primary text-white rounded-2xl font-black text-[11px] uppercase tracking-widest flex items-center justify-between px-6 hover:bg-secondary transition-all shadow-lg shadow-primary/20"
               >
                 <span>ADICIONAR</span>
                 <span>Kz {calculateCustomTotal().toLocaleString()}</span>
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Notification Button (Discreet) */}
      <div className="fixed bottom-8 left-8 z-[150] flex flex-col gap-3">
        {notificationPermission !== 'granted' ? (
          <button
            onClick={handleRequestPermission}
            className="size-14 bg-white border border-[#F5F5F5] text-primary rounded-2xl shadow-premium hover:shadow-2xl transition-all flex items-center justify-center animate-bounce-soft"
          >
            <span className="material-symbols-outlined text-2xl">notifications_active</span>
          </button>
        ) : (
          <button
            onClick={handleTestNotification}
            className="size-14 bg-white/80 backdrop-blur-md border border-[#F5F5F5] text-secondary rounded-2xl shadow-premium hover:shadow-2xl transition-all flex items-center justify-center"
          >
            <span className="material-symbols-outlined text-2xl">vibration</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default CustomerTrackingView;

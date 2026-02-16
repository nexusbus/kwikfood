import React, { useState, useEffect } from 'react';
import { Company, Order, OrderStatus, Product, CartItem } from '../types';
import { supabase } from '../src/lib/supabase';
import { requestNotificationPermission, showNotification } from '../src/lib/notifications';
import Logo from './Logo';

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
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    let count = 0;
    const playNext = () => {
      if (count < 3) {
        audio.currentTime = 0;
        audio.play().catch(e => console.error('Audio play failed:', e));
        count++;
        setTimeout(playNext, 1500); // Toca a cada 1.5 segundos
      }
    };
    playNext();
  };

  const handleRequestPermission = async () => {
    if (!window.isSecureContext) {
      alert('🔒 SEGURANÇA: As notificações do browser só funcionam em sites SEGUROS (HTTPS). Por favor, garanta que está a aceder via https:// para poder ativar os alertas.');
      return;
    }

    if (Notification.permission === 'denied') {
      alert('🚫 BLOQUEADO: As notificações foram negadas anteriormente neste browser. Para ativar, clique no ícone do CADEADO ao lado do URL (endereço do site) e mude para "Permitir".');
      return;
    }

    const granted = await requestNotificationPermission();
    setNotificationPermission(Notification.permission);

    if (granted) {
      showNotification('Notificações Ativadas! 🔔', { body: 'Você receberá atualizações do seu pedido aqui.' });
    } else {
      // If it's not denied but not granted, it might have been closed/ignored
      if (Notification.permission === 'default') {
        alert('ℹ️ AVISO: A janela de permissão foi fechada ou ignorada. Por favor, clique novamente em "Permitir Alertas" e aceite o pedido do browser.');
      }
    }
  };

  const handleTestNotification = () => {
    playNotificationSound();
    showNotification('Teste de Alerta 🧪', {
      body: 'Este é um teste para confirmar que os seus alertas estão funcionando.',
      tag: 'test-notification'
    });
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}h:${m.toString().padStart(2, '0')}min:${s.toString().padStart(2, '0')}s`;
  };

  useEffect(() => {
    const loadData = async () => {
      setLoadingProducts(true);
      try {
        const { data: co } = await supabase.from('companies').select('*').eq('id', order.companyId).single();
        if (co) setCompany(co as Company);

        const { data: prods } = await supabase.from('products').select('*').eq('company_id', order.companyId);
        if (prods) setProducts(prods.map(p => ({ ...p, imageUrl: p.image_url })));

        // Hydrate order to get latest status if refreshed
        const { data: latestOrder } = await supabase
          .from('orders')
          .select('id, company_id, customer_phone, status, items, total, queue_position, estimated_minutes, ticket_code, ticket_number, timer_last_started_at, timer_accumulated_seconds, created_at')
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
            items: latestOrder.items,
            total: latestOrder.total,
            timestamp: latestOrder.created_at
          });

          calculateElapsed(latestOrder.timer_accumulated_seconds || 0, latestOrder.timer_last_started_at, latestOrder.status as OrderStatus);

          // Calculate dynamic queue position
          const { count: posCount } = await supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('company_id', order.companyId)
            .in('status', [OrderStatus.RECEIVED, OrderStatus.PREPARING, OrderStatus.READY])
            .lt('created_at', latestOrder.created_at);

          setOrder(prev => ({
            ...prev,
            queuePosition: (posCount || 0) + 1
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
      .channel(`order-${order.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${order.id}` },
        (payload) => {
          const updatedOrder = payload.new as any;
          if (!updatedOrder) return;

          setOrder(prev => {
            const nextStatus = updatedOrder.status || prev.status;

            if (nextStatus !== prev.status) {
              if (
                nextStatus === OrderStatus.PREPARING ||
                nextStatus === OrderStatus.READY ||
                nextStatus === OrderStatus.DELIVERED
              ) {
                playNotificationSound();
              }

              if (nextStatus === OrderStatus.READY) {
                showNotification('Seu pedido está pronto! 🍔', { body: 'Pode levantar o seu pedido no balcão.' });
              } else if (nextStatus === OrderStatus.RECEIVED) {
                showNotification('Pedido Recebido! 📝', { body: 'O restaurante já recebeu o seu pedido.' });
              } else if (nextStatus === OrderStatus.PREPARING) {
                showNotification('Seu pedido entrou na cozinha! 🍳', { body: 'Estamos preparando tudo com carinho.' });
              } else if (nextStatus === OrderStatus.DELIVERED) {
                showNotification('Pedido entregue! Bom apetite! 🍱', { body: 'Obrigado por escolher o KwikFood.' });
              }
            }

            return {
              ...prev,
              status: nextStatus as OrderStatus,
              ticketCode: updatedOrder.ticket_code ?? prev.ticketCode,
              ticketNumber: updatedOrder.ticket_number ?? prev.ticketNumber,
              estimatedMinutes: updatedOrder.estimated_minutes ?? prev.estimatedMinutes,
              timerAccumulatedSeconds: updatedOrder.timer_accumulated_seconds ?? prev.timerAccumulatedSeconds,
              timerLastStartedAt: updatedOrder.timer_last_started_at ?? prev.timerLastStartedAt,
              items: updatedOrder.items ?? prev.items,
              total: updatedOrder.total ?? prev.total
            };
          });

          // Recalculate position when any order is updated
          loadData();
        }
      )
      .subscribe();

    const pChannel = supabase
      .channel(`products-${order.companyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products', filter: `company_id=eq.${order.companyId}` },
        () => {
          loadData();
        }
      )
      .subscribe();

    const cChannel = supabase
      .channel(`company-${order.companyId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'companies', filter: `id=eq.${order.companyId}` },
        () => {
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(pChannel);
      supabase.removeChannel(cChannel);
    };
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
    setCart(prev => {
      const existing = prev.find(item => item.id === p.id);
      if (existing) {
        return prev.map(item =>
          item.id === p.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...p, observation: '', quantity: 1 }];
    });
  };

  const removeFromCart = (pId: string) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === pId);
      if (existing && existing.quantity > 1) {
        return prev.map(item =>
          item.id === pId ? { ...item, quantity: item.quantity - 1 } : item
        );
      }
      return prev.filter(item => item.id !== pId);
    });
  };

  const updateObservation = (idx: number, text: string) => {
    const newCart = [...cart];
    newCart[idx].observation = text;
    setCart(newCart);
  };

  const handleFinishOrder = async () => {
    if (cart.length === 0) return;
    setSubmittingOrder(true);
    try {
      const total = cart.reduce((acc, p) => acc + (p.price * p.quantity), 0);
      const { error } = await supabase
        .from('orders')
        .update({
          items: cart,
          total: total,
          status: OrderStatus.RECEIVED
        })
        .eq('id', order.id);

      if (error) throw error;
      setCart([]);
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
      const { error } = await supabase
        .from('orders')
        .update({ status: OrderStatus.CANCELLED, cancelled_by: 'customer' })
        .eq('id', order.id);

      if (error) throw error;
      onNewOrder(); // Redirect to home
    } catch (err) {
      alert('Erro ao cancelar entrada.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const totalCart = cart.reduce((acc, p) => acc + (p.price * p.quantity), 0);

  return (
    <div className="bg-background min-h-screen pb-20 selection:bg-primary selection:text-white">
      {/* Notification Authorization Banner */}
      {notificationPermission !== 'granted' && (
        <div className="bg-secondary text-white p-4 sticky top-0 z-[200] animate-in slide-in-from-top duration-500 shadow-xl border-b border-white/10">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-3xl animate-bounce">notifications_active</span>
              <p className="font-black text-[13px] uppercase tracking-widest text-center sm:text-left leading-tight">
                ATIVE AS NOTIFICAÇÕES PARA RECEBER ALERTAS REAL-TIME DO SEU PEDIDO
              </p>
            </div>
            <button
              onClick={handleRequestPermission}
              className="bg-white text-secondary px-8 py-3 rounded-full font-black text-[11px] uppercase tracking-tighter hover:bg-primary hover:text-white transition-all shadow-premium active:scale-95 whitespace-nowrap"
            >
              PERMITIR ALERTAS
            </button>
          </div>
        </div>
      )}

      {/* Test Notification Widget (Floating) */}
      {notificationPermission === 'granted' && (
        <button
          onClick={handleTestNotification}
          className="fixed bottom-8 left-8 z-[150] bg-white/80 backdrop-blur-md border border-border p-4 rounded-2xl flex items-center gap-3 shadow-premium hover:shadow-2xl transition-all group active:scale-95"
          title="Testar som e notificação"
        >
          <div className="size-10 bg-secondary/10 rounded-xl flex items-center justify-center group-hover:bg-secondary group-hover:text-white transition-colors">
            <span className="material-symbols-outlined text-2xl">vibration</span>
          </div>
          <span className="font-black text-[10px] uppercase tracking-widest text-secondary pr-2">Testar Alerta</span>
        </button>
      )}

      {/* Decorative Background */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none opacity-40">
        <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] bg-primary/5 rounded-full blur-[150px]"></div>
        <div className="absolute bottom-[-10%] left-[-20%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[150px]"></div>
      </div>

      <header className="glass sticky top-0 z-[60] px-4 py-4 sm:px-8 sm:py-6 flex items-center justify-between border-b border-white/50 animate-fade-in">
        <div className="flex items-center gap-3 sm:gap-5">
          <button
            onClick={onNewOrder}
            className="size-10 sm:size-14 bg-white/50 hover:bg-white rounded-[1rem] sm:rounded-[1.5rem] flex items-center justify-center text-secondary shadow-sm hover:shadow-md transition-all group"
          >
            <span className="material-symbols-outlined text-2xl sm:text-3xl group-hover:-translate-x-1 transition-transform">home</span>
          </button>
          <Logo variant="full" size={40} className="sm:h-14" />
          <div className="flex flex-col">
            <h2 className="text-lg sm:text-2xl font-black tracking-tighter text-secondary leading-none">KwikFood</h2>
            <p className="text-[8px] sm:text-[10px] uppercase tracking-[0.4em] font-black text-primary mt-0.5 sm:mt-1 truncate max-w-[100px] sm:max-w-none">{company?.name || 'Angola'}</p>
          </div>
        </div>
        <div className="bg-secondary text-white px-4 py-2.5 sm:px-8 sm:py-4 rounded-full font-black text-[11px] sm:text-[14px] tracking-widest uppercase shadow-2xl flex items-center gap-3">
          <span className="text-primary/60 hidden xs:inline">SENHA</span>
          <span className="text-white text-base sm:text-xl">#{order.ticketCode}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12 space-y-16 relative z-10">
        {/* Status Dashboard */}
        <section className="bg-surface rounded-[2.5rem] sm:rounded-[4rem] shadow-premium p-8 sm:p-12 border border-white/60 relative overflow-hidden animate-scale-in">
          <div className="absolute top-0 right-0 w-60 h-60 bg-primary/5 rounded-full blur-[80px] -mr-30 -mt-30"></div>

          <div className="flex flex-col lg:flex-row justify-between items-center gap-10 lg:gap-16 relative z-10">
            <div className="text-center lg:text-left space-y-4 sm:space-y-6">
              <div className="inline-flex items-center gap-2.5 px-4 py-2 bg-primary-soft rounded-full">
                <span className="size-2 bg-primary rounded-full animate-pulse-soft"></span>
                <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Sincronizado</p>
              </div>
              <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-secondary leading-tight">
                {order.status === OrderStatus.PENDING ? 'Seja Bem-vindo!' :
                  order.status === OrderStatus.RECEIVED ? 'Na Fila' :
                    order.status === OrderStatus.PREPARING ? 'Preparando' :
                      order.status === OrderStatus.READY ? 'Pronto!' : 'Entregue'}
              </h1>
              <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 sm:gap-5 text-text-muted font-bold uppercase text-[10px] sm:text-[12px] tracking-widest">
                <span className="flex items-center gap-1.5 pb-0.5 border-b border-primary/20">
                  <span className="material-symbols-outlined text-lg sm:text-xl">group</span>
                  Posição: <span className="text-secondary">{order.queuePosition}º</span>
                </span>
                <span className="flex items-center gap-1.5 pb-0.5 border-b border-primary/20">
                  <span className="material-symbols-outlined text-lg sm:text-xl">schedule</span>
                  Senha: <span className="text-primary">#{order.ticketCode}</span>
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4 mt-6 sm:mt-8">
                {order.status === OrderStatus.DELIVERED && (
                  <button
                    onClick={() => onNewOrder(company || undefined, order.customerPhone)}
                    className="px-8 py-4 sm:px-12 sm:py-5 bg-primary text-white rounded-full font-black text-[11px] sm:text-[13px] uppercase tracking-[0.3em] shadow-premium hover:bg-secondary transition-all flex items-center justify-center gap-3 sm:gap-4 animate-bounce-soft w-full sm:w-auto"
                  >
                    <span className="material-symbols-outlined text-xl sm:text-2xl">add_circle</span>
                    NOVO PEDIDO
                  </button>
                )}

                {(order.status === OrderStatus.PENDING || order.status === OrderStatus.RECEIVED) && (
                  <button
                    onClick={handleCancelOrder}
                    disabled={submittingOrder}
                    className="px-8 py-4 sm:px-10 sm:py-5 bg-secondary/5 hover:bg-red-500 hover:text-white text-secondary/40 rounded-full font-black text-[10px] sm:text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-3 w-full sm:w-auto group"
                  >
                    <span className="material-symbols-outlined text-xl group-hover:rotate-90 transition-transform">close</span>
                    CANCELAR ENTRADA
                  </button>
                )}
              </div>
            </div>

            <div className="size-48 sm:size-64 rounded-[2.5rem] sm:rounded-[3.5rem] bg-secondary flex flex-col items-center justify-center relative shadow-premium group transform hover:scale-105 transition-all duration-700">
              <div className="absolute inset-2 sm:inset-3 border-2 border-white/5 rounded-[2.2rem] sm:rounded-[2.8rem] border-dashed"></div>
              <div className="relative text-center">
                <span className="text-2xl sm:text-3xl font-black text-primary leading-none block mb-1">{formatTime(elapsedSeconds)}</span>
                <span className="absolute -top-6 sm:-top-8 left-1/2 -translate-x-1/2 text-primary/40 material-symbols-outlined text-xl sm:text-2xl animate-spin-slow">timer</span>
              </div>
              <p className="text-[8px] sm:text-[10px] font-black text-white/30 uppercase tracking-[0.5em] mt-1 sm:mt-2">DURAÇÃO</p>
            </div>
          </div>

          <div className="mt-10 sm:mt-16 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-8">
            <div className="bg-background/50 backdrop-blur-sm flex items-center gap-4 sm:gap-6 p-5 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] border border-white/50 group hover:bg-white transition-all">
              <div className="size-12 sm:size-16 bg-white rounded-xl sm:rounded-2xl flex items-center justify-center text-primary shadow-md border border-border group-hover:rotate-12 transition-transform overflow-hidden">
                {company?.logoUrl ? (
                  <img src={company.logoUrl} alt={company.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="material-symbols-outlined text-2xl sm:text-3xl">storefront</span>
                )}
              </div>
              <div className="overflow-hidden">
                <p className="text-[9px] sm:text-[10px] font-black text-text-muted uppercase tracking-widest mb-0.5 sm:mb-1">Local</p>
                <p className="text-base sm:text-xl font-black text-secondary truncate">{company?.name}</p>
              </div>
            </div>
            <div className="bg-background/50 backdrop-blur-sm flex items-center gap-4 sm:gap-6 p-5 sm:p-8 rounded-[1.5rem] sm:rounded-[2.5rem] border border-white/50 group hover:bg-white transition-all">
              <div className="size-12 sm:size-16 bg-white rounded-xl sm:rounded-2xl flex items-center justify-center text-primary shadow-md border border-border group-hover:rotate-12 transition-transform">
                <span className="material-symbols-outlined text-2xl sm:text-3xl">smartphone</span>
              </div>
              <div>
                <p className="text-[9px] sm:text-[10px] font-black text-text-muted uppercase tracking-widest mb-0.5 sm:mb-1">Contacto</p>
                <p className="text-base sm:text-xl font-black text-secondary">{order.customerPhone}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Cart Section - Move to Top when PENDING */}
        {order.status === OrderStatus.PENDING && cart.length > 0 && (
          <section className="animate-fade-in">
            <div className="bg-surface rounded-[2rem] sm:rounded-[4rem] shadow-premium p-6 sm:p-12 border-2 border-primary/20 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-[40px] -mr-16 -mt-16"></div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-6 sm:gap-8 relative z-10 border-b border-border/50 pb-6 sm:pb-8 mb-6 sm:mb-8">
                <div className="flex items-center gap-4 sm:gap-6">
                  <div className="size-14 sm:size-20 bg-secondary rounded-[1.25rem] sm:rounded-[2.2rem] flex items-center justify-center text-white relative shadow-premium">
                    <span className="material-symbols-outlined text-3xl sm:text-4xl">shopping_bag</span>
                    <span className="absolute -top-2 -right-2 sm:-top-3 sm:-right-3 size-7 sm:size-10 bg-primary text-white text-xs sm:text-[14px] font-black rounded-full flex items-center justify-center shadow-xl ring-4 sm:ring-8 ring-white/50 animate-pulse-soft">{cart.reduce((acc, item) => acc + item.quantity, 0)}</span>
                  </div>
                  <div className="text-center sm:text-left">
                    <h3 className="text-xl sm:text-2xl font-black tracking-tighter text-secondary">O Meu Pedido</h3>
                    <p className="text-[10px] sm:text-[12px] font-black text-text-muted uppercase tracking-widest mt-1">Total: <span className="text-primary font-black ml-1">Kz {totalCart.toLocaleString()}</span></p>
                  </div>
                </div>

                <button
                  onClick={handleFinishOrder}
                  disabled={submittingOrder}
                  className="group relative w-full sm:w-auto h-16 sm:h-20 px-8 sm:px-12 bg-primary hover:bg-secondary text-white rounded-[1rem] sm:rounded-[1.5rem] font-black text-[11px] sm:text-[13px] tracking-widest active:scale-[0.96] transition-all shadow-premium flex items-center justify-center gap-4 uppercase overflow-hidden"
                >
                  <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 skew-x-12"></div>
                  {submittingOrder ? (
                    <div className="size-6 sm:size-8 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-xl sm:text-2xl">send</span>
                      Confirmar
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[500px] overflow-y-auto pr-4 custom-scrollbar">
                {cart.map((item, idx) => (
                  <div key={`${item.id}-${idx}`} className="bg-background/40 rounded-[2.5rem] p-6 border border-white/50 group hover:bg-white hover:border-primary/20 transition-all animate-scale-in">
                    <div className="flex justify-between items-center mb-4">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center bg-background rounded-xl p-1 border border-border">
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="size-8 rounded-lg hover:bg-primary-soft text-text-muted hover:text-primary transition-all flex items-center justify-center"
                          >
                            <span className="material-symbols-outlined text-sm font-black">remove</span>
                          </button>
                          <span className="w-10 text-center font-black text-secondary">{item.quantity}</span>
                          <button
                            onClick={() => addToCart(item)}
                            className="size-8 rounded-lg hover:bg-primary-soft text-text-muted hover:text-primary transition-all flex items-center justify-center"
                          >
                            <span className="material-symbols-outlined text-sm font-black">add</span>
                          </button>
                        </div>
                        <span className="font-black text-lg text-secondary">{item.name}</span>
                      </div>
                      <button
                        onClick={() => {
                          const newCart = cart.filter((_, i) => i !== idx);
                          setCart(newCart);
                        }}
                        className="size-10 rounded-xl hover:bg-primary-soft text-text-muted hover:text-primary transition-all flex items-center justify-center"
                      >
                        <span className="material-symbols-outlined text-2xl">close</span>
                      </button>
                    </div>
                    <textarea
                      placeholder="Restrições or observações?"
                      value={item.observation}
                      onChange={(e) => updateObservation(idx, e.target.value)}
                      className="w-full bg-white/60 border-2 border-border/30 rounded-2xl p-5 text-sm font-bold focus:border-primary focus:bg-white resize-none placeholder:text-text-muted/40 outline-none transition-all shadow-sm"
                      rows={2}
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Menu/Products Section */}
        {(order.status === OrderStatus.PENDING || !order.items || order.items.length === 0) ? (
          <section className="space-y-12 animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <div className="flex flex-col gap-3">
              <h2 className="text-3xl font-black tracking-tight text-secondary">
                {order.status === OrderStatus.PENDING ? 'O que deseja ' : 'Cardápio do '}
                <span className="text-primary">{order.status === OrderStatus.PENDING ? 'comprar?' : 'Dia'}</span>
              </h2>
              <p className="text-text-muted font-medium text-lg">
                {order.status === OrderStatus.PENDING
                  ? 'Selecione os produtos abaixo para entrar na fila.'
                  : 'Faça o seu pedido enquanto aguarda pela sua vez.'}
              </p>
            </div>

            <div className="grid grid-cols-1 xs:grid-cols-2 gap-4 sm:gap-8">
              {products.map(p => {
                const inCart = cart.filter(c => c.id === p.id).length;
                return (
                  <div key={p.id} className="bg-white rounded-[1.5rem] sm:rounded-[2.8rem] p-4 sm:p-8 border border-white/60 shadow-md hover:shadow-premium transition-all group relative overflow-hidden animate-scale-in">
                    {inCart > 0 && (
                      <div className="absolute top-0 right-0 w-12 h-12 sm:w-20 sm:h-20 bg-primary/10 rounded-bl-[1.5rem] sm:rounded-bl-[3rem] flex items-center justify-center text-primary font-black text-lg sm:text-2xl animate-fade-in">
                        {cart.find(item => item.id === p.id)?.quantity || 0}
                      </div>
                    )}
                    <div className="flex flex-col sm:flex-row gap-4 sm:gap-8">
                      <div className="size-full xs:h-32 sm:size-36 rounded-[1rem] sm:rounded-[2.5rem] overflow-hidden shadow-sm flex-shrink-0 relative">
                        <img src={p.imageUrl} className="size-full object-cover group-hover:scale-110 transition-transform duration-1000" />
                        <div className="absolute inset-0 bg-secondary/10 group-hover:bg-transparent transition-colors"></div>
                      </div>
                      <div className="flex-1 flex flex-col justify-between py-1">
                        <div>
                          <h3 className="font-black text-base sm:text-xl text-secondary leading-tight tracking-tight mb-1 sm:mb-2 line-clamp-2">{p.name}</h3>
                          <p className="text-primary font-black text-base sm:text-xl">Kz {p.price.toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-4 mt-3 sm:mt-0">
                          {inCart > 0 && (
                            <button
                              onClick={() => removeFromCart(p.id)}
                              className="size-10 sm:size-12 rounded-xl sm:rounded-2xl bg-primary-soft flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all shadow-sm"
                            >
                              <span className="material-symbols-outlined text-lg font-black">remove</span>
                            </button>
                          )}
                          <button
                            onClick={() => addToCart(p)}
                            className="flex-1 h-10 sm:h-12 rounded-xl sm:rounded-2xl bg-secondary text-white flex items-center justify-center gap-2 sm:gap-3 hover:bg-primary transition-all font-black text-[9px] sm:text-[11px] tracking-widest uppercase shadow-lg shadow-secondary/20"
                          >
                            <span className="material-symbols-outlined text-lg sm:text-xl">{inCart > 0 ? 'add' : 'add_shopping_cart'}</span>
                            <span className="hidden xs:inline">{inCart > 0 ? 'MAIS' : 'PEDIR'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="bg-surface rounded-[2rem] sm:rounded-[4rem] p-8 sm:p-16 space-y-8 sm:space-y-12 shadow-premium border border-white relative overflow-hidden animate-scale-in" style={{ animationDelay: '0.2s' }}>
            <div className="absolute top-0 left-0 w-full h-2 bg-primary/50"></div>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6 sm:gap-10">
              <div className="flex items-center gap-5 sm:gap-8">
                <div className="size-14 sm:size-20 bg-secondary rounded-2xl sm:rounded-3xl flex items-center justify-center text-primary shadow-premium">
                  <span className="material-symbols-outlined text-3xl sm:text-5xl">receipt_long</span>
                </div>
                <div>
                  <h3 className="text-xl sm:text-2xl font-black tracking-tight text-secondary">Detalhes do Pedido</h3>
                  <p className="text-[10px] sm:text-sm font-black uppercase tracking-[0.3em] mt-0.5 sm:mt-1">Confirmado</p>
                </div>
              </div>
              <div className="text-center sm:text-right px-8 py-4 sm:px-10 sm:py-6 bg-background rounded-2xl sm:rounded-3xl border border-border w-full sm:w-auto">
                <p className="text-[9px] sm:text-[11px] font-black text-text-muted uppercase tracking-[0.4em] mb-1 sm:mb-2">Total</p>
                <p className="text-2xl sm:text-3xl font-black text-secondary tracking-tighter">Kz {order.total?.toLocaleString()}</p>
              </div>
            </div>

            <div className="divide-y divide-border/30 border-y border-border/30 bg-background/20 rounded-[1.5rem] sm:rounded-[3.5rem] px-6 sm:px-12 py-4">
              {order.items.map((item, i) => (
                <div key={i} className="py-6 sm:py-10 flex flex-col sm:flex-row justify-between sm:items-center gap-4 group animate-fade-in" style={{ animationDelay: `${0.1 * i}s` }}>
                  <div className="space-y-2 sm:space-y-4 flex-1">
                    <p className="font-black text-lg sm:text-2xl text-secondary group-hover:text-primary transition-colors">{item.name}</p>
                    {item.observation && (
                      <div className="inline-flex items-center gap-3 bg-primary-soft/50 px-4 py-2 sm:px-6 sm:py-3 rounded-xl sm:rounded-2xl border border-primary/10 shadow-sm">
                        <span className="material-symbols-outlined text-primary text-base sm:text-xl font-black animate-pulse-soft">info</span>
                        <p className="text-primary font-bold italic text-xs sm:text-sm">
                          "{item.observation}"
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between sm:justify-end items-center gap-4">
                    <span className="text-xs sm:text-sm font-black text-primary uppercase tracking-widest">{item.quantity}x</span>
                    <span className="font-black text-lg sm:text-xl text-secondary bg-white px-6 py-3 sm:px-8 sm:py-4 rounded-xl sm:rounded-[1.5rem] border border-border shadow-sm min-w-[120px] sm:min-w-[160px] text-center">
                      Kz {(item.price * item.quantity).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 sm:gap-5 p-6 sm:p-8 bg-primary-soft rounded-[1.5rem] sm:rounded-[3rem] border border-primary/20 animate-pulse-soft">
              <span className="material-symbols-outlined text-primary text-3xl sm:text-4xl">verified_user</span>
              <p className="text-[11px] sm:text-[12px] font-black text-primary uppercase tracking-[0.1em] sm:tracking-[0.2em] leading-relaxed">
                Seu pedido foi autenticado. Aguarde a notificação de pronto para levantar no balcão.
              </p>
            </div>
          </section>
        )}
      </main>

      {!cart.length && (
        <footer className="max-w-4xl mx-auto px-6 mt-20 mb-32 text-center animate-fade-in">
          <button
            onClick={onNewOrder}
            className="group inline-flex items-center gap-3 px-10 py-5 bg-secondary/5 hover:bg-secondary hover:text-white rounded-full text-[11px] font-black text-text-muted uppercase tracking-[0.3em] transition-all"
          >
            <span className="material-symbols-outlined group-hover:rotate-180 transition-transform duration-700">logout</span>
            Encerrar Sessão
          </button>
        </footer>
      )}
    </div>
  );
};

export default CustomerTrackingView;


import React, { useEffect, useState } from 'react';
import { Order, OrderStatus, Company, Product, CartItem } from '../types';
import { supabase } from '../src/lib/supabase';
import { requestNotificationPermission, showNotification } from '../src/lib/notifications';

interface CustomerTrackingViewProps {
  order: Order;
  onNewOrder: () => void;
}

const CustomerTrackingView: React.FC<CustomerTrackingViewProps> = ({ order: initialOrder, onNewOrder }) => {
  const [order, setOrder] = useState<Order>(initialOrder);
  const [company, setCompany] = useState<Company | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [submittingOrder, setSubmittingOrder] = useState(false);

  useEffect(() => {
    requestNotificationPermission();

    const loadData = async () => {
      setLoadingProducts(true);
      try {
        const { data: co } = await supabase.from('companies').select('*').eq('id', order.companyId).single();
        if (co) setCompany(co as Company);

        const { data: prods } = await supabase.from('products').select('*').eq('company_id', order.companyId);
        if (prods) setProducts(prods.map(p => ({ ...p, imageUrl: p.image_url })));

        // Hydrate order to get latest status if refreshed
        const { data: latestOrder } = await supabase.from('orders').select('*').eq('id', order.id).single();
        if (latestOrder) {
          setOrder({
            ...order,
            status: latestOrder.status,
            ticketCode: latestOrder.ticket_code,
            queuePosition: latestOrder.queue_position,
            estimatedMinutes: latestOrder.estimated_minutes,
            items: latestOrder.items,
            total: latestOrder.total
          });
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
          setOrder(prev => ({
            ...prev,
            status: updatedOrder.status,
            ticketCode: updatedOrder.ticket_code,
            queuePosition: updatedOrder.queue_position,
            estimatedMinutes: updatedOrder.estimated_minutes,
            items: updatedOrder.items,
            total: updatedOrder.total
          }));

          if (updatedOrder.status === OrderStatus.PREPARING) {
            showNotification('Seu pedido entrou na cozinha! 🍳', { body: 'Estamos preparando tudo com carinho.' });
          } else if (updatedOrder.status === OrderStatus.READY) {
            showNotification('Seu pedido está pronto! 🍔', { body: 'Pode levantar o seu pedido no balcão.' });
          } else if (updatedOrder.status === OrderStatus.DELIVERED) {
            showNotification('Pedido entregue! Bom apetite! 🍱', { body: 'Obrigado por escolher o KwikFood.' });
          }
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

  const addToCart = (p: Product) => setCart([...cart, { ...p, observation: '' }]);
  const removeFromCart = (pId: string) => {
    const idx = cart.findLastIndex(c => c.id === pId);
    if (idx > -1) {
      const newCart = [...cart];
      newCart.splice(idx, 1);
      setCart(newCart);
    }
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
      const total = cart.reduce((acc, p) => acc + p.price, 0);
      const { error } = await supabase
        .from('orders')
        .update({
          items: cart,
          total: total
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

  const totalCart = cart.reduce((acc, p) => acc + p.price, 0);

  return (
    <div className="bg-[#F8F8F8] min-h-screen font-inter pb-44">
      <header className="flex items-center justify-between px-8 py-6 bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="bg-primary text-white size-12 flex items-center justify-center rounded-2xl shadow-xl shadow-primary/20">
            <span className="material-symbols-outlined text-3xl">bolt</span>
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tighter text-black leading-none">KwikFood</h2>
            <p className="text-[10px] uppercase tracking-[0.4em] font-black text-primary mt-1">{company?.name || 'Angola'}</p>
          </div>
        </div>
        <div className="bg-black text-white px-5 py-2.5 rounded-full font-black text-[12px] tracking-widest uppercase shadow-lg shadow-black/10 flex items-center gap-2">
          <span className="text-primary">SENHA</span> #{order.ticketCode}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-12">
        {/* Status Section */}
        <section className="bg-white rounded-[3rem] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.08)] p-12 border border-gray-100 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32"></div>

          <div className="flex flex-col md:flex-row justify-between items-center gap-12 relative z-10">
            <div className="text-center md:text-left space-y-4">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full">
                <span className="size-2 bg-primary rounded-full animate-ping"></span>
                <p className="text-[10px] font-black text-primary uppercase tracking-widest">Estado Atual</p>
              </div>
              <h1 className="text-4xl md:text-6xl font-black tracking-tight text-black leading-tight">
                {order.status === OrderStatus.RECEIVED ? 'Aguardando na Fila' :
                  order.status === OrderStatus.PREPARING ? 'Sendo Preparado' :
                    order.status === OrderStatus.READY ? 'Pronto para Levantar' : 'Entregue com Sucesso'}
              </h1>
              <div className="flex items-center gap-3 text-gray-400 font-bold uppercase text-[11px] tracking-widest">
                <span className="material-symbols-outlined text-sm">group</span>
                Sua posição: <span className="text-black">{order.queuePosition}º lugar</span>
                <span className="mx-2 opacity-20">|</span>
                <span className="material-symbols-outlined text-sm">confirmation_number</span>
                Senha: <span className="text-primary">{order.ticketCode}</span>
              </div>
            </div>

            <div className="size-48 rounded-[2.5rem] bg-black flex flex-col items-center justify-center relative shadow-2xl shadow-black/20 group">
              <div className="absolute inset-2 border-2 border-white/10 rounded-[2rem] border-dashed"></div>
              <p className="text-6xl font-black text-primary group-hover:scale-110 transition-transform">{order.estimatedMinutes}</p>
              <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] mt-2">MINUTOS</p>
              <p className="text-[8px] font-bold text-white/20 uppercase tracking-widest mt-1">Estimativa</p>
            </div>
          </div>

          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 flex items-center gap-5 p-6 rounded-3xl border border-gray-100">
              <div className="size-12 bg-white rounded-2xl flex items-center justify-center text-primary shadow-sm border border-gray-100">
                <span className="material-symbols-outlined">storefront</span>
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Estabelecimento</p>
                <p className="text-base font-black text-black">{company?.name}</p>
              </div>
            </div>
            <div className="bg-gray-50 flex items-center gap-5 p-6 rounded-3xl border border-gray-100">
              <div className="size-12 bg-white rounded-2xl flex items-center justify-center text-primary shadow-sm border border-gray-100">
                <span className="material-symbols-outlined">smartphone</span>
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Seu Contacto</p>
                <p className="text-base font-black text-black">{order.customerPhone}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Menu Section */}
        {(!order.items || order.items.length === 0) ? (
          <section className="space-y-10">
            <div className="flex flex-col gap-2">
              <h2 className="text-4xl font-black tracking-tight text-black">Cardápio Digital</h2>
              <p className="text-gray-400 font-medium">Selecione o que deseja comer enquanto aguarda.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {products.map(p => {
                const inCart = cart.filter(c => c.id === p.id).length;
                return (
                  <div key={p.id} className="bg-white rounded-[2rem] p-6 border border-gray-100 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
                    {inCart > 0 && <div className="absolute top-0 right-0 w-16 h-16 bg-primary/10 rounded-bl-[2rem] flex items-center justify-center text-primary font-black text-xl">{inCart}</div>}
                    <div className="flex gap-6">
                      <div className="size-28 rounded-3xl overflow-hidden shadow-xl flex-shrink-0 relative">
                        <img src={p.imageUrl} className="size-full object-cover group-hover:scale-110 transition-transform duration-700" />
                        <div className="absolute inset-0 bg-black/5 group-hover:bg-transparent transition-colors"></div>
                      </div>
                      <div className="flex-1 flex flex-col justify-between py-1">
                        <div>
                          <h3 className="font-black text-xl text-black leading-tight tracking-tight">{p.name}</h3>
                          <p className="text-primary font-black text-lg mt-1">Kz {p.price.toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {inCart > 0 && (
                            <button
                              onClick={() => removeFromCart(p.id)}
                              className="size-10 rounded-xl bg-gray-100 flex items-center justify-center text-black hover:bg-black hover:text-white transition-all"
                            >
                              <span className="material-symbols-outlined text-sm font-black">remove</span>
                            </button>
                          )}
                          <button
                            onClick={() => addToCart(p)}
                            className="flex-1 h-10 rounded-xl bg-black text-white flex items-center justify-center gap-2 hover:bg-primary transition-all font-black text-[10px] tracking-widest uppercase"
                          >
                            <span className="material-symbols-outlined text-sm">add_shopping_cart</span>
                            Adicionar
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
          <section className="bg-white rounded-[3rem] p-12 space-y-10 shadow-xl border border-gray-100 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-primary"></div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-5">
                <div className="size-14 bg-black rounded-2xl flex items-center justify-center text-primary shadow-xl shadow-black/20">
                  <span className="material-symbols-outlined text-3xl">receipt_long</span>
                </div>
                <div>
                  <h3 className="text-3xl font-black tracking-tight text-black">Resumo do Pedido</h3>
                  <p className="text-gray-400 text-sm font-medium uppercase tracking-widest">Itens Confirmados</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Total GERAL</p>
                <p className="text-4xl font-black text-black">Kz {order.total?.toLocaleString()}</p>
              </div>
            </div>

            <div className="divide-y divide-gray-100 border-y border-gray-100 bg-gray-50/30 rounded-[2rem] px-8">
              {order.items.map((item, i) => (
                <div key={i} className="py-8 flex justify-between items-center group">
                  <div className="space-y-2">
                    <p className="font-black text-xl text-black group-hover:text-primary transition-colors">{item.name}</p>
                    {item.observation && (
                      <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-primary/10 shadow-sm animate-in slide-in-from-left duration-500">
                        <span className="material-symbols-outlined text-primary text-sm font-black">notification_important</span>
                        <p className="text-primary font-bold italic text-[12px] leading-tight">
                          "{item.observation}"
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="font-black text-lg text-black bg-white px-5 py-2.5 rounded-2xl border border-gray-100 shadow-sm min-w-[120px] inline-block">
                      Kz {item.price.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 p-6 bg-primary/5 rounded-[2rem] border border-primary/10">
              <span className="material-symbols-outlined text-primary">verified_user</span>
              <p className="text-[11px] font-black text-primary uppercase tracking-widest">
                Seu pedido foi recebido e está na fila. Fique atento às notificações!
              </p>
            </div>
          </section>
        )}
      </main>

      {/* Persistent Cart Bottom Bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-[100] bg-white border-t border-gray-100 p-8 shadow-[0_-20px_60px_rgba(0,0,0,0.1)] animate-in slide-in-from-bottom-full duration-700">
          <div className="max-w-xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="size-12 bg-black rounded-2xl flex items-center justify-center text-white relative">
                  <span className="material-symbols-outlined">shopping_bag</span>
                  <span className="absolute -top-2 -right-2 size-6 bg-primary text-white text-[10px] font-black rounded-full flex items-center justify-center shadow-lg ring-4 ring-white">{cart.length}</span>
                </div>
                <div>
                  <h3 className="text-2xl font-black tracking-tighter text-black">Carrinho Aberto</h3>
                  <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Total: <span className="text-primary font-black">Kz {totalCart.toLocaleString()}</span></p>
                </div>
              </div>
              <button
                onClick={handleFinishOrder}
                disabled={submittingOrder}
                className="bg-black hover:bg-primary text-white h-16 px-12 rounded-2xl font-black text-sm tracking-[0.2em] active:scale-95 transition-all shadow-xl shadow-black/10 flex items-center gap-4 uppercase"
              >
                {submittingOrder ? (
                  <div className="size-6 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span>Confirmar Pedido</span>
                    <span className="material-symbols-outlined font-black">arrow_forward</span>
                  </>
                )}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[25vh] overflow-y-auto pr-2 custom-scrollbar">
              {cart.map((item, idx) => (
                <div key={`${item.id}-${idx}`} className="bg-gray-50 rounded-[1.5rem] p-4 border border-gray-100 group hover:bg-white hover:border-primary/20 transition-all">
                  <div className="flex justify-between items-center mb-3">
                    <span className="font-black text-sm text-black">{item.name}</span>
                    <button onClick={() => removeFromCart(item.id)} className="text-gray-300 hover:text-primary transition-colors">
                      <span className="material-symbols-outlined text-base">close</span>
                    </button>
                  </div>
                  <textarea
                    placeholder="Alguma restrição?"
                    value={item.observation}
                    onChange={(e) => updateObservation(idx, e.target.value)}
                    className="w-full bg-white border-gray-100 rounded-xl p-3 text-xs font-medium focus:ring-primary focus:border-primary resize-none placeholder:text-gray-300 outline-none"
                    rows={1}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!cart.length && (
        <footer className="max-w-4xl mx-auto px-6 mt-12 mb-20 text-center">
          <button
            onClick={onNewOrder}
            className="text-gray-300 font-black text-[10px] hover:text-primary transition-all tracking-[0.4em] uppercase py-4 px-8 border border-transparent hover:border-gray-100 rounded-full"
          >
            Encerrar Sessão
          </button>
        </footer>
      )}
    </div>
  );
};

export default CustomerTrackingView;

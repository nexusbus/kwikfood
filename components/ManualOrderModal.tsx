import React, { useState } from 'react';
import { supabase } from '../src/lib/supabase';
import { Company, Product, OrderStatus, OrderType, CartItem } from '../types';

interface ManualOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: Company;
  products: Product[];
  onOrderCreated: () => void;
}

export const ManualOrderModal: React.FC<ManualOrderModalProps> = ({
  isOpen,
  onClose,
  company,
  products,
  onOrderCreated
}) => {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderType, setOrderType] = useState<OrderType>(OrderType.TAKE_AWAY);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'TPA' | 'TRANSFER'>('CASH');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1, selectedAccompaniments: [] }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.id !== productId));
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === productId) {
        const newQ = item.quantity + delta;
        return newQ > 0 ? { ...item, quantity: newQ } : item;
      }
      return item;
    }));
  };

  const total = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      alert("Adicione pelo menos um produto ao pedido.");
      return;
    }
    setLoading(true);

    try {
      // Get next ticket code
      const { data: latestOrder } = await supabase
        .from('orders')
        .select('ticket_number')
        .eq('company_id', company.id)
        .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const nextNumber = latestOrder ? (latestOrder.ticket_number + 1) : 1;
      const ticketCode = `KWK${nextNumber.toString().padStart(3, '0')}`;

      // Insert Order
      const { error } = await supabase.from('orders').insert([{
        company_id: company.id,
        ticket_code: ticketCode,
        ticket_number: nextNumber,
        customer_phone: customerPhone || '999999999',
        customer_name: customerName || 'Balcão',
        status: OrderStatus.RECEIVED,
        items: cart,
        total: total,
        queue_position: nextNumber,
        estimated_minutes: 15,
        payment_method: paymentMethod,
        order_type: orderType,
        created_at: new Date().toISOString()
      }]);

      if (error) throw error;
      
      onOrderCreated();
      onClose();
    } catch (err: any) {
      alert('Erro ao criar pedido: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 sm:p-6 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-sm w-full max-w-4xl shadow-2xl animate-in zoom-in-95 duration-300 relative overflow-hidden flex flex-col max-h-[90vh]">
        
        <header className="px-6 py-4 border-b border-[#E5E7EB] flex justify-between items-center bg-[#FCFAFA] sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-2xl">point_of_sale</span>
            <div>
              <h3 className="text-[13px] font-black text-secondary uppercase tracking-[0.2em]">Novo Pedido Manual</h3>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">Registo Direto no Balcão</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-sm bg-white border border-[#E5E7EB] hover:border-primary hover:text-primary transition-all shadow-sm">
            <span className="material-symbols-outlined text-lg text-zinc-500">close</span>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto flex flex-col lg:flex-row">
          {/* Menu Selection */}
          <div className="flex-1 p-6 border-r border-[#E5E7EB] bg-zinc-50 flex flex-col h-full min-h-0 overflow-hidden">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Selecione os Produtos</h4>
            </div>

            {/* Filtro de Pesquisa */}
            <div className="relative mb-4 shrink-0">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="BUSCAR PRODUTO..."
                className="w-full h-10 pl-10 pr-4 bg-white border border-[#E5E7EB] rounded-sm text-xs font-bold focus:border-primary outline-none transition-colors uppercase tracking-widest placeholder:text-zinc-400"
              />
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-base">search</span>
            </div>

            <div className="flex-1 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2 pr-1 custom-scrollbar">
              {products
                .filter(p => p.status !== 'OUT_OF_STOCK')
                .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(product => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addToCart(product)}
                    className="bg-white p-3 border border-[#E5E7EB] rounded-sm flex items-center gap-3 hover:border-primary transition-colors text-left active:scale-[0.98] h-20 shrink-0"
                  >
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.name} className="size-12 rounded bg-zinc-100 object-cover" />
                    ) : (
                      <div className="size-12 rounded bg-zinc-100 flex items-center justify-center">
                        <span className="material-symbols-outlined text-zinc-400">fastfood</span>
                      </div>
                    )}
                    <div className="flex-1 overflow-hidden">
                      <p className="text-xs font-bold text-secondary truncate">{product.name}</p>
                      <p className="text-[10px] font-black text-primary uppercase tracking-widest mt-1">{product.price.toLocaleString()} Kz</p>
                    </div>
                    <span className="material-symbols-outlined text-zinc-300">add_circle</span>
                  </button>
                ))}
            </div>
          </div>

          {/* Cart & Details */}
          <div className="w-full lg:w-96 bg-white flex flex-col h-[500px] lg:h-auto border-t lg:border-t-0 border-[#E5E7EB]">
            <form onSubmit={handleSubmit} className="flex flex-col h-full">
              <div className="p-6 border-b border-[#E5E7EB] space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">Cliente (Opcional)</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="Nome do Cliente"
                    className="w-full h-10 px-3 bg-zinc-50 border border-[#E5E7EB] rounded-sm text-xs font-bold focus:border-primary outline-none transition-colors uppercase"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">Telefone (Opcional)</label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    placeholder="Nº de Telefone"
                    className="w-full h-10 px-3 bg-zinc-50 border border-[#E5E7EB] rounded-sm text-xs font-bold focus:border-primary outline-none transition-colors"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">Tipo</label>
                    <select
                      value={orderType}
                      onChange={e => setOrderType(e.target.value as OrderType)}
                      className="w-full h-10 px-3 bg-zinc-50 border border-[#E5E7EB] rounded-sm text-[10px] font-black uppercase tracking-widest focus:border-primary outline-none"
                    >
                      <option value="TAKE_AWAY">Levantamento</option>
                      <option value="EAT_IN">Comer Aqui</option>
                      <option value="DELIVERY">Entrega</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">Pagamento</label>
                    <select
                      value={paymentMethod}
                      onChange={e => setPaymentMethod(e.target.value as any)}
                      className="w-full h-10 px-3 bg-zinc-50 border border-[#E5E7EB] rounded-sm text-[10px] font-black uppercase tracking-widest focus:border-primary outline-none"
                    >
                      <option value="CASH">Numerário</option>
                      <option value="TPA">TPA / Multicaixa</option>
                      <option value="TRANSFER">Transferência</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 bg-zinc-50">
                <h4 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-4">Resumo ({cart.length} itens)</h4>
                {cart.length === 0 ? (
                  <div className="text-center py-8 text-zinc-400">
                    <span className="material-symbols-outlined text-4xl mb-2 opacity-50">shopping_cart</span>
                    <p className="text-[10px] font-black uppercase tracking-widest">Carrinho Vazio</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cart.map(item => (
                      <div key={item.id} className="flex justify-between items-center bg-white p-3 border border-[#E5E7EB] rounded-sm">
                        <div className="flex-1 pr-2">
                          <p className="text-[11px] font-bold text-secondary uppercase leading-tight mb-1">{item.name}</p>
                          <p className="text-[10px] font-black text-primary tracking-widest">{(item.price * item.quantity).toLocaleString()} Kz</p>
                        </div>
                        <div className="flex items-center gap-2 bg-zinc-50 rounded-sm p-1 border border-[#E5E7EB]">
                          <button type="button" onClick={() => updateQuantity(item.id, -1)} className="size-6 flex items-center justify-center text-secondary hover:text-primary bg-white rounded-sm border border-[#E5E7EB] shadow-sm">
                            <span className="material-symbols-outlined text-[14px]">remove</span>
                          </button>
                          <span className="text-[10px] font-black w-4 text-center">{item.quantity}</span>
                          <button type="button" onClick={() => updateQuantity(item.id, 1)} className="size-6 flex items-center justify-center text-secondary hover:text-primary bg-white rounded-sm border border-[#E5E7EB] shadow-sm">
                            <span className="material-symbols-outlined text-[14px]">add</span>
                          </button>
                        </div>
                        <button type="button" onClick={() => removeFromCart(item.id)} className="ml-2 size-8 flex items-center justify-center text-red-400 hover:text-red-600 transition-colors">
                          <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-[#E5E7EB] bg-white mt-auto">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Total a Pagar</span>
                  <span className="text-xl font-black text-secondary">{total.toLocaleString()} Kz</span>
                </div>
                <button
                  type="submit"
                  disabled={loading || cart.length === 0}
                  className="w-full h-12 bg-primary hover:bg-[#BE123C] disabled:opacity-50 text-white rounded-sm font-black text-[11px] uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 shadow-sm"
                >
                  {loading ? (
                    <span className="material-symbols-outlined animate-spin">progress_activity</span>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-lg">check_circle</span>
                      CONFIRMAR PEDIDO
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
};


import React, { useState, useEffect } from 'react';
import { Company, Product, ProductStatus, Order, OrderStatus } from '../types';
import { fetchProducts } from '../constants';
import { supabase } from '../src/lib/supabase';

interface CompanyAdminViewProps {
  company: Company;
  onLogout: () => void;
}

const getStatusColor = (status: OrderStatus) => {
  switch (status) {
    case OrderStatus.RECEIVED: return 'bg-blue-100 text-blue-600';
    case OrderStatus.PREPARING: return 'bg-orange-100 text-orange-600';
    case OrderStatus.READY: return 'bg-green-100 text-green-600';
    case OrderStatus.DELIVERED: return 'bg-gray-100 text-gray-600';
    default: return 'bg-gray-100 text-gray-600';
  }
};

const CompanyAdminView: React.FC<CompanyAdminViewProps> = ({ company, onLogout }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<'PRODUTOS' | 'FILA' | 'HISTORICO'>('FILA');
  const [productFilter, setProductFilter] = useState('Todos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [ticketSearch, setTicketSearch] = useState('');

  // Form state
  const [pName, setPName] = useState('');
  const [pPrice, setPPrice] = useState<number | ''>('');
  const [pCategory, setPCategory] = useState('Hambúrgueres');
  const [pStatus, setPStatus] = useState<ProductStatus>(ProductStatus.ACTIVE);
  const [pImageUrl, setPImageUrl] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: pData } = await supabase.from('products').select('*').eq('company_id', company.id);
        if (pData) setProducts(pData.map(p => ({ ...p, imageUrl: p.image_url })));

        const { data: oData } = await supabase
          .from('orders')
          .select('id, company_id, customer_phone, status, items, total, queue_position, estimated_minutes, ticket_code, ticket_number, timer_last_started_at, timer_accumulated_seconds, created_at')
          .eq('company_id', company.id)
          .in('status', [OrderStatus.RECEIVED, OrderStatus.PREPARING, OrderStatus.READY])
          .order('created_at', { ascending: true });

        if (oData) setOrders(oData.map(o => ({
          ...o,
          companyId: o.company_id,
          ticketCode: o.ticket_code,
          customerPhone: o.customer_phone,
          queuePosition: o.queue_position,
          estimatedMinutes: o.estimated_minutes,
          timerAccumulatedSeconds: o.timer_accumulated_seconds || 0,
          timerLastStartedAt: o.timer_last_started_at,
          timestamp: new Date(o.created_at).toLocaleTimeString()
        })));

        const { data: hData } = await supabase
          .from('orders')
          .select('id, company_id, customer_phone, status, items, total, queue_position, estimated_minutes, ticket_code, ticket_number, timer_last_started_at, timer_accumulated_seconds, created_at')
          .eq('company_id', company.id)
          .eq('status', OrderStatus.DELIVERED)
          .order('created_at', { ascending: false })
          .limit(50);

        if (hData) setHistoryOrders(hData.map(o => ({
          ...o,
          companyId: o.company_id,
          ticketCode: o.ticket_code,
          customerPhone: o.customer_phone,
          timerAccumulatedSeconds: o.timer_accumulated_seconds || 0,
          timestamp: new Date(o.created_at).toLocaleString()
        })));
      } catch (err) {
        console.error(err);
      }
    };
    loadData();

    const pChannel = supabase
      .channel(`products-${company.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `company_id=eq.${company.id}` }, () => loadData())
      .subscribe();

    const oChannel = supabase
      .channel(`orders-${company.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `company_id=eq.${company.id}` }, () => loadData())
      .subscribe();

    return () => {
      supabase.removeChannel(pChannel);
      supabase.removeChannel(oChannel);
    };
  }, [company.id]);

  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    try {
      const order = orders.find(o => o.id === orderId);
      if (!order) return;

      const updates: any = { status };
      const now = new Date().toISOString();

      if (status === OrderStatus.PREPARING) {
        // Start or resume timer
        updates.timer_last_started_at = now;
      } else if (status === OrderStatus.READY || status === OrderStatus.DELIVERED) {
        // Pause timer and accumulate
        if (order.timerLastStartedAt) {
          const start = new Date(order.timerLastStartedAt).getTime();
          const current = new Date().getTime();
          const elapsed = Math.floor((current - start) / 1000);
          updates.timer_accumulated_seconds = (order.timerAccumulatedSeconds || 0) + elapsed;
          updates.timer_last_started_at = null;
        } else if (!order.timerAccumulatedSeconds) {
          // If timer was never started (e.g. skipped PREPARING), 
          // calculate total time from creation to finish
          const start = new Date(order.timestamp).getTime();
          const current = new Date().getTime();
          const elapsed = Math.floor((current - start) / 1000);
          updates.timer_accumulated_seconds = elapsed;
        }
      }

      const { error } = await supabase.from('orders').update(updates).eq('id', orderId);
      if (error) throw error;
    } catch (err) {
      alert('Erro ao atualizar pedido.');
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pPrice === '') return;
    setSaving(true);
    try {
      const productData = { name: pName, price: Number(pPrice), category: pCategory, status: pStatus, image_url: pImageUrl, company_id: company.id };
      if (modalMode === 'add') {
        const { error } = await supabase.from('products').insert([productData]);
        if (error) throw error;
      } else if (selectedProduct) {
        const { error } = await supabase.from('products').update(productData).eq('id', selectedProduct.id);
        if (error) throw error;
      }
      setIsModalOpen(false);
    } catch (err) {
      alert('Erro ao guardar produto.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;
    try {
      const { error } = await supabase.from('products').delete().eq('id', productId);
      if (error) throw error;
    } catch (err) {
      alert('Erro ao excluir produto.');
    }
  };

  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${company.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('products')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('products')
        .getPublicUrl(filePath);

      setPImageUrl(data.publicUrl);
    } catch (err) {
      alert('Erro ao carregar imagem.');
    } finally {
      setUploading(false);
    }
  };

  const openModal = (mode: 'add' | 'edit', product?: Product) => {
    setModalMode(mode);
    if (mode === 'edit' && product) {
      setSelectedProduct(product);
      setPName(product.name); setPPrice(product.price); setPCategory(product.category); setPStatus(product.status); setPImageUrl(product.imageUrl);
    } else {
      setSelectedProduct(null);
      setPName(''); setPPrice(''); setPCategory('Hambúrgueres'); setPStatus(ProductStatus.ACTIVE); setPImageUrl('');
    }
    setIsModalOpen(true);
  };

  const filteredProducts = productFilter === 'Todos' ? products : products.filter(p => p.category === productFilter);

  return (
    <div className="flex h-screen bg-background overflow-hidden selection:bg-primary selection:text-white">
      {/* Premium Sidebar */}
      <aside className="w-80 glass border-r border-white/50 p-8 flex flex-col gap-12 relative z-[100] animate-in slide-in-from-left duration-1000">
        <div className="flex items-center gap-5 relative group">
          <div className="size-16 bg-primary rounded-[1.8rem] flex items-center justify-center text-white shadow-premium transform group-hover:rotate-12 transition-transform duration-500">
            <span className="material-symbols-outlined text-4xl">restaurant</span>
          </div>
          <div className="overflow-hidden">
            <h1 className="text-xl font-black tracking-tighter text-secondary leading-none truncate">{company.name}</h1>
            <p className="text-[9px] font-black text-primary uppercase tracking-[0.4em] mt-2">Portal de Gestão</p>
          </div>
        </div>

        <nav className="flex flex-col gap-4">
          <button
            onClick={() => setActiveTab('FILA')}
            className={`flex items-center gap-5 px-8 py-5 rounded-[1.5rem] transition-all font-black text-[12px] uppercase tracking-widest relative overflow-hidden group ${activeTab === 'FILA' ? 'bg-secondary text-white shadow-premium' : 'text-text-muted hover:bg-white/40 hover:text-secondary'}`}
          >
            <span className="material-symbols-outlined text-2xl">view_list</span>
            Monitor de Fila
            {activeTab === 'FILA' && <div className="absolute right-6 size-2 bg-primary rounded-full animate-pulse"></div>}
          </button>
          <button
            onClick={() => setActiveTab('PRODUTOS')}
            className={`flex items-center gap-5 px-8 py-5 rounded-[1.5rem] transition-all font-black text-[12px] uppercase tracking-widest relative overflow-hidden group ${activeTab === 'PRODUTOS' ? 'bg-secondary text-white shadow-premium' : 'text-text-muted hover:bg-white/40 hover:text-secondary'}`}
          >
            <span className="material-symbols-outlined text-2xl">inventory_2</span>
            Menu Digital
          </button>
          <button
            onClick={() => setActiveTab('HISTORICO')}
            className={`flex items-center gap-5 px-8 py-5 rounded-[1.5rem] transition-all font-black text-[12px] uppercase tracking-widest relative overflow-hidden group ${activeTab === 'HISTORICO' ? 'bg-secondary text-white shadow-premium' : 'text-text-muted hover:bg-white/40 hover:text-secondary'}`}
          >
            <span className="material-symbols-outlined text-2xl">history</span>
            Audit & Histórico
          </button>

          <div className="mt-12 pt-12 border-t border-border/50">
            <button onClick={onLogout} className="w-full flex items-center justify-between px-8 py-5 rounded-[1.5rem] text-primary font-black text-[12px] uppercase tracking-widest hover:bg-primary-soft transition-all group">
              <span className="flex items-center gap-5">
                <span className="material-symbols-outlined text-2xl">logout</span>
                Sair
              </span>
              <span className="material-symbols-outlined text-xl opacity-0 group-hover:opacity-100 group-hover:translate-x-2 transition-all">arrow_forward</span>
            </button>
          </div>
        </nav>

        <div className="mt-auto p-8 rounded-[2.5rem] bg-secondary text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-full blur-2xl -mr-12 -mt-12"></div>
          <p className="text-[10px] font-black text-white/30 uppercase tracking-[0.4em] mb-2">SISTEMA ATIVO</p>
          <code className="text-[12px] text-primary font-mono tracking-tighter">{company.id}</code>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-12 relative custom-scrollbar">
        <div className="fixed top-0 right-0 w-1/3 h-1/2 bg-primary/5 rounded-full blur-[150px] pointer-events-none"></div>

        <header className="mb-16 flex flex-col lg:flex-row justify-between items-center gap-10 relative z-10 animate-fade-in">
          <div>
            <h2 className="text-3xl lg:text-5xl font-black tracking-tighter text-secondary leading-none">
              {activeTab === 'FILA' ? 'A Cozinha' : activeTab === 'PRODUTOS' ? 'O Menu' : 'Audit & Histórico'}
            </h2>
            <div className="flex items-center gap-3 mt-4">
              <span className="size-2.5 bg-green-500 rounded-full animate-pulse-soft"></span>
              <p className="text-text-muted font-black uppercase text-[11px] tracking-[0.4em]">Monitor em Tempo Real</p>
            </div>
          </div>

          <div className="flex flex-wrap justify-center items-center gap-6">
            {activeTab === 'FILA' && (
              <div className="relative group">
                <input
                  type="text"
                  placeholder="Localizar Senha..."
                  value={ticketSearch}
                  onChange={(e) => setTicketSearch(e.target.value.toUpperCase())}
                  className="w-80 h-20 bg-white border-2 border-border/40 rounded-[1.5rem] px-16 font-black text-xl text-secondary shadow-lg group-focus-within:border-primary transition-all outline-none"
                />
                <span className="material-symbols-outlined absolute left-6 top-1/2 -translate-y-1/2 text-text-muted/40">search</span>
              </div>
            )}
            <div className="bg-surface px-8 py-5 rounded-[1.5rem] border border-border shadow-premium flex flex-col items-center min-w-[150px]">
              <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.3em] mb-1">Pedidos Atuais</p>
              <p className="text-4xl font-black text-secondary">{orders.length}</p>
            </div>
            {activeTab === 'PRODUTOS' && (
              <button
                onClick={() => openModal('add')}
                className="h-20 px-12 bg-primary hover:bg-secondary text-white rounded-[1.5rem] font-black text-[11px] uppercase tracking-[0.3em] shadow-premium transition-all flex items-center gap-4"
              >
                <span className="material-symbols-outlined text-2xl">add</span>
                NOVO ITEM
              </button>
            )}
          </div>
        </header>

        <div className="relative z-10">
          {activeTab === 'FILA' ? (
            <div className="space-y-12 animate-fade-in">
              {orders.filter(o => ticketSearch === '' || o.ticketCode.includes(ticketSearch)).length === 0 ? (
                <div className="bg-white rounded-[4rem] p-40 text-center border-2 border-dashed border-border/60 animate-scale-in">
                  <div className="size-32 bg-background rounded-full flex items-center justify-center mx-auto mb-10 text-border">
                    <span className="material-symbols-outlined text-6xl">restaurant</span>
                  </div>
                  <h3 className="text-3xl font-black text-border uppercase tracking-[0.3em]">Cozinha em Descanso</h3>
                  <p className="text-text-muted mt-4 font-medium text-lg">Novos pedidos aparecerão instantaneamente aqui.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-10">
                  {orders.filter(o => ticketSearch === '' || o.ticketCode.includes(ticketSearch)).map(order => (
                    <div key={order.id} className="bg-surface rounded-[3.5rem] p-12 border border-border shell-premium shadow-premium group overflow-hidden relative animate-scale-in">
                      <div className="absolute top-0 left-0 w-3 h-full transition-all group-hover:w-4" style={{ backgroundColor: order.status === OrderStatus.PREPARING ? '#f97316' : order.status === OrderStatus.READY ? '#22c55e' : '#3b82f6' }}></div>

                      <div className="flex flex-col lg:flex-row gap-12 items-start lg:items-center w-full">
                        <div className="flex items-center gap-10 flex-shrink-0">
                          <div className="relative transform group-hover:scale-105 transition-transform duration-700">
                            <div className="size-24 bg-secondary rounded-[1.8rem] flex flex-col items-center justify-center border-2 border-white/10 shadow-premium">
                              <p className="text-[9px] font-black text-primary uppercase tracking-[0.3em] mb-0.5">Senha</p>
                              <h3 className="text-3xl font-black text-white tracking-tighter">{order.ticketCode}</h3>
                            </div>
                            <div className="absolute -top-4 -right-4 size-12 bg-primary text-white rounded-full flex items-center justify-center text-[11px] font-black border-4 border-white shadow-xl">
                              #{order.id.slice(0, 3).toUpperCase()}
                            </div>
                          </div>
                          <div className="space-y-3">
                            <div className="flex items-center gap-4">
                              <h4 className="text-2xl md:text-3xl font-black tracking-tighter text-secondary">{order.customerPhone}</h4>
                              <span className="px-4 py-1.5 bg-primary-soft text-primary rounded-full text-[10px] font-black uppercase tracking-widest">VIP CLIENT</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-4 text-[11px] font-black text-text-muted uppercase tracking-widest">
                              <span className="flex items-center gap-2 pr-4 border-r border-border/50"><span className="material-symbols-outlined text-lg">schedule</span> {order.timestamp}</span>
                              <span className={`px-4 py-1.5 rounded-full shadow-sm ${getStatusColor(order.status)}`}>{order.status}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex-1 lg:border-x border-border/50 px-8 py-4 min-h-[140px] flex flex-col justify-center gap-6">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {order.items.map((item, i) => (
                              <div key={i} className="flex flex-col gap-4 p-6 bg-white rounded-[2rem] border-2 border-border/50 shadow-sm group/item hover:border-primary/30 transition-all">
                                <div className="flex items-start gap-5">
                                  <div className="size-12 bg-secondary text-white rounded-xl flex items-center justify-center text-lg font-black group-hover/item:bg-primary transition-colors flex-shrink-0 shadow-lg">
                                    {item.quantity}
                                  </div>
                                  <div className="flex-1 pt-1">
                                    <span className="font-black text-2xl text-secondary leading-tight block">
                                      {item.name}
                                    </span>
                                  </div>
                                </div>

                                {item.observation && (
                                  <div className="flex items-start gap-4 p-5 bg-orange-50 rounded-[1.5rem] border-l-8 border-orange-400 animate-pulse-soft">
                                    <span className="material-symbols-outlined text-orange-600 text-2xl font-black">warning</span>
                                    <div className="flex-1">
                                      <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-1">Restrição / Observação</p>
                                      <span className="text-base font-black text-orange-800 uppercase leading-snug">
                                        {item.observation}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-row lg:flex-col gap-4 min-w-[280px] w-full lg:w-auto">
                          <button
                            onClick={() => updateOrderStatus(order.id, OrderStatus.PREPARING)}
                            className={`flex-1 flex items-center justify-center gap-5 h-20 rounded-[1.8rem] font-black text-[12px] uppercase tracking-widest transition-all ${order.status === OrderStatus.PREPARING ? 'bg-orange-600 text-white shadow-premium ring-8 ring-orange-600/10' : 'bg-background text-text-muted hover:bg-secondary hover:text-white'}`}
                          >
                            <span className="material-symbols-outlined text-2xl">{order.status === OrderStatus.PREPARING ? 'cooking' : 'outdoor_grill'}</span>
                            {order.status === OrderStatus.PREPARING ? 'COZINHANDO' : 'PREPARAR'}
                          </button>
                          <button
                            onClick={() => updateOrderStatus(order.id, OrderStatus.READY)}
                            className={`flex-1 flex items-center justify-center gap-5 h-20 rounded-[1.8rem] font-black text-[12px] uppercase tracking-widest transition-all ${order.status === OrderStatus.READY ? 'bg-green-600 text-white shadow-premium ring-8 ring-green-600/10' : 'bg-background text-text-muted hover:bg-secondary hover:text-white'}`}
                          >
                            <span className="material-symbols-outlined text-2xl">notifications_active</span>
                            {order.status === OrderStatus.READY ? 'PRONTO' : 'NOTIFICAR'}
                          </button>
                          <button
                            onClick={() => updateOrderStatus(order.id, OrderStatus.DELIVERED)}
                            className="flex-1 flex items-center justify-center gap-5 h-20 bg-secondary text-white rounded-[1.8rem] font-black text-[12px] uppercase tracking-widest hover:bg-primary shadow-premium transition-all active:scale-95"
                          >
                            <span className="material-symbols-outlined text-2xl">done_all</span>
                            ENTREGAR
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'PRODUTOS' ? (
            <div className="space-y-16 animate-fade-in">
              <div className="flex items-center gap-5 flex-wrap">
                {['Todos', 'Hambúrgueres', 'Bebidas', 'Acompanhamentos'].map(cat => (
                  <button
                    key={cat} onClick={() => setProductFilter(cat)}
                    className={`px-10 py-4 rounded-full font-black text-[11px] uppercase tracking-widest transition-all ${productFilter === cat ? 'bg-secondary text-white shadow-premium' : 'bg-surface text-text-muted border border-border hover:border-secondary'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-10">
                {filteredProducts.map(p => (
                  <div key={p.id} className="bg-surface rounded-[3.5rem] overflow-hidden border border-border shadow-md hover:shadow-premium transition-all duration-700 group flex flex-col animate-scale-in">
                    <div className="relative h-72 bg-background overflow-hidden">
                      <img src={p.imageUrl} alt={p.name} className="size-full object-cover group-hover:scale-110 transition-all duration-1000" />
                      <div className="absolute top-8 right-8">
                        <span className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white shadow-premium ${p.status === ProductStatus.ACTIVE ? 'bg-green-500' : 'bg-red-500'}`}>
                          {p.status}
                        </span>
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-secondary/40 to-transparent"></div>
                    </div>
                    <div className="p-10 flex flex-col flex-1 justify-between gap-10">
                      <div>
                        <h4 className="font-black text-2xl text-secondary tracking-tight mb-3">{p.name}</h4>
                        <div className="flex items-center justify-between">
                          <p className="text-primary font-black text-3xl tracking-tighter">Kz {p.price.toLocaleString()}</p>
                          <span className="text-[10px] font-bold text-text-muted uppercase tracking-[0.3em] bg-background px-4 py-1.5 rounded-full">{p.category}</span>
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <button onClick={() => openModal('edit', p)} className="flex-1 h-16 bg-background hover:bg-secondary hover:text-white rounded-[1.2rem] font-black text-[11px] uppercase tracking-widest flex items-center justify-center gap-3 transition-all">
                          <span className="material-symbols-outlined text-2xl">edit_note</span>
                          EDITAR
                        </button>
                        <button onClick={() => handleDeleteProduct(p.id)} className="size-16 flex items-center justify-center bg-primary-soft text-primary rounded-[1.2rem] hover:bg-primary hover:text-white transition-all shadow-sm">
                          <span className="material-symbols-outlined text-2xl">delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-12 animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                <div className="bg-surface p-12 rounded-[3.5rem] border border-border shell-premium shadow-premium">
                  <p className="text-[11px] font-black text-text-muted uppercase tracking-[0.4em] mb-3">Histórico</p>
                  <p className="text-6xl font-black text-secondary tracking-tighter">{historyOrders.length}</p>
                </div>
                <div className="bg-surface p-12 rounded-[3.5rem] border border-border shell-premium shadow-premium">
                  <p className="text-[11px] font-black text-text-muted uppercase tracking-[0.4em] mb-3">Tempo Médio</p>
                  <p className="text-6xl font-black text-primary tracking-tighter">
                    {historyOrders.length > 0
                      ? Math.round(historyOrders.reduce((acc, o) => acc + (o.timerAccumulatedSeconds || 0), 0) / historyOrders.length / 60)
                      : 0} min
                  </p>
                </div>
              </div>

              <div className="bg-surface rounded-[4.5rem] shadow-premium border border-border overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-black text-text-muted uppercase tracking-[0.3em] border-b border-border/50">
                      <th className="px-12 py-10">Ticket</th>
                      <th className="px-10 py-10">Contacto</th>
                      <th className="px-10 py-10">Tempo Total</th>
                      <th className="px-12 py-10 text-right">Data/Hora</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {historyOrders.map((hOrder) => (
                      <tr key={hOrder.id} className="group hover:bg-background/40 transition-all duration-500">
                        <td className="px-12 py-10">
                          <div className="flex items-center gap-5">
                            <div className="size-12 bg-secondary text-white rounded-xl flex items-center justify-center font-black text-base group-hover:bg-primary transition-colors">
                              #{hOrder.ticketCode}
                            </div>
                            <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mt-1 hidden sm:block">Ref: {hOrder.id.slice(0, 8)}</p>
                          </div>
                        </td>
                        <td className="px-10 py-10 text-[14px] font-black text-secondary">{hOrder.customerPhone}</td>
                        <td className="px-10 py-10 font-black text-secondary text-[14px]">
                          {Math.floor((hOrder.timerAccumulatedSeconds || 0) / 60)}m {(hOrder.timerAccumulatedSeconds || 0) % 60}s
                        </td>
                        <td className="px-12 py-10 text-right">
                          <p className="text-[13px] font-black text-secondary">{hOrder.timestamp}</p>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Premium Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-8 bg-secondary/80 backdrop-blur-3xl animate-in fade-in duration-500">
          <div className="bg-surface rounded-[4.5rem] w-full max-w-2xl shadow-premium p-16 animate-in zoom-in-95 duration-300 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-4 bg-primary"></div>

            <header className="flex justify-between items-start mb-12">
              <div>
                <h3 className="text-3xl lg:text-4xl font-black tracking-tighter text-secondary">
                  {modalMode === 'add' ? 'Novo Produto' : 'Editar Produto'}
                </h3>
                <p className="text-text-muted font-medium text-lg mt-2">Personalize os detalhes no menu digital.</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="size-14 bg-background rounded-full flex items-center justify-center text-text-muted hover:bg-primary hover:text-white transition-all">
                <span className="material-symbols-outlined text-3xl font-black">close</span>
              </button>
            </header>

            <form onSubmit={handleSaveProduct} className="space-y-10">
              <div className="space-y-3">
                <label className="text-[11px] font-black text-secondary uppercase tracking-[0.4em] ml-2 opacity-40">Identificação do Item</label>
                <input type="text" value={pName} onChange={e => setPName(e.target.value)} placeholder="Ex: Grand Deluxe Master" className="w-full h-20 bg-background border-2 border-border/40 rounded-[1.8rem] px-8 font-black text-xl text-secondary focus:border-primary transition-all outline-none shadow-sm" required />
              </div>

              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-[11px] font-black text-secondary uppercase tracking-[0.4em] ml-2 opacity-40">Investimento (Kz)</label>
                  <input type="number" value={pPrice} onChange={e => setPPrice(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0" className="w-full h-20 bg-background border-2 border-border/40 rounded-[1.8rem] px-8 font-black text-xl text-secondary focus:border-primary transition-all outline-none shadow-sm" required />
                </div>
                <div className="space-y-3">
                  <label className="text-[11px] font-black text-secondary uppercase tracking-[0.4em] ml-2 opacity-40">Sessão do Menu</label>
                  <select value={pCategory} onChange={e => setPCategory(e.target.value)} className="w-full h-20 bg-background border-2 border-border/40 rounded-[1.8rem] px-8 font-black text-[12px] uppercase tracking-widest text-secondary focus:border-primary transition-all outline-none appearance-none cursor-pointer">
                    <option>Hambúrgueres</option><option>Bebidas</option><option>Acompanhamentos</option>
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[11px] font-black text-secondary uppercase tracking-[0.4em] ml-2 opacity-40">Impacto Visual</label>
                <div className="flex gap-8 items-center bg-background/50 p-8 rounded-[3rem] border-2 border-dashed border-border/60 group">
                  <div className="relative size-40 bg-white rounded-[2rem] shadow-premium flex items-center justify-center overflow-hidden flex-shrink-0">
                    {pImageUrl ? (
                      <img src={pImageUrl} alt="Preview" className="size-full object-cover" />
                    ) : (
                      <span className="material-symbols-outlined text-border text-6xl">image</span>
                    )}
                    {uploading && (
                      <div className="absolute inset-0 bg-secondary/80 flex items-center justify-center">
                        <div className="size-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <input type="file" accept="image/*" onChange={handleUpload} className="hidden" id="p-image-upload" />
                    <label htmlFor="p-image-upload" className="inline-flex px-10 py-5 bg-secondary text-white text-[11px] font-black uppercase tracking-[0.3em] rounded-2xl cursor-pointer hover:bg-primary transition-all shadow-premium">
                      Escolher Imagem
                    </label>
                    <p className="text-[11px] text-text-muted mt-4 font-medium italic">Selecione uma foto apelativa para os clientes.</p>
                  </div>
                </div>
              </div>

              <div className="pt-10 flex gap-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 h-20 font-black uppercase tracking-[0.4em] text-text-muted hover:text-primary transition-all text-[12px]">Descartar</button>
                <button type="submit" disabled={saving || uploading} className="flex-[2] h-20 bg-primary hover:bg-secondary text-white rounded-[1.8rem] font-black uppercase tracking-[0.4em] text-[13px] shadow-premium active:scale-[0.96] transition-all disabled:opacity-50 relative overflow-hidden group">
                  <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 skew-x-12"></div>
                  {saving ? 'PROCESSANDO...' : 'FINALIZAR & SALVAR'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanyAdminView;

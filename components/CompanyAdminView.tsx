
import React, { useState, useEffect } from 'react';
import { Company, Product, ProductStatus, Order, OrderStatus } from '../types';
import { fetchProducts } from '../constants';
import { supabase } from '../src/lib/supabase';

interface CompanyAdminViewProps {
  company: Company;
  onLogout: () => void;
}

const CompanyAdminView: React.FC<CompanyAdminViewProps> = ({ company, onLogout }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<'PRODUTOS' | 'FILA'>('FILA');
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
          .select('*')
          .eq('company_id', company.id)
          .neq('status', OrderStatus.DELIVERED)
          .order('created_at', { ascending: true });

        if (oData) setOrders(oData.map(o => ({
          ...o,
          companyId: o.company_id,
          ticketCode: o.ticket_code,
          customerPhone: o.customer_phone,
          queuePosition: o.queue_position,
          estimatedMinutes: o.estimated_minutes,
          timestamp: new Date(o.created_at).toLocaleTimeString()
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
      const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
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
    <div className="flex h-screen bg-[#F4F4F5] overflow-hidden font-inter">
      {/* Sidebar */}
      <aside className="w-80 bg-black p-8 flex flex-col gap-10 relative">
        <div className="absolute top-0 right-0 w-1 h-full bg-primary/20"></div>
        <div className="flex items-center gap-4 relative z-10">
          <div className="size-14 bg-primary rounded-2xl flex items-center justify-center text-white shadow-xl shadow-primary/20">
            <span className="material-symbols-outlined text-4xl font-black">restaurant</span>
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tighter text-white leading-none truncate max-w-[160px]">{company.name}</h1>
            <p className="text-[9px] font-black text-primary uppercase tracking-[0.2em] mt-1">Admin Dashboard</p>
          </div>
        </div>

        <nav className="flex flex-col gap-3 relative z-10">
          <button
            onClick={() => setActiveTab('FILA')}
            className={`flex items-center gap-4 px-6 py-4 rounded-2xl transition-all font-black text-[11px] uppercase tracking-widest ${activeTab === 'FILA' ? 'bg-primary text-white shadow-2xl shadow-primary/40' : 'text-gray-500 hover:bg-white/5 hover:text-white'}`}
          >
            <span className="material-symbols-outlined text-xl">view_list</span>
            Monitor de Fila
          </button>
          <button
            onClick={() => setActiveTab('PRODUTOS')}
            className={`flex items-center gap-4 px-6 py-4 rounded-2xl transition-all font-black text-[11px] uppercase tracking-widest ${activeTab === 'PRODUTOS' ? 'bg-primary text-white shadow-2xl shadow-primary/40' : 'text-gray-500 hover:bg-white/5 hover:text-white'}`}
          >
            <span className="material-symbols-outlined text-xl">inventory_2</span>
            Menu Digital
          </button>

          <div className="mt-10 pt-10 border-t border-white/10">
            <button onClick={onLogout} className="w-full flex items-center justify-between px-6 py-4 rounded-2xl text-red-500 font-black text-[11px] uppercase tracking-widest hover:bg-primary/10 transition-all group">
              <span className="flex items-center gap-4">
                <span className="material-symbols-outlined text-xl">logout</span>
                Terminar Sessão
              </span>
              <span className="material-symbols-outlined text-sm opacity-0 group-hover:opacity-100 transition-all">arrow_forward</span>
            </button>
          </div>
        </nav>

        <div className="mt-auto p-6 bg-white/5 rounded-3xl border border-white/5">
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Empresa ID</p>
          <code className="text-[10px] text-primary font-mono">{company.id}</code>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-12 relative">
        <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-primary/5 rounded-full blur-[140px] pointer-events-none"></div>

        <header className="mb-12 flex justify-between items-start relative z-10">
          <div>
            <h2 className="text-5xl font-black tracking-tight text-black">{activeTab === 'FILA' ? 'A Cozinha' : 'O Menu'}</h2>
            <div className="flex items-center gap-3 mt-3">
              <div className="size-2 bg-primary rounded-full animate-pulse"></div>
              <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest">Sincronizado em tempo real</p>
            </div>
          </div>
          <div className="flex gap-6 items-center">
            {activeTab === 'FILA' && (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Consultar Senha..."
                  value={ticketSearch}
                  onChange={(e) => setTicketSearch(e.target.value)}
                  className="w-64 h-16 bg-white border border-gray-100 rounded-2xl px-12 font-bold text-black shadow-xl shadow-gray-200/40 focus:ring-primary focus:border-primary transition-all outline-none"
                />
                <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-300">search</span>
              </div>
            )}
            <div className="bg-white px-8 py-5 rounded-3xl border border-gray-100 shadow-xl shadow-gray-200/40 text-center min-w-[160px]">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Pedidos Atuais</p>
              <p className="text-4xl font-black text-black">{orders.length}</p>
            </div>
            {activeTab === 'PRODUTOS' && (
              <button
                onClick={() => openModal('add')}
                className="bg-black hover:bg-primary text-white px-10 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-black/20 transition-all active:scale-95 flex items-center gap-3"
              >
                <span className="material-symbols-outlined">add</span>
                NOVO ITEM
              </button>
            )}
          </div>
        </header>

        <div className="relative z-10">
          {activeTab === 'FILA' ? (
            <div className="grid grid-cols-1 gap-8">
              {orders.filter(o => ticketSearch === '' || o.ticketCode.includes(ticketSearch)).length === 0 ? (
                <div className="bg-white rounded-[3rem] p-32 text-center border-2 border-dashed border-gray-100 shadow-sm">
                  <div className="size-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-8 text-gray-200">
                    <span className="material-symbols-outlined text-5xl">inbox</span>
                  </div>
                  <h3 className="text-2xl font-black text-gray-300 uppercase tracking-widest">Sem Pedidos na Fila</h3>
                  <p className="text-gray-400 mt-2 font-medium">Os novos pedidos aparecerão aqui instantaneamente.</p>
                </div>
              ) : (
                orders.filter(o => ticketSearch === '' || o.ticketCode.includes(ticketSearch)).map(order => (
                  <div key={order.id} className="bg-white rounded-[3rem] p-12 border border-gray-100 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.05)] hover:shadow-[0_40px_100px_-20px_rgba(0,0,0,0.1)] transition-all duration-700 flex flex-col xl:flex-row gap-12 items-start xl:items-center group overflow-hidden relative">
                    <div className="absolute top-0 left-0 w-3 h-full transition-all group-hover:w-4" style={{ backgroundColor: order.status === OrderStatus.PREPARING ? '#f97316' : order.status === OrderStatus.READY ? '#22c55e' : '#3b82f6' }}></div>

                    <div className="flex items-center gap-8 flex-shrink-0">
                      <div className="size-28 bg-black rounded-[2rem] flex flex-col items-center justify-center border border-black shadow-2xl shadow-black/20 group-hover:scale-105 transition-transform duration-500">
                        <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">Senha</p>
                        <h3 className="text-3xl font-black text-white">{order.ticketCode}</h3>
                      </div>
                      <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 px-3 py-1 bg-gray-50 rounded-full">
                          <span className="material-symbols-outlined text-gray-400 text-[10px]">schedule</span>
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{order.timestamp}</p>
                        </div>
                        <h4 className="text-3xl font-black tracking-tighter text-black">{order.customerPhone}</h4>
                      </div>
                    </div>

                    <div className="flex-1 px-12 xl:border-x border-gray-50 py-2 w-full">
                      <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2 opacity-50">
                        <span className="material-symbols-outlined text-sm">restaurant_menu</span>
                        ITENS DO PEDIDO
                      </p>
                      {order.items && order.items.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {order.items.map((item, i) => (
                            <div key={i} className="flex flex-col gap-2 p-5 bg-gray-50 rounded-3xl border border-gray-50 hover:border-primary/20 hover:bg-white hover:shadow-lg hover:shadow-gray-200/30 transition-all duration-300">
                              <div className="flex justify-between items-center">
                                <span className="font-black text-black">{item.name}</span>
                                <span className="size-6 bg-black text-white rounded-full flex items-center justify-center text-[10px] font-black">1</span>
                              </div>
                              {item.observation && (
                                <div className="flex items-start gap-2 pt-2 border-t border-gray-200/50">
                                  <span className="material-symbols-outlined text-[14px] text-primary mt-0.5">notification_important</span>
                                  <span className="text-[11px] font-bold text-primary italic leading-tight">"{item.observation}"</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="py-8 bg-gray-50/50 rounded-3xl border border-dashed border-gray-100 flex flex-col items-center justify-center gap-3 text-gray-300">
                          <span className="material-symbols-outlined text-3xl animate-spin-slow">sync</span>
                          <p className="text-[10px] font-black uppercase tracking-widest">Pedido em formação pelo cliente</p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-row xl:flex-col gap-3 min-w-[240px] w-full xl:w-auto">
                      <button
                        onClick={() => updateOrderStatus(order.id, OrderStatus.PREPARING)}
                        className={`flex-1 flex items-center justify-center gap-4 px-10 py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all ${order.status === OrderStatus.PREPARING ? 'bg-orange-600 text-white shadow-2xl shadow-orange-600/30 ring-8 ring-orange-600/10' : 'bg-gray-50 text-gray-400 hover:bg-white hover:text-black hover:shadow-xl'}`}
                      >
                        <span className="material-symbols-outlined font-black">cooking</span>
                        PREPARAR
                      </button>
                      <button
                        onClick={() => updateOrderStatus(order.id, OrderStatus.READY)}
                        className={`flex-1 flex items-center justify-center gap-4 px-10 py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all ${order.status === OrderStatus.READY ? 'bg-green-600 text-white shadow-2xl shadow-green-600/30 ring-8 ring-green-600/10' : 'bg-gray-50 text-gray-400 hover:bg-white hover:text-black hover:shadow-xl'}`}
                      >
                        <span className="material-symbols-outlined font-black">notifications_active</span>
                        PRONTO
                      </button>
                      <button
                        onClick={() => updateOrderStatus(order.id, OrderStatus.DELIVERED)}
                        className="flex-1 flex items-center justify-center gap-4 px-10 py-5 bg-black text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-primary transition-all active:scale-95 shadow-xl shadow-black/20"
                      >
                        <span className="material-symbols-outlined font-black">done_all</span>
                        ENTREGAR
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-12">
              <div className="flex items-center gap-3">
                {['Todos', 'Hambúrgueres', 'Bebidas', 'Acompanhamentos'].map(cat => (
                  <button
                    key={cat} onClick={() => setProductFilter(cat)}
                    className={`px-8 py-3 rounded-full font-black text-[10px] uppercase tracking-widest transition-all ${productFilter === cat ? 'bg-black text-white shadow-xl shadow-black/20' : 'bg-white text-gray-400 border border-gray-100 hover:border-black hover:text-black'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-10">
                {filteredProducts.map(p => (
                  <div key={p.id} className="bg-white rounded-[3rem] overflow-hidden border border-gray-100 shadow-xl shadow-gray-200/20 hover:shadow-2xl hover:shadow-gray-200/50 transition-all duration-500 group flex flex-col">
                    <div className="relative h-64 bg-gray-50 overflow-hidden">
                      <img src={p.imageUrl} alt={p.name} className="size-full object-cover group-hover:scale-110 transition-all duration-700" />
                      <div className="absolute top-6 right-6">
                        <span className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white shadow-2xl ${p.status === ProductStatus.ACTIVE ? 'bg-green-500' : 'bg-red-500'}`}>
                          {p.status}
                        </span>
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
                    </div>
                    <div className="p-8 flex flex-col flex-1 justify-between gap-6">
                      <div>
                        <h4 className="font-black text-2xl text-black truncate">{p.name}</h4>
                        <div className="flex items-center justify-between mt-2">
                          <p className="text-primary font-black text-2xl tracking-tight">Kz {p.price.toLocaleString()}</p>
                          <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest bg-gray-50 px-3 py-1 rounded-full">{p.category}</p>
                        </div>
                      </div>
                      <div className="flex gap-4">
                        <button onClick={() => openModal('edit', p)} className="flex-1 py-4 bg-gray-50 hover:bg-black hover:text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 transition-all">
                          <span className="material-symbols-outlined text-base">edit_note</span>
                          EDITAR
                        </button>
                        <button onClick={() => handleDeleteProduct(p.id)} className="size-14 flex items-center justify-center bg-red-50 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all shadow-sm">
                          <span className="material-symbols-outlined text-xl">delete_sweep</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Modern Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-3xl animate-in fade-in duration-500">
          <div className="bg-white rounded-[4rem] w-full max-w-xl shadow-[0_50px_150px_-30px_rgba(0,0,0,0.5)] p-16 animate-in zoom-in-95 duration-300 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-3 bg-primary"></div>

            <header className="flex justify-between items-start mb-10">
              <div>
                <h3 className="text-4xl font-black tracking-tight text-black">
                  {modalMode === 'add' ? 'Adicionar Item' : 'Configurar Item'}
                </h3>
                <p className="text-gray-400 font-medium mt-1">Defina os detalhes do produto no cardápio.</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="size-12 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 hover:bg-black hover:text-white transition-all">
                <span className="material-symbols-outlined font-black">close</span>
              </button>
            </header>

            <form onSubmit={handleSaveProduct} className="space-y-8">
              <div className="space-y-2">
                <label className="text-[11px] font-black text-black uppercase tracking-[0.2em] ml-1 opacity-30">Nome do Produto</label>
                <input type="text" value={pName} onChange={e => setPName(e.target.value)} placeholder="Ex: Master Burger Bacon" className="w-full h-16 bg-gray-50 border-2 border-transparent rounded-2xl px-6 font-bold text-black focus:bg-white focus:border-primary transition-all outline-none" required />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-black uppercase tracking-[0.2em] ml-1 opacity-30">Preço (Kz)</label>
                  <input type="number" value={pPrice} onChange={e => setPPrice(e.target.value === '' ? '' : Number(e.target.value))} placeholder="0.00" className="w-full h-16 bg-gray-50 border-2 border-transparent rounded-2xl px-6 font-bold text-black focus:bg-white focus:border-primary transition-all outline-none" required />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-black uppercase tracking-[0.2em] ml-1 opacity-30">Categoria</label>
                  <select value={pCategory} onChange={e => setPCategory(e.target.value)} className="w-full h-16 bg-gray-50 border-2 border-transparent rounded-2xl px-6 font-black text-[11px] uppercase tracking-widest text-black focus:bg-white focus:border-primary transition-all outline-none appearance-none cursor-pointer">
                    <option>Hambúrgueres</option><option>Bebidas</option><option>Acompanhamentos</option>
                  </select>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[11px] font-black text-black uppercase tracking-[0.2em] ml-1 opacity-30">Imagem Representativa</label>
                <div className="flex gap-6 items-center bg-gray-50 p-6 rounded-[2.5rem] border-2 border-dashed border-gray-100">
                  <div className="relative size-32 bg-white rounded-3xl shadow-xl flex items-center justify-center overflow-hidden flex-shrink-0 group">
                    {pImageUrl ? (
                      <img src={pImageUrl} alt="Preview" className="size-full object-cover group-hover:scale-110 transition-all" />
                    ) : (
                      <span className="material-symbols-outlined text-gray-200 text-4xl">image_search</span>
                    )}
                    {uploading && (
                      <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                        <div className="size-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <input type="file" accept="image/*" onChange={handleUpload} className="hidden" id="p-image" />
                    <label htmlFor="p-image" className="inline-block px-8 py-4 bg-black text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl cursor-pointer hover:bg-primary transition-all shadow-xl shadow-black/10">
                      Submeter Ficheiro
                    </label>
                    <p className="text-[10px] text-gray-400 mt-3 font-medium">Recomendado: 800x800px (JPG/PNG)</p>
                  </div>
                </div>
              </div>

              <div className="pt-8 flex gap-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 h-18 py-5 font-black uppercase tracking-[0.2em] text-gray-300 hover:text-black transition-all">Descartar</button>
                <button type="submit" disabled={saving || uploading} className="flex-[2] h-18 py-5 bg-black hover:bg-primary text-white rounded-2xl font-black uppercase tracking-[0.2em] shadow-2xl shadow-black/20 active:scale-95 transition-all disabled:opacity-50">
                  {saving ? 'A Processar...' : 'Salvar no Menu'}
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

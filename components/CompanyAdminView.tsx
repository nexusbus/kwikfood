
import React, { useState, useEffect } from 'react';
import { Company, Product, ProductStatus, Order, OrderStatus } from '../types';
import { fetchProducts } from '../constants';
import { supabase } from '../src/lib/supabase';
import { sendSMS } from '../src/services/smsService';
import Logo from './Logo';

interface CompanyAdminViewProps {
  company: Company;
  onLogout: () => void;
}

const getStatusColor = (status: OrderStatus) => {
  switch (status) {
    case OrderStatus.PENDING: return 'bg-blue-100 text-blue-600';
    case OrderStatus.RECEIVED: return 'bg-yellow-100 text-yellow-600';
    case OrderStatus.PREPARING: return 'bg-orange-100 text-orange-600';
    case OrderStatus.READY: return 'bg-green-100 text-green-600';
    case OrderStatus.DELIVERED: return 'bg-gray-100 text-gray-600';
    case OrderStatus.CANCELLED: return 'bg-red-100 text-red-600';
    default: return 'bg-gray-100 text-gray-600';
  }
};

const getStatusLabel = (order: Order) => {
  if (order.status === OrderStatus.CANCELLED) {
    return order.cancelledBy === 'admin' ? 'Cancelado pelo Admin' : 'Cancelado pelo Cliente';
  }
  switch (order.status) {
    case OrderStatus.PENDING: return 'Pendente';
    case OrderStatus.RECEIVED: return 'Recebido';
    case OrderStatus.PREPARING: return 'Preparando';
    case OrderStatus.READY: return 'Pronto';
    case OrderStatus.DELIVERED: return 'Entregue';
    default: return order.status;
  }
};

const CompanyAdminView: React.FC<CompanyAdminViewProps> = ({ company, onLogout }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<'PRODUTOS' | 'FILA' | 'HISTORICO' | 'MARKETING'>('FILA');
  const [productFilter, setProductFilter] = useState('Todos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [ticketSearch, setTicketSearch] = useState('');
  const [showQRModal, setShowQRModal] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);

  // Form state
  const [pName, setPName] = useState('');
  const [pPrice, setPPrice] = useState<number | ''>('');
  const [pCategory, setPCategory] = useState('Hambúrgueres');
  const [pStatus, setPStatus] = useState<ProductStatus>(ProductStatus.ACTIVE);
  const [pImageUrl, setPImageUrl] = useState('');
  const [saving, setSaving] = useState(false);

  // History filters
  const [hStartDate, setHStartDate] = useState('');
  const [hEndDate, setHEndDate] = useState('');
  const [hStatusFilter, setHStatusFilter] = useState('Todos');
  const [hContactFilter, setHContactFilter] = useState('');

  // Marketing state
  const [contacts, setContacts] = useState<string[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [messageBody, setMessageBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showFullPhones, setShowFullPhones] = useState<Record<string, boolean>>({});

  // Marketing Auth State
  const [showMarketingAuthModal, setShowMarketingAuthModal] = useState(false);
  const [marketingPasswordPrompt, setMarketingPasswordPrompt] = useState('');
  const [isMarketingUnlocked, setIsMarketingUnlocked] = useState(false);
  const [marketingAuthError, setMarketingAuthError] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: pData } = await supabase.from('products').select('*').eq('company_id', company.id);
        if (pData) setProducts(pData.map(p => ({ ...p, imageUrl: p.image_url })));

        const { data: oData } = await supabase
          .from('orders')
          .select('id, company_id, customer_phone, status, items, total, queue_position, estimated_minutes, ticket_code, ticket_number, timer_last_started_at, timer_accumulated_seconds, created_at, cancelled_by, payment_method, payment_proof_url')
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
          paymentMethod: o.payment_method,
          paymentProofUrl: o.payment_proof_url,
          timerAccumulatedSeconds: o.timer_accumulated_seconds || 0,
          timerLastStartedAt: o.timer_last_started_at,
          cancelledBy: o.cancelled_by,
          timestamp: new Date(o.created_at).toLocaleString()
        })));

        const { data: hData } = await supabase
          .from('orders')
          .select('id, company_id, customer_phone, status, items, total, queue_position, estimated_minutes, ticket_code, ticket_number, timer_last_started_at, timer_accumulated_seconds, created_at, cancelled_by, payment_method, payment_proof_url')
          .eq('company_id', company.id)
          .in('status', [OrderStatus.DELIVERED, OrderStatus.CANCELLED])
          .order('created_at', { ascending: false })
          .limit(50);

        if (hData) setHistoryOrders(hData.map(o => ({
          ...o,
          companyId: o.company_id,
          ticketCode: o.ticket_code,
          customerPhone: o.customer_phone,
          paymentMethod: o.payment_method,
          paymentProofUrl: o.payment_proof_url,
          timerAccumulatedSeconds: o.timer_accumulated_seconds || 0,
          timerLastStartedAt: o.timer_last_started_at,
          cancelledBy: o.cancelled_by,
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

  useEffect(() => {
    if (activeTab === 'MARKETING') {
      const loadContacts = async () => {
        const { data, error } = await supabase
          .from('orders')
          .select('customer_phone')
          .eq('company_id', company.id);

        if (data) {
          const unique = Array.from(new Set(data.map(o => o.customer_phone)));
          setContacts(unique);
        }
      };
      loadContacts();
    }
  }, [activeTab, company.id]);

  const mainContentRef = React.useRef<HTMLElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (showSidebar) setShowSidebar(false);
    };
    const main = mainContentRef.current;
    if (main) {
      main.addEventListener('scroll', handleScroll);
      return () => main.removeEventListener('scroll', handleScroll);
    }
  }, [showSidebar]);

  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    try {
      const order = orders.find(o => o.id === orderId);
      if (!order) return;

      const updates: any = { status };
      const now = new Date().toISOString();

      if (status === OrderStatus.CANCELLED) {
        updates.cancelled_by = 'admin';
      }

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
      } else if (status === OrderStatus.CANCELLED) {
        updates.timer_last_started_at = null;
      }

      const { error } = await supabase.from('orders').update(updates).eq('id', orderId);
      if (error) throw error;

      // Trigger SMS notification
      if (status === OrderStatus.PREPARING || status === OrderStatus.READY || status === OrderStatus.DELIVERED || status === OrderStatus.CANCELLED) {
        let message = '';
        switch (status) {
          case OrderStatus.PREPARING:
            message = `${company.name}: Ótima notícia! O Chef já começou a preparar o seu pedido ${order.ticketCode}. Fique atento! 👨‍🍳🔥`;
            break;
          case OrderStatus.READY:
            message = `${company.name}: O seu pedido ${order.ticketCode} está pronto e a cheirar maravilhosamente! Pode vir levantar agora. 🍔✨`;
            break;
          case OrderStatus.DELIVERED:
            message = `${company.name}: Pedido ${order.ticketCode} entregue! Esperamos que desfrute de cada dentada. Bom apetite! 😋🙏`;
            break;
          case OrderStatus.CANCELLED:
            message = `${company.name}: Lamentamos imenso, mas o seu pedido ${order.ticketCode} teve de ser cancelado. Por favor, contacte o estabelecimento. 😔`;
            break;
        }

        if (message && order.customerPhone) {
          try {
            await sendSMS({ recipient: order.customerPhone, message });
          } catch (smsErr) {
            console.error('Failed to send SMS notification:', smsErr);
          }
        }
      }
    } catch (err) {
      alert('Erro ao atualizar pedido.');
    }
  };

  const handleSendMarketing = async () => {
    if (selectedContacts.length === 0) return alert('Selecione contactos.');
    if (!messageBody.trim()) return alert('Escreva a mensagem.');

    setIsSending(true);
    try {
      const finalMessage = `${company.name}: ${messageBody}`;
      for (const phone of selectedContacts) {
        await sendSMS({ recipient: phone, message: finalMessage });
      }
      alert('SMS Enviados com Sucesso!');
      setMessageBody('');
      setSelectedContacts([]);
    } catch (err) {
      alert('Erro no envio em massa.');
    } finally {
      setIsSending(false);
    }
  };

  const maskPhone = (phone: string, id: string) => {
    if (showFullPhones[id]) return phone;
    return phone.slice(0, -3) + 'XXX';
  };

  const revealPhone = (id: string) => {
    const pass = prompt('Palavra-passe do parceiro:');
    if (pass === company.password) {
      setShowFullPhones(prev => ({ ...prev, [id]: true }));
    } else {
      alert('Incorreta.');
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
    const password = prompt('Para excluir este produto, insira a senha do parceiro:');
    if (password !== company.password) {
      alert('Senha incorreta.');
      return;
    }
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

  const categories = ['Todos', 'Hambúrgueres', 'Comida', 'Bebidas', 'Acompanhamentos'];
  const filteredProducts = productFilter === 'Todos' ? products : products.filter(p => p.category === productFilter);

  const filteredOrders = orders.filter(o => {
    if (ticketSearch === '') return true;
    const search = ticketSearch.toLowerCase();
    const matchesTicket = o.ticketCode.toLowerCase().includes(search);
    const matchesPhone = o.customerPhone.toLowerCase().includes(search);
    const matchesStatus = o.status.toLowerCase().includes(search);
    const matchesItems = o.items.some(item =>
      item.name.toLowerCase().includes(search) ||
      (item.observation && item.observation.toLowerCase().includes(search))
    );
    return matchesTicket || matchesPhone || matchesStatus || matchesItems;
  });

  const filteredHistory = historyOrders.filter(o => {
    const matchesStatus = hStatusFilter === 'Todos' || o.status === hStatusFilter;
    const matchesContact = hContactFilter === '' || o.customerPhone.includes(hContactFilter);

    let matchesDate = true;
    if (hStartDate || hEndDate) {
      const oDate = new Date(o.timestamp);
      if (hStartDate) {
        const start = new Date(hStartDate);
        if (oDate < start) matchesDate = false;
      }
      if (hEndDate) {
        const end = new Date(hEndDate);
        if (oDate > end) matchesDate = false;
      }
    }

    return matchesStatus && matchesContact && matchesDate;
  });

  const totalRevenue = filteredHistory.reduce((acc, o) => acc + (o.status === OrderStatus.DELIVERED ? (o.total || 0) : 0), 0);

  return (
    <div className="flex h-screen bg-[#F9F9F9] overflow-hidden selection:bg-primary selection:text-white relative font-sans">
      {/* Sidebar Backdrop - Click to Close */}
      {showSidebar && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[150] animate-fade-in"
          onClick={() => setShowSidebar(false)}
        />
      )}
      {/* Premium Sidebar - Collapsible */}
      <aside className={`fixed inset-y-0 left-0 w-80 bg-white/95 backdrop-blur-xl border-r border-white/50 p-8 flex flex-col gap-12 z-[200] transition-transform duration-500 ease-in-out shadow-2xl ${showSidebar ? 'translate-x-0' : '-translate-x-full'}`}>
        <button
          onClick={() => setShowSidebar(false)}
          className="flex items-center gap-5 relative group text-left w-full hover:opacity-80 transition-opacity"
        >
          <Logo variant="icon" size={48} className="transform group-hover:rotate-12 transition-transform duration-500" color="primary" />
          <div className="overflow-hidden">
            <h1 className="text-xl font-black tracking-tighter text-secondary leading-none truncate">{company.name}</h1>
            <p className="text-[9px] font-black text-primary uppercase tracking-[0.4em] mt-2">Portal Parceiro</p>
          </div>
        </button>

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

          {company.marketingEnabled && (
            <button
              onClick={() => {
                if (isMarketingUnlocked) {
                  setActiveTab('MARKETING');
                } else {
                  setShowMarketingAuthModal(true);
                  setMarketingAuthError(false);
                  setMarketingPasswordPrompt('');
                }
              }}
              className={`flex items-center gap-5 px-8 py-5 rounded-[1.5rem] transition-all font-black text-[12px] uppercase tracking-widest relative overflow-hidden group ${activeTab === 'MARKETING' ? 'bg-secondary text-white shadow-premium' : 'text-text-muted hover:bg-white/40 hover:text-secondary'}`}
            >
              <span className="material-symbols-outlined text-2xl">campaign</span>
              Marketing
              {activeTab === 'MARKETING' && <div className="absolute right-6 size-2 bg-primary rounded-full animate-pulse"></div>}
            </button>
          )}

          <div className="mt-8">
            <button
              onClick={() => setShowQRModal(true)}
              className="w-full flex items-center gap-5 px-8 py-5 rounded-[1.5rem] bg-primary/10 text-primary border border-primary/20 transition-all font-black text-[12px] uppercase tracking-widest hover:bg-primary hover:text-white"
            >
              <span className="material-symbols-outlined text-2xl">qr_code_2</span>
              Meu QR Code
            </button>
          </div>

          <div className="mt-4 pt-8 border-t border-border/50">
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

      <main
        ref={mainContentRef}
        className="flex-1 overflow-y-auto p-6 lg:p-12 relative custom-scrollbar bg-[#F9F9F9]"
      >
        <div className="fixed top-0 right-0 w-1/3 h-1/2 bg-red-500/5 rounded-full blur-[150px] pointer-events-none"></div>

        <header className="mb-10 flex flex-col lg:flex-row justify-between items-center gap-8 relative z-10 animate-fade-in">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className="group flex items-center justify-center p-2 rounded-xl hover:bg-red-50 transition-all active:scale-90"
            >
              <Logo variant="icon" size={44} className="transform group-hover:rotate-12 transition-transform duration-500" color="primary" />
            </button>
            <div>
              <h2 className="text-2xl lg:text-3xl font-black tracking-tight text-[#111111]">
                {activeTab === 'FILA' ? 'A Cozinha' : activeTab === 'PRODUTOS' ? 'O Menu' : activeTab === 'MARKETING' ? 'Marketing' : 'Audit & Histórico'}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="size-2 bg-green-500 rounded-full animate-pulse"></span>
                <p className="text-[#BBBBBB] font-black uppercase text-[10px] tracking-widest">Monitor em Tempo Real</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-center items-center gap-4">
            {activeTab === 'FILA' && (
              <>
                <div className="grid grid-cols-2 gap-3 lg:gap-4 shrink-0">
                  <div className="bg-white px-8 py-5 rounded-[2.5rem] border border-[#F5F5F5] shadow-[0_5px_25px_-5px_rgba(0,0,0,0.04)] flex flex-col items-start min-w-[160px] group hover:border-primary/20 transition-all">
                    <p className="text-[10px] font-black text-[#BBBBBB] uppercase tracking-widest mb-1.5 flex items-center gap-2">
                      Pedidos Atuais
                    </p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-4xl font-black text-[#111111]">{orders.length}</p>
                      <span className="text-[10px] font-black text-green-500 flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-[14px]">trending_up</span>
                        20%
                      </span>
                    </div>
                  </div>
                  <div className="bg-white px-8 py-5 rounded-[2.5rem] border border-[#F5F5F5] shadow-[0_5px_25px_-5px_rgba(0,0,0,0.04)] flex flex-col items-start min-w-[160px] group hover:border-primary/20 transition-all">
                    <p className="text-[10px] font-black text-[#BBBBBB] uppercase tracking-widest mb-1.5">Tempo Médio</p>
                    <div className="flex items-baseline gap-1">
                      <p className="text-4xl font-black text-[#111111]">12'</p>
                      <p className="text-[11px] font-black text-[#BBBBBB] uppercase">min</p>
                    </div>
                  </div>
                </div>

                <div className="relative group ml-0 lg:ml-2">
                  <input
                    type="text"
                    placeholder="Buscar ticket ou telefone..."
                    value={ticketSearch}
                    onChange={(e) => setTicketSearch(e.target.value.toUpperCase())}
                    className="w-80 h-16 bg-white border border-[#F5F5F5] rounded-[2rem] px-14 font-bold text-base text-[#111111] shadow-[0_5px_25px_-5px_rgba(0,0,0,0.04)] focus:border-primary transition-all outline-none placeholder:text-[#BBBBBB]/60"
                  />
                  <span className="material-symbols-outlined absolute left-6 top-1/2 -translate-y-1/2 text-[#BBBBBB]">search</span>
                </div>
              </>
            )}

            {activeTab === 'PRODUTOS' && (
              <button
                onClick={() => openModal('add')}
                className="h-16 px-10 bg-primary hover:bg-[#111111] text-white rounded-2xl font-black text-[12px] uppercase tracking-widest shadow-lg shadow-primary/20 transition-all flex items-center gap-3 active:scale-95"
              >
                <span className="material-symbols-outlined text-2xl">add</span>
                NOVO ITEM
              </button>
            )}
          </div>
        </header>

        <div className="relative z-10">
          {activeTab === 'FILA' && (
            <div className="flex items-center gap-3 mb-10 overflow-hidden">
              <h3 className="text-[13px] font-black text-[#111111] uppercase tracking-[0.2em] whitespace-nowrap">Fila de Pedidos</h3>
              <span className="px-3 py-1 bg-red-50 text-primary rounded-lg text-[9px] font-black uppercase tracking-widest">Novos</span>
              <div className="h-[1px] bg-[#F5F5F5] w-full"></div>
            </div>
          )}

          {activeTab === 'FILA' ? (
            <div className="space-y-12 animate-fade-in">
              {filteredOrders.length === 0 ? (
                <div className="bg-white rounded-none p-40 text-center border-2 border-dashed border-border/60 animate-scale-in">
                  <div className="size-32 bg-background rounded-full flex items-center justify-center mx-auto mb-10 text-border">
                    <span className="material-symbols-outlined text-6xl">restaurant</span>
                  </div>
                  <h3 className="text-3xl font-black text-border uppercase tracking-[0.3em]">Nenhum pedido encontrado</h3>
                  <p className="text-text-muted mt-4 font-medium text-lg">Tente um termo de pesquisa diferente ou aguarde novos pedidos.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 lg:gap-8">
                  {filteredOrders.map(order => (
                    <div key={order.id} className="bg-white rounded-[2rem] p-6 lg:p-8 border border-[#F5F5F5] shadow-[0_10px_40px_-15px_rgba(0,0,0,0.05)] group relative overflow-hidden animate-scale-in flex flex-col justify-between min-h-[400px]">
                      <div className="absolute top-0 left-0 w-2 h-full transition-all group-hover:w-3"
                        style={{ backgroundColor: order.status === OrderStatus.PREPARING ? '#FACC15' : order.status === OrderStatus.READY ? '#22C55E' : '#E11D48' }}>
                      </div>

                      <div>
                        <div className="flex justify-between items-start mb-6">
                          <div>
                            <h3 className="text-3xl font-black text-[#E11D48] tracking-tight mb-1">#{order.ticketCode}</h3>
                            <p className="text-base font-bold text-[#BBBBBB]">{order.customerPhone}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-black text-[#111111]">{(order.total || 0).toLocaleString()} Kz</p>
                            <div className="flex items-center justify-end gap-1.5 mt-1 text-[#BBBBBB]">
                              <span className="material-symbols-outlined text-[18px]">schedule</span>
                              <span className="text-[10px] font-black uppercase tracking-widest leading-none">HÁ 2 MIN</span>
                            </div>
                          </div>
                        </div>

                        {order.status === OrderStatus.READY && (
                          <span className="px-3 py-1 bg-green-50 text-green-600 rounded-lg text-[10px] font-black uppercase tracking-widest">PRONTO</span>
                        )}
                        <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${order.paymentMethod === 'TRANSFER' ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-600'}`}>
                          PAGAMENTO: {order.paymentMethod || 'N/A'}
                        </span>
                      </div>

                      {order.paymentMethod === 'TRANSFER' && order.paymentProofUrl && (
                        <div className="mb-6">
                          <a
                            href={order.paymentProofUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full flex items-center justify-center gap-2 h-12 bg-blue-50 text-blue-600 rounded-xl font-black text-[10px] uppercase tracking-widest border border-blue-100 hover:bg-blue-100 transition-all"
                          >
                            <span className="material-symbols-outlined text-lg">picture_as_pdf</span>
                            VER COMPROVATIVO
                          </a>
                        </div>
                      )}

                      <div className="space-y-4 mb-8">
                        {order.items.map((item, i) => (
                          <div key={i} className="flex justify-between items-start group/item">
                            <div className="flex gap-3">
                              <span className="text-lg font-black text-[#111111] leading-tight">{item.quantity}x</span>
                              <span className="text-lg font-bold text-[#111111] leading-tight">{item.name}</span>
                            </div>
                            {item.observation && (
                              <span className="text-[12px] font-medium text-[#BBBBBB] italic shrink-0 ml-4">{item.observation}</span>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="space-y-3">
                        {order.status === OrderStatus.READY ? (
                          <button
                            onClick={() => updateOrderStatus(order.id, OrderStatus.DELIVERED)}
                            className="w-full flex items-center justify-center gap-3 h-16 bg-[#22C55E] text-white rounded-2xl font-black text-[13px] uppercase tracking-widest shadow-lg shadow-green-500/20 hover:bg-[#1DA850] transition-all active:scale-95"
                          >
                            <span className="material-symbols-outlined text-2xl">check_circle</span>
                            ENTREGAR AGORA
                          </button>
                        ) : (
                          <>
                            <div className="grid grid-cols-2 gap-3">
                              <button
                                onClick={() => updateOrderStatus(order.id, OrderStatus.PREPARING)}
                                disabled={order.status === OrderStatus.PREPARING}
                                className={`flex items-center justify-center gap-2 h-16 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all shadow-md group/btn ${order.status === OrderStatus.PREPARING ? 'bg-red-50 text-primary border border-primary/20 cursor-default' : 'bg-[#E11D48] text-white hover:bg-[#BE123C] active:scale-95'}`}
                              >
                                <span className="material-symbols-outlined text-xl">{order.status === OrderStatus.PREPARING ? 'cooking' : 'outdoor_grill'}</span>
                                {order.status === OrderStatus.PREPARING ? 'PREPARANDO' : 'PREPARAR'}
                              </button>
                              <button
                                onClick={() => updateOrderStatus(order.id, OrderStatus.READY)}
                                className="flex items-center justify-center gap-2 h-16 bg-white border border-[#F5F5F5] text-[#111111] rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-sm hover:border-primary/20 hover:text-primary transition-all active:scale-95 group/btn"
                              >
                                <span className="material-symbols-outlined text-xl group-hover/btn:animate-pulse">notifications</span>
                                NOTIFICAR
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <button
                                onClick={() => updateOrderStatus(order.id, OrderStatus.DELIVERED)}
                                className="flex items-center justify-center gap-2 h-16 bg-white border border-[#F5F5F5] text-[#111111] rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-sm hover:border-black/10 transition-all active:scale-95"
                              >
                                <span className="material-symbols-outlined text-xl">check_circle</span>
                                ENTREGAR
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm('Tem certeza que deseja cancelar este pedido?')) {
                                    updateOrderStatus(order.id, OrderStatus.CANCELLED);
                                  }
                                }}
                                className="flex items-center justify-center gap-2 h-16 bg-white text-[#BBBBBB] hover:text-red-500 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all active:scale-95"
                              >
                                <span className="material-symbols-outlined text-xl">cancel</span>
                                CANCELAR
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'PRODUTOS' ? (
            <div className="space-y-16 animate-fade-in">
              <div className="flex items-center gap-5 flex-wrap">
                {categories.map(cat => (
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
          ) : activeTab === 'MARKETING' ? (
            <div className="space-y-12 animate-fade-in">
              <div className="bg-surface rounded-[3.5rem] p-12 border border-border shell-premium shadow-premium">
                <div className="flex flex-col lg:flex-row gap-12">
                  <div className="flex-1 space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-black text-secondary uppercase tracking-widest">Base de Contactos ({contacts.length})</h3>
                      <button
                        onClick={() => setSelectedContacts(selectedContacts.length === contacts.length ? [] : [...contacts])}
                        className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline"
                      >
                        {selectedContacts.length === contacts.length ? 'DESMARCAR TODOS' : 'SELECIONAR TODOS'}
                      </button>
                    </div>

                    <div className="h-[450px] overflow-y-auto pr-4 custom-scrollbar bg-background rounded-[2rem] p-8 border border-border/50 shadow-inner">
                      {contacts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full opacity-30">
                          <span className="material-symbols-outlined text-6xl mb-4">person_off</span>
                          <p className="font-black uppercase tracking-widest text-[10px]">Nenhuma base de dados disponível</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 gap-3">
                          {contacts.map(phone => (
                            <label key={phone} className="flex items-center gap-5 p-5 bg-white rounded-2xl border border-border/50 hover:border-primary/40 hover:shadow-md transition-all cursor-pointer group">
                              <div className={`size-6 rounded-full border-2 flex items-center justify-center transition-all ${selectedContacts.includes(phone) ? 'bg-primary border-primary' : 'border-border group-hover:border-primary/40'}`}>
                                {selectedContacts.includes(phone) && <span className="material-symbols-outlined text-white text-[14px] font-black">done</span>}
                              </div>
                              <input
                                type="checkbox"
                                className="hidden"
                                checked={selectedContacts.includes(phone)}
                                onChange={() => {
                                  setSelectedContacts(prev =>
                                    prev.includes(phone) ? prev.filter(c => c !== phone) : [...prev, phone]
                                  );
                                }}
                              />
                              <span className={`text-lg font-black transition-colors ${selectedContacts.includes(phone) ? 'text-primary' : 'text-secondary'}`}>{phone}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 space-y-8">
                    <div className="space-y-3">
                      <label className="text-[11px] font-black text-secondary uppercase tracking-[0.4em] ml-2 opacity-50">Composição da Campanha</label>
                      <textarea
                        value={messageBody}
                        onChange={e => setMessageBody(e.target.value)}
                        placeholder="Escreva a mensagem para os seus clientes..."
                        className="w-full h-64 bg-background border-2 border-border/40 rounded-[2rem] p-10 font-medium text-lg text-secondary focus:border-primary transition-all outline-none resize-none shadow-inner"
                      />
                      <div className="flex justify-between px-2">
                        <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">{selectedContacts.length} destinatários selecionados</p>
                        <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">{messageBody.length} caracteres</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-5">
                      <button
                        onClick={handleSendMarketing}
                        disabled={isSending || selectedContacts.length === 0 || !messageBody.trim()}
                        className="h-24 bg-primary text-white rounded-[2rem] font-black text-sm tracking-[0.4em] shadow-premium hover:bg-secondary transition-all disabled:opacity-30 relative overflow-hidden group"
                      >
                        <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 skew-x-12"></div>
                        <span className="flex items-center justify-center gap-4">
                          <span className="material-symbols-outlined text-2xl">{isSending ? 'sync' : 'send'}</span>
                          {isSending ? 'SINALIZANDO...' : 'DISPARAR SMS'}
                        </span>
                      </button>

                      <div className="grid grid-cols-2 gap-5 opacity-40">
                        <button disabled className="h-20 bg-background border-2 border-border/40 rounded-[2rem] font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-4 cursor-not-allowed">
                          <span className="material-symbols-outlined">chat</span>
                          WHATSAPP
                        </button>
                        <button disabled className="h-20 bg-background border-2 border-border/40 rounded-[2rem] font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-4 cursor-not-allowed">
                          <span className="material-symbols-outlined">send</span>
                          TELEGRAM
                        </button>
                      </div>
                      <p className="text-[9px] text-center font-black text-text-muted uppercase tracking-[0.3em] mt-2">Canais alternativos em desenvolvimento</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-12 animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                <div className="bg-surface p-12 rounded-[3.5rem] border border-border shell-premium shadow-premium">
                  <p className="text-[11px] font-black text-text-muted uppercase tracking-[0.4em] mb-3">Pedidos no Filtro</p>
                  <p className="text-6xl font-black text-secondary tracking-tighter">{filteredHistory.length}</p>
                </div>
                <div className="bg-surface p-12 rounded-[3.5rem] border border-border shell-premium shadow-premium">
                  <p className="text-[11px] font-black text-text-muted uppercase tracking-[0.4em] mb-3">Faturamento (Filtro)</p>
                  <p className="text-5xl font-black text-primary tracking-tighter leading-tight">
                    <span className="text-2xl">Kz</span> {totalRevenue.toLocaleString()}
                  </p>
                </div>
                <div className="bg-surface p-12 rounded-[3.5rem] border border-border shell-premium shadow-premium">
                  <p className="text-[11px] font-black text-text-muted uppercase tracking-[0.4em] mb-3">Tempo Médio</p>
                  <p className="text-6xl font-black text-secondary tracking-tighter">
                    {filteredHistory.length > 0
                      ? Math.round(filteredHistory.reduce((acc, o) => acc + (o.timerAccumulatedSeconds || 0), 0) / filteredHistory.length / 60)
                      : 0} min
                  </p>
                </div>
              </div>

              <div className="bg-surface p-12 rounded-[3.5rem] border border-border shadow-premium space-y-8">
                <div className="flex items-center gap-4 mb-4">
                  <span className="material-symbols-outlined text-primary">filter_alt</span>
                  <p className="text-[11px] font-black text-secondary uppercase tracking-[0.4em]">Filtros de Auditoria & Fecho do Dia</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                  <div className="space-y-3">
                    <label className="text-[9px] font-black text-text-muted uppercase tracking-widest ml-2">Data Inicial</label>
                    <input
                      type="datetime-local"
                      value={hStartDate}
                      onChange={e => setHStartDate(e.target.value)}
                      className="w-full h-14 bg-background border border-border/50 rounded-xl px-4 font-bold text-xs text-secondary outline-none focus:border-primary transition-all"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[9px] font-black text-text-muted uppercase tracking-widest ml-2">Data Final</label>
                    <input
                      type="datetime-local"
                      value={hEndDate}
                      onChange={e => setHEndDate(e.target.value)}
                      className="w-full h-14 bg-background border border-border/50 rounded-xl px-4 font-bold text-xs text-secondary outline-none focus:border-primary transition-all"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[9px] font-black text-text-muted uppercase tracking-widest ml-2">Estado</label>
                    <select
                      value={hStatusFilter}
                      onChange={e => setHStatusFilter(e.target.value)}
                      className="w-full h-14 bg-background border border-border/50 rounded-xl px-4 font-bold text-[10px] uppercase tracking-widest text-secondary outline-none appearance-none cursor-pointer"
                    >
                      <option>Todos</option>
                      <option>{OrderStatus.RECEIVED}</option>
                      <option>{OrderStatus.PREPARING}</option>
                      <option>{OrderStatus.READY}</option>
                      <option>{OrderStatus.DELIVERED}</option>
                    </select>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[9px] font-black text-text-muted uppercase tracking-widest ml-2">Contacto</label>
                    <input
                      type="text"
                      placeholder="9xx..."
                      value={hContactFilter}
                      onChange={e => setHContactFilter(e.target.value)}
                      className="w-full h-14 bg-background border border-border/50 rounded-xl px-4 font-bold text-xs text-secondary outline-none focus:border-primary transition-all"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-4 pt-4">
                  <button
                    onClick={() => {
                      setHStartDate(''); setHEndDate(''); setHStatusFilter('Todos'); setHContactFilter('');
                    }}
                    className="px-8 py-3 bg-primary-soft text-primary rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-primary hover:text-white transition-all"
                  >
                    Resetar Filtros
                  </button>
                </div>
              </div>

              <div className="bg-surface rounded-[4.5rem] shadow-premium border border-border overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-black text-text-muted uppercase tracking-[0.3em] border-b border-border/50">
                      <th className="px-12 py-10">Senha</th>
                      <th className="px-10 py-10">Contacto</th>
                      <th className="px-10 py-10">Estado</th>
                      <th className="px-10 py-10">Pagamento</th>
                      <th className="px-10 py-10 text-right">Valor</th>
                      <th className="px-10 py-10">Tempo Preparo</th>
                      <th className="px-12 py-10 text-right">Data/Hora</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/20">
                    {filteredHistory.map((hOrder) => (
                      <tr key={hOrder.id} className="group hover:bg-background/40 transition-all duration-500">
                        <td className="px-12 py-10">
                          <div className="flex items-center gap-5">
                            <div className="size-12 bg-secondary text-white rounded-xl flex items-center justify-center font-black text-base group-hover:bg-primary transition-colors">
                              #{hOrder.ticketCode}
                            </div>
                            <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mt-1 hidden sm:block">Ref: {hOrder.id.slice(0, 8)}</p>
                          </div>
                        </td>
                        <td className="px-10 py-10 text-[14px] font-black text-secondary">
                          <div className="flex items-center gap-2">
                            {maskPhone(hOrder.customerPhone, hOrder.id)}
                            {!showFullPhones[hOrder.id] && (
                              <button onClick={() => revealPhone(hOrder.id)} className="text-[10px] bg-primary-soft text-primary px-2 py-1 rounded-md hover:bg-primary hover:text-white transition-all">
                                MOSTRAR
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="px-10 py-10">
                          <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${getStatusColor(hOrder.status as OrderStatus)}`}>
                            {getStatusLabel(hOrder)}
                          </span>
                        </td>
                        <td className="px-10 py-10">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-black text-secondary uppercase tracking-widest">{hOrder.paymentMethod || 'N/A'}</span>
                            {hOrder.paymentProofUrl && (
                              <a href={hOrder.paymentProofUrl} target="_blank" rel="noopener noreferrer" className="text-[9px] text-primary font-bold hover:underline">VER DOC</a>
                            )}
                          </div>
                        </td>
                        <td className="px-10 py-10 font-black text-secondary text-[14px] text-right">
                          Kz {(hOrder.total || 0).toLocaleString()}
                        </td>
                        <td className="px-10 py-10 font-black text-text-muted text-[13px]">
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
                    {categories.filter(c => c !== 'Todos').map(c => (
                      <option key={c}>{c}</option>
                    ))}
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

      {showQRModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-8 bg-secondary/80 backdrop-blur-3xl animate-in fade-in duration-500">
          <div className="w-full max-w-xl bg-surface rounded-[4.5rem] p-16 shadow-premium relative overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="absolute top-0 left-0 w-full h-4 bg-primary"></div>

            <div className="text-center mb-12">
              <div className="size-24 bg-primary-soft text-primary rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-premium">
                <span className="material-symbols-outlined text-5xl">qr_code_2</span>
              </div>
              <h3 className="text-4xl font-black tracking-tighter text-secondary leading-none">{company.name}</h3>
              <p className="text-text-muted text-lg font-medium mt-4 leading-relaxed">
                Código do Local: <span className="text-primary font-black">{company.id.toString().padStart(4, '0')}</span>
              </p>
            </div>

            <div className="flex flex-col items-center gap-10">
              <div className="bg-white p-8 rounded-[3rem] shadow-premium border-2 border-border/20 relative group" style={{ filter: 'sharp-edges' }}>
                <div className="relative">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`https://kwikfood.vercel.app?code=${company.id.toString().padStart(4, '0')}`)}`}
                    alt="QR Code"
                    className="size-64"
                  />
                  {company.logoUrl && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="size-16 bg-white p-1 rounded-xl shadow-lg border border-border/20 overflow-hidden">
                        <img src={company.logoUrl} alt="Logo" className="w-full h-full object-cover rounded-lg" />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="w-full space-y-4">
                <button
                  onClick={() => window.print()}
                  className="w-full h-24 bg-primary text-white rounded-[2rem] font-black text-sm tracking-[0.4em] shadow-premium hover:bg-secondary transition-all flex items-center justify-center gap-4"
                >
                  <span className="material-symbols-outlined">print</span>
                  IMPRIMIR PARA BALCÃO
                </button>
                <button
                  onClick={() => setShowQRModal(false)}
                  className="w-full py-5 text-[12px] font-black text-text-muted uppercase tracking-[0.4em] hover:text-secondary transition-colors"
                >
                  FECHAR
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showMarketingAuthModal && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-8 bg-secondary/90 backdrop-blur-3xl animate-in fade-in duration-500">
          <div className="w-full max-w-md bg-white rounded-[3.5rem] p-12 shadow-premium relative overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="absolute top-0 left-0 w-full h-3 bg-primary"></div>

            <div className="text-center mb-10">
              <div className="size-20 bg-primary/10 text-primary rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                <span className="material-symbols-outlined text-4xl">lock</span>
              </div>
              <h3 className="text-2xl font-black tracking-tight text-secondary leading-none">Acesso Restrito</h3>
              <p className="text-[#BBBBBB] text-[11px] font-black uppercase tracking-widest mt-4">Insira a sua password de parceiro</p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (marketingPasswordPrompt === company.password) {
                  setIsMarketingUnlocked(true);
                  setActiveTab('MARKETING');
                  setShowMarketingAuthModal(false);
                  setMarketingAuthError(false);
                } else {
                  setMarketingAuthError(true);
                }
              }}
              className="space-y-6"
            >
              <div className="space-y-2">
                <input
                  type="password"
                  value={marketingPasswordPrompt}
                  onChange={(e) => setMarketingPasswordPrompt(e.target.value)}
                  placeholder="Password da Empresa"
                  autoFocus
                  className={`w-full h-16 bg-[#F9F9F9] border-2 rounded-2xl px-6 font-bold text-center text-[#111111] transition-all outline-none ${marketingAuthError ? 'border-red-500 animate-shake' : 'border-transparent focus:border-primary'}`}
                />
                {marketingAuthError && (
                  <p className="text-[10px] text-red-500 font-black uppercase tracking-widest text-center mt-2">Password Incorrecta</p>
                )}
              </div>

              <div className="flex flex-col gap-3 pt-4">
                <button
                  type="submit"
                  className="w-full h-16 bg-primary text-white rounded-2xl font-black text-[12px] uppercase tracking-widest shadow-lg shadow-primary/20 hover:bg-secondary transition-all"
                >
                  AUTENTICAR
                </button>
                <button
                  type="button"
                  onClick={() => setShowMarketingAuthModal(false)}
                  className="w-full py-4 text-[10px] font-black text-[#BBBBBB] uppercase tracking-[0.2em] hover:text-secondary transition-colors"
                >
                  CANCELAR
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

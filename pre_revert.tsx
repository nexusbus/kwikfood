
import React, { useState, useEffect } from 'react';
import { Company, Product, ProductStatus, Order, OrderStatus, OrderType } from '../types';
import { fetchProducts } from '../constants';
import { supabase } from '../src/lib/supabase';
import { sendSMS } from '../src/services/smsService';
import { sendTelegramMessage, formatOrderNotification } from '../src/services/telegramService';
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
  const [activeTab, setActiveTab] = useState<'PRODUTOS' | 'FILA' | 'MARKETING' | 'RELATORIOS'>('FILA');
  const [productFilter, setProductFilter] = useState('Todos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [ticketSearch, setTicketSearch] = useState('');
  const [showQRModal, setShowQRModal] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [isKitchenMonitor, setIsKitchenMonitor] = useState(false);

  // Form state
  const [pName, setPName] = useState('');
  const [pPrice, setPPrice] = useState<number | ''>('');
  const [pCategory, setPCategory] = useState('Hamb├║rgueres');
  const [pStatus, setPStatus] = useState<ProductStatus>(ProductStatus.ACTIVE);
  const [pImageUrl, setPImageUrl] = useState('');
  const [pDetails, setPDetails] = useState('');
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
  const [smsCount, setSmsCount] = useState(0);
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const calculateElapsed = (order: Order) => {
    const accumulated = order.timerAccumulatedSeconds || 0;
    if (order.status === OrderStatus.READY || order.status === OrderStatus.DELIVERED || !order.timerLastStartedAt) {
      return accumulated;
    }
    const start = new Date(order.timerLastStartedAt).getTime();
    const current = now.getTime();
    return accumulated + Math.floor((current - start) / 1000);
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const loadData = async () => {
    try {
      const { data: pData } = await supabase.from('products').select('*').eq('company_id', company.id).order('created_at', { ascending: false });
      if (pData) setProducts(pData.map(p => ({ ...p, imageUrl: p.image_url, details: p.details })));

      const { data: oData } = await supabase
        .from('orders')
        .select('id, company_id, customer_phone, customer_name, status, items, total, queue_position, estimated_minutes, ticket_code, ticket_number, timer_last_started_at, timer_accumulated_seconds, created_at, cancelled_by, payment_method, payment_proof_url, order_type, delivery_address, delivery_coords')
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
        customerName: o.customer_name,
        timerAccumulatedSeconds: o.timer_accumulated_seconds || 0,
        timerLastStartedAt: o.timer_last_started_at,
        cancelledBy: o.cancelled_by,
        orderType: o.order_type as OrderType,
        deliveryAddress: o.delivery_address,
        deliveryCoords: o.delivery_coords,
        timestamp: new Date(o.created_at).toLocaleString()
      })));

      const { data: hData } = await supabase
        .from('orders')
        .select('id, company_id, customer_phone, customer_name, status, items, total, queue_position, estimated_minutes, ticket_code, ticket_number, timer_last_started_at, timer_accumulated_seconds, created_at, cancelled_by, payment_method, payment_proof_url, order_type, delivery_address, delivery_coords')
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
        customerName: o.customer_name,
        timerAccumulatedSeconds: o.timer_accumulated_seconds || 0,
        timerLastStartedAt: o.timer_last_started_at,
        cancelledBy: o.cancelled_by,
        orderType: o.order_type as OrderType,
        deliveryAddress: o.delivery_address,
        deliveryCoords: o.delivery_coords,
        timestamp: new Date(o.created_at).toLocaleString()
      })));
      const { count: sCount } = await supabase
        .from('sms_logs')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', company.id);

      setSmsCount(sCount || 0);

    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();

    const pChannel = supabase
      .channel(`products-${company.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `company_id=eq.${company.id}` }, () => loadData())
      .subscribe();

    const sChannel = supabase
      .channel(`sms-${company.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sms_logs', filter: `company_id=eq.${company.id}` }, () => loadData())
      .subscribe();

    const oChannel = supabase
      .channel(`orders-${company.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `company_id=eq.${company.id}` }, () => loadData())
      .subscribe();

    return () => {
      supabase.removeChannel(pChannel);
      supabase.removeChannel(oChannel);
      supabase.removeChannel(sChannel);
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

      // Update local state immediately for better Reactivity/Precision
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updates, timerAccumulatedSeconds: updates.timer_accumulated_seconds ?? o.timerAccumulatedSeconds, timerLastStartedAt: updates.timer_last_started_at ?? o.timerLastStartedAt } : o));

      // Telegram Notification
      if (company.telegramChatId && company.telegramBotToken) {
        const updatedOrder = { ...order, status, ...updates };
        const message = formatOrderNotification(updatedOrder, 'STATUS_CHANGE');
        sendTelegramMessage(company.telegramBotToken, company.telegramChatId, message);
      }
      if (status === OrderStatus.DELIVERED || status === OrderStatus.CANCELLED) {
        setOrders(prev => prev.filter(o => o.id !== orderId));
      }

      // Trigger SMS notification
      if (status === OrderStatus.PREPARING || status === OrderStatus.READY || status === OrderStatus.DELIVERED || status === OrderStatus.CANCELLED) {
        let message = '';
        const ticket = order.ticketCode;
        const name = company.name;

        if (order.orderType === OrderType.DELIVERY) {
          switch (status) {
            case OrderStatus.PREPARING:
              message = `${name}: O seu pedido ${ticket} est├í a ser preparado!`;
              break;
            case OrderStatus.READY:
              message = `${name}: O seu pedido ${ticket} est├í a caminho, Aguarde!`;
              break;
            case OrderStatus.DELIVERED:
              message = `${name}: O seu pedido ${ticket} foi entregue. Bom apetite!`;
              break;
            case OrderStatus.CANCELLED:
              message = `${name}: Lamentamos imenso, mas o seu pedido ${ticket} teve de ser cancelado. Por favor, contacte o estabelecimento. ≡ƒÿö`;
              break;
          }
        } else {
          // Vou comer aqui e Vou levar
          switch (status) {
            case OrderStatus.PREPARING:
              message = `${name}: O seu pedido ${ticket} est├í a ser preparado!`;
              break;
            case OrderStatus.READY:
              message = `${name}: O seu pedido ${ticket} est├í pronto! Pode vir levantar.`;
              break;
            case OrderStatus.DELIVERED:
              message = `${name}: O seu pedido ${ticket} foi entregue. Bom apetite!`;
              break;
            case OrderStatus.CANCELLED:
              message = `${name}: Lamentamos imenso, mas o seu pedido ${ticket} teve de ser cancelado. Por favor, contacte o estabelecimento. ≡ƒÿö`;
              break;
          }
        }

        if (message && order.customerPhone) {
          try {
            await sendSMS({ recipient: order.customerPhone, message, companyId: company.id });
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
        await sendSMS({ recipient: phone, message: finalMessage, companyId: company.id });
      }
      alert('SMS Enviados com Sucesso!');
      setMessageBody('');
      setSelectedContacts([]);
      loadData(); // Force refresh stats
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
      const productData = { name: pName, price: Number(pPrice), category: pCategory, status: pStatus, image_url: pImageUrl, details: pDetails, company_id: company.id };
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
      setPName(product.name); setPPrice(product.price); setPCategory(product.category); setPStatus(product.status); setPImageUrl(product.imageUrl); setPDetails(product.details || '');
    } else {
      setSelectedProduct(null);
      setPName(''); setPPrice(''); setPCategory('Hamb├║rgueres'); setPStatus(ProductStatus.ACTIVE); setPImageUrl(''); setPDetails('');
    }
    setIsModalOpen(true);
  };

  const categories = ['Todos', 'Hamb├║rgueres', 'Comida', 'Bebidas', 'Acompanhamentos'];
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

  const handleExportCSV = () => {
    const headers = ['Data', 'Ticket', 'Status', 'Itens', 'Total (Kz)', 'Telefone', 'Pagamento'];
    const rows = filteredHistory.map(o => [
      o.timestamp,
      `#${o.ticketCode}`,
      o.status,
      o.items.map(i => `${i.quantity}x ${i.name}`).join(' | '),
      o.total || 0,
      o.customerPhone,
      o.paymentMethod || 'N/A'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `relatorio_${company.name.replace(/\s+/g, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex h-screen bg-[#F9F9F9] overflow-hidden selection:bg-primary selection:text-white relative font-sans">
      {/* Mobile Menu Toggle - Only visible on small screens */}
      {!showSidebar && (
        <button
          onClick={() => setShowSidebar(true)}
          className="lg:hidden fixed bottom-8 right-8 z-[160] size-16 bg-primary text-white rounded-2xl shadow-premium flex items-center justify-center animate-fade-in active:scale-90 transition-all"
        >
          <span className="material-symbols-outlined text-3xl">menu</span>
        </button>
      )}

      {/* Sidebar Backdrop - Click to Close */}
      {showSidebar && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[150] animate-fade-in"
          onClick={() => setShowSidebar(false)}
        />
      )}
      {/* Premium Sidebar - Collapsible */}
      <aside className={`fixed lg:static inset-y-0 left-0 w-80 bg-white/95 lg:bg-white backdrop-blur-xl lg:backdrop-blur-none border-r border-white/50 lg:border-border/30 p-8 flex flex-col gap-10 z-[200] transition-all duration-500 ease-in-out shadow-2xl lg:shadow-none overflow-y-auto custom-scrollbar ${isKitchenMonitor ? '-translate-x-full absolute' : (showSidebar ? 'translate-x-0' : '-translate-x-full lg:translate-x-0')}`}>
        <div className="flex flex-col items-center text-center gap-6 py-4">
          {company.logoUrl && (
            <div className="size-28 bg-white rounded-[2.5rem] shadow-premium border-2 border-primary/5 overflow-hidden group/logo">
              <img
                src={company.logoUrl}
                alt={company.name}
                className="w-full h-full object-cover group-hover/logo:scale-110 transition-transform duration-700"
              />
            </div>
          )}

          <button
            onClick={() => setShowSidebar(false)}
            className="flex flex-col items-center gap-3 relative group w-full hover:opacity-80 transition-opacity"
          >
            <div className="flex items-center gap-4">
              <Logo variant="icon" size={32} className="transform group-hover:rotate-12 transition-transform duration-500" color="primary" />
              <div className="h-4 w-[1px] bg-border/40"></div>
              <p className="text-[9px] font-black text-primary uppercase tracking-[0.4em]">Portal Parceiro</p>
            </div>
            <h1 className="text-2xl font-black tracking-tighter text-secondary leading-tight px-4">{company.name}</h1>
          </button>
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

          <button
            onClick={() => setActiveTab('RELATORIOS')}
            className={`flex items-center gap-5 px-8 py-5 rounded-[1.5rem] transition-all font-black text-[12px] uppercase tracking-widest relative overflow-hidden group ${activeTab === 'RELATORIOS' ? 'bg-secondary text-white shadow-premium' : 'text-text-muted hover:bg-white/40 hover:text-secondary'}`}
          >
            <span className="material-symbols-outlined text-2xl">analytics</span>
            Auditoria & Relat├│rios
            {activeTab === 'RELATORIOS' && <div className="absolute right-6 size-2 bg-primary rounded-full animate-pulse"></div>}
          </button>

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
        className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-12 relative custom-scrollbar bg-slate-50"
      >
        <div className="fixed top-0 right-0 w-1/3 h-1/2 bg-red-500/5 rounded-full blur-[150px] pointer-events-none"></div>

        <header className={`mb-6 lg:mb-10 flex flex-col lg:flex-row justify-between items-center gap-6 relative z-10 animate-fade-in no-print ${isKitchenMonitor ? 'bg-white rounded-[2rem] p-6 shadow-premium border border-border/20 mb-8' : ''}`}>
          <div className="flex items-center gap-4">
            {!isKitchenMonitor && (
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="group flex items-center justify-center p-2 rounded-xl hover:bg-slate-100 transition-all active:scale-90"
              >
                <Logo variant="icon" size={44} className="transform group-hover:rotate-12 transition-transform duration-500" color="primary" />
              </button>
            )}
            <div>
              <p className="text-[9px] font-black text-primary uppercase tracking-[0.4em] mb-1">Painel Administrativo</p>
              <h2 className={`font-black tracking-tight text-slate-900 ${isKitchenMonitor ? 'text-3xl' : 'text-2xl lg:text-3xl'}`}>
                {activeTab === 'FILA' ? 'A Cozinha' : activeTab === 'PRODUTOS' ? 'O Menu' : activeTab === 'MARKETING' ? 'Marketing' : 'Relat├│rios'}
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap justify-center items-center gap-4">
            {activeTab === 'FILA' && (
              <button
                onClick={() => setIsKitchenMonitor(!isKitchenMonitor)}
                className={`h-16 px-8 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all flex items-center gap-3 shadow-lg active:scale-95 ${isKitchenMonitor ? 'bg-secondary text-white' : 'bg-white text-secondary border border-border shadow-md'}`}
              >
                <span className="material-symbols-outlined text-2xl">
                  {isKitchenMonitor ? 'fullscreen_exit' : 'fullscreen'}
                </span>
                {isKitchenMonitor ? 'SAIR DO MONITOR' : 'MODO MONITOR'}
              </button>
            )}

            {!isKitchenMonitor && (
              <button
                onClick={async () => {
                  const newState = !company.isAcceptingOrders;
                  const { error } = await supabase
                    .from('companies')
                    .update({ is_accepting_orders: newState })
                    .eq('id', company.id);
                  if (error) alert('Erro ao atualizar estado de pedidos.');
                  else {
                    company.isAcceptingOrders = newState;
                    setNow(new Date()); // trigger re-render if needed
                  }
                }}
                className={`h-16 px-8 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all flex items-center gap-3 shadow-lg active:scale-95 ${company.isAcceptingOrders === false ? 'bg-red-500 text-white shadow-red-500/20' : 'bg-green-500 text-white shadow-green-500/20'}`}
              >
                <span className="material-symbols-outlined text-2xl">
                  {company.isAcceptingOrders === false ? 'block' : 'check_circle'}
                </span>
                {company.isAcceptingOrders === false ? 'PEDIDOS DESATIVADOS' : 'PEDIDOS ATIVADOS'}
              </button>
            )}

            {activeTab === 'FILA' && (
              <>
                {!isKitchenMonitor && (
                  <button
                    onClick={async () => {
                      const res = await sendTelegramMessage(
                        company.telegramBotToken || '',
                        company.telegramChatId || '',
                        `≡ƒº¬ <b>TESTE DE CONECTIVIDADE</b>\nO seu terminal administrativo est├í correctamente ligado ao Telegram! ≡ƒÜÇ`
                      );
                      if (res?.success) alert('Sucesso! Verifique o Telegram.');
                      else alert(`FALHA: ${res?.error}`);
                    }}
                    className="h-14 px-5 bg-white border border-slate-200 text-slate-600 rounded-xl font-black text-[9px] uppercase tracking-widest hover:border-primary/20 hover:text-primary transition-all flex items-center gap-2 active:scale-95"
                  >
                    <span className="material-symbols-outlined text-lg text-primary">send</span>
                    TESTAR TELEGRAM
                  </button>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <div className="bg-white px-5 py-3 rounded-xl border border-slate-100 shadow-sm flex flex-col min-w-[120px]">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Pedidos Atuais</p>
                    <p className="text-xl font-black text-slate-900">{orders.length}</p>
                  </div>
                  {!isKitchenMonitor && (
                    <div className="bg-white px-5 py-3 rounded-xl border border-slate-100 shadow-sm flex flex-col min-w-[120px]">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Status SMS</p>
                      <p className="text-xl font-black text-slate-900">{smsCount}</p>
                    </div>
                  )}
                  <div className="relative group w-full sm:w-60">
                    <input
                      type="text"
                      placeholder="Pesquisar..."
                      value={ticketSearch}
                      onChange={(e) => setTicketSearch(e.target.value.toUpperCase())}
                      className="w-full h-14 bg-white border border-slate-200 rounded-xl px-10 font-bold text-xs text-slate-700 shadow-sm focus:border-primary transition-all outline-none"
                    />
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-300">search</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </header>

        <div className="relative z-10">
          {activeTab === 'FILA' ? (
            <div className="px-4 sm:px-0 space-y-6 animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-[10px] font-black text-slate-800 uppercase tracking-[0.2em]">Fila de Prepara├º├úo</h3>
                  <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-md text-[8px] font-black uppercase tracking-widest">{filteredOrders.length} Ativos</span>
                </div>
              </div>

              {filteredOrders.length === 0 ? (
                <div className="bg-white rounded-[2rem] p-12 sm:p-20 text-center border border-slate-200 border-dashed animate-scale-in">
                  <div className="size-24 sm:size-32 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-8 text-slate-300">
                    <span className="material-symbols-outlined text-5xl sm:text-6xl">restaurant_menu</span>
                  </div>
                  <h3 className="text-xl font-black text-slate-300 uppercase tracking-[0.3em]">Cozinha em Espera</h3>
                </div>
              ) : (
                <div className={`grid gap-4 sm:gap-6 lg:gap-8 ${isKitchenMonitor ? 'grid-cols-1 md:grid-cols-2 2xl:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'}`}>
                  {filteredOrders.map(order => (
                    <div key={order.id} className="bg-white rounded-[2.5rem] border border-border shadow-md hover:shadow-premium transition-all duration-500 overflow-hidden flex flex-col group animate-scale-in relative">
                      {/* Borda Lateral Ultra-Impactante */}
                      <div className={`absolute top-0 left-0 w-3 h-full ${order.status === OrderStatus.PREPARING ? 'bg-amber-400' : order.status === OrderStatus.READY ? 'bg-emerald-400' : 'bg-rose-500'}`}></div>

                      <div className="p-8 sm:p-10 flex-1 flex flex-col gap-8 ml-3">
                        {/* Cabe├ºalho do Ticket */}
                        <div className="flex justify-between items-start border-b border-border/40 pb-6">
                          <div>
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Ticket ID</span>
                              {order.orderType === OrderType.EAT_IN && <span className="px-2 py-0.5 bg-blue-50 text-blue-500 rounded-md text-[8px] font-black uppercase tracking-widest">NO LOCAL</span>}
                              {order.orderType === OrderType.TAKE_AWAY && <span className="px-2 py-0.5 bg-orange-50 text-orange-500 rounded-md text-[8px] font-black uppercase tracking-widest">TAKE AWAY</span>}
                              {order.orderType === OrderType.DELIVERY && <span className="px-2 py-0.5 bg-rose-50 text-rose-500 rounded-md text-[8px] font-black uppercase tracking-widest">ENTREGA</span>}
                            </div>
                            <h2 className="text-5xl lg:text-6xl font-black text-slate-900 tracking-tighter leading-none">
                              <span className="text-primary">#</span>{order.ticketCode}
                            </h2>
                            <div className="mt-4 flex flex-col">
                              {order.customerName && <p className="text-base font-black text-slate-800 uppercase tracking-tight">{order.customerName}</p>}
                              <p className="text-xs font-bold text-slate-400 flex items-center gap-2">
                                <span className="material-symbols-outlined text-sm">phone_android</span>
                                {maskPhone(order.customerPhone, order.id)}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${order.status === OrderStatus.PREPARING ? 'bg-amber-50 text-amber-600 border border-amber-100' : order.status === OrderStatus.READY ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                              <span className="size-2 rounded-full bg-current animate-pulse"></span>
                              {order.status === OrderStatus.PREPARING ? 'Preparando' : order.status === OrderStatus.READY ? 'Pronto' : 'Na Fila'}
                            </div>
                            <div className="mt-6 flex flex-col items-end">
                              <p className="text-2xl font-black text-slate-900 tracking-tighter">{(order.total || 0).toLocaleString()} <span className="text-sm font-bold text-slate-400 uppercase ml-1">Kz</span></p>
                              <div className="flex items-center gap-2 mt-2 text-primary bg-primary/5 px-3 py-1.5 rounded-lg border border-primary/10">
                                <span className="material-symbols-outlined text-base animate-spin-slow">timer</span>
                                <span className="font-black text-[13px] tabular-nums tracking-widest">
                                  {formatTime(calculateElapsed(order))}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Itens do Pedido (Aumentado para Melhor Leitura) */}
                        <div className="flex-1">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mb-6">Conte├║do do Pedido</p>
                          <div className="space-y-6">
                            {order.items.map((item, i) => (
                              <div key={i} className="flex gap-6 items-start group/item">
                                <div className="size-14 bg-slate-50 rounded-2xl flex items-center justify-center font-black text-xl text-slate-900 border border-slate-100 group-hover/item:bg-primary group-hover/item:text-white transition-colors flex-shrink-0">
                                  {item.quantity}
                                </div>
                                <div className="flex flex-col min-w-0 flex-1 pt-1">
                                  <span className="text-xl font-black text-slate-800 leading-tight group-hover/item:text-primary transition-colors">{item.name}</span>
                                  {item.observation && (
                                    <div className="mt-3 flex gap-2 items-start bg-amber-50/50 p-4 rounded-2xl border border-amber-100/50">
                                      <span className="material-symbols-outlined text-amber-500 text-lg">info</span>
                                      <span className="text-xs text-amber-700 font-black uppercase tracking-tight leading-relaxed italic">{item.observation}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Ac├º├╡es de Gest├úo de Ticket (Ultra Premium) */}
                        <div className="mt-auto space-y-4 pt-6 border-t border-border/40">
                          {order.status === OrderStatus.READY ? (
                            <button
                              onClick={() => updateOrderStatus(order.id, OrderStatus.DELIVERED)}
                              className="w-full h-20 bg-emerald-500 text-white rounded-3xl font-black text-xs uppercase tracking-[0.3em] shadow-lg shadow-emerald-500/20 hover:bg-slate-900 transition-all flex items-center justify-center gap-4 active:scale-95 group/btn"
                            >
                              <span className="material-symbols-outlined text-2xl group-hover/btn:translate-x-2 transition-transform">check_circle</span>
                              CONCLUIR ENTREGA
                            </button>
                          ) : (
                            <div className="grid grid-cols-1 gap-4">
                              <button
                                onClick={() => updateOrderStatus(order.id, OrderStatus.PREPARING)}
                                disabled={order.status === OrderStatus.PREPARING}
                                className={`w-full h-20 rounded-3xl font-black text-xs uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-4 shadow-xl active:scale-95 group/btn ${order.status === OrderStatus.PREPARING ? 'bg-slate-50 text-slate-300 border border-border cursor-default' : 'bg-primary text-white hover:bg-secondary shadow-primary/20'}`}
                              >
                                <span className={`material-symbols-outlined text-2xl ${order.status === OrderStatus.PREPARING ? '' : 'group-hover/btn:rotate-12 transition-transform'}`}>
                                  {order.status === OrderStatus.PREPARING ? 'outdoor_grill' : 'local_fire_department'}
                                </span>
                                {order.status === OrderStatus.PREPARING ? 'EM PREPARA├ç├âO' : 'INICIAR PREPARO'}
                              </button>

                              <div className="grid grid-cols-2 gap-4">
                                <button
                                  onClick={() => updateOrderStatus(order.id, OrderStatus.READY)}
                                  className="h-16 bg-white border-2 border-slate-100 text-slate-800 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:border-primary/40 hover:text-primary transition-all flex items-center justify-center gap-3 active:scale-95"
                                >
                                  <span className="material-symbols-outlined text-xl">notifications_active</span>
                                  NOTIFICAR
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm('Cancelar este pedido permanentemente?')) updateOrderStatus(order.id, OrderStatus.CANCELLED);
                                  }}
                                  className="h-16 bg-white border-2 border-slate-100 text-slate-300 hover:text-red-500 hover:border-red-100 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-3 active:scale-95"
                                >
                                  <span className="material-symbols-outlined text-xl">block</span>
                                  CANCELAR
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'PRODUTOS' ? (
            <div className="space-y-12 animate-fade-in pb-20">
              {/* Cabe├ºalho da Se├º├úo de Produtos */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-8 bg-white p-8 sm:p-12 rounded-[3.5rem] border border-border/40 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-2 h-full bg-primary"></div>
                <div>
                  <h3 className="text-3xl font-black text-secondary tracking-tighter">Gest├úo de Card├ípio</h3>
                  <p className="text-text-muted text-sm font-medium mt-1">Organize os seus produtos e categorias com um clique.</p>
                </div>
                <button
                  onClick={() => openModal('add')}
                  className="w-full sm:w-auto h-20 px-10 bg-primary text-white rounded-[1.8rem] font-black text-xs uppercase tracking-[0.3em] shadow-xl shadow-primary/20 hover:bg-secondary transition-all flex items-center justify-center gap-4 active:scale-95 group/add"
                >
                  <span className="material-symbols-outlined text-2xl group-hover/add:rotate-90 transition-transform">add_circle</span>
                  NOVO PRODUTO
                </button>
              </div>

              {/* Filtros de Categoria */}
              <div className="flex items-center gap-4 overflow-x-auto pb-4 custom-scrollbar no-scrollbar scroll-smooth">
                {categories.map(cat => (
                  <button
                    key={cat} onClick={() => setProductFilter(cat)}
                    className={`px-10 py-5 rounded-3xl font-black text-[10px] uppercase tracking-widest transition-all flex-shrink-0 border-2 ${productFilter === cat ? 'bg-secondary border-secondary text-white shadow-premium scale-105' : 'bg-white border-slate-100 text-slate-400 hover:border-primary/20 hover:text-secondary'}`}
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
                    <div className="p-10 flex flex-col flex-1 justify-between gap-10 bg-white">
                      <div>
                        <div className="flex items-center gap-3 mb-3">
                          <span className="text-[9px] font-black text-primary uppercase tracking-[0.3em] bg-primary/5 px-4 py-1.5 rounded-full">{p.category}</span>
                          <div className="h-[1px] flex-1 bg-slate-100"></div>
                        </div>
                        <h4 className="font-bold text-xl text-secondary tracking-tight mb-2 group-hover:text-primary transition-colors">{p.name}</h4>
                        {p.details && <p className="text-[10px] font-medium text-slate-400 leading-relaxed mb-6 line-clamp-2 italic opacity-80">{p.details}</p>}

                        <div className="flex items-center justify-between mt-4">
                          <p className="text-secondary font-bold text-2xl tracking-tighter">
                            <span className="text-[10px] text-slate-300 mr-2 uppercase tracking-widest font-black">Kz</span>
                            {p.price.toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-4">
                        <button
                          onClick={() => openModal('edit', p)}
                          className="flex-1 h-16 bg-slate-50 hover:bg-secondary hover:text-white rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all active:scale-95 group/edit"
                        >
                          <span className="material-symbols-outlined text-2xl group-hover/edit:rotate-12 transition-transform">edit_square</span>
                          EDITAR
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Excluir ${p.name}?`)) handleDeleteProduct(p.id);
                          }}
                          className="size-16 flex items-center justify-center bg-red-50 text-red-400 rounded-2xl hover:bg-red-500 hover:text-white transition-all shadow-sm active:scale-95"
                        >
                          <span className="material-symbols-outlined text-2xl">delete_sweep</span>
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
                          <p className="font-black uppercase tracking-widest text-[10px]">Nenhuma base de dados dispon├¡vel</p>
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
                      <label className="text-[11px] font-black text-secondary uppercase tracking-[0.4em] ml-2 opacity-50">Composi├º├úo da Campanha</label>
                      <textarea
                        value={messageBody}
                        onChange={e => setMessageBody(e.target.value)}
                        placeholder="Escreva a mensagem para os seus clientes..."
                        className="w-full h-64 bg-background border-2 border-border/40 rounded-[2rem] p-10 font-medium text-lg text-secondary focus:border-primary transition-all outline-none resize-none shadow-inner"
                      />
                      <div className="flex justify-between px-2">
                        <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">{selectedContacts.length} destinat├írios selecionados</p>
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
            <div className="space-y-6 animate-fade-in pb-20">
              {/* Header de Relat├│rio com Exporta├º├úo */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 sm:p-8 rounded-2xl sm:rounded-[3rem] border border-border/40 shadow-sm no-print">
                <div>
                  <h3 className="text-xl sm:text-2xl font-black text-secondary tracking-tight">Auditoria & Relat├│rios</h3>
                  <p className="text-text-muted text-xs font-medium mt-1">Monitoriza├º├úo financeira e hist├│rico de opera├º├╡es.</p>
                </div>
                <div className="flex w-full sm:w-auto gap-3">
                  <button
                    onClick={handleExportCSV}
                    className="flex-1 sm:px-6 h-12 bg-slate-100 border border-border/40 text-secondary hover:bg-slate-200 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2 active:scale-95"
                  >
                    <span className="material-symbols-outlined text-lg">description</span> EXCEL
                  </button>
                  <button
                    onClick={handlePrint}
                    className="flex-[1.5] sm:px-8 h-12 bg-primary text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2 active:scale-95"
                  >
                    <span className="material-symbols-outlined text-lg">picture_as_pdf</span> GERAR PDF
                  </button>
                </div>
              </div>

              {/* Monitor em Tempo Real (KPIs) */}
              <section>
                <div className="flex items-center justify-between mb-4 px-2">
                  <h4 className="text-primary text-[10px] font-black leading-normal tracking-[0.2em] uppercase">Monitor em Tempo Real</h4>
                  <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="flex flex-col gap-1 rounded-2xl p-4 sm:p-6 bg-white border border-slate-200 shadow-sm group hover:border-primary/20 transition-all">
                    <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest">Faturamento Bruto</p>
                    <p className="text-slate-900 text-xl font-black tracking-tight">{totalRevenue.toLocaleString()} Kz</p>
                  </div>
                  <div className="flex flex-col gap-1 rounded-2xl p-4 sm:p-6 bg-white border border-slate-200 shadow-sm group hover:border-primary/20 transition-all">
                    <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest">Investimento SMS</p>
                    <p className="text-slate-900 text-xl font-black tracking-tight">{(smsCount * 5).toLocaleString()} Kz</p>
                  </div>
                  <div className="flex flex-col gap-1 rounded-2xl p-4 sm:p-6 bg-white border border-slate-200 shadow-sm group hover:border-primary/20 transition-all border-l-4 border-l-primary">
                    <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest">Faturamento L├¡quido</p>
                    <p className="text-primary text-xl font-black tracking-tight">{(totalRevenue - (smsCount * 5)).toLocaleString()} Kz</p>
                  </div>
                  <div className="flex flex-col gap-1 rounded-2xl p-4 sm:p-6 bg-white border border-slate-200 shadow-sm group hover:border-primary/20 transition-all">
                    <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest">Tempo Preparo</p>
                    <p className="text-slate-900 text-xl font-black tracking-tight">
                      {filteredHistory.length > 0
                        ? Math.round(filteredHistory.reduce((acc, o) => acc + (o.timerAccumulatedSeconds || 0), 0) / filteredHistory.length / 60)
                        : 0} min
                    </p>
                  </div>
                </div>
              </section>

              {/* Filtros Avan├ºados */}
              <div className="bg-white p-6 sm:p-8 rounded-2xl sm:rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6 no-print">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-primary">filter_list</span>
                  <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Filtros de Auditoria & Fecho do Dia</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Data Inicial</label>
                    <input
                      type="datetime-local"
                      value={hStartDate}
                      onChange={e => setHStartDate(e.target.value)}
                      className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 font-bold text-xs text-secondary outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Data Final</label>
                    <input
                      type="datetime-local"
                      value={hEndDate}
                      onChange={e => setHEndDate(e.target.value)}
                      className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 font-bold text-xs text-secondary outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Estado</label>
                    <div className="relative">
                      <select
                        value={hStatusFilter}
                        onChange={e => setHStatusFilter(e.target.value)}
                        className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 font-bold text-[10px] uppercase tracking-widest text-secondary outline-none appearance-none cursor-pointer focus:border-primary focus:ring-1 focus:ring-primary"
                      >
                        <option>Todos</option>
                        <option>{OrderStatus.RECEIVED}</option>
                        <option>{OrderStatus.PREPARING}</option>
                        <option>{OrderStatus.READY}</option>
                        <option>{OrderStatus.DELIVERED}</option>
                      </select>
                      <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none text-lg">expand_more</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Contacto</label>
                    <input
                      type="text"
                      placeholder="9xx..."
                      value={hContactFilter}
                      onChange={e => setHContactFilter(e.target.value)}
                      className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-4 font-bold text-xs text-secondary outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button
                    onClick={() => {
                      setHStartDate(''); setHEndDate(''); setHStatusFilter('Todos'); setHContactFilter('');
                    }}
                    className="px-6 h-10 bg-slate-50 text-slate-500 rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-slate-100 transition-all border border-slate-200"
                  >
                    Resetar Filtros
                  </button>
                </div>
              </div>

              {/* Tabela de Auditoria Unificada */}
              <div className="bg-white rounded-2xl sm:rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center no-print">
                  <h4 className="text-sm font-black text-slate-700 uppercase tracking-tight">Hist├│rico Detalhado de Opera├º├╡es</h4>
                  <span className="text-[10px] text-slate-400">{filteredHistory.length} resultados encontrados</span>
                </div>
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left min-w-[1000px]">
                    <thead>
                      <tr className="text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/30">
                        <th className="px-6 py-4">Senha</th>
                        <th className="px-5 py-4">Contacto</th>
                        <th className="px-5 py-4">Estado</th>
                        <th className="px-5 py-4">Itens</th>
                        <th className="px-5 py-4">Pagto</th>
                        <th className="px-5 py-4">Tipo / Endere├ºo</th>
                        <th className="px-5 py-4 text-right">Valor</th>
                        <th className="px-5 py-4">Preparo</th>
                        <th className="px-6 py-4 text-right">Data/Hora</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredHistory.map((hOrder) => (
                        <tr key={hOrder.id} className="group hover:bg-slate-50 transition-all">
                          <td className="px-6 py-4">
                            <div className="h-10 w-12 bg-slate-900 text-white rounded-lg flex items-center justify-center font-black text-[11px] group-hover:bg-primary transition-colors">
                              #{hOrder.ticketCode}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-[11px] font-black text-slate-700">
                            <div className="flex items-center gap-2">
                              {maskPhone(hOrder.customerPhone, hOrder.id)}
                              {!showFullPhones[hOrder.id] && (
                                <button onClick={() => revealPhone(hOrder.id)} className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded no-print hover:bg-primary hover:text-white transition-all">
                                  VER
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <span className={`px-2 py-1 rounded text-[8px] font-black uppercase tracking-widest ${getStatusColor(hOrder.status as OrderStatus)}`}>
                              {getStatusLabel(hOrder)}
                            </span>
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-[10px] font-bold text-slate-500 truncate max-w-[150px]" title={hOrder.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}>
                              {hOrder.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                            </p>
                          </td>
                          <td className="px-5 py-4">
                            <span className="text-[9px] font-black text-slate-700 uppercase tracking-tight bg-slate-100 px-2 py-1 rounded">{hOrder.paymentMethod || 'N/A'}</span>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex flex-col">
                              <span className="text-[9px] font-black text-slate-700 uppercase tracking-tight">
                                {hOrder.orderType === OrderType.EAT_IN ? 'COMER AQUI' : hOrder.orderType === OrderType.TAKE_AWAY ? 'LEVANTAMENTO' : 'ENTREGA'}
                              </span>
                              {hOrder.orderType === OrderType.DELIVERY && hOrder.deliveryAddress && (
                                <span className="text-[9px] font-bold text-slate-400 truncate max-w-[180px]" title={hOrder.deliveryAddress}>
                                  {hOrder.deliveryAddress}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-4 font-black text-slate-900 text-[12px] text-right">
                            {(hOrder.total || 0).toLocaleString()} Kz
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-1.5 font-black text-slate-500 text-[10px]">
                              <span className="material-symbols-outlined text-sm">schedule</span>
                              {Math.floor((hOrder.timerAccumulatedSeconds || 0) / 60)}m
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <p className="text-[10px] font-black text-slate-700">{hOrder.timestamp.split(', ')[0]}</p>
                            <p className="text-[9px] font-bold text-slate-400">{hOrder.timestamp.split(', ')[1]}</p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="hidden print:block mt-12 text-center border-t border-border pt-8">
                <p className="text-[10px] font-black text-secondary uppercase tracking-[0.2em]">Documento Oficial de Auditoria Interna - KwikFood</p>
                <p className="text-[8px] text-text-muted mt-1">Este relat├│rio cont├⌐m informa├º├╡es confidenciais e propriet├írias de {company.name}.</p>
              </div>
            </div>
          )}
        </div>
      </main>

      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-8 bg-secondary/90 backdrop-blur-3xl animate-in fade-in duration-500">
          <div className="bg-white rounded-[3.5rem] sm:rounded-[4.5rem] w-full max-w-2xl shadow-premium animate-in zoom-in-95 duration-300 relative overflow-hidden flex flex-col max-h-[95vh]">
            <div className="absolute top-0 left-0 w-full h-4 bg-primary"></div>

            <header className="p-10 sm:p-14 border-b border-border/10 flex justify-between items-start">
              <div>
                <h3 className="text-2xl sm:text-3xl font-bold tracking-tight text-secondary">
                  {modalMode === 'add' ? 'Adicionar Produto' : 'Editar Produto'}
                </h3>
                <p className="text-text-muted font-bold text-[9px] uppercase tracking-[0.2em] mt-1 opacity-50">Configura├º├úo de Item</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="size-14 bg-background rounded-2xl flex items-center justify-center text-text-muted hover:bg-primary/10 hover:text-primary transition-all active:scale-90"
              >
                <span className="material-symbols-outlined text-3xl font-black">close</span>
              </button>
            </header>

            <form onSubmit={handleSaveProduct} className="flex-1 overflow-y-auto p-10 sm:p-14 space-y-12 custom-scrollbar">
              {/* Basic Info */}
              <div className="space-y-4">
                <label className="text-[11px] font-black text-secondary uppercase tracking-[0.4em] ml-2 opacity-50">Dados Principais</label>
                <div className="space-y-6">
                  <div className="relative group">
                    <span className="material-symbols-outlined absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-primary transition-colors">label</span>
                    <input
                      type="text"
                      value={pName}
                      onChange={e => setPName(e.target.value)}
                      placeholder="Nome do Produto (Ex: Master Burger)"
                      className="w-full h-20 bg-[#F8F9FA] border-2 border-transparent rounded-[1.8rem] pl-16 pr-8 font-black text-xl text-secondary focus:border-primary focus:bg-white transition-all outline-none shadow-sm"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="relative group">
                      <span className="material-symbols-outlined absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-primary transition-colors">payments</span>
                      <input
                        type="number"
                        value={pPrice}
                        onChange={e => setPPrice(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="Pre├ºo (Kz)"
                        className="w-full h-20 bg-[#F8F9FA] border-2 border-transparent rounded-[1.8rem] pl-16 pr-8 font-black text-xl text-secondary focus:border-primary focus:bg-white transition-all outline-none shadow-sm"
                        required
                      />
                    </div>
                    <div className="relative group">
                      <span className="material-symbols-outlined absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none">category</span>
                      <select
                        value={pCategory}
                        onChange={e => setPCategory(e.target.value)}
                        className="w-full h-20 bg-[#F8F9FA] border-2 border-transparent rounded-[1.8rem] pl-16 pr-12 font-black text-[11px] uppercase tracking-widest text-secondary focus:border-primary focus:bg-white transition-all outline-none appearance-none cursor-pointer"
                      >
                        {categories.filter(c => c !== 'Todos').map(c => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                      <span className="material-symbols-outlined absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_more</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Toggle */}
              <div className="space-y-4">
                <label className="text-[11px] font-black text-secondary uppercase tracking-[0.4em] ml-2 opacity-50">Disponibilidade</label>
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-2 rounded-[2rem] border border-slate-100">
                  <button
                    type="button"
                    onClick={() => setPStatus(ProductStatus.ACTIVE)}
                    className={`h-16 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 transition-all ${pStatus === ProductStatus.ACTIVE ? 'bg-green-500 text-white shadow-lg' : 'text-slate-400 hover:text-secondary'}`}
                  >
                    <span className="material-symbols-outlined text-xl">check_circle</span>
                    Dispon├¡vel
                  </button>
                  <button
                    type="button"
                    onClick={() => setPStatus(ProductStatus.OUT_OF_STOCK)}
                    className={`h-16 rounded-[1.5rem] font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3 transition-all ${pStatus === ProductStatus.OUT_OF_STOCK ? 'bg-red-500 text-white shadow-lg' : 'text-slate-400 hover:text-secondary'}`}
                  >
                    <span className="material-symbols-outlined text-xl">block</span>
                    Esgotado
                  </button>
                </div>
              </div>

              {/* Detailed Info */}
              <div className="space-y-4">
                <label className="text-[11px] font-black text-secondary uppercase tracking-[0.4em] ml-2 opacity-50">Descri├º├úo Detalhada</label>
                <div className="relative group">
                  <span className="material-symbols-outlined absolute left-6 top-8 text-slate-300 group-focus-within:text-primary transition-colors">notes</span>
                  <textarea
                    value={pDetails}
                    onChange={e => setPDetails(e.target.value)}
                    placeholder="Descreva os ingredientes, avisos ou detalhes do prato..."
                    className="w-full h-40 bg-[#F8F9FA] border-2 border-transparent rounded-[1.8rem] pl-16 pr-8 py-7 font-medium text-lg text-secondary focus:border-primary focus:bg-white transition-all outline-none resize-none shadow-sm"
                  />
                </div>
              </div>

              {/* Image Upload */}
              <div className="space-y-4">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] ml-1">Fotografia</label>
                <div className="flex flex-col sm:flex-row gap-6 items-center bg-slate-50/50 p-6 rounded-[2.5rem] border border-slate-100 group hover:border-primary/20 transition-all">
                  <div className="relative size-32 bg-white rounded-3xl shadow-sm flex items-center justify-center overflow-hidden flex-shrink-0 border border-slate-100">
                    {pImageUrl ? (
                      <img src={pImageUrl} alt="Preview" className="size-full object-cover" />
                    ) : (
                      <span className="material-symbols-outlined text-slate-200 text-6xl">image</span>
                    )}
                    {uploading && (
                      <div className="absolute inset-0 bg-secondary/80 flex items-center justify-center">
                        <div className="size-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col items-center sm:items-start text-center sm:text-left">
                    <input type="file" accept="image/*" onChange={handleUpload} className="hidden" id="p-image-upload" />
                    <label
                      htmlFor="p-image-upload"
                      className="inline-flex px-10 py-5 bg-secondary text-white text-[11px] font-black uppercase tracking-[0.3em] rounded-2xl cursor-pointer hover:bg-primary transition-all shadow-lg active:scale-95"
                    >
                      Alterar Foto
                    </label>
                    <p className="text-[10px] text-slate-400 mt-4 font-bold uppercase tracking-widest leading-relaxed">Formatos: JPG, PNG ΓÇó M├íx 5MB</p>
                  </div>
                </div>
              </div>
            </form>

            <footer className="p-10 sm:p-14 bg-[#F8F9FA] border-t border-border/10 flex flex-col sm:flex-row gap-6">
              {modalMode === 'edit' && selectedProduct && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Excluir ${selectedProduct.name}?`)) {
                      handleDeleteProduct(selectedProduct.id);
                      setIsModalOpen(false);
                    }
                  }}
                  className="h-16 px-8 rounded-2xl bg-red-50 text-red-500 font-bold uppercase tracking-widest text-[10px] hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-3 border border-red-100/50"
                >
                  <span className="material-symbols-outlined text-xl">delete</span>
                  APAGAR
                </button>
              )}

              <div className="flex-1 flex gap-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 h-16 font-bold uppercase tracking-widest text-slate-400 hover:text-secondary transition-all text-[10px]"
                >
                  CANCELAR
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    const form = document.querySelector('form');
                    if (form) form.requestSubmit();
                  }}
                  disabled={saving || uploading}
                  className="flex-[2] h-16 bg-primary hover:bg-secondary text-white rounded-2xl font-bold uppercase tracking-[0.2em] text-[11px] shadow-lg shadow-primary/10 active:scale-[0.98] transition-all disabled:opacity-50 relative overflow-hidden group/btn"
                >
                  <span className="flex items-center justify-center gap-3">
                    <span className="material-symbols-outlined text-xl">{saving ? 'autorenew' : 'done'}</span>
                    {saving ? 'GUARDANDO...' : 'SALVAR'}
                  </span>
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}

      {
        showQRModal && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-8 bg-secondary/80 backdrop-blur-3xl animate-in fade-in duration-500">
            <div className="w-full max-w-xl bg-surface rounded-[4.5rem] p-16 shadow-premium relative overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="absolute top-0 left-0 w-full h-4 bg-primary"></div>

              <div className="text-center mb-12">
                <div className="size-24 bg-primary-soft text-primary rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-premium">
                  <span className="material-symbols-outlined text-5xl">qr_code_2</span>
                </div>
                <h3 className="text-4xl font-black tracking-tighter text-secondary leading-none">{company.name}</h3>
                <p className="text-text-muted text-lg font-medium mt-4 leading-relaxed">
                  C├│digo do Local: <span className="text-primary font-black">{company.id.toString().padStart(4, '0')}</span>
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
                    IMPRIMIR PARA BALC├âO
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
        )
      }

      {
        showMarketingAuthModal && (
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
        )
      }
    </div >
  );
};

export default CompanyAdminView;

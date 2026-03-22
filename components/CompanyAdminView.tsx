
import React, { useState, useEffect } from 'react';
import { Company, Product, ProductStatus, Order, OrderStatus, OrderType, Category, AccompanimentGroup, AccompanimentItem } from '../types';
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
  const [pCategory, setPCategory] = useState('Hambúrgueres');
  const [pStatus, setPStatus] = useState<ProductStatus>(ProductStatus.ACTIVE);
  const [pImageUrl, setPImageUrl] = useState('');
  const [pDetails, setPDetails] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [accompanimentGroups, setAccompanimentGroups] = useState<AccompanimentGroup[]>([]);
  const [saving, setSaving] = useState(false);

  // History filters
  const [hStartDate, setHStartDate] = useState('');
  const [hEndDate, setHEndDate] = useState('');
  const [hStatusFilter, setHStatusFilter] = useState('Todos');
  const [hContactFilter, setHContactFilter] = useState('');
  const [hLimit, setHLimit] = useState(25);
  const [hPage, setHPage] = useState(1);

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
    if (company.isActive === false) {
      alert('Esta conta foi desativada. Por favor, contacte a empresa NexusBus LDA.');
      onLogout();
    }
  }, [company.isActive, onLogout]);

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

      const { data: catData } = await supabase.from('categories').select('*').eq('company_id', company.id).order('sort_order', { ascending: true });
      if (catData) setCategories(catData.map(c => ({ ...c, companyId: c.company_id, sortOrder: c.sort_order })));

      const { data: groupsData } = await supabase
        .from('accompaniment_groups')
        .select('*, accompaniment_items(*)')
        .eq('company_id', company.id);
      
      if (groupsData) setAccompanimentGroups(groupsData.map(g => ({
        ...g,
        companyId: g.company_id,
        isRequired: g.is_required,
        minSelection: g.min_selection,
        maxSelection: g.max_selection,
        items: g.accompaniment_items.map((i: any) => ({
          ...i,
          groupId: i.group_id,
          isActive: i.is_active
        }))
      })));

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

    const cChannel = supabase
      .channel(`categories-${company.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: `company_id=eq.${company.id}` }, () => loadData())
      .subscribe();

    const agChannel = supabase
      .channel(`acc-groups-${company.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accompaniment_groups', filter: `company_id=eq.${company.id}` }, () => loadData())
      .subscribe();

    const aiChannel = supabase
      .channel(`acc-items-${company.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accompaniment_items' }, () => loadData())
      .subscribe();

    const pagChannel = supabase
      .channel(`prod-acc-${company.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_to_accompaniment_groups' }, () => loadData())
      .subscribe();

    return () => {
      supabase.removeChannel(pChannel);
      supabase.removeChannel(oChannel);
      supabase.removeChannel(sChannel);
      supabase.removeChannel(cChannel);
      supabase.removeChannel(agChannel);
      supabase.removeChannel(aiChannel);
      supabase.removeChannel(pagChannel);
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
              message = `${name}: O seu pedido ${ticket} está a ser preparado!`;
              break;
            case OrderStatus.READY:
              message = `${name}: O seu pedido ${ticket} está a caminho, Aguarde!`;
              break;
            case OrderStatus.DELIVERED:
              message = `${name}: O seu pedido ${ticket} foi entregue. Bom apetite!`;
              break;
            case OrderStatus.CANCELLED:
              message = `${name}: Lamentamos imenso, mas o seu pedido ${ticket} teve de ser cancelado. Por favor, contacte o estabelecimento. 😔`;
              break;
          }
        } else {
          // Vou comer aqui e Vou levar
          switch (status) {
            case OrderStatus.PREPARING:
              message = `${name}: O seu pedido ${ticket} está a ser preparado!`;
              break;
            case OrderStatus.READY:
              message = `${name}: O seu pedido ${ticket} está pronto! Pode vir levantar.`;
              break;
            case OrderStatus.DELIVERED:
              message = `${name}: O seu pedido ${ticket} foi entregue. Bom apetite!`;
              break;
            case OrderStatus.CANCELLED:
              message = `${name}: Lamentamos imenso, mas o seu pedido ${ticket} teve de ser cancelado. Por favor, contacte o estabelecimento. 😔`;
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
    setSaving(true);
    try {
      const selectedCat = categories.find(c => c.name === pCategory);
      // Ensure numeric price
      const priceVal = typeof pPrice === 'string' ? parseFloat(pPrice.replace(',', '.')) : pPrice;
      
      const productData = {
        company_id: company.id,
        name: pName,
        price: priceVal,
        category: pCategory,
        category_id: selectedCat?.id,
        status: pStatus,
        imageUrl: pImageUrl,
        details: pDetails
      };

      if (modalMode === 'edit' && selectedProduct) {
        await supabase.from('products').update(productData).eq('id', selectedProduct.id);
      } else {
        await supabase.from('products').insert([productData]);
      }
      setIsModalOpen(false);
      loadData();
    } catch (error) {
      console.error('Error saving product:', error);
      alert('Erro ao guardar produto.');
    } finally {
      setSaving(false);
    }
  };

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('🍔');

  const handleSaveCategory = async () => {
    if (!newCatName) return;
    setSaving(true);
    try {
      await supabase.from('categories').insert([{
        company_id: company.id,
        name: newCatName,
        icon: newCatIcon,
        sort_order: categories.length
      }]);
      setIsCategoryModalOpen(false);
      setNewCatName('');
      loadData();
    } catch (error) {
      console.error('Error saving category:', error);
      alert('Erro ao guardar categoria.'); // Added alert for user feedback
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
      setPName(''); setPPrice(''); setPCategory('Hambúrgueres'); setPStatus(ProductStatus.ACTIVE); setPImageUrl(''); setPDetails('');
    }
    setIsModalOpen(true);
  };

  const categoryOptions = ['Todos', ...categories.map(c => c.name)];
  const filteredProducts = productFilter === 'Todos' ? products : products.filter(p => p.category === productFilter);

  const filteredOrders = orders.filter(o => {
    if (ticketSearch === '') return true;
    const search = ticketSearch.toLowerCase();
    const matchesTicket = o.ticketCode.toLowerCase().includes(search);
    const matchesPhone = o.customerPhone.toLowerCase().includes(search);
    const matchesStatus = o.status.toLowerCase().includes(search);
    const matchesItems = o.items?.some(item =>
      item.name.toLowerCase().includes(search) ||
      (item.observation && item.observation.toLowerCase().includes(search))
    ) || false;
    return matchesTicket || matchesPhone || matchesStatus || matchesItems;
  });

  const allFilteredHistory = historyOrders.filter(o => {
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

  const filteredHistory = allFilteredHistory.slice((hPage - 1) * hLimit, hPage * hLimit);

  const totalRevenue = allFilteredHistory.reduce((acc, o) => acc + (o.status === OrderStatus.DELIVERED ? (o.total || 0) : 0), 0);

  const handleExportCSV = () => {
    const headers = ['Data', 'Ticket', 'Status', 'Itens', 'Total (Kz)', 'Telefone', 'Pagamento'];
    const rows = allFilteredHistory.map(o => [
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
      <aside className={`fixed inset-y-0 left-0 w-80 bg-white shadow-2xl border-r border-border/30 p-8 flex flex-col gap-10 z-[200] transition-all duration-500 ease-in-out overflow-y-auto custom-scrollbar ${showSidebar ? 'translate-x-0' : '-translate-x-full'}`}>
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
            onClick={() => { setActiveTab('FILA'); setShowSidebar(false); }}
            title="Ver fila de pedidos em tempo real"
            className={`flex items-center gap-5 px-8 py-5 rounded-[1.5rem] transition-all font-black text-[12px] uppercase tracking-widest relative overflow-hidden group ${activeTab === 'FILA' ? 'bg-secondary text-white shadow-premium' : 'text-text-muted hover:bg-white/40 hover:text-secondary'}`}
          >
            <span className="material-symbols-outlined text-2xl">view_list</span>
            Monitor de Fila
            {activeTab === 'FILA' && <div className="absolute right-6 size-2 bg-primary rounded-full animate-pulse"></div>}
          </button>
          <button
            onClick={() => { setActiveTab('PRODUTOS'); setShowSidebar(false); }}
            title="Gerir menu de produtos e categorias"
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
                  setShowSidebar(false);
                } else {
                  setShowMarketingAuthModal(true);
                  setMarketingAuthError(false);
                  setMarketingPasswordPrompt('');
                }
              }}
              title="Campanhas de marketing e SMS"
              className={`flex items-center gap-5 px-8 py-5 rounded-[1.5rem] transition-all font-black text-[12px] uppercase tracking-widest relative overflow-hidden group ${activeTab === 'MARKETING' ? 'bg-secondary text-white shadow-premium' : 'text-text-muted hover:bg-white/40 hover:text-secondary'}`}
            >
              <span className="material-symbols-outlined text-2xl">campaign</span>
              Marketing
              {activeTab === 'MARKETING' && <div className="absolute right-6 size-2 bg-primary rounded-full animate-pulse"></div>}
            </button>
          )}

          <button
            onClick={() => { setActiveTab('RELATORIOS'); setShowSidebar(false); }}
            title="Relatórios de vendas e auditoria"
            className={`flex items-center gap-5 px-8 py-5 rounded-[1.5rem] transition-all font-black text-[12px] uppercase tracking-widest relative overflow-hidden group ${activeTab === 'RELATORIOS' ? 'bg-secondary text-white shadow-premium' : 'text-text-muted hover:bg-white/40 hover:text-secondary'}`}
          >
            <span className="material-symbols-outlined text-2xl">analytics</span>
            Auditoria & Relatórios
            {activeTab === 'RELATORIOS' && <div className="absolute right-6 size-2 bg-primary rounded-full animate-pulse"></div>}
          </button>

          <div className="mt-8">
            <button
              onClick={() => setShowQRModal(true)}
              title="Exibir e imprimir QR Code do local"
              className="w-full flex items-center gap-5 px-8 py-5 rounded-[1.5rem] bg-primary/10 text-primary border border-primary/20 transition-all font-black text-[12px] uppercase tracking-widest hover:bg-primary hover:text-white no-print"
            >
              <span className="material-symbols-outlined text-2xl">qr_code_2</span>
              Meu QR Code
            </button>
          </div>

          <div className="mt-8 pt-8 border-t border-border/50">
            <button
              onClick={onLogout}
              title="Sair do painel administrativo"
              className="w-full flex items-center justify-between px-8 py-5 rounded-[1.5rem] bg-primary/5 text-primary font-black text-[12px] uppercase tracking-widest hover:bg-primary hover:text-white transition-all group shadow-sm"
            >
              <span className="flex items-center gap-5">
                <span className="material-symbols-outlined text-2xl group-hover:rotate-12 transition-transform">logout</span>
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
            {!showSidebar && (
              <button
                onClick={() => setShowSidebar(true)}
                className="group flex items-center justify-center size-14 rounded-2xl bg-white border border-border/20 shadow-sm hover:bg-slate-50 transition-all active:scale-95"
              >
                <span className="material-symbols-outlined text-3xl font-black text-secondary">menu</span>
              </button>
            )}
            <div>
              <h2 className={`font-black tracking-tight text-primary italic ${isKitchenMonitor ? 'text-2xl' : 'text-2xl lg:text-3xl'}`}>
                {activeTab === 'FILA' ? 'A cozinha' :
                  activeTab === 'PRODUTOS' ? 'Menu Digital' :
                    activeTab === 'MARKETING' ? 'Marketing & Fidelização' :
                      activeTab === 'RELATORIOS' ? 'Auditoria & Relatórios' : 'Painel Administrativo'}
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap justify-center items-center gap-4">
            {activeTab === 'FILA' && (
              <div className="flex flex-col lg:flex-row items-center gap-8 w-full lg:w-auto">
                {/* Indicadores Lado a Lado */}
                <div className="flex items-center gap-3">
                  <div className="bg-white px-5 py-3 rounded-[1.5rem] border border-[#F5F5F5] shadow-[0_5px_25px_-5px_rgba(0,0,0,0.04)] flex flex-col items-start min-w-[130px] group hover:border-primary/20 transition-all">
                    <p className="text-[9px] font-black text-[#BBBBBB] uppercase tracking-widest mb-1 flex items-center gap-2">
                      Pedidos Atuais
                    </p>
                    <div className="flex items-baseline gap-1.5">
                      <p className="text-2xl font-black text-[#111111]">{orders.length}</p>
                      <span className={`text-[9px] font-black flex items-center gap-0.5 ${orders.length > 5 ? 'text-red-500' : 'text-green-500'}`}>
                        <span className="material-symbols-outlined text-[12px]">{orders.length > 5 ? 'trending_up' : 'trending_down'}</span>
                        {orders.length > 0 ? `${Math.round((orders.length / products.length) * 100)}%` : '0%'}
                      </span>
                    </div>
                  </div>
                  <div className="bg-white px-5 py-3 rounded-[1.5rem] border border-[#F5F5F5] shadow-[0_5px_25px_-5px_rgba(0,0,0,0.04)] flex flex-col items-start min-w-[130px] group hover:border-primary/20 transition-all">
                    <p className="text-[9px] font-black text-[#BBBBBB] uppercase tracking-widest mb-1">Tempo Médio (Hoje)</p>
                    <div className="flex items-baseline gap-1">
                      <p className="text-2xl font-black text-[#111111]">
                        {(() => {
                          const today = new Date().toISOString().split('T')[0];
                          const todayOrders = historyOrders.filter(o => o.timestamp.includes(today));
                          if (todayOrders.length === 0) return 0;
                          const avg = todayOrders.reduce((acc, o) => acc + (o.timerAccumulatedSeconds || 0), 0) / todayOrders.length / 60;
                          return Math.round(avg);
                        })()}
                      </p>
                      <p className="text-[9px] font-black text-[#BBBBBB] uppercase">min</p>
                      {(() => {
                        const today = new Date().toISOString().split('T')[0];
                        const todayOrders = historyOrders.filter(o => o.timestamp.includes(today));
                        const prevOrders = historyOrders.filter(o => !o.timestamp.includes(today));

                        if (todayOrders.length === 0 || prevOrders.length === 0) return null;

                        const todayAvg = todayOrders.reduce((acc, o) => acc + (o.timerAccumulatedSeconds || 0), 0) / todayOrders.length;
                        const prevAvg = prevOrders.reduce((acc, o) => acc + (o.timerAccumulatedSeconds || 0), 0) / prevOrders.length;
                        const diff = ((todayAvg - prevAvg) / prevAvg) * 100;

                        return (
                          <span className={`text-[9px] font-black flex items-center gap-0.5 ml-1.5 ${diff > 0 ? 'text-red-500' : 'text-green-500'}`}>
                            <span className="material-symbols-outlined text-[12px]">{diff > 0 ? 'trending_up' : 'trending_down'}</span>
                            {Math.abs(Math.round(diff))}%
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Busca Posicionada no Canto Superior Direito */}
                <div className="relative group lg:ml-auto">
                  <input
                    type="text"
                    placeholder="Buscar ticket ou telefone..."
                    value={ticketSearch}
                    onChange={(e) => setTicketSearch(e.target.value.toUpperCase())}
                    className="w-64 h-12 bg-white border border-[#F5F5F5] rounded-[1.5rem] px-12 font-bold text-sm text-[#111111] shadow-[0_5px_25px_-5px_rgba(0,0,0,0.04)] focus:border-primary transition-all outline-none placeholder:text-[#BBBBBB]/60"
                  />
                  <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-[#BBBBBB] text-xl">search</span>
                </div>
              </div>
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
                    <div key={order.id} className="bg-white rounded-none p-6 lg:p-8 border border-[#EEEEEE] shadow-sm group relative overflow-hidden animate-scale-in flex flex-col justify-between min-h-[400px]">
                      <div className="absolute top-0 left-0 w-1.5 h-full transition-all"
                        style={{ backgroundColor: order.status === OrderStatus.PREPARING ? '#FACC15' : order.status === OrderStatus.READY ? '#22C55E' : '#E11D48' }}>
                      </div>

                      <div>
                        <div className="flex justify-between items-start mb-6">
                          <div>
                            <h3 className="text-2xl font-black text-[#E11D48] tracking-tight mb-1">#{order.ticketCode}</h3>
                            <div className="flex flex-col">
                              {order.customerName && <p className="text-xs font-black text-[#111111] uppercase tracking-wider">{order.customerName}</p>}
                              <p className="text-sm font-bold text-[#BBBBBB]">{order.customerPhone}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-black text-[#111111]">{(order.total || 0).toLocaleString()} Kz</p>
                            <div className="flex items-center justify-end gap-1.5 mt-1 text-[#BBBBBB]">
                              <span className="material-symbols-outlined text-[18px]">schedule</span>
                              <span className={`text-[10px] font-black uppercase tracking-widest leading-none ${order.status === OrderStatus.PREPARING ? 'text-primary animate-pulse' : ''}`}>
                                {formatTime(calculateElapsed(order))}
                              </span>
                            </div>
                          </div>
                        </div>

                        {order.status === OrderStatus.READY && (
                          <span className="px-3 py-1 bg-green-50 text-green-600 rounded-none text-[10px] font-black uppercase tracking-widest">
                            {order.orderType === OrderType.DELIVERY ? 'A CAMINHO' : 'PRONTO'}
                          </span>
                        )}
                        <div className="flex flex-wrap gap-2 mt-2">
                          <span className={`px-3 py-1 rounded-none text-[10px] font-black uppercase tracking-widest ${order.paymentMethod === 'TRANSFER' ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-600'}`}>
                            {order.paymentMethod || 'PAGAMENTO: N/A'}
                          </span>
                          <span className={`px-3 py-1 rounded-none text-[10px] font-black uppercase tracking-widest bg-primary/5 text-primary border border-primary/10 flex items-center gap-1.5`}>
                            <span className="material-symbols-outlined text-[14px]">
                              {order.orderType === OrderType.EAT_IN ? 'restaurant' : order.orderType === OrderType.TAKE_AWAY ? 'local_mall' : 'delivery_dining'}
                            </span>
                            {order.orderType === OrderType.EAT_IN ? 'COMER AQUI' : order.orderType === OrderType.TAKE_AWAY ? 'LEVANTAMENTO' : 'ENTREGA'}
                          </span>
                        </div>

                        {order.orderType === OrderType.DELIVERY && (order.deliveryAddress || order.deliveryCoords) && (
                          <div className="mt-4 p-4 bg-primary/5 rounded-2xl border border-primary/10">
                            <div className="flex items-center gap-2 mb-2 text-primary">
                              <span className="material-symbols-outlined text-base">location_on</span>
                              <span className="text-[10px] font-black uppercase tracking-widest">Endereço de Entrega</span>
                            </div>
                            {order.deliveryAddress && (
                              <p className="text-xs font-bold text-[#111111] mb-3 leading-relaxed">
                                {order.deliveryAddress}
                              </p>
                            )}
                            {order.deliveryCoords && (
                              <a
                                href={`https://www.google.com/maps?q=${order.deliveryCoords.lat},${order.deliveryCoords.lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2 bg-white text-primary rounded-xl text-[10px] font-black uppercase tracking-widest border border-primary/20 hover:bg-primary/5 transition-all shadow-sm"
                              >
                                <span className="material-symbols-outlined text-base">map</span>
                                VER NO MAPA
                              </a>
                            )}
                          </div>
                        )}
                      </div>

                      {order.paymentMethod === 'TRANSFER' && order.paymentProofUrl && (
                        <div className="mb-6">
                          <a
                            href={order.paymentProofUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full flex items-center justify-center gap-2 h-12 bg-blue-50 text-blue-600 rounded-none font-black text-[10px] uppercase tracking-widest border border-blue-100 hover:bg-blue-100 transition-all"
                          >
                            <span className="material-symbols-outlined text-lg">picture_as_pdf</span>
                            VER COMPROVATIVO
                          </a>
                        </div>
                      )}

                      <div className="space-y-4 mb-8">
                        {(order.items || []).map((item, i) => (
                          <div key={i} className="flex justify-between items-start group/item">
                            <div className="flex gap-3">
                              <span className="text-base font-black text-[#111111] leading-tight">{item.quantity}x</span>
                              <span className="text-base font-bold text-[#111111] leading-tight">{item.name}</span>
                            </div>
                            {item.observation && (
                              <span className="text-[12px] font-medium text-[#BBBBBB] italic shrink-0 ml-4">{item.observation}</span>
                            )}
                          </div>
                        ))}
                        {(!order.items || order.items.length === 0) && (
                          <p className="text-[10px] font-black text-[#BBBBBB] uppercase tracking-widest italic">
                            Aguardando seleção de itens...
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        {order.status === OrderStatus.READY ? (
                          <button
                            onClick={() => updateOrderStatus(order.id, OrderStatus.DELIVERED)}
                            className="w-full flex items-center justify-center gap-3 h-14 bg-[#22C55E] text-white rounded-none font-black text-[13px] uppercase tracking-[0.1em] leading-none shadow-md hover:bg-[#1DA850] transition-all active:scale-[0.98]"
                          >
                            <span className="material-symbols-outlined text-2xl">check_circle</span>
                            ENTREGAR AGORA
                          </button>
                        ) : (
                          <>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => updateOrderStatus(order.id, OrderStatus.PREPARING)}
                                disabled={order.status === OrderStatus.PREPARING}
                                className={`flex items-center justify-center gap-2 h-14 rounded-none font-black text-[11px] uppercase tracking-[0.1em] leading-none transition-all ${order.status === OrderStatus.PREPARING ? 'bg-amber-50 text-amber-600 border border-amber-200 cursor-default' : 'bg-[#E11D48] text-white hover:bg-[#BE123C] active:scale-[0.98]'}`}
                              >
                                <span className="material-symbols-outlined text-xl">{order.status === OrderStatus.PREPARING ? 'cooking' : 'outdoor_grill'}</span>
                                {order.status === OrderStatus.PREPARING ? 'PREPARANDO' : 'PREPARAR'}
                              </button>
                              <button
                                onClick={() => updateOrderStatus(order.id, OrderStatus.READY)}
                                className="flex items-center justify-center gap-2 h-14 bg-white border border-[#EEEEEE] text-[#111111] rounded-none font-black text-[11px] uppercase tracking-[0.1em] leading-none hover:bg-slate-50 transition-all active:scale-[0.98]"
                              >
                                <span className="material-symbols-outlined text-xl">notifications</span>
                                NOTIFICAR
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => updateOrderStatus(order.id, OrderStatus.DELIVERED)}
                                className="flex items-center justify-center gap-2 h-14 bg-white border border-[#EEEEEE] text-[#111111] rounded-none font-black text-[11px] uppercase tracking-[0.1em] leading-none hover:bg-slate-50 transition-all active:scale-[0.98]"
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
                                className="flex items-center justify-center gap-2 h-14 bg-slate-50 text-[#999999] hover:text-red-600 rounded-none font-black text-[11px] uppercase tracking-[0.1em] leading-none transition-all active:scale-[0.98]"
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
              <div className="max-w-7xl mx-auto space-y-8 animate-fade-in pb-20">
                {/* Quick Stats Bento Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="col-span-1 md:col-span-2 bg-primary text-white p-6 rounded-xl shadow-lg shadow-rose-200 flex flex-col justify-between relative overflow-hidden">
                    <div className="relative z-10">
                      <p className="text-rose-100 text-sm font-medium">Categorias Ativas</p>
                      <h3 className="text-4xl font-black mt-1">{categories.length}</h3>
                    </div>
                    <div className="mt-4 relative z-10">
                      <button onClick={() => setIsCategoryModalOpen(true)} className="bg-white/20 hover:bg-white/30 transition-colors px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">add_circle</span>
                        Nova Categoria
                      </button>
                    </div>
                    <span className="material-symbols-outlined absolute -right-4 -bottom-4 text-9xl opacity-10">category</span>
                  </div>
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-zinc-100 flex flex-col justify-between">
                    <div>
                      <p className="text-zinc-500 text-sm font-medium">Total de Produtos</p>
                      <h3 className="text-3xl font-bold mt-1 text-zinc-900">{products.length}</h3>
                    </div>
                    <div className="text-emerald-600 text-sm font-bold flex items-center gap-1 mt-2">
                      <span className="material-symbols-outlined text-xs">trending_up</span> +{products.filter(p => new Date(p.id).getTime() > Date.now() - 30*24*60*60*1000).length} este mês
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-zinc-100 flex flex-col justify-between">
                    <div>
                      <p className="text-zinc-500 text-sm font-medium">Grupos de Acompanhamentos</p>
                      <h3 className="text-3xl font-bold mt-1 text-zinc-900">{accompanimentGroups.length}</h3>
                    </div>
                    <div className="text-zinc-400 text-sm font-medium mt-2">Vinculados a {products.filter(p => p.accompanimentGroups?.length).length} itens</div>
                  </div>
                </div>

                {/* Categories Pill Navigation */}
                <section className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xl font-extrabold tracking-tight">Categorias</h3>
                    <button className="text-primary font-bold text-sm hover:underline">Ver todas</button>
                  </div>
                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                    {categoryOptions.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setProductFilter(cat)}
                        className={`px-6 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all ${productFilter === cat ? 'bg-secondary text-white shadow-md' : 'bg-white text-zinc-600 border border-zinc-200 hover:border-primary hover:text-primary'}`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </section>

                {/* Products Grid Control */}
                <section className="space-y-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="relative flex-1 max-w-md">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">search</span>
                      <input 
                        className="w-full pl-10 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none" 
                        placeholder="Buscar produto..." 
                        type="text"
                        onChange={(e) => setTicketSearch(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => {/* TODO: Vincular */}} className="flex-1 md:flex-none px-5 py-2.5 border-2 border-primary text-primary rounded-xl font-bold hover:bg-rose-50 transition-all flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-xl">link</span>
                        Vincular Acompanhamento
                      </button>
                      <button onClick={() => openModal('add')} className="flex-1 md:flex-none px-5 py-2.5 bg-primary text-white rounded-xl font-bold hover:shadow-lg hover:shadow-rose-200 transition-all flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-xl">add</span>
                        Adicionar Produto
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {filteredProducts.filter(p => p.name.toLowerCase().includes(ticketSearch.toLowerCase())).map(p => (
                      <div key={p.id} className="group bg-white p-4 rounded-2xl border border-zinc-100 hover:border-rose-100 hover:shadow-xl hover:shadow-zinc-200/50 transition-all flex flex-col sm:flex-row gap-4">
                        <div className="w-full sm:w-32 h-32 rounded-xl overflow-hidden bg-zinc-100 flex-shrink-0 relative">
                          <img className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" src={p.imageUrl} alt={p.name} />
                          <div className="absolute top-2 left-2 bg-white/90 backdrop-blur px-2 py-0.5 rounded text-[10px] font-bold text-zinc-800 uppercase">{p.category}</div>
                        </div>
                        <div className="flex-1 flex flex-col justify-between">
                          <div>
                            <div className="flex justify-between items-start">
                              <h4 className="text-lg font-bold text-zinc-900 group-hover:text-primary transition-colors">{p.name}</h4>
                              <div className="flex gap-1">
                                <button onClick={() => openModal('edit', p)} className="p-1.5 hover:bg-zinc-100 rounded-lg transition-colors">
                                  <span className="material-symbols-outlined text-zinc-400 text-lg">edit</span>
                                </button>
                                <button onClick={() => handleDeleteProduct(p.id)} className="p-1.5 hover:bg-zinc-100 rounded-lg transition-colors">
                                  <span className="material-symbols-outlined text-zinc-400 text-lg">delete</span>
                                </button>
                              </div>
                            </div>
                            <p className="text-zinc-500 text-xs mt-1 line-clamp-2">{p.details}</p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {p.accompanimentGroups?.length ? (
                                <span className="px-2 py-1 bg-zinc-100 rounded-md text-[10px] font-bold text-zinc-600 flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[12px]">check_circle</span> {p.accompanimentGroups.length} Grupos
                                </span>
                              ) : (
                                <button className="px-2 py-1 bg-primary/10 rounded-md text-[10px] font-bold text-primary flex items-center gap-1 hover:bg-primary/20">
                                  <span className="material-symbols-outlined text-[12px]">add</span> Vincular Extras
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="mt-4 flex items-center justify-between">
                            <span className="text-xl font-black text-secondary">R$ {p.price.toLocaleString()}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-zinc-400 uppercase">Status</span>
                              <div 
                                onClick={async () => {
                                  const newStatus = p.status === ProductStatus.ACTIVE ? ProductStatus.OUT_OF_STOCK : ProductStatus.ACTIVE;
                                  await supabase.from('products').update({ status: newStatus }).eq('id', p.id);
                                  loadData();
                                }}
                                className={`w-10 h-5 rounded-full relative flex items-center px-1 cursor-pointer transition-colors ${p.status === ProductStatus.ACTIVE ? 'bg-emerald-100' : 'bg-zinc-200'}`}
                              >
                                <div className={`w-3 h-3 rounded-full transition-all ${p.status === ProductStatus.ACTIVE ? 'bg-emerald-500 translate-x-5' : 'bg-zinc-400 translate-x-0'}`}></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Manage Accompaniments Section */}
                <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 pt-6">
                  <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xl font-extrabold tracking-tight">Gerenciar Acompanhamentos</h3>
                      <button className="text-primary font-bold text-sm flex items-center gap-1">
                        <span className="material-symbols-outlined text-lg">add_box</span> Novo Grupo
                      </button>
                    </div>
                    <div className="space-y-4">
                      {accompanimentGroups.map(group => (
                        <div key={group.id} className="bg-white rounded-2xl border border-zinc-100 overflow-hidden">
                          <div className="p-4 bg-zinc-50 flex items-center justify-between border-b border-zinc-100">
                            <div className="flex items-center gap-3">
                              <span className="material-symbols-outlined text-zinc-400">reorder</span>
                              <h5 className="font-bold text-sm">{group.name}</h5>
                              {group.isRequired && <span className="text-[10px] bg-white border px-2 py-0.5 rounded text-zinc-500 font-medium">Obrigatório</span>}
                            </div>
                            <button className="text-zinc-400 hover:text-primary"><span className="material-symbols-outlined">settings</span></button>
                          </div>
                          <div className="p-4 space-y-3">
                            {group.items?.map(item => (
                              <div key={item.id} className="flex items-center justify-between p-3 bg-zinc-50/50 rounded-xl">
                                <div className="flex items-center gap-3">
                                  <div className={`w-2 h-2 rounded-full ${item.isActive ? 'bg-primary' : 'bg-zinc-300'}`}></div>
                                  <span className="text-sm font-medium">{item.name}</span>
                                </div>
                                <div className="flex items-center gap-4">
                                  <span className="text-sm font-bold">+ R$ {item.price.toLocaleString()}</span>
                                  <button className="text-zinc-400 hover:text-red-500"><span className="material-symbols-outlined text-lg">delete</span></button>
                                </div>
                              </div>
                            ))}
                            <button className="w-full py-3 border-2 border-dashed border-zinc-200 rounded-xl text-zinc-400 text-sm font-bold hover:border-primary hover:text-primary transition-all">
                              + Adicionar Item neste Grupo
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Quick Link Side Panel */}
                  <div className="lg:col-span-1">
                    <div className="bg-secondary text-white p-6 rounded-3xl sticky top-24 shadow-xl">
                      <h4 className="text-lg font-extrabold mb-2 text-white">Vincular Rápido</h4>
                      <p className="text-zinc-400 text-sm mb-6">Conecte grupos de acompanhamentos a vários produtos de uma só vez.</p>
                      <div className="space-y-6">
                        <div>
                          <label className="text-[10px] font-black uppercase text-zinc-500 mb-2 block">Selecionar Grupo</label>
                          <select className="w-full bg-zinc-800 border-none rounded-xl text-sm py-3 px-4 focus:ring-1 focus:ring-primary text-white">
                            <option>Selecione um grupo...</option>
                            {accompanimentGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-black uppercase text-zinc-500 mb-2 block">Aplicar aos Produtos</label>
                          <div className="bg-zinc-800 rounded-xl p-3 max-h-64 overflow-y-auto space-y-1 custom-scrollbar">
                            {products.map(p => (
                              <label key={p.id} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg cursor-pointer transition-colors">
                                <input className="rounded border-zinc-700 bg-zinc-900 text-primary focus:ring-primary" type="checkbox" />
                                <span className="text-xs font-medium text-zinc-300">{p.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <button className="w-full py-4 bg-primary text-white rounded-2xl font-black text-sm hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-rose-900/20">
                          Confirmar Vinculação
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
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
              <div className="space-y-6 animate-fade-in pb-20">
                {/* Header de Relatório com Exportação */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 sm:p-8 rounded-2xl sm:rounded-[3rem] border border-border/40 shadow-sm no-print">
                  <div>
                    <h3 className="text-xl sm:text-2xl font-black text-secondary tracking-tight">Auditoria & Relatórios</h3>
                    <p className="text-text-muted text-xs font-medium mt-1">Monitorização financeira e histórico de operações.</p>
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
                      <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest">Faturamento Líquido</p>
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

                {/* Filtros Avançados */}
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
                    <h4 className="text-sm font-black text-slate-700 uppercase tracking-tight">Histórico Detalhado de Operações</h4>
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
                          <th className="px-5 py-4">Tipo / Endereço</th>
                          <th className="px-5 py-4 text-right">Valor</th>
                          <th className="px-5 py-4">Preparo</th>
                          <th className="px-6 py-4 text-right">Data/Hora</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {filteredHistory.map((hOrder) => (
                          <tr key={hOrder.id} className="group hover:bg-slate-50 transition-all">
                            <td className="px-6 py-4">
                              <div className="font-black text-lg text-slate-900 group-hover:text-primary transition-all">
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

                  {/* Paginação */}
                  <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-6 no-print">
                    <div className="flex items-center gap-4">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mostrar</p>
                      <select
                        value={hLimit}
                        onChange={(e) => { setHLimit(Number(e.target.value)); setHPage(1); }}
                        className="h-10 px-3 bg-white border border-slate-200 rounded-xl font-black text-xs text-secondary outline-none focus:border-primary transition-all"
                      >
                        {[10, 25, 50, 100].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">registos</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setHPage(prev => Math.max(1, prev - 1))}
                        disabled={hPage === 1}
                        className="size-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-secondary hover:border-primary hover:text-primary transition-all disabled:opacity-30 disabled:pointer-events-none"
                      >
                        <span className="material-symbols-outlined text-xl">chevron_left</span>
                      </button>
                      <div className="h-10 px-6 flex items-center bg-white border border-slate-200 rounded-xl">
                        <span className="text-xs font-black text-secondary">Página {hPage}</span>
                      </div>
                      <button
                        onClick={() => setHPage(prev => prev + 1)}
                        disabled={filteredHistory.length < hLimit}
                        className="size-10 flex items-center justify-center bg-white border border-slate-200 rounded-xl text-secondary hover:border-primary hover:text-primary transition-all disabled:opacity-30 disabled:pointer-events-none"
                      >
                        <span className="material-symbols-outlined text-xl">chevron_right</span>
                      </button>
                    </div>
                  </div>
                </div>
                <div className="hidden print:block mt-12 text-center border-t border-border pt-8">
                  <p className="text-[10px] font-black text-secondary uppercase tracking-[0.2em]">Documento Oficial de Auditoria Interna - KwikFood</p>
                  <p className="text-[8px] text-text-muted mt-1">Este relatório contém informações confidenciais e proprietárias de {company.name}.</p>
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
                <p className="text-text-muted font-bold text-[9px] uppercase tracking-[0.2em] mt-1 opacity-50">Configuração de Item</p>
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
                        placeholder="Preço (Kz)"
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
                        {categoryOptions.filter(c => c !== 'Todos').map(c => (
                          <option key={c} value={c}>{c}</option>
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
                    Disponível
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
                <label className="text-[11px] font-black text-secondary uppercase tracking-[0.4em] ml-2 opacity-50">Descrição Detalhada</label>
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
                    <p className="text-[10px] text-slate-400 mt-4 font-bold uppercase tracking-widest leading-relaxed">Formatos: JPG, PNG • Máx 5MB</p>
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
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-8 bg-secondary/80 backdrop-blur-3xl animate-in fade-in duration-500 no-print">
            <div className="w-full max-w-xl bg-surface rounded-[4.5rem] p-16 shadow-premium relative overflow-hidden animate-in zoom-in-95 duration-300 print:shadow-none print:rounded-none print:p-0 print:border-none">
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
                <div className="bg-white p-8 rounded-[3rem] shadow-premium border-2 border-border/20 relative group print:border-none print:shadow-none" style={{ filter: 'sharp-edges' }}>
                  <div className="relative">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(`https://kwikfood.vercel.app/?code=${company.id.toString().padStart(4, '0')}`)}`}
                      alt="QR Code"
                      className="size-72 print:size-[600px] transition-all"
                    />
                    {company.logoUrl && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="size-12 bg-white p-1 rounded-lg shadow-xl border border-border/10 overflow-hidden print:size-24">
                          <img src={company.logoUrl} alt="Logo" className="w-full h-full object-cover rounded-md" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="w-full space-y-4 no-print">
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
        )
      }

      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-8 bg-secondary/90 backdrop-blur-3xl animate-in fade-in duration-500">
          <div className="w-full max-w-md bg-white rounded-[3.5rem] p-12 shadow-premium relative overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="absolute top-0 left-0 w-full h-3 bg-primary"></div>
            <div className="text-center mb-10">
              <h3 className="text-2xl font-black tracking-tight text-secondary">Nova Categoria</h3>
              <p className="text-zinc-500 text-sm font-medium mt-1">Crie uma nova seção para o seu cardápio.</p>
            </div>
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block tracking-widest">Nome da Categoria</label>
                <input 
                  type="text" 
                  value={newCatName} 
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="Ex: Pizzas, Bebidas..."
                  className="w-full h-16 bg-zinc-50 border-none rounded-2xl px-6 font-bold outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-zinc-400 mb-2 block tracking-widest">Emoji ou Ícone</label>
                <input 
                  type="text" 
                  value={newCatIcon} 
                  onChange={(e) => setNewCatIcon(e.target.value)}
                  placeholder="Ex: 🍕"
                  className="w-full h-16 bg-zinc-50 border-none rounded-2xl px-6 font-bold outline-none focus:ring-2 focus:ring-primary/20 transition-all text-center text-2xl"
                />
              </div>
              <div className="flex flex-col gap-3 pt-4">
                <button 
                  onClick={handleSaveCategory}
                  disabled={saving || !newCatName}
                  className="w-full h-16 bg-primary text-white rounded-2xl font-black text-[12px] uppercase tracking-widest shadow-lg shadow-primary/20 hover:bg-secondary transition-all disabled:opacity-50"
                >
                  {saving ? 'CRIANDO...' : 'CRIAR CATEGORIA'}
                </button>
                <button 
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="w-full py-4 text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em] hover:text-secondary transition-colors"
                >
                  CANCELAR
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

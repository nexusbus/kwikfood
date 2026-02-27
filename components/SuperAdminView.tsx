
import React, { useState, useEffect } from 'react';
import { fetchCompanies, getNextCompanyId, STORE_RADIUS_METERS } from '../constants';
import Logo from './Logo';
import { supabase } from '../src/lib/supabase';
import { Company, OrderStatus } from '../types';
import { sendSMS } from '../src/services/smsService';
import { sendTelegramMessage, checkBotStatus, getBotUpdates } from '../src/services/telegramService';
const PROVINCES = [
  'Bengo', 'Benguela', 'Bié', 'Cabinda', 'Cuando Cubango', 'Cuanza Norte',
  'Cuanza Sul', 'Cunene', 'Huambo', 'Huíla', 'Luanda', 'Lunda Norte',
  'Lunda Sul', 'Malanje', 'Moxico', 'Namibe', 'Uíge', 'Zaire'
];

interface SuperAdminViewProps {
  onBack: () => void;
}

const SuperAdminView: React.FC<SuperAdminViewProps> = ({ onBack }) => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [name, setName] = useState('');
  const [nif, setNif] = useState('');
  const [location, setLocation] = useState('Luanda');
  const [city, setCity] = useState('');
  const [type, setType] = useState('');
  const [id, setId] = useState('');
  const [lat, setLat] = useState<number | ''>('');
  const [lng, setLng] = useState<number | ''>('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [logoLoading, setLogoLoading] = useState(false);
  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [showQRModal, setShowQRModal] = useState<Company | null>(null);
  const [adminConfirmEmail, setAdminConfirmEmail] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [activeView, setActiveView] = useState<'ESTABELECIMENTOS' | 'AUDITORIA' | 'SMS' | 'DIAGNOSTICO'>('ESTABELECIMENTOS');
  const [auditOrders, setAuditOrders] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Telegram Test Console States
  const [testToken, setTestToken] = useState('8656847836:AAH0TkUpHdO_8ECYaSDBG5yGnppBc0hgoVM');
  const [testChatId, setTestChatId] = useState('');
  const [testMessage, setTestMessage] = useState('Olá! Este é um teste de conectividade do KwikFood SuperAdmin. 🚀');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  // New States for Search and Dashboard
  const [searchTerm, setSearchTerm] = useState('');
  const [smsStats, setSmsStats] = useState<Record<string, number>>({});
  const [totalClientCount, setTotalClientCount] = useState(0);
  const [dailySmsCount, setDailySmsCount] = useState(0);
  const [dailyRevenue, setDailyRevenue] = useState(0);

  const loadData = async () => {
    const cData = await fetchCompanies();
    setCompanies(cData);
    const nextId = await getNextCompanyId();
    setId(nextId.toString().padStart(4, '0'));

    // Load SMS Stats
    const { data: smsData } = await supabase.from('sms_logs').select('company_id');
    if (smsData) {
      const stats: Record<string, number> = {};
      smsData.forEach(log => {
        const cid = log.company_id?.toString();
        if (cid) stats[cid] = (stats[cid] || 0) + 1;
      });
      setSmsStats(stats);
    }

    // Load Daily Stats
    const today = new Date().toISOString().split('T')[0];
    const { data: todayOrders } = await supabase.from('orders').select('total, customer_phone').gte('created_at', today);
    if (todayOrders) {
      setTotalClientCount(new Set(todayOrders.map(o => o.customer_phone)).size);
      setDailyRevenue(todayOrders.reduce((acc, o) => acc + (o.total || 0), 0));
    }

    const { count: todaySms } = await supabase.from('sms_logs').select('*', { count: 'exact', head: true }).gte('created_at', today);
    setDailySmsCount(todaySms || 0);
  };

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel('companies-all-premium')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'companies' }, () => {
        loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadAuditData = async () => {
    setAuditLoading(true);
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, companies(name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAuditOrders(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setAuditLoading(false);
    }
  };

  const handleExportAudit = () => {
    const headers = ['Ticket', 'Local', 'Cliente', 'Contacto', 'Duração', 'Status', 'Data/Hora'];
    const rows = auditOrders.map(o => [
      `#${o.ticket_code}`,
      o.companies?.name || 'N/A',
      o.customer_name || 'N/A',
      o.customer_phone,
      `${Math.floor((o.timer_accumulated_seconds || 0) / 60)}m`,
      o.status,
      new Date(o.created_at).toLocaleString()
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `auditoria_global_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const handleExportSMS = () => {
    const headers = ['Estabelecimento', 'SMS Enviadas', 'Custo (Kz)'];
    const rows = companies.map(co => [
      co.name,
      smsStats[co.id.toString()] || 0,
      (smsStats[co.id.toString()] || 0) * 5
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio_sms_global_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  useEffect(() => {
    if (activeView === 'AUDITORIA') {
      loadAuditData();
    }
  }, [activeView]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lat === '' || lng === '') {
      alert('Localização GPS é obrigatória para inteligência logística.');
      return;
    }

    setLoading(true);
    try {
      const dbData = {
        id: editingCompany ? editingCompany.id : id,
        name,
        location,
        city,
        type,
        province: location,
        nif,
        lat,
        lng,
        email,
        password,
        logo_url: logoUrl,
        telegram_chat_id: telegramChatId,
        telegram_bot_token: telegramBotToken
      };

      if (editingCompany) {
        const { error } = await supabase
          .from('companies')
          .update(dbData)
          .eq('id', editingCompany.id);
        if (error) throw error;
        setEditingCompany(null);
      } else {
        const insertData: any = { ...dbData };
        if (!insertData.id) delete insertData.id;
        const { error } = await supabase.from('companies').insert([insertData]);
        if (error) throw error;
      }

      setName(''); setNif(''); setLat(''); setLng(''); setEmail(''); setPassword(''); setLogoUrl('');
      setCity(''); setType(''); setTelegramChatId(''); setTelegramBotToken('');
      const nextId = await getNextCompanyId();
      setId(nextId.toString().padStart(4, '0'));
    } catch (err: any) {
      console.error(err);
      alert('FALHA NA SINCRONIZAÇÃO: ' + (err.message || 'Erro de rede'));
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (company: Company) => {
    setEditingCompany(company);
    setId(company.id.toString().padStart(4, '0'));
    setName(company.name);
    setLocation(company.location || 'Luanda');
    setCity(company.city || '');
    setType(company.type || '');
    setNif(company.nif);
    setLat(company.lat);
    setLng(company.lng);
    setEmail(company.email || '');
    setPassword(company.password || '');
    setLogoUrl(company.logoUrl || '');
    setTelegramChatId(company.telegramChatId || '');
    setTelegramBotToken(company.telegramBotToken || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleStatus = async (company: Company) => {
    try {
      const { error } = await supabase
        .from('companies')
        .update({ is_active: !company.isActive })
        .eq('id', company.id);
      if (error) throw error;
    } catch (err: any) {
      console.error(err);
      alert('Erro ao alternar status: ' + err.message);
    }
  };

  const toggleMarketing = async (company: Company) => {
    try {
      const { error } = await supabase
        .from('companies')
        .update({ marketing_enabled: !company.marketingEnabled })
        .eq('id', company.id);
      if (error) throw error;
    } catch (err: any) {
      console.error(err);
      alert('Erro ao alternar Marketing: ' + err.message);
    }
  };

  const handleCancelEdit = async () => {
    setEditingCompany(null);
    setName(''); setNif(''); setLat(''); setLng(''); setEmail(''); setPassword(''); setLogoUrl('');
    setCity(''); setType(''); setTelegramChatId(''); setTelegramBotToken('');
    const nextId = await getNextCompanyId();
    setId(nextId.toString().padStart(4, '0'));
  };

  const handleSecureDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showDeleteModal) return;

    setDeleteLoading(true);
    setDeleteError(null);

    try {
      const { data: admin, error: authError } = await supabase
        .from('super_admins')
        .select('*')
        .eq('email', adminConfirmEmail)
        .eq('password', adminConfirmPassword)
        .single();

      if (authError || !admin) {
        setDeleteError('ACESSO NEGADO: Credenciais Master Inválidas.');
        setDeleteLoading(false);
        return;
      }

      const { error: deleteErr } = await supabase
        .from('companies')
        .delete()
        .eq('id', showDeleteModal);

      if (deleteErr) throw deleteErr;

      setShowDeleteModal(null);
      setAdminConfirmEmail('');
      setAdminConfirmPassword('');
    } catch (err: any) {
      setDeleteError(err.message || 'Erro crítico na desativação.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLogoLoading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `logos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('logos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('logos')
        .getPublicUrl(filePath);

      setLogoUrl(publicUrl);
    } catch (err: any) {
      alert('Erro no upload do logotipo: ' + err.message);
    } finally {
      setLogoLoading(false);
    }
  };

  const handleGetCurrentLocation = () => {
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude);
        setLng(position.coords.longitude);
        setGeoLoading(false);
      },
      () => {
        alert("SINAL GPS PERDIDO: Verifique as permissões de localização.");
        setGeoLoading(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const filteredCompanies = companies.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.id.toString().includes(searchTerm) ||
    (c.city || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-background min-h-screen selection:bg-primary selection:text-white relative overflow-x-hidden">
      {/* Decorative Background */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none opacity-40">
        <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] bg-primary/5 rounded-full blur-[150px]"></div>
        <div className="absolute bottom-[-10%] left-[-20%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[150px]"></div>
      </div>

      <header className="glass sticky top-0 z-[60] px-6 lg:px-12 py-6 flex flex-col lg:flex-row items-center justify-between gap-6 border-b border-border/30 animate-fade-in no-print bg-white/80 backdrop-blur-xl">
        <div className="flex items-center gap-6">
          <button onClick={onBack} className="group flex items-center justify-center size-14 rounded-2xl bg-slate-50 border border-slate-200 hover:bg-primary hover:text-white transition-all active:scale-95">
            <span className="material-symbols-outlined text-2xl group-hover:-translate-x-1 transition-transform">arrow_back</span>
          </button>
          <div className="flex items-center gap-4">
            <Logo variant="icon" size={44} color="primary" className="transform hover:rotate-12 transition-transform duration-500" />
            <div>
              <p className="text-[9px] font-black text-primary uppercase tracking-[0.4em] mb-1">Central de Comando</p>
              <h2 className="text-2xl font-black tracking-tight text-slate-900 leading-none">Super Admin</h2>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 overflow-x-auto no-scrollbar max-w-full shadow-inner">
          {[
            { id: 'ESTABELECIMENTOS', label: 'Gestão' },
            { id: 'AUDITORIA', label: 'Auditoria' },
            { id: 'SMS', label: 'Financeiro' },
            { id: 'DIAGNOSTICO', label: 'Diagnóstico' }
          ].map(view => (
            <button
              key={view.id}
              onClick={() => setActiveView(view.id as any)}
              className={`px-6 py-2.5 rounded-xl font-black text-[9px] uppercase tracking-[0.2em] transition-all ${activeView === view.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-white hover:text-slate-900'}`}
            >
              {view.label}
            </button>
          ))}
        </div>

        <div className="hidden lg:flex items-center gap-2 px-6 h-14 bg-green-50 text-green-600 rounded-2xl font-black text-[9px] uppercase tracking-widest border border-green-100">
          <span className="size-2 bg-green-500 rounded-full animate-pulse"></span>
          Sistema Operativo
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 lg:px-12 py-8 lg:py-12 space-y-12 relative z-10">

        {/* Dashboard Analytics */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 animate-fade-in">
          {[
            { label: 'Estabelecimentos Ativos', val: companies.filter(c => c.isActive).length, color: 'text-slate-900' },
            { label: 'Clientes Hoje', val: totalClientCount, color: 'text-primary' },
            { label: 'SMS Enviadas Hoje', val: dailySmsCount, color: 'text-slate-900' },
            { label: 'Receita do Dia', val: `${dailyRevenue.toLocaleString()} Kz`, color: 'text-primary' }
          ].map((stat, i) => (
            <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col gap-1 group">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] group-hover:text-primary transition-colors">{stat.label}</p>
              <p className={`text-4xl font-black ${stat.color} tracking-tighter`}>{stat.val}</p>
            </div>
          ))}
        </section>

        {activeView === 'ESTABELECIMENTOS' ? (
          <div className="space-y-16">
            {/* Registration Form */}
            <section className="bg-white rounded-[3.5rem] p-8 lg:p-16 border border-slate-100 shadow-sm relative overflow-hidden animate-scale-in">
              <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 rounded-full blur-[100px] -mr-40 -mt-40"></div>

              <div className="max-w-5xl mx-auto">
                <div className="flex items-center gap-6 mb-16">
                  <div className="size-16 bg-primary text-white rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
                    <span className="material-symbols-outlined text-3xl">add_business</span>
                  </div>
                  <div>
                    <h2 className="text-4xl font-black tracking-tight text-slate-900">
                      {editingCompany ? 'Ajustar Parceiro' : 'Novo Estabelecimento'}
                    </h2>
                    <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Expanda a rede KwikFood registando novos restaurantes.</p>
                  </div>
                </div>

                <form onSubmit={handleRegister} className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Código ID de Referência</label>
                    <input
                      type="text"
                      value={id}
                      onChange={e => setId(e.target.value.replace(/\D/g, ''))}
                      className="w-full h-16 bg-slate-50 border border-slate-100 rounded-2xl px-8 font-black text-lg text-primary outline-none focus:border-primary transition-all"
                      placeholder="0001"
                    />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Designação / Nome Fantasia</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full h-16 bg-slate-50 border border-slate-100 rounded-2xl px-8 font-black text-lg text-slate-900 outline-none focus:border-primary transition-all" placeholder="Ex: Master Burger Central" required />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo de Negócio</label>
                    <input type="text" value={type} onChange={e => setType(e.target.value)} className="w-full h-16 bg-slate-50 border border-slate-100 rounded-2xl px-8 font-black text-lg text-slate-900 outline-none focus:border-primary transition-all" placeholder="Ex: Restaurante, Hamburgaria..." required />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">NIF Corporativo</label>
                    <input type="text" value={nif} onChange={e => setNif(e.target.value)} className="w-full h-16 bg-slate-50 border border-slate-100 rounded-2xl px-8 font-black text-lg text-slate-900 outline-none focus:border-primary transition-all" placeholder="000000000" required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Província</label>
                      <select value={location} onChange={e => setLocation(e.target.value)} className="w-full h-16 bg-slate-50 border border-slate-100 rounded-2xl px-6 font-black text-[12px] uppercase tracking-widest text-slate-900 outline-none focus:border-primary transition-all appearance-none cursor-pointer">
                        {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Cidade / Bairro</label>
                      <input type="text" value={city} onChange={e => setCity(e.target.value)} className="w-full h-16 bg-slate-50 border border-slate-100 rounded-2xl px-6 font-black text-lg text-slate-900 outline-none focus:border-primary transition-all" placeholder="Ex: Talatona" required />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email de Acesso Administrativo</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full h-16 bg-slate-50 border border-slate-100 rounded-2xl px-8 font-black text-lg text-slate-900 outline-none focus:border-primary transition-all" placeholder="restaurante@exemplo.com" required />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Senha de Parceiro</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full h-16 bg-slate-50 border border-slate-100 rounded-2xl px-8 font-black text-lg text-slate-900 outline-none focus:border-primary transition-all" placeholder="••••••••" required />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Gestão de Logótipo</label>
                    <div className="flex items-center gap-6 p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                      <div className="size-20 bg-white rounded-xl border border-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0 relative shadow-inner">
                        {logoUrl ? <img src={logoUrl} alt="Logo" className="size-full object-cover" /> : <span className="material-symbols-outlined text-slate-200 text-4xl">image</span>}
                        {logoLoading && <div className="absolute inset-0 bg-white/80 flex items-center justify-center"><span className="material-symbols-outlined animate-spin text-primary">sync</span></div>}
                      </div>
                      <div className="flex-1">
                        <label className="inline-block px-6 py-3 bg-slate-900 text-white rounded-xl font-black text-[9px] uppercase tracking-widest cursor-pointer hover:bg-primary transition-all shadow-lg active:scale-95">
                          {logoUrl ? 'Alterar Logo' : 'Inserir Logo'}
                          <input type="file" onChange={handleLogoUpload} className="hidden" accept="image/*" />
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="col-span-full space-y-4 pt-4">
                    <div className="flex flex-col md:flex-row gap-6">
                      <div className="flex-1 space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Latitude (Y)</label>
                        <input type="text" value={lat} onChange={e => setLat(e.target.value === '' ? '' : parseFloat(e.target.value))} className="w-full h-16 bg-slate-50 border border-slate-100 rounded-2xl px-8 font-black text-lg text-slate-900 outline-none focus:border-primary transition-all" />
                      </div>
                      <div className="flex-1 space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Longitude (X)</label>
                        <input type="text" value={lng} onChange={e => setLng(e.target.value === '' ? '' : parseFloat(e.target.value))} className="w-full h-16 bg-slate-50 border border-slate-100 rounded-2xl px-8 font-black text-lg text-slate-900 outline-none focus:border-primary transition-all" />
                      </div>
                    </div>
                    <button type="button" onClick={handleGetCurrentLocation} className="w-full h-16 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-widest text-slate-600 hover:text-primary transition-all active:scale-[0.98]">
                      <span className="material-symbols-outlined text-xl">{geoLoading ? 'sync' : 'my_location'}</span>
                      {geoLoading ? 'Detectando Localização...' : 'Capturar Coordenadas do GPS'}
                    </button>
                  </div>

                  <div className="col-span-full pt-12 flex gap-4">
                    {editingCompany && (
                      <button type="button" onClick={handleCancelEdit} className="flex-1 h-16 font-black text-slate-400 uppercase tracking-widest text-[11px] hover:text-primary transition-all">Cancelar</button>
                    )}
                    <button type="submit" disabled={loading} className="flex-[3] h-20 bg-primary text-white rounded-[1.5rem] font-black text-[13px] uppercase tracking-[0.3em] shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all">
                      {loading ? 'Sincronizando...' : editingCompany ? 'Guardar Alterações' : 'Finalizar Registo'}
                    </button>
                  </div>
                </form>
              </div>
            </section>

            {/* Partners List */}
            <section className="space-y-8 animate-fade-in">
              <div className="flex flex-col sm:flex-row justify-between items-center gap-6">
                <div>
                  <h3 className="text-3xl font-black text-slate-900 tracking-tight">Rede de Parceiros</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.35em] mt-1">{companies.length} Estabelecimentos Ligados</p>
                </div>
                <div className="relative w-full sm:w-96">
                  <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Pesquisar Unidade..." className="w-full h-16 bg-white border border-slate-100 rounded-2xl px-14 font-black text-xs text-slate-700 shadow-sm focus:border-primary outline-none transition-all" />
                  <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-slate-300">search</span>
                </div>
              </div>

              <div className="bg-white rounded-[3.5rem] border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto no-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        <th className="px-10 py-8 text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Estabelecimento</th>
                        <th className="px-10 py-8 text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Contacto Directo</th>
                        <th className="px-10 py-8 text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Localização</th>
                        <th className="px-10 py-8 text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] text-center">Gestão de Status</th>
                        <th className="px-10 py-8 text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] text-right">Acções Master</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {companies.filter(c =>
                        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        c.id.toString().includes(searchTerm)
                      ).map((co) => (
                        <tr key={co.id} className="group hover:bg-slate-50/50 transition-all">
                          <td className="px-10 py-8">
                            <div className="flex items-center gap-6">
                              <div className="size-16 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 shadow-inner group-hover:scale-110 transition-transform">
                                {co.logoUrl ? <img src={co.logoUrl} alt={co.name} className="size-full object-cover" /> : <div className="size-full flex items-center justify-center font-black text-slate-300 text-2xl uppercase">{co.name[0]}</div>}
                              </div>
                              <div>
                                <h4 className="font-black text-slate-900 text-base">{co.name}</h4>
                                <p className="text-[10px] font-black text-primary uppercase tracking-widest">{co.type}</p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">ID: {co.id.toString().padStart(4, '0')}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-10 py-8">
                            <p className="font-black text-slate-700 text-sm">{co.email}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">NIF: {co.nif}</p>
                          </td>
                          <td className="px-10 py-8">
                            <div className="flex items-center gap-2 text-slate-600">
                              <span className="material-symbols-outlined text-lg opacity-50">location_on</span>
                              <p className="font-black text-xs uppercase tracking-wide">{co.location}, {co.city}</p>
                            </div>
                          </td>
                          <td className="px-10 py-8">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => toggleStatus(co)}
                                className={`px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all ${co.isActive ? 'bg-green-50 text-green-600 border border-green-100' : 'bg-red-50 text-red-600 border border-red-100'}`}
                              >
                                {co.isActive ? 'Activo' : 'Pausado'}
                              </button>
                              <button
                                onClick={() => toggleMarketing(co)}
                                className={`size-10 rounded-xl flex items-center justify-center transition-all ${co.marketingEnabled ? 'bg-primary text-white shadow-lg' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                                title="Marketing Automático"
                              >
                                <span className="material-symbols-outlined text-xl">campaign</span>
                              </button>
                            </div>
                          </td>
                          <td className="px-10 py-8 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => setShowQRModal(co)} className="size-12 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-400 hover:text-primary hover:border-primary transition-all active:scale-95 shadow-sm">
                                <span className="material-symbols-outlined text-xl">qr_code_2</span>
                              </button>
                              <button onClick={() => handleEditClick(co)} className="size-12 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-900 hover:border-slate-900 transition-all active:scale-95 shadow-sm">
                                <span className="material-symbols-outlined text-xl">edit_note</span>
                              </button>
                              <button onClick={() => setShowDeleteModal(co.id.toString())} className="size-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all active:scale-95 shadow-sm">
                                <span className="material-symbols-outlined text-xl">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        ) : activeView === 'AUDITORIA' ? (
          <section className="space-y-12 animate-fade-in">
            <div className="flex flex-col lg:flex-row justify-between items-center gap-8 bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-sm no-print">
              <div>
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">Registo de Auditoria</h3>
                <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Monitorização global de transações e logs de sistema.</p>
              </div>
              <div className="flex gap-4 w-full lg:w-auto">
                <button onClick={handleExportAudit} className="flex-1 lg:flex-none h-16 px-10 bg-slate-50 border border-slate-200 text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all hover:bg-white flex items-center justify-center gap-3">
                  <span className="material-symbols-outlined text-2xl">table_rows</span> CSV
                </button>
                <button onClick={() => window.print()} className="flex-1 lg:flex-none h-16 px-10 bg-primary text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-3 active:scale-95">
                  <span className="material-symbols-outlined text-2xl">picture_as_pdf</span> PDF
                </button>
              </div>
            </div>

            <div className="bg-white rounded-[3.5rem] border border-slate-100 shadow-sm overflow-hidden animate-scale-in">
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-10 py-8 text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Operação / Local</th>
                      <th className="px-10 py-8 text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Cliente</th>
                      <th className="px-10 py-8 text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Produtividade</th>
                      <th className="px-10 py-8 text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Tipo de Pedido</th>
                      <th className="px-10 py-8 text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] text-right">Data/Hora</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {auditOrders.map((order) => (
                      <tr key={order.id} className="group hover:bg-slate-50 transition-all">
                        <td className="px-10 py-6">
                          <div className="flex items-center gap-4">
                            <div className="size-12 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black text-xs shadow-lg">
                              #{order.ticket_code}
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-900 uppercase truncate max-w-[150px]">{order.companies?.name}</p>
                              <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5 tracking-tighter">REF: {order.id.slice(0, 8)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-10 py-6">
                          <p className="text-[12px] font-black text-slate-900">{order.customer_phone}</p>
                          {order.customer_name && <p className="text-[10px] font-bold text-primary uppercase tracking-wide">{order.customer_name}</p>}
                        </td>
                        <td className="px-10 py-6">
                          <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-slate-300 text-lg">timer</span>
                            <p className="text-[12px] font-black text-slate-700 tracking-tight">
                              {Math.floor((order.timer_accumulated_seconds || 0) / 60)}m {(order.timer_accumulated_seconds || 0) % 60}s
                            </p>
                          </div>
                        </td>
                        <td className="px-10 py-6">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 border border-slate-100 rounded-lg text-[9px] font-black text-slate-600 w-fit uppercase tracking-widest">
                              <span className="material-symbols-outlined text-[14px]">
                                {order.order_type === 'EAT_IN' ? 'restaurant' : order.order_type === 'TAKE_AWAY' ? 'local_mall' : 'delivery_dining'}
                              </span>
                              {order.order_type === 'EAT_IN' ? 'No Local' : order.order_type === 'TAKE_AWAY' ? 'Take Away' : 'Entregue'}
                            </div>
                            <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest w-fit shadow-sm border ${order.status === 'DELIVERED' ? 'bg-slate-100 text-slate-500 border-slate-200' :
                                order.status === 'READY' ? 'bg-green-50 text-green-600 border-green-100' :
                                  'bg-primary/10 text-primary border-primary/20'
                              }`}>
                              {order.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-10 py-6 text-right">
                          <p className="text-[11px] font-black text-slate-900 uppercase">{new Date(order.created_at).toLocaleDateString()}</p>
                          <p className="text-[9px] font-bold text-slate-400">{new Date(order.created_at).toLocaleTimeString()}</p>
                        </td>
                      </tr>
                    ))}
                    {auditOrders.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-24 text-center opacity-40">
                          {auditLoading ? 'CARREGANDO DADOS DA NUVEM...' : 'NENHUM HISTÓRICO DISPONÍVEL.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : activeView === 'DIAGNOSTICO' ? (
          <section className="space-y-12 animate-fade-in">
            <div className="bg-white rounded-[3.5rem] p-8 lg:p-16 border border-slate-100 shadow-sm relative overflow-hidden animate-scale-in">
              <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 rounded-full blur-[100px] -mr-40 -mt-40"></div>

              <div className="max-w-4xl mx-auto">
                <div className="flex items-center gap-8 mb-16">
                  <div className="size-20 bg-slate-900 text-white rounded-[2.2rem] flex items-center justify-center shadow-2xl relative">
                    <span className="material-symbols-outlined text-4xl">terminal</span>
                    <div className="absolute -top-2 -right-2 size-6 bg-primary rounded-full border-4 border-white animate-pulse"></div>
                  </div>
                  <div>
                    <h2 className="text-4xl font-black tracking-tight text-slate-900">Consola de Diagnóstico</h2>
                    <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Verificação de Integridade e Webhooks do Telegram.</p>
                  </div>
                </div>

                <div className="space-y-12">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Token de Acesso (Telegram BotFather)</label>
                    <div className="flex flex-col sm:flex-row gap-4">
                      <input
                        type="text"
                        value={testToken}
                        onChange={e => setTestToken(e.target.value)}
                        className="flex-1 h-16 bg-slate-50 border border-slate-100 rounded-2xl px-6 font-black text-[12px] text-slate-900 outline-none focus:border-primary transition-all"
                        placeholder="Ex: 569812:AAHjKq9..."
                      />
                      <button
                        onClick={async () => {
                          const res = await checkBotStatus(testToken);
                          if (res.success) alert(`✅ TOKEN VÁLIDO!\nBot: ${res.botName} (@${res.username})`);
                          else alert(`❌ TOKEN INVÁLIDO: ${res.error}`);
                        }}
                        className="h-16 px-8 bg-slate-100 border border-slate-200 text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-white transition-all active:scale-95 flex-shrink-0"
                      >
                        Validar Token
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">ID de Destino / Chat ID</label>
                      <input
                        type="text"
                        value={testChatId}
                        onChange={e => setTestChatId(e.target.value)}
                        className="w-full h-16 bg-slate-50 border border-slate-100 rounded-2xl px-6 font-black text-[12px] text-slate-900 outline-none focus:border-primary transition-all"
                        placeholder="Ex: -100123... ou 91283..."
                      />
                    </div>
                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex flex-col justify-center gap-4">
                      <p className="text-[10px] font-bold text-slate-500 leading-snug">
                        Para grupos, escreva algo no Telegram e use o scanner para capturar o ID exacto.
                      </p>
                      <button
                        onClick={async () => {
                          setTestLoading(true);
                          const res = await getBotUpdates(testToken);
                          setTestLoading(false);
                          if (res.success && res.chats && res.chats.length > 0) {
                            alert(`📍 GRUPOS DETECTADOS:\n\n${res.chats.map((c: any) => `${c.title} (ID: ${c.id})`).join('\n')}`);
                          } else {
                            alert("Nenhum grupo detectado recentemente.");
                          }
                        }}
                        className="w-full py-4 bg-white border border-slate-200 rounded-xl font-black text-[9px] uppercase tracking-widest text-slate-900 hover:border-primary transition-all flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-lg">radar</span> Scanner Ativo
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Carga Útil de Teste (Mensagem)</label>
                    <textarea
                      value={testMessage}
                      onChange={e => setTestMessage(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-[2rem] p-8 font-bold text-sm text-slate-900 outline-none focus:border-primary transition-all resize-none min-h-[140px]"
                      placeholder="Escreva aqui a mensagem para enviar..."
                    />
                  </div>

                  {testResult && (
                    <div className={`p-8 rounded-3xl border animate-fade-in ${testResult.success ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
                      <div className="flex items-start gap-4">
                        <span className="material-symbols-outlined">{testResult.success ? 'check_circle' : 'error'}</span>
                        <div>
                          <p className="font-black text-[10px] uppercase tracking-widest mb-1">{testResult.success ? 'Diagnóstico OK' : 'Falha Crítica'}</p>
                          <p className="text-xs font-bold">{testResult.message}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={async () => {
                      setTestLoading(true);
                      setTestResult(null);
                      const result = await sendTelegramMessage(testToken, testChatId, testMessage);
                      setTestResult({
                        success: result?.success || false,
                        message: result?.success ? 'Mensagem disparada com sucesso!' : (result?.error || 'Erro desconhecido.')
                      });
                      setTestLoading(false);
                    }}
                    disabled={testLoading || !testToken || !testChatId}
                    className="w-full h-20 bg-slate-900 hover:bg-primary text-white rounded-[1.5rem] font-black uppercase tracking-[0.4em] text-[13px] shadow-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-4"
                  >
                    {testLoading ? 'Sincronizando...' : 'Disparar Teste de Alta Prioridade'}
                    <span className="material-symbols-outlined">send</span>
                  </button>
                </div>
              </div>
            </div>
          </section>
        ) : (
          /* SMS & Financial View */
          <section className="space-y-12 animate-fade-in">
            <div className="flex flex-col lg:flex-row justify-between items-center gap-8 bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-sm no-print">
              <div>
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">Financeiro & SMS</h3>
                <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Monitorização de custos de mensageira por estabelecimento.</p>
              </div>
              <div className="flex gap-4 w-full lg:w-auto">
                <button onClick={handleExportSMS} className="flex-1 lg:flex-none h-16 px-10 bg-slate-50 border border-slate-200 text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all hover:bg-white flex items-center justify-center gap-3">
                  <span className="material-symbols-outlined text-2xl">table_rows</span> CSV
                </button>
                <button onClick={() => window.print()} className="flex-1 lg:flex-none h-16 px-10 bg-primary text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-3 active:scale-95">
                  <span className="material-symbols-outlined text-2xl">picture_as_pdf</span> PDF
                </button>
              </div>
            </div>

            <div className="bg-white rounded-[3.5rem] border border-slate-100 shadow-sm overflow-hidden animate-scale-in">
              <div className="overflow-x-auto no-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-10 py-8 text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Estabelecimento</th>
                      <th className="px-10 py-8 text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] text-center">SMS Enviadas</th>
                      <th className="px-10 py-8 text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] text-center">Custo Acumulado</th>
                      <th className="px-10 py-8 text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] text-right">Margem Operacional</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {companies.map(co => {
                      const count = smsStats[co.id.toString()] || 0;
                      return (
                        <tr key={co.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-10 py-8">
                            <div className="flex items-center gap-4">
                              <div className="size-10 bg-slate-100 rounded-lg flex items-center justify-center font-black text-slate-400 text-xs">
                                {co.id.toString().padStart(2, '0')}
                              </div>
                              <p className="font-black text-slate-900 uppercase text-sm tracking-tight">{co.name}</p>
                            </div>
                          </td>
                          <td className="px-10 py-8 text-center font-black text-slate-700">{count}</td>
                          <td className="px-10 py-8 text-center font-black text-primary">{(count * 5).toLocaleString()} Kz</td>
                          <td className="px-10 py-8 text-right font-black text-green-600">
                            Alta
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-fade-in no-print">
          <div className="w-full max-w-lg bg-white rounded-[3rem] p-12 shadow-2xl relative overflow-hidden animate-scale-in">
            <div className="absolute top-0 left-0 w-full h-2 bg-primary"></div>

            <div className="text-center mb-10">
              <div className="size-20 bg-primary/10 text-primary rounded-3xl flex items-center justify-center mx-auto mb-6">
                <span className="material-symbols-outlined text-4xl">warning</span>
              </div>
              <h3 className="text-3xl font-black text-slate-900 tracking-tight leading-none uppercase">Acção Crítica</h3>
              <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-4">
                A exclusão da unidade é irreversível. Todos os produtos e logs serão perdidos imediatamente.
              </p>
            </div>

            <form onSubmit={handleSecureDelete} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email Master</label>
                <input type="email" value={adminConfirmEmail} onChange={e => setAdminConfirmEmail(e.target.value)} required className="w-full h-14 bg-slate-50 border border-slate-100 rounded-xl px-6 font-black text-slate-900 outline-none focus:border-primary transition-all" placeholder="admin@master.com" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Chave Mestra</label>
                <input type="password" value={adminConfirmPassword} onChange={e => setAdminConfirmPassword(e.target.value)} required className="w-full h-14 bg-slate-50 border border-slate-100 rounded-xl px-6 font-black text-slate-900 outline-none focus:border-primary transition-all" placeholder="••••••••" />
              </div>

              {deleteError && <div className="p-4 bg-red-50 border border-red-100 text-red-600 text-[10px] font-black rounded-xl text-center uppercase tracking-widest">{deleteError}</div>}

              <div className="flex flex-col gap-4 pt-6">
                <button type="submit" disabled={deleteLoading} className="w-full h-16 bg-primary text-white rounded-2xl font-black uppercase tracking-[0.3em] text-[11px] shadow-lg shadow-primary/20 hover:bg-slate-900 transition-all">
                  {deleteLoading ? 'Eliminando...' : 'Confirmar Exclusão'}
                </button>
                <button type="button" onClick={() => setShowDeleteModal(null)} className="w-full h-12 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-colors">Abortar Operação</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Modal */}
      {showQRModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-fade-in no-print">
          <div className="w-full max-w-lg bg-white rounded-[3rem] p-12 shadow-2xl relative overflow-hidden animate-scale-in text-center">
            <div className="absolute top-0 left-0 w-full h-2 bg-primary"></div>

            <div className="mb-10">
              <h3 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none">{showQRModal.name}</h3>
              <p className="text-primary font-black text-[10px] uppercase tracking-[0.4em] mt-3">ID Local: {showQRModal.id.toString().padStart(4, '0')}</p>
            </div>

            <div className="bg-white p-8 border-2 border-slate-100 rounded-[2.5rem] shadow-inner mb-10 w-fit mx-auto relative group">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`https://kwikfood.vercel.app?code=${showQRModal.id.toString().padStart(4, '0')}`)}`}
                alt="QR"
                className="size-48"
              />
              {showQRModal.logoUrl && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="size-12 bg-white p-1 rounded-lg shadow-lg border border-slate-100 overflow-hidden">
                    <img src={showQRModal.logoUrl} alt="L" className="size-full object-cover rounded" />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <button onClick={() => window.print()} className="w-full h-16 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-[0.3em] text-[11px] shadow-lg flex items-center justify-center gap-3">
                <span className="material-symbols-outlined">print</span> Imprimir Pack QR
              </button>
              <button onClick={() => setShowQRModal(null)} className="w-full h-12 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900">Fechar Janela</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SuperAdminView;

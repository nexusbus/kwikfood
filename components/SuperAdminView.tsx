
import React, { useState, useEffect } from 'react';
import { fetchCompanies, getNextCompanyId, STORE_RADIUS_METERS } from '../constants';
import Logo from './Logo';
import { supabase } from '../src/lib/supabase';
import { Company } from '../types';
import { sendSMS } from '../src/services/smsService';

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
  const [id, setId] = useState('');
  const [lat, setLat] = useState<number | ''>('');
  const [lng, setLng] = useState<number | ''>('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [logoLoading, setLogoLoading] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [showQRModal, setShowQRModal] = useState<Company | null>(null);
  const [adminConfirmEmail, setAdminConfirmEmail] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [activeView, setActiveView] = useState<'ESTABELECIMENTOS' | 'AUDITORIA'>('ESTABELECIMENTOS');
  const [auditOrders, setAuditOrders] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      const cData = await fetchCompanies();
      setCompanies(cData);
      const nextId = await getNextCompanyId();
      setId(nextId.toString().padStart(4, '0'));
    };
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
        nif,
        lat,
        lng,
        email,
        password,
        logo_url: logoUrl // Map to snake_case for DB
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
    setLocation(company.location);
    setNif(company.nif);
    setLat(company.lat);
    setLng(company.lng);
    setEmail(company.email || '');
    setPassword(company.password || '');
    setLogoUrl(company.logoUrl || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  return (
    <div className="bg-background min-h-screen selection:bg-primary selection:text-white relative overflow-x-hidden">
      {/* Decorative Background */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none opacity-40">
        <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] bg-primary/5 rounded-full blur-[150px]"></div>
        <div className="absolute bottom-[-10%] left-[-20%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[150px]"></div>
      </div>

      <header className="glass sticky top-0 z-[60] px-12 py-8 flex items-center justify-between border-b border-white/50 animate-fade-in">
        <div className="flex items-center gap-6">
          <button onClick={onBack} className="size-16 bg-white/50 hover:bg-secondary hover:text-white rounded-[1.5rem] flex items-center justify-center transition-all shadow-md group">
            <span className="material-symbols-outlined text-3xl group-hover:-translate-x-1 transition-transform">arrow_back</span>
          </button>
          <Logo variant="full" color="dark" size={48} />
        </div>

        <div className="flex items-center gap-4 bg-background/50 p-2 rounded-[1.5rem] border border-border/50">
          <button
            onClick={() => setActiveView('ESTABELECIMENTOS')}
            className={`px-8 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeView === 'ESTABELECIMENTOS' ? 'bg-secondary text-white shadow-premium' : 'text-text-muted hover:bg-white'}`}
          >
            Gestão
          </button>
          <button
            onClick={() => setActiveView('AUDITORIA')}
            className={`px-8 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeView === 'AUDITORIA' ? 'bg-secondary text-white shadow-premium' : 'text-text-muted hover:bg-white'}`}
          >
            Auditoria
          </button>
        </div>

        <div className="hidden lg:flex items-center gap-4 px-8 py-4 bg-secondary text-white rounded-full font-black text-[11px] uppercase tracking-widest shadow-premium">
          <span className="size-2 bg-green-400 rounded-full animate-pulse-soft"></span>
          Sistema Operativo
        </div>
      </header>


      <main className="max-w-7xl mx-auto px-12 py-16 space-y-20 relative z-10">
        {activeView === 'ESTABELECIMENTOS' ? (
          <>
            {/* Registration Section */}
            <section className="bg-surface rounded-[4.5rem] shadow-premium p-16 border border-white/60 relative overflow-hidden animate-scale-in">
              <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 rounded-full blur-[100px] -mr-40 -mt-40"></div>

              <div className="max-w-4xl mx-auto space-y-12">
                <div className="flex items-center gap-8">
                  <div className="size-20 bg-primary text-white rounded-[2.2rem] flex items-center justify-center shadow-premium transform rotate-3">
                    <span className="material-symbols-outlined text-5xl">add_business</span>
                  </div>
                  <div>
                    <h2 className="text-5xl font-black tracking-tight text-secondary leading-none">
                      {editingCompany ? 'Ajustar Parceiro' : 'Novo Estabelecimento'}
                    </h2>
                    <p className="text-text-muted font-medium text-lg mt-3">Expanda a rede KwikFood registando novos restaurantes.</p>
                  </div>
                </div>

                <form onSubmit={handleRegister} className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  <div className="space-y-4">
                    <label className="text-[11px] font-black text-secondary uppercase tracking-[0.4em] ml-2 opacity-50">Código ID (Referência)</label>
                    <input
                      type="text"
                      value={id}
                      onChange={e => setId(e.target.value.replace(/\D/g, ''))}
                      placeholder="0001"
                      className="w-full h-20 bg-background border-2 border-primary/20 rounded-[1.8rem] px-8 font-black text-lg text-primary focus:border-primary transition-all outline-none"
                    />
                  </div>

                  <div className="space-y-4">
                    <label className="text-[11px] font-black text-secondary uppercase tracking-[0.4em] ml-2 opacity-50">Designação Social</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Master Burger Central" className="w-full h-20 bg-background border-2 border-border/40 rounded-[1.8rem] px-8 font-black text-lg text-secondary focus:border-primary transition-all outline-none" required />
                  </div>
                  <div className="space-y-4">
                    <label className="text-[11px] font-black text-secondary uppercase tracking-[0.4em] ml-2 opacity-50">NIF da Empresa</label>
                    <input type="text" value={nif} onChange={e => setNif(e.target.value)} placeholder="000000000" className="w-full h-20 bg-background border-2 border-border/40 rounded-[1.8rem] px-8 font-black text-lg text-secondary focus:border-primary transition-all outline-none" required />
                  </div>

                  <div className="space-y-4">
                    <label className="text-[11px] font-black text-secondary uppercase tracking-[0.4em] ml-2 opacity-50">Local de Operação (Província)</label>
                    <select value={location} onChange={e => setLocation(e.target.value)} className="w-full h-20 bg-background border-2 border-border/40 rounded-[1.8rem] px-8 font-black text-[12px] uppercase tracking-widest text-secondary focus:border-primary transition-all appearance-none cursor-pointer outline-none">
                      {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>

                  <div className="space-y-4">
                    <label className="text-[11px] font-black text-secondary uppercase tracking-[0.4em] ml-2 opacity-50">Credenciais de Acesso (Email)</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="restaurante@exemplo.com" className="w-full h-20 bg-background border-2 border-border/40 rounded-[1.8rem] px-8 font-black text-lg text-secondary focus:border-primary transition-all outline-none" required />
                  </div>

                  <div className="space-y-4">
                    <label className="text-[11px] font-black text-secondary uppercase tracking-[0.4em] ml-2 opacity-50">Senha Administrativa</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="w-full h-20 bg-background border-2 border-border/40 rounded-[1.8rem] px-8 font-black text-lg text-secondary focus:border-primary transition-all outline-none" required />
                  </div>

                  <div className="md:col-span-2 space-y-4">
                    <label className="text-[11px] font-black text-secondary uppercase tracking-[0.4em] ml-2 opacity-50">Logótipo da Empresa</label>
                    <div className="flex items-center gap-8 p-8 bg-background border-2 border-border/40 rounded-[1.8rem]">
                      <div className="size-24 bg-surface rounded-2xl flex items-center justify-center overflow-hidden border border-border relative group">
                        {logoUrl ? (
                          <img src={logoUrl} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                          <span className="material-symbols-outlined text-4xl text-text-muted">image</span>
                        )}
                        {logoLoading && (
                          <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                            <span className="material-symbols-outlined animate-spin text-primary">sync</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <label className="inline-block px-8 py-4 bg-secondary text-white rounded-xl font-black text-[10px] uppercase tracking-widest cursor-pointer hover:bg-primary transition-all shadow-premium">
                          {logoLoading ? 'A CARREGAR...' : logoUrl ? 'ALTERAR IMAGEM' : 'SELECIONAR LOGOTIPO'}
                          <input type="file" onChange={handleLogoUpload} className="hidden" accept="image/*" disabled={logoLoading} />
                        </label>
                        <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest ml-1">PNG ou JPG até 2MB</p>
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-2 space-y-6">
                    <div className="flex flex-col md:flex-row gap-6">
                      <div className="flex-1 space-y-4">
                        <label className="text-[11px] font-black text-secondary uppercase tracking-[0.4em] ml-2 opacity-50">Coordenada Y (Lat)</label>
                        <input type="text" value={lat} onChange={e => setLat(e.target.value === '' ? '' : parseFloat(e.target.value.toString()))} placeholder="0.0000" className="w-full h-20 bg-background border-2 border-border/40 rounded-[1.8rem] px-8 font-black text-lg text-secondary focus:border-primary transition-all outline-none" required />
                      </div>
                      <div className="flex-1 space-y-4">
                        <label className="text-[11px] font-black text-secondary uppercase tracking-[0.4em] ml-2 opacity-50">Coordenada X (Long)</label>
                        <input type="text" value={lng} onChange={e => setLng(e.target.value === '' ? '' : parseFloat(e.target.value.toString()))} placeholder="0.0000" className="w-full h-20 bg-background border-2 border-border/40 rounded-[1.8rem] px-8 font-black text-lg text-secondary focus:border-primary transition-all outline-none" required />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleGetCurrentLocation}
                      disabled={geoLoading}
                      className="w-full py-5 bg-background hover:bg-white text-secondary hover:text-primary rounded-[1.5rem] font-black text-[12px] uppercase tracking-widest border border-border/60 transition-all flex items-center justify-center gap-4 group"
                    >
                      <span className="material-symbols-outlined group-hover:rotate-180 transition-transform duration-700">{geoLoading ? 'sync' : 'my_location'}</span>
                      {geoLoading ? 'DETECTANDO SINAL GPS...' : 'Detectar Minha Localização Atual'}
                    </button>
                  </div>

                  <div className="md:col-span-2 pt-10 flex gap-6">
                    {editingCompany && (
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        className="flex-1 h-24 font-black uppercase tracking-[0.4em] text-text-muted hover:text-primary transition-all text-[12px]"
                      >
                        DESCARTAR
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-[2] h-24 bg-primary hover:bg-secondary text-white rounded-[2rem] font-black uppercase tracking-[0.4em] text-[14px] shadow-premium active:scale-[0.96] transition-all disabled:opacity-50 relative overflow-hidden group"
                    >
                      <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 skew-x-12"></div>
                      {loading ? 'SINCRONIZANDO...' : editingCompany ? 'SALVAR ALTERAÇÕES' : 'CONCLUIR REGISTO'}
                    </button>
                  </div>
                </form>
              </div>
            </section>

            {/* List Section */}
            <section className="animate-fade-in" style={{ animationDelay: '0.2s' }}>
              <div className="flex items-center justify-between mb-12">
                <div>
                  <h2 className="text-5xl font-black tracking-tight text-secondary leading-none">Parceiros KwikFood</h2>
                  <div className="flex items-center gap-4 mt-4">
                    <span className="px-5 py-2 bg-secondary text-white rounded-full text-[12px] font-black">
                      {companies.length} Unidades
                    </span>
                    <p className="text-text-muted font-black uppercase text-[11px] tracking-[0.3em]">Gestão Global de Rede</p>
                  </div>
                </div>
              </div>

              <div className="bg-surface rounded-[4.5rem] shadow-premium border border-white/60 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[11px] font-black text-text-muted uppercase tracking-[0.4em] border-b border-border/50">
                        <th className="px-16 py-12">Estabelecimento</th>
                        <th className="px-12 py-12 text-center">Referência</th>
                        <th className="px-12 py-12">Acesso & Segurança</th>
                        <th className="px-16 py-12 text-right">Controlo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {companies.map((co) => (
                        <tr key={co.id} className="group hover:bg-background/40 transition-all duration-500 relative">
                          <td className="px-16 py-12">
                            <div className="flex items-center gap-8">
                              <div className="size-20 bg-background rounded-[2.2rem] flex items-center justify-center text-secondary font-black text-3xl group-hover:bg-primary group-hover:text-white transition-all duration-700 shadow-sm border border-border overflow-hidden">
                                {co.logoUrl ? (
                                  <img src={co.logoUrl} alt={co.name} className="w-full h-full object-cover" />
                                ) : co.name.charAt(0)}
                              </div>
                              <div>
                                <p className="text-2xl font-black text-secondary group-hover:translate-x-2 transition-transform duration-500">{co.name}</p>
                                <div className="flex items-center gap-5 text-[11px] font-black text-text-muted uppercase tracking-[0.2em] mt-2">
                                  <span className="flex items-center gap-2 text-primary bg-primary-soft/50 px-3 py-1 rounded-full border border-primary/10">
                                    <span className="material-symbols-outlined text-lg">location_on</span>
                                    {co.location}
                                  </span>
                                  <span className="opacity-40 italic">NIF: {co.nif}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-12 py-12 text-center">
                            <span className="inline-block px-6 py-2.5 bg-secondary text-white rounded-full text-[12px] font-bold tracking-[0.4em] shadow-premium">
                              {co.id.toString().padStart(4, '0')}
                            </span>
                          </td>
                          <td className="px-12 py-12">
                            <div className="space-y-2">
                              <p className="text-[14px] font-black text-secondary leading-none">{co.email}</p>
                              <div className="flex items-center gap-3">
                                <span className="size-2.5 bg-green-500 rounded-full animate-pulse-soft"></span>
                                <span className="text-[10px] font-black uppercase text-green-600 tracking-[0.3em]">Autenticado</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-16 py-12 text-right">
                            <div className="flex justify-end gap-5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 translate-x-10 transition-all duration-700">
                              <button
                                onClick={() => toggleMarketing(co)}
                                className={`size-16 border border-border/80 rounded-[1.5rem] flex items-center justify-center transition-all ${co.marketingEnabled ? 'bg-secondary text-white shadow-premium' : 'bg-white text-text-muted hover:text-primary hover:shadow-premium'}`}
                                title={co.marketingEnabled ? 'Desativar Marketing' : 'Ativar Marketing'}
                              >
                                <span className="material-symbols-outlined text-3xl">campaign</span>
                              </button>
                              <button onClick={() => setShowQRModal(co)} className="size-16 bg-white border border-border/80 rounded-[1.5rem] flex items-center justify-center text-text-muted hover:text-primary hover:shadow-premium transition-all">
                                <span className="material-symbols-outlined text-3xl">qr_code_2</span>
                              </button>
                              <button onClick={() => handleEditClick(co)} className="size-16 bg-white border border-border/80 rounded-[1.5rem] flex items-center justify-center text-text-muted hover:text-secondary hover:shadow-premium transition-all">
                                <span className="material-symbols-outlined text-3xl">edit_note</span>
                              </button>
                              <button onClick={() => setShowDeleteModal(co.id.toString())} className="size-16 bg-primary-soft rounded-[1.5rem] flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all shadow-md">
                                <span className="material-symbols-outlined text-3xl">delete</span>
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
          </>
        ) : (
          <section className="space-y-12 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-16">
              <div className="bg-surface p-12 rounded-[3.5rem] border border-white/60 shadow-premium">
                <p className="text-[11px] font-black text-text-muted uppercase tracking-[0.4em] mb-3">Total de Tickets</p>
                <p className="text-6xl font-black text-secondary tracking-tighter">{auditOrders.length}</p>
              </div>
              <div className="bg-surface p-12 rounded-[3.5rem] border border-white/60 shadow-premium">
                <p className="text-[11px] font-black text-text-muted uppercase tracking-[0.4em] mb-3">Tempo Médio de Serviço</p>
                <p className="text-6xl font-black text-primary tracking-tighter">
                  {auditOrders.length > 0
                    ? Math.round(auditOrders.reduce((acc, o) => acc + (o.timer_accumulated_seconds || 0), 0) / auditOrders.length / 60)
                    : 0} min
                </p>
              </div>
              <div className="bg-surface p-12 rounded-[3.5rem] border border-white/60 shadow-premium">
                <p className="text-[11px] font-black text-text-muted uppercase tracking-[0.4em] mb-3">Establecimentos Ativos</p>
                <p className="text-6xl font-black text-secondary tracking-tighter">{companies.length}</p>
              </div>
            </div>

            <div className="bg-surface rounded-[4.5rem] shadow-premium border border-white/60 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[11px] font-black text-text-muted uppercase tracking-[0.4em] border-b border-border/50">
                      <th className="px-16 py-12">Ticket / Local</th>
                      <th className="px-12 py-12">Contacto Cliente</th>
                      <th className="px-12 py-12">Duração Serviço</th>
                      <th className="px-12 py-12">Status</th>
                      <th className="px-16 py-12 text-right">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {auditOrders.map((order) => (
                      <tr key={order.id} className="group hover:bg-background/40 transition-all duration-500">
                        <td className="px-16 py-12">
                          <div className="flex items-center gap-6">
                            <div className="size-14 bg-secondary text-white rounded-2xl flex items-center justify-center font-black text-lg shadow-sm group-hover:bg-primary transition-colors">
                              #{order.ticket_code}
                            </div>
                            <div>
                              <p className="text-xl font-black text-secondary uppercase tracking-tight">{order.companies?.name}</p>
                              <p className="text-[9px] font-bold text-text-muted uppercase tracking-widest mt-1">Ref: {order.id.slice(0, 8)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-12 py-12">
                          <p className="text-[15px] font-black text-secondary">{order.customer_phone}</p>
                          <p className="text-[10px] text-primary font-bold uppercase tracking-widest mt-1">Verificado</p>
                        </td>
                        <td className="px-12 py-12">
                          <p className="text-xl font-black text-secondary">
                            {Math.floor((order.timer_accumulated_seconds || 0) / 60)}m {(order.timer_accumulated_seconds || 0) % 60}s
                          </p>
                        </td>
                        <td className="px-12 py-12">
                          <span className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest ${order.status === 'DELIVERED' ? 'bg-gray-100 text-gray-600' :
                            order.status === 'READY' ? 'bg-green-100 text-green-600' :
                              'bg-orange-100 text-orange-600'
                            }`}>
                            {order.status}
                          </span>
                        </td>
                        <td className="px-16 py-12 text-right">
                          <p className="text-[14px] font-black text-secondary">{new Date(order.created_at).toLocaleDateString()}</p>
                          <p className="text-[11px] font-bold text-text-muted uppercase mt-1">{new Date(order.created_at).toLocaleTimeString()}</p>
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
        )}
      </main>

      {/* Premium Delete Modal */}
      {
        showDeleteModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-secondary/80 backdrop-blur-3xl animate-in fade-in duration-500">
            <div className="w-full max-w-xl bg-surface rounded-[4.5rem] p-16 shadow-premium relative overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="absolute top-0 left-0 w-full h-4 bg-primary"></div>

              <div className="text-center mb-12">
                <div className="size-24 bg-primary-soft text-primary rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 animate-pulse-soft shadow-premium">
                  <span className="material-symbols-outlined text-5xl">warning</span>
                </div>
                <h3 className="text-4xl font-black tracking-tighter text-secondary leading-none">Cuidado Crítico</h3>
                <p className="text-text-muted text-lg font-medium mt-4 leading-relaxed">
                  A exclusão desta unidade é irreversível e removerá todos os produtos associados. Confirme as credenciais MASTER.
                </p>
              </div>

              <form onSubmit={handleSecureDelete} className="space-y-8">
                <div className="space-y-3">
                  <label className="text-[11px) font-black text-secondary uppercase tracking-[0.4em] ml-2 opacity-50">Email de Autorização</label>
                  <input
                    type="email"
                    required
                    value={adminConfirmEmail}
                    onChange={e => setAdminConfirmEmail(e.target.value)}
                    className="w-full h-20 bg-background border-2 border-border/40 rounded-[1.8rem] px-8 font-black text-xl text-secondary focus:border-primary transition-all outline-none"
                    placeholder="master@kwikfood.com"
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-[11px) font-black text-secondary uppercase tracking-[0.4em] ml-2 opacity-50">Chave de Segurança</label>
                  <input
                    type="password"
                    required
                    value={adminConfirmPassword}
                    onChange={e => setAdminConfirmPassword(e.target.value)}
                    className="w-full h-20 bg-background border-2 border-border/40 rounded-[1.8rem] px-8 font-black text-xl text-secondary focus:border-primary transition-all outline-none"
                    placeholder="••••••••"
                  />
                </div>

                {deleteError && (
                  <div className="p-6 bg-primary-soft text-primary text-[12px] font-black rounded-2xl text-center uppercase tracking-widest border border-primary/20 animate-fade-in">
                    {deleteError}
                  </div>
                )}

                <div className="flex flex-col gap-6 mt-12">
                  <button
                    type="submit"
                    disabled={deleteLoading}
                    className="w-full h-24 bg-primary text-white rounded-[2rem] font-black text-sm tracking-[0.4em] shadow-premium hover:bg-secondary transition-all disabled:opacity-50 relative overflow-hidden group"
                  >
                    <div className="absolute inset-0 bg-white/10 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 skew-x-12"></div>
                    {deleteLoading ? 'DESINTEGRANDO...' : 'EXECUTAR EXCLUSÃO'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeleteModal(null);
                      setDeleteError(null);
                      setAdminConfirmEmail('');
                      setAdminConfirmPassword('');
                    }}
                    className="w-full py-5 text-[12px] font-black text-text-muted uppercase tracking-[0.4em] hover:text-secondary transition-colors"
                  >
                    DESISTIR AGORA
                  </button>
                </div>
              </form>
            </div>
          </div>
        )
      }

      {/* QR Code Modal */}
      {
        showQRModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-8 bg-secondary/80 backdrop-blur-3xl animate-in fade-in duration-500">
            <div className="w-full max-w-xl bg-surface rounded-[4.5rem] p-16 shadow-premium relative overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="absolute top-0 left-0 w-full h-4 bg-primary"></div>

              <div className="text-center mb-12">
                <div className="size-24 bg-primary-soft text-primary rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-premium">
                  <span className="material-symbols-outlined text-5xl">qr_code_2</span>
                </div>
                <h3 className="text-4xl font-black tracking-tighter text-secondary leading-none">{showQRModal.name}</h3>
                <p className="text-text-muted text-lg font-medium mt-4 leading-relaxed">
                  Código do Local: <span className="text-primary font-black">{showQRModal.id.toString().padStart(4, '0')}</span>
                </p>
              </div>

              <div className="flex flex-col items-center gap-10">
                <div className="bg-white p-8 rounded-[3rem] shadow-premium border-2 border-border/20 relative group">
                  <div className="relative">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`https://kwikfood.vercel.app?code=${showQRModal.id.toString().padStart(4, '0')}`)}`}
                      alt="QR Code"
                      className="size-64"
                    />
                    {showQRModal.logoUrl && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="size-16 bg-white p-1 rounded-xl shadow-lg border border-border/20 overflow-hidden">
                          <img src={showQRModal.logoUrl} alt="Logo" className="w-full h-full object-cover rounded-lg" />
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
                    IMPRIMIR QR CODE
                  </button>
                  <button
                    onClick={() => setShowQRModal(null)}
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
    </div >
  );
};



export default SuperAdminView;

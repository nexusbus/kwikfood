
import React, { useState, useEffect } from 'react';
import { fetchCompanies } from '../constants';
import { supabase } from '../src/lib/supabase';
import { Company } from '../types';

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
  const [id, setId] = useState('B294');
  const [lat, setLat] = useState<number | ''>('');
  const [lng, setLng] = useState<number | ''>('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [adminConfirmEmail, setAdminConfirmEmail] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    const loadCompanies = async () => {
      const data = await fetchCompanies();
      setCompanies(data);
    };
    loadCompanies();

    const channel = supabase
      .channel('companies-all-premium')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'companies' }, () => {
        loadCompanies();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lat === '' || lng === '') {
      alert('Localização GPS é obrigatória para inteligência logística.');
      return;
    }

    setLoading(true);
    try {
      const companyData = {
        id: editingCompany ? editingCompany.id : id,
        name,
        location,
        nif,
        lat,
        lng,
        email,
        password
      };

      if (editingCompany) {
        const { error } = await supabase
          .from('companies')
          .update(companyData)
          .eq('id', editingCompany.id);
        if (error) throw error;
        setEditingCompany(null);
      } else {
        const { error } = await supabase.from('companies').insert([companyData]);
        if (error) throw error;
      }

      setName(''); setNif(''); setLat(''); setLng(''); setEmail(''); setPassword('');
      setId(String.fromCharCode(65 + Math.floor(Math.random() * 26)) + Math.floor(100 + Math.random() * 900));
    } catch (err: any) {
      console.error(err);
      alert('FALHA NA SINCRONIZAÇÃO: ' + (err.message || 'Erro de rede'));
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (company: Company) => {
    setEditingCompany(company);
    setId(company.id);
    setName(company.name);
    setLocation(company.location);
    setNif(company.nif);
    setLat(company.lat);
    setLng(company.lng);
    setEmail(company.email || '');
    setPassword(company.password || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingCompany(null);
    setName(''); setNif(''); setLat(''); setLng(''); setEmail(''); setPassword('');
    setId(String.fromCharCode(65 + Math.floor(Math.random() * 26)) + Math.floor(100 + Math.random() * 900));
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
          <div>
            <h1 className="text-4xl font-black tracking-tighter text-secondary leading-none">Super Admin</h1>
            <p className="text-[10px] font-black text-primary uppercase tracking-[0.4em] mt-2">KwikFood Master Console</p>
          </div>
        </div>
        <div className="flex items-center gap-4 px-8 py-4 bg-secondary text-white rounded-full font-black text-[11px] uppercase tracking-widest shadow-premium">
          <span className="size-2 bg-green-400 rounded-full animate-pulse-soft"></span>
          Sistema Operativo
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-12 py-16 space-y-20 relative z-10">
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
                          <div className="size-20 bg-background rounded-[2.2rem] flex items-center justify-center text-secondary font-black text-3xl group-hover:bg-primary group-hover:text-white transition-all duration-700 shadow-sm border border-border">
                            {co.name.charAt(0)}
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
                        <span className="inline-block px-6 py-2.5 bg-secondary text-white rounded-full text-[12px] font-bold tracking-[0.1em] shadow-premium">
                          {co.id.slice(0, 8).toUpperCase()}
                        </span>
                      </td>
                      <td className="px-12 py-12">
                        <div className="space-y-2">
                          <p className="text-[14px] font-black text-secondary leading-none">{co.email}</p>
                          <div className="flex items-center gap-3">
                            <span className="size-2.5 bg-green-500 rounded-full animate-pulse-soft"></span>
                            <span className="text-[10px) font-black uppercase text-green-600 tracking-[0.3em]">Autenticado</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-16 py-12 text-right">
                        <div className="flex justify-end gap-5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 translate-x-10 transition-all duration-700">
                          <button onClick={() => handleEditClick(co)} className="size-16 bg-white border border-border/80 rounded-[1.5rem] flex items-center justify-center text-text-muted hover:text-secondary hover:shadow-premium transition-all">
                            <span className="material-symbols-outlined text-3xl">edit_note</span>
                          </button>
                          <button onClick={() => setShowDeleteModal(co.id)} className="size-16 bg-primary-soft rounded-[1.5rem] flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-all shadow-md">
                            <span className="material-symbols-outlined text-3xl">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {companies.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-48 text-center bg-background/20">
                        <div className="flex flex-col items-center gap-6 opacity-30">
                          <span className="material-symbols-outlined text-8xl font-thin">domain_disabled</span>
                          <h3 className="text-3xl font-black uppercase tracking-[0.5em]">Operação Deserta</h3>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      {/* Premium Delete Modal */}
      {showDeleteModal && (
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
      )}
    </div>
  );
};



export default SuperAdminView;

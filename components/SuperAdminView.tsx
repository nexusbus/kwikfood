
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
  const [newName, setNewName] = useState('');
  const [newNif, setNewNif] = useState('');
  const [newLoc, setNewLoc] = useState('Luanda');
  const [newId, setNewId] = useState('B294');
  const [newLat, setNewLat] = useState<number | ''>('');
  const [newLng, setNewLng] = useState<number | ''>('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
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
      .channel('companies-all')
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
    if (newLat === '' || newLng === '') {
      alert('Por favor, insira as coordenadas de localização.');
      return;
    }

    setLoading(true);
    try {
      const companyData = {
        id: newId,
        name: newName,
        location: newLoc,
        nif: newNif,
        lat: newLat,
        lng: newLng,
        email: newEmail,
        password: newPassword
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

      setNewName(''); setNewNif(''); setNewLat(''); setNewLng(''); setNewEmail(''); setNewPassword('');
      setNewId(String.fromCharCode(65 + Math.floor(Math.random() * 26)) + Math.floor(100 + Math.random() * 900));
    } catch (err: any) {
      console.error(err);
      alert('Erro ao processar empresa: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (company: Company) => {
    setEditingCompany(company);
    setNewId(company.id);
    setNewName(company.name);
    setNewLoc(company.location);
    setNewNif(company.nif);
    setNewLat(company.lat);
    setNewLng(company.lng);
    setNewEmail(company.email || '');
    setNewPassword(company.password || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCancelEdit = () => {
    setEditingCompany(null);
    setNewName(''); setNewNif(''); setNewLat(''); setNewLng(''); setNewEmail(''); setNewPassword('');
    setNewId(String.fromCharCode(65 + Math.floor(Math.random() * 26)) + Math.floor(100 + Math.random() * 900));
  };

  const handleSecureDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showDeleteModal) return;

    setDeleteLoading(true);
    setDeleteError(null);

    try {
      // Validate Admin Credentials
      const { data: admin, error: authError } = await supabase
        .from('super_admins')
        .select('*')
        .eq('email', adminConfirmEmail)
        .eq('password', adminConfirmPassword)
        .single();

      if (authError || !admin) {
        setDeleteError('Credenciais de administrador inválidas.');
        setDeleteLoading(false);
        return;
      }

      // Proceed with deletion
      const { error: deleteErr } = await supabase
        .from('companies')
        .delete()
        .eq('id', showDeleteModal);

      if (deleteErr) throw deleteErr;

      setShowDeleteModal(null);
      setAdminConfirmEmail('');
      setAdminConfirmPassword('');
    } catch (err: any) {
      setDeleteError(err.message || 'Erro ao excluir unidade.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleGetCurrentLocation = () => {
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setNewLat(position.coords.latitude);
        setNewLng(position.coords.longitude);
        setGeoLoading(false);
      },
      () => {
        alert("Erro ao obter localização.");
        setGeoLoading(false);
      },
      { enableHighAccuracy: true }
    );
  };

  return (
    <div className="bg-[#F8F8F8] min-h-screen font-inter pb-20">
      <header className="bg-black text-white px-8 py-6 sticky top-0 z-50 flex items-center justify-between shadow-2xl shadow-black/20">
        <div className="flex items-center gap-4">
          <div className="size-12 bg-primary text-white rounded-2xl flex items-center justify-center shadow-xl shadow-primary/20">
            <span className="material-symbols-outlined text-3xl font-black">security</span>
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tighter leading-none">KwikFood</h2>
            <p className="text-[10px] font-black text-primary uppercase tracking-[0.4em] mt-1">Global Infrastructure</p>
          </div>
        </div>
        <button
          onClick={onBack}
          className="flex items-center gap-3 px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-black text-[10px] uppercase tracking-widest transition-all border border-white/10 active:scale-95"
        >
          <span className="material-symbols-outlined text-sm">exit_to_app</span>
          Sair do Sistema
        </button>
      </header>

      <main className="max-w-[1500px] mx-auto px-8 py-16">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-10 mb-16 px-4">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full">
              <span className="size-2 bg-primary rounded-full animate-ping"></span>
              <p className="text-[10px] font-black text-primary uppercase tracking-widest">Master Control</p>
            </div>
            <h1 className="text-6xl font-black tracking-tighter text-black leading-tight">Painel de Expansão</h1>
            <p className="text-gray-400 font-medium text-lg leading-relaxed max-w-2xl">Gestão centralizada da rede KwikFood. Monitorize parceiros, ative novas unidades e controle a expansão global.</p>
          </div>
          <div className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-xl shadow-gray-200/40 text-center min-w-[240px] relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16"></div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 relative z-10">Unidades Operacionais</p>
            <p className="text-6xl font-black text-black group-hover:text-primary transition-colors relative z-10">{companies.length}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-4">
            <div className="bg-white rounded-[3.5rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.08)] p-12 border border-white sticky top-36">
              <h3 className="text-2xl font-black tracking-tight mb-10 text-black">
                {editingCompany ? 'Editar Unidade' : 'Registar Unidade'}
              </h3>

              <form onSubmit={handleRegister} className="space-y-8">
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-black uppercase tracking-[0.2em] ml-1 opacity-30">Nome da Unidade</label>
                  <input type="text" value={newName} onChange={e => setNewName(e.target.value)} className="w-full h-16 bg-gray-50 border-2 border-transparent rounded-[1.5rem] px-6 font-bold text-black focus:bg-white focus:border-primary transition-all outline-none" placeholder="Ex: Belas Shopping" required />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-black uppercase tracking-[0.2em] ml-1 opacity-30">NIF Angola</label>
                    <input type="text" value={newNif} onChange={e => setNewNif(e.target.value)} className="w-full h-16 bg-gray-50 border-2 border-transparent rounded-[1.5rem] px-6 font-bold text-black focus:bg-white focus:border-primary transition-all outline-none" placeholder="540..." required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-black uppercase tracking-[0.2em] ml-1 opacity-30">Província</label>
                    <select value={newLoc} onChange={e => setNewLoc(e.target.value)} className="w-full h-16 bg-gray-50 border-2 border-transparent rounded-[1.5rem] px-6 font-black text-[11px] uppercase tracking-widest text-black focus:bg-white focus:border-primary transition-all outline-none cursor-pointer">
                      {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-4 pt-6 border-t border-gray-50">
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-black uppercase tracking-[0.2em] ml-1 opacity-30">E-mail de Gestão</label>
                    <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} className="w-full h-16 bg-gray-50 border-2 border-transparent rounded-[1.5rem] px-6 font-bold text-black focus:bg-white focus:border-primary transition-all outline-none" placeholder="gestor@unidade.ao" required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] font-black text-black uppercase tracking-[0.2em] ml-1 opacity-30">Senha de Acesso</label>
                    <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full h-16 bg-gray-50 border-2 border-transparent rounded-[1.5rem] px-6 font-bold text-black focus:bg-white focus:border-primary transition-all outline-none" placeholder="••••••••" required />
                  </div>
                </div>

                <div className="bg-primary/5 p-8 rounded-[2.5rem] border border-primary/10">
                  <div className="flex justify-between items-center mb-6 px-1">
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm">explore</span>
                      Geolocalização
                    </p>
                    <button type="button" onClick={handleGetCurrentLocation} disabled={geoLoading} className="text-[10px] font-black text-primary hover:text-black transition-colors flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm">{geoLoading ? 'sync' : 'my_location'}</span>
                      {geoLoading ? 'A LER...' : 'GPS'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <input type="number" step="any" value={newLat} onChange={e => setNewLat(e.target.value === '' ? '' : parseFloat(e.target.value))} placeholder="Latitude" className="h-14 bg-white border-transparent rounded-2xl px-5 font-black text-xs text-center shadow-lg shadow-primary/5 focus:ring-2 ring-primary/20 outline-none" required />
                    <input type="number" step="any" value={newLng} onChange={e => setNewLng(e.target.value === '' ? '' : parseFloat(e.target.value))} placeholder="Longitude" className="h-14 bg-white border-transparent rounded-2xl px-5 font-black text-xs text-center shadow-lg shadow-primary/5 focus:ring-2 ring-primary/20 outline-none" required />
                  </div>
                </div>

                <div className="pt-6">
                  <div className="flex items-center justify-between mb-4 px-2">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Código Identificador</p>
                    <button type="button" onClick={() => setNewId(Math.random().toString(36).substring(2, 6).toUpperCase())} className="text-gray-300 hover:text-black transition-colors"><span className="material-symbols-outlined text-base">refresh</span></button>
                  </div>
                  <div className="h-24 bg-black text-white rounded-[1.5rem] flex items-center justify-center text-4xl font-black tracking-[0.6em] shadow-[0_30px_60px_-12px_rgba(0,0,0,0.3)]">
                    {newId}
                  </div>
                </div>

                <button type="submit" disabled={loading} className="w-full py-6 bg-primary text-white rounded-[1.5rem] font-black text-sm uppercase tracking-[0.2em] shadow-2xl shadow-primary/20 hover:bg-black transition-all active:scale-[0.97] mt-10">
                  {loading ? 'A PROCESSAR...' : editingCompany ? 'GUARDAR ALTERAÇÕES' : 'ATIVAR UNIDADE'}
                </button>

                {editingCompany && (
                  <button type="button" onClick={handleCancelEdit} className="w-full mt-4 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-black transition-colors">
                    Cancelar Edição
                  </button>
                )}
              </form>
            </div>
          </div>

          <div className="lg:col-span-8">
            <div className="bg-white rounded-[3.5rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.05)] border border-gray-100 overflow-hidden">
              <div className="p-12 border-b border-gray-50 flex justify-between items-center bg-white relative z-10">
                <div>
                  <h3 className="text-3xl font-black tracking-tight text-black">Rede Parceira</h3>
                  <p className="text-gray-400 text-sm font-medium mt-1">Unidades ativas na malha digital.</p>
                </div>
                <div className="bg-black text-white rounded-2xl px-6 py-3 shadow-xl">
                  <span className="text-[11px] font-black uppercase tracking-widest">{companies.length} Parceiros</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[11px] font-black text-gray-300 uppercase tracking-[0.3em]">
                      <th className="px-12 py-10 border-b border-gray-50">Local & Detalhes</th>
                      <th className="px-12 py-10 text-center border-b border-gray-50">ID</th>
                      <th className="px-12 py-10 border-b border-gray-50">Segurança</th>
                      <th className="px-12 py-10 text-right border-b border-gray-50">Acções</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {companies.map((co, idx) => (
                      <tr key={co.id} className="group hover:bg-[#FAF9F9] transition-all duration-500 relative">
                        <td className="px-12 py-10">
                          <div className="flex items-center gap-6">
                            <div className="size-16 bg-gray-50 rounded-[1.5rem] flex items-center justify-center text-black font-black text-2xl group-hover:bg-primary group-hover:text-white transition-all duration-500 shadow-sm">
                              {co.name.charAt(0)}
                            </div>
                            <div className="space-y-1">
                              <p className="text-xl font-black text-black group-hover:translate-x-1 transition-transform">{co.name}</p>
                              <div className="flex items-center gap-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                <span className="flex items-center gap-1 text-primary">
                                  <span className="material-symbols-outlined text-[14px]">location_on</span>
                                  {co.location}
                                </span>
                                <span className="opacity-20 italic">NIF: {co.nif}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-12 py-10 text-center">
                          <span className="inline-block px-5 py-2 bg-black text-white rounded-full text-[11px] font-black tracking-widest shadow-xl">
                            {co.id}
                          </span>
                        </td>
                        <td className="px-12 py-10">
                          <div className="flex flex-col gap-1">
                            <p className="text-[11px] font-black text-gray-700">{co.email}</p>
                            <div className="flex items-center gap-1.5">
                              <div className="size-2 rounded-full bg-green-500 animate-pulse"></div>
                              <span className="text-[9px] font-black uppercase text-green-600 tracking-widest">Authorized</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-12 py-10 text-right">
                          <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 translate-x-4 transition-all duration-500">
                            <button onClick={() => handleEditClick(co)} className="size-14 bg-white border border-gray-100 rounded-2xl flex items-center justify-center text-gray-400 hover:text-black hover:shadow-xl transition-all">
                              <span className="material-symbols-outlined text-2xl font-black">edit_note</span>
                            </button>
                            <button onClick={() => setShowDeleteModal(co.id)} className="size-14 bg-red-50 rounded-2xl flex items-center justify-center text-red-500 hover:bg-red-500 hover:text-white transition-all shadow-lg hover:shadow-red-500/20">
                              <span className="material-symbols-outlined text-2xl font-black">delete_forever</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {companies.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-32 text-center text-gray-300 font-black uppercase tracking-[0.4em] opacity-40">
                          Operação Deserta • Nenhum Parceiro
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-[440px] bg-white rounded-[3rem] p-12 shadow-2xl">
            <div className="text-center mb-10">
              <div className="size-20 bg-red-50 text-red-500 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
                <span className="material-symbols-outlined text-4xl">warning</span>
              </div>
              <h3 className="text-2xl font-black tracking-tight text-black">Confirmar Exclusão</h3>
              <p className="text-gray-400 text-sm font-medium mt-3 leading-relaxed">
                Esta ação é irreversível. Insira as credenciais de administrador para confirmar.
              </p>
            </div>

            <form onSubmit={handleSecureDelete} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[11px] font-black text-black uppercase tracking-[0.2em] opacity-30 ml-1">Admin E-mail</label>
                <input
                  type="email"
                  required
                  value={adminConfirmEmail}
                  onChange={e => setAdminConfirmEmail(e.target.value)}
                  className="w-full h-16 bg-gray-50 border-2 border-transparent rounded-2xl px-6 font-bold text-black focus:bg-white focus:border-red-500 transition-all outline-none"
                  placeholder="admin@kwikfood.com"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-black text-black uppercase tracking-[0.2em] opacity-30 ml-1">Admin Senha</label>
                <input
                  type="password"
                  required
                  value={adminConfirmPassword}
                  onChange={e => setAdminConfirmPassword(e.target.value)}
                  className="w-full h-16 bg-gray-50 border-2 border-transparent rounded-2xl px-6 font-bold text-black focus:bg-white focus:border-red-500 transition-all outline-none"
                  placeholder="••••••••"
                />
              </div>

              {deleteError && (
                <div className="p-4 bg-red-50 text-red-500 text-[10px] font-black rounded-xl text-center uppercase tracking-widest border border-red-100">
                  {deleteError}
                </div>
              )}

              <div className="flex flex-col gap-4 mt-8">
                <button
                  type="submit"
                  disabled={deleteLoading}
                  className="w-full py-5 bg-red-500 text-white rounded-2xl font-black text-sm tracking-[0.2em] shadow-xl shadow-red-500/20 hover:bg-black transition-all disabled:opacity-50"
                >
                  {deleteLoading ? 'A PROCESSAR...' : 'APAGAR PARA SEMPRE'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteModal(null);
                    setDeleteError(null);
                    setAdminConfirmEmail('');
                    setAdminConfirmPassword('');
                  }}
                  className="w-full py-4 text-[10px] font-black text-gray-300 uppercase tracking-widest hover:text-black transition-colors"
                >
                  Cancelar
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

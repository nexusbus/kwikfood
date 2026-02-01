
import React, { useState, useEffect } from 'react';
import { fetchCompanies, createOrder, STORE_RADIUS_METERS } from '../constants';
import { Order, OrderStatus, Company } from '../types';
import { supabase } from '../src/lib/supabase';

interface CustomerEntryViewProps {
  onJoinQueue: (order: Order) => void;
  onAdminAccess: () => void;
}

const CustomerEntryView: React.FC<CustomerEntryViewProps> = ({ onJoinQueue, onAdminAccess }) => {
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);

  useEffect(() => {
    const loadCompanies = async () => {
      try {
        const data = await fetchCompanies();
        setCompanies(data);
      } catch (err) {
        console.error('Error loading companies:', err);
      }
    };
    loadCompanies();
  }, []);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in metres
  };

  const handleJoin = async () => {
    setError(null);

    // Validation
    const company = companies.find(c => c.id.toUpperCase() === code.toUpperCase());

    if (!company) {
      setError('Código do estabelecimento inválido.');
      return;
    }

    if (phone.length < 9) {
      setError('Insira um número de telefone válido.');
      return;
    }

    setLoading(true);

    // Check Geolocation
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const dist = calculateDistance(
            position.coords.latitude,
            position.coords.longitude,
            company.lat,
            company.lng
          );

          if (dist > STORE_RADIUS_METERS && !code.startsWith('TEST')) {
            setError(`Acesso negado. Você está a ${Math.round(dist)}m. Por favor, aproxime-se do local (máx ${STORE_RADIUS_METERS}m).`);
            setLoading(false);
            return;
          }

          try {
            const newOrderData = await createOrder({
              companyId: company.id,
              customerPhone: phone,
              status: OrderStatus.RECEIVED,
              queuePosition: 1,
              estimatedMinutes: 5,
            });
            onJoinQueue(newOrderData);
          } catch (err) {
            setError('Erro ao entrar na fila. Tente novamente.');
            console.error(err);
          } finally {
            setLoading(false);
          }
        },
        (err) => {
          setError('Erro ao obter localização. Permita o acesso para confirmar sua presença no local.');
          setLoading(false);
        },
        { enableHighAccuracy: true }
      );
    } else {
      setError('Geolocalização não suportada no seu dispositivo.');
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden font-inter bg-[#F4F4F5]">
      {/* Red accent circles */}
      <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="relative z-10 w-full max-w-[480px] bg-white rounded-[2.5rem] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.1)] overflow-hidden border border-gray-100">
        <header className="px-10 py-10 flex justify-between items-center border-b border-gray-50">
          <div className="flex items-center gap-4">
            <div className="size-14 bg-primary rounded-2xl flex items-center justify-center text-white shadow-xl shadow-primary/20">
              <span className="material-symbols-outlined text-4xl">restaurant_menu</span>
            </div>
            <div>
              <h2 className="text-3xl font-black text-black tracking-tighter">KwikFood</h2>
              <p className="text-[10px] text-primary font-black uppercase tracking-[0.3em] mt-1">Smart Queue System</p>
            </div>
          </div>
          <button
            onClick={onAdminAccess}
            className="flex items-center gap-2 px-5 py-2.5 bg-gray-50 hover:bg-black hover:text-white rounded-full text-[10px] font-black text-gray-400 uppercase tracking-widest transition-all border border-gray-100"
          >
            <span className="material-symbols-outlined text-sm">admin_panel_settings</span>
            ADMIN
          </button>
        </header>

        <div className="p-10 flex flex-col gap-10">
          <div className="space-y-3">
            <h1 className="text-4xl font-black text-black tracking-tight">O Fim das Filas.</h1>
            <p className="text-gray-400 font-medium leading-relaxed">
              Junte-se à fila digital em segundos e aguarde onde preferir. O seu tempo é valioso.
            </p>
          </div>

          <div className="space-y-8">
            <div className="space-y-3">
              <label className="block text-[11px] font-black text-black uppercase tracking-[0.2em] ml-1 opacity-40">Onde você está?</label>
              <div className="relative group">
                <input
                  type="text"
                  maxLength={4}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="w-full h-24 bg-gray-50 border-2 border-gray-100 rounded-[1.5rem] text-4xl font-black tracking-[0.5em] text-center text-black focus:ring-primary focus:border-primary focus:bg-white transition-all outline-none"
                  placeholder="CODE"
                />
                <div className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-200 group-focus-within:text-primary transition-colors">
                  <span className="material-symbols-outlined text-3xl">meeting_room</span>
                </div>
              </div>
              <p className="text-[10px] text-gray-300 font-bold uppercase tracking-widest ml-1">Ex: L402, F210 • Procure o código no balcão</p>
            </div>

            <div className="space-y-3">
              <label className="block text-[11px] font-black text-black uppercase tracking-[0.2em] ml-1 opacity-40">Seu Telemóvel</label>
              <div className="flex gap-3">
                <div className="flex items-center px-6 bg-black text-white rounded-[1.5rem] font-black text-lg">
                  +244
                </div>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  className="flex-1 h-20 bg-gray-50 border-2 border-gray-100 rounded-[1.5rem] px-8 text-xl font-bold text-black focus:ring-primary focus:border-primary focus:bg-white transition-all outline-none"
                  placeholder="9XX XXX XXX"
                />
              </div>
            </div>

            {error && (
              <div className="p-6 bg-red-50 border border-red-100 rounded-3xl flex items-center gap-4 text-primary text-sm font-black animate-shake">
                <span className="material-symbols-outlined text-2xl">error</span>
                <span className="leading-tight uppercase text-[11px] tracking-wider">{error}</span>
              </div>
            )}

            <button
              onClick={handleJoin}
              disabled={loading}
              className="group relative w-full h-24 bg-primary hover:bg-black text-white rounded-[1.5rem] font-black text-lg shadow-2xl shadow-primary/20 active:scale-[0.97] transition-all flex items-center justify-center gap-4 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
              {loading ? (
                <div className="size-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <span>ENTRAR NA FILA AGORA</span>
                  <span className="material-symbols-outlined text-2xl group-hover:translate-x-2 transition-transform">bolt</span>
                </>
              )}
            </button>
          </div>

          <div className="pt-8 border-t border-gray-50 text-center">
            <p className="text-[10px] text-gray-300 leading-relaxed font-bold uppercase tracking-[0.15em]">
              KwikFood Angola • Luanda • 2024<br />
              <span className="opacity-50">Notificações inteligentes via SMS</span>
            </p>
          </div>
        </div>
      </div>

      <footer className="fixed bottom-12 left-0 w-full flex flex-col items-center gap-5 pointer-events-none opacity-20">
        <div className="h-px w-24 bg-black/10"></div>
        <p className="text-black text-[10px] tracking-[0.5em] uppercase font-black">
          PREMIUM SERVICE
        </p>
      </footer>
    </div>
  );
};

export default CustomerEntryView;

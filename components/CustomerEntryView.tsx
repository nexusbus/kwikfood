
import React, { useState, useEffect } from 'react';
import { fetchCompanies, createOrder, STORE_RADIUS_METERS } from '../constants';
import { Order, OrderStatus, Company } from '../types';
import { supabase } from '../src/lib/supabase';

interface CustomerEntryViewProps {
  companies: Company[];
  onJoinQueue: (order: Order) => void;
  onAdminAccess: () => void;
}

const CustomerEntryView: React.FC<CustomerEntryViewProps> = ({ companies, onJoinQueue, onAdminAccess }) => {
  const [code, setCode] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
          } catch (err: any) {
            const errorMsg = err.message || err.details || 'Erro desconhecido';
            setError(`Falha ao entrar: ${errorMsg}`);
            console.error('Queue Entry Error Details:', err);
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
    <div className="relative min-h-screen flex items-center justify-center p-6 overflow-hidden bg-background">
      {/* Decorative Elements */}
      <div className="fixed top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[120px] pointer-events-none animate-pulse-soft"></div>
      <div className="fixed bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[120px] pointer-events-none animate-pulse-soft" style={{ animationDelay: '1s' }}></div>

      <div className="relative z-10 w-full max-w-[500px] animate-fade-in">
        <div className="bg-surface rounded-[3.5rem] shadow-premium overflow-hidden border border-white/40 glass">
          <header className="px-12 py-12 flex justify-between items-center border-b border-border/50">
            <div className="flex items-center gap-5">
              <div className="size-16 bg-primary rounded-[1.8rem] flex items-center justify-center text-white shadow-lg shadow-primary/30 transform hover:rotate-12 transition-transform duration-500">
                <span className="material-symbols-outlined text-4xl">restaurant_menu</span>
              </div>
              <div>
                <h2 className="text-4xl font-black text-secondary tracking-tighter leading-none">KwikFood</h2>
                <p className="text-[10px] text-primary font-black uppercase tracking-[0.4em] mt-2">Smart Queue</p>
              </div>
            </div>
            <button
              onClick={onAdminAccess}
              className="flex items-center gap-2 px-6 py-3 bg-secondary/5 hover:bg-secondary hover:text-white rounded-full text-[10px] font-black text-secondary/40 uppercase tracking-widest transition-all"
            >
              <span className="material-symbols-outlined text-sm">admin_panel_settings</span>
              ADMIN
            </button>
          </header>

          <div className="p-12 space-y-12">
            <div className="space-y-4">
              <h1 className="text-5xl font-black text-secondary tracking-tight leading-[1.1]">Diga adeus às <span className="text-primary">filas.</span></h1>
              <p className="text-text-muted font-medium leading-relaxed text-lg">
                Junte-se à fila digital em segundos. Seu tempo vale muito.
              </p>
            </div>

            <div className="space-y-10">
              <div className="space-y-4 group">
                <label className="block text-[11px] font-black text-secondary uppercase tracking-[0.2em] ml-2 opacity-50">Código do Local</label>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={4}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    className="w-full h-28 bg-background border-2 border-border/50 rounded-[2rem] text-5xl font-black tracking-[0.4em] text-center text-secondary focus:border-primary focus:bg-white transition-all outline-none shadow-sm"
                    placeholder="CODE"
                  />
                  <div className="absolute right-10 top-1/2 -translate-y-1/2 text-border group-focus-within:text-primary transition-colors">
                    <span className="material-symbols-outlined text-4xl">pin_drop</span>
                  </div>
                </div>
                <p className="text-[10px] text-text-muted font-bold uppercase tracking-widest ml-2 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">info</span>
                  Procure o código de 4 dígitos no balcão
                </p>
              </div>

              <div className="space-y-4">
                <label className="block text-[11px] font-black text-secondary uppercase tracking-[0.2em] ml-2 opacity-50">Seu Telemóvel</label>
                <div className="flex gap-4">
                  <div className="flex items-center px-8 bg-secondary text-white rounded-[2rem] font-black text-xl shadow-lg">
                    +244
                  </div>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    className="flex-1 h-24 bg-background border-2 border-border/50 rounded-[2rem] px-10 text-2xl font-black text-secondary focus:border-primary focus:bg-white transition-all outline-none shadow-sm"
                    placeholder="9XX XXX XXX"
                  />
                </div>
              </div>

              {error && (
                <div className="p-8 bg-primary/5 border border-primary/10 rounded-[2rem] flex items-center gap-5 text-primary animate-shake">
                  <span className="material-symbols-outlined text-3xl font-black">error</span>
                  <div className="flex flex-col gap-1">
                    <p className="font-black uppercase text-[12px] tracking-wider leading-tight">Erro no Sistema</p>
                    <p className="text-[10px] font-bold opacity-70 break-all">{error}</p>
                  </div>
                </div>
              )}

              <button
                onClick={handleJoin}
                disabled={loading}
                className="group relative w-full h-28 bg-primary hover:bg-primary-dark text-white rounded-[2.2rem] font-black text-xl shadow-premium active:scale-[0.96] transition-all flex items-center justify-center gap-5 disabled:opacity-50 overflow-hidden"
              >
                <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-700 skew-x-12"></div>
                {loading ? (
                  <div className="size-10 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span>ENTRAR NA FILA</span>
                    <span className="material-symbols-outlined text-3xl group-hover:translate-x-3 transition-transform duration-500">bolt</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <footer className="px-12 py-10 bg-secondary/5 text-center">
            <p className="text-[10px] text-secondary/30 leading-relaxed font-black uppercase tracking-[0.3em]">
              KwikFood Angola &copy; 2024<br />
              <span className="text-primary/40">Premium Queue System</span>
            </p>
          </footer>
        </div>
      </div>
    </div>
  );
};

export default CustomerEntryView;

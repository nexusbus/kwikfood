
import React, { useState, useEffect, useRef } from 'react';
import { createOrder, STORE_RADIUS_METERS } from '../constants';
import { Order, OrderStatus, Company } from '../types';
import { supabase } from '../src/lib/supabase';
import Logo from './Logo';

interface CustomerEntryViewProps {
  companies: Company[];
  onJoinQueue: (order: Order) => void;
  onAdminAccess: () => void;
}

const CustomerEntryView: React.FC<CustomerEntryViewProps> = ({ companies, onJoinQueue, onAdminAccess }) => {
  const [code, setCode] = useState(['', '', '', '']);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const codeRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlCode = urlParams.get('code');
    if (urlCode && urlCode.length === 4) {
      setCode(urlCode.split(''));
    }
  }, []);

  const handleCodeChange = (index: number, value: string) => {
    if (value.length > 1) value = value[0];
    const newCode = [...code];
    newCode[index] = value.replace(/\D/g, '');
    setCode(newCode);

    // Auto-focus next
    if (value && index < 3) {
      codeRefs[index + 1].current?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      codeRefs[index - 1].current?.focus();
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) *
      Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  useEffect(() => {
    const checkCustomer = async () => {
      if (phone.length === 0) {
        setCustomerName('');
        setIsNewCustomer(false);
        return;
      }

      if (phone.length === 9) {
        const { data, error } = await supabase
          .from('customers')
          .select('name')
          .eq('phone', phone)
          .maybeSingle();

        if (data) {
          setCustomerName(data.name);
          setIsNewCustomer(false);
        } else {
          setCustomerName('');
          setIsNewCustomer(true);
        }
      } else {
        // Enquanto digita ou apaga, não mostramos o campo de nome
        // e limpamos qualquer nome previamente carregado para privacidade
        setCustomerName('');
        setIsNewCustomer(false);
      }
    };
    checkCustomer();
  }, [phone]);

  const handleJoin = async () => {
    setError(null);
    const fullCode = code.join('');

    if (fullCode.length < 4) {
      setError('Por favor, insira o código completo de 4 dígitos.');
      return;
    }

    const company = companies.find(c => c.id.toString().padStart(4, '0') === fullCode.padStart(4, '0'));

    if (!company) {
      setError('Código do estabelecimento inválido.');
      return;
    }

    if (phone.length < 9) {
      setError('Insira um número de telefone válido.');
      return;
    }

    if (!termsAccepted) {
      setError('É necessário aceitar os Termos e Condições.');
      return;
    }

    setLoading(true);

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const dist = calculateDistance(
            position.coords.latitude,
            position.coords.longitude,
            company.lat,
            company.lng
          );

          if (dist > STORE_RADIUS_METERS && !fullCode.startsWith('TEST')) {
            setError(`Acesso negado. Está a ${Math.round(dist)}m do local. Aproxime-se para entrar na fila.`);
            setLoading(false);
            return;
          }

          try {
            const { data: existingOrder } = await supabase
              .from('orders')
              .select('*')
              .eq('company_id', company.id)
              .eq('customer_phone', phone)
              .in('status', [OrderStatus.RECEIVED, OrderStatus.PREPARING, OrderStatus.READY])
              .maybeSingle();

            if (existingOrder) {
              onJoinQueue({
                id: existingOrder.id,
                companyId: existingOrder.company_id,
                customerPhone: existingOrder.customer_phone,
                status: existingOrder.status as OrderStatus,
                queuePosition: existingOrder.queue_position,
                estimatedMinutes: existingOrder.estimated_minutes,
                ticketCode: existingOrder.ticket_code,
                ticketNumber: existingOrder.ticket_number,
                timestamp: existingOrder.created_at,
                items: existingOrder.items || [],
                total: existingOrder.total || 0,
                customerName: existingOrder.customer_name,
                timerAccumulatedSeconds: existingOrder.timer_accumulated_seconds || 0,
                timerLastStartedAt: existingOrder.timer_last_started_at
              });
              return;
            }

            const newOrderData = await createOrder({
              companyId: company.id,
              customerPhone: phone,
              customerName: customerName,
              status: OrderStatus.PENDING,
              queuePosition: 1,
              estimatedMinutes: 5,
            });

            // Save customer name if new
            if (isNewCustomer && customerName.trim()) {
              await supabase.from('customers').upsert({
                phone: phone,
                name: customerName.trim()
              });
            }

            onJoinQueue(newOrderData);
          } catch (err: any) {
            setError(`Erro ao entrar: ${err.message || 'Falha na ligação'}`);
          } finally {
            setLoading(false);
          }
        },
        () => {
          setError('Permita o acesso à localização para confirmar sua presença no local.');
          setLoading(false);
        },
        { enableHighAccuracy: true }
      );
    } else {
      setError('Geolocalização não suportada.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFCFD] flex flex-col font-sans selection:bg-primary/20 overflow-x-hidden">
      {/* Header */}
      <header className="w-full max-w-5xl mx-auto px-6 py-6 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Logo variant="icon" size={32} />
          <span className="text-xl font-black tracking-tight text-[#111111]">Kwikfood</span>
        </div>
        <button
          onClick={onAdminAccess}
          className="px-6 py-2 border-2 border-[#E31B44]/10 rounded-2xl text-[11px] font-black text-primary uppercase tracking-widest hover:bg-primary/5 transition-all shadow-sm active:scale-95"
        >
          ADMIN
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-[440px] mx-auto px-6 py-8 flex flex-col items-center">
        {/* Logo Icon */}
        <div className="mb-8">
          <Logo variant="icon" size={64} />
        </div>

        {/* Hero Text */}
        <div className="text-center mb-12 space-y-4">
          <h1 className="text-4xl font-black text-[#111111] leading-tight">
            Sua comida favorita,<br />
            <span className="text-primary text-gradient">sem filas, sem stress.</span>
          </h1>
          <p className="text-[#555555] font-medium text-base leading-relaxed">
            Junte-se à nossa fila digital premium e acompanhe o seu pedido em tempo real.
          </p>
        </div>

        {/* Form Card */}
        <div className="w-full bg-white rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.06)] border border-[#F5F5F5] p-8 space-y-10">
          {/* Local Code Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-primary text-xl">pin</span>
              <label className="text-[11px] font-black text-[#111111] uppercase tracking-widest">Código do Local</label>
            </div>
            <div className="flex justify-between gap-3">
              {code.map((digit, i) => (
                <input
                  key={i}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleCodeChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  ref={codeRefs[i]}
                  className="w-full h-16 bg-[#F8F9FA] border-none rounded-2xl text-2xl font-black text-center text-[#111111] focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                  placeholder="•"
                />
              ))}
            </div>
          </div>

          {/* Phone Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-primary text-xl">smartphone</span>
              <label className="text-[11px] font-black text-[#111111] uppercase tracking-widest">Seu Telemóvel</label>
            </div>
            <div className="flex items-center bg-[#F8F9FA] rounded-2xl p-2 h-16">
              <div className="flex items-center gap-3 px-4 border-r border-[#E0E0E0]">
                <span className="text-lg">🇦🇴</span>
                <span className="text-base font-black text-[#111111]">+244</span>
              </div>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                className="flex-1 bg-transparent border-none px-5 text-base font-black text-[#111111] focus:ring-0 outline-none placeholder:text-[#BBBBBB]"
                placeholder="9XX XXX XXX"
              />
            </div>
          </div>

          {/* Customer Name Section (Conditional) */}
          {isNewCustomer && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-primary text-xl">person</span>
                <label className="text-[11px] font-black text-[#111111] uppercase tracking-widest">Pedido em nome de...</label>
              </div>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full h-16 bg-[#F8F9FA] border-none rounded-2xl px-6 text-base font-black text-[#111111] focus:ring-2 focus:ring-primary/20 transition-all outline-none placeholder:text-[#BBBBBB]"
                placeholder="Introduza o seu nome"
                required
              />
            </div>
          )}

          {/* Terms Checkbox */}
          <label className="flex items-center gap-4 cursor-pointer group">
            <div className="relative">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="sr-only"
              />
              <div className={`size-6 rounded-lg border-2 transition-all flex items-center justify-center ${termsAccepted ? 'bg-primary border-primary' : 'border-[#E0E0E0] group-hover:border-primary/50'}`}>
                {termsAccepted && <span className="material-symbols-outlined text-white text-base font-black">check</span>}
              </div>
            </div>
            <span className="text-xs font-bold text-[#555555]">
              Li e aceito os <span className="text-primary">Termos e Condições</span>
            </span>
          </label>

          {/* Action Button */}
          <button
            onClick={handleJoin}
            disabled={loading || code.some(d => !d) || phone.length < 9 || !termsAccepted}
            className="w-full h-16 bg-primary hover:bg-primary/95 text-white rounded-2xl font-black text-[13px] uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-40 disabled:grayscale-[0.5] disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="size-6 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <>
                ENTRAR NA FILA
                <span className="material-symbols-outlined text-xl">chevron_right</span>
              </>
            )}
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="w-full mt-6 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 animate-shake">
            <span className="material-symbols-outlined text-primary text-xl mt-0.5">error</span>
            <p className="text-[11px] font-bold text-primary leading-relaxed uppercase">{error}</p>
          </div>
        )}

        {/* SMS Info Box */}
        <div className="w-full mt-8 p-6 bg-red-50/30 rounded-[2rem] flex items-start gap-4">
          <div className="size-8 bg-primary rounded-full flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-white text-base">info</span>
          </div>
          <p className="text-[#555555] text-[12px] font-medium leading-relaxed">
            Iremos enviar-lhe uma notificação via SMS assim que o seu pedido estiver quase pronto.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-12 text-center space-y-4">
        <p className="text-[10px] font-black text-primary uppercase tracking-[0.4em]">PREMIUM QUEUE SYSTEM</p>
        <p className="text-[10px] text-[#555555] font-bold">
          © {new Date().getFullYear()} <span className="text-primary">KwikFood Angola</span>.<br />
          Todos os direitos reservados.
        </p>
      </footer>
    </div>
  );
};

export default CustomerEntryView;

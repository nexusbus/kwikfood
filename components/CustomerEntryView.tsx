
import React, { useState, useEffect, useRef } from 'react';
import { createOrder, STORE_RADIUS_METERS } from '../constants';
import { Order, OrderStatus, Company, OrderType } from '../types';
import { supabase } from '../src/lib/supabase';
import Logo from './Logo';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface CustomerEntryViewProps {
  companies: Company[];
  onJoinQueue: (order: Order) => void;
  onAdminAccess: () => void;
  onShowTerms: () => void;
}

const CustomerEntryView: React.FC<CustomerEntryViewProps> = ({ companies, onJoinQueue, onAdminAccess, onShowTerms }) => {
  const [code, setCode] = useState(['', '', '', '']);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [matchedCompany, setMatchedCompany] = useState<Company | null>(null);
  const [selectedOrderType, setSelectedOrderType] = useState<OrderType | null>(null);
  const [isCheckingActiveOrder, setIsCheckingActiveOrder] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCoords, setDeliveryCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isCapturingLocation, setIsCapturingLocation] = useState(false);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [companySearch, setCompanySearch] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const codeRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlCode = urlParams.get('code');
    if (urlCode && urlCode.length === 4) {
      setCode(urlCode.split(''));
    }
  }, []);

  useEffect(() => {
    const fullCode = code.join('');
    if (fullCode.length > 0) {
      const company = companies.find(c => c.id.toString().padStart(4, '0') === fullCode.padStart(4, '0'));
      setMatchedCompany(company || null);
    } else {
      setMatchedCompany(null);
    }
  }, [code, companies]);

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

  const startScanner = () => {
    setShowScanner(true);
    setTimeout(() => {
      scannerRef.current = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
      );
      scannerRef.current.render(onScanSuccess, onScanFailure);
    }, 100);
  };

  const onScanSuccess = (decodedText: string) => {
    try {
      const url = new URL(decodedText);
      const urlCode = url.searchParams.get('code');
      if (urlCode && urlCode.length === 4) {
        setCode(urlCode.split(''));
        stopScanner();
      } else {
        setError('QR Code inválido. Certifique-se de que é um QR Code do KwikFood.');
      }
    } catch (e) {
      if (decodedText.length === 4 && /^\d+$/.test(decodedText)) {
        setCode(decodedText.split(''));
        stopScanner();
      } else {
        setError('QR Code inválido.');
      }
    }
  };

  const onScanFailure = (error: any) => {
    // console.warn(`QR error: ${error}`);
  };

  const stopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.clear().catch(err => console.error("Failed to clear scanner", err));
      scannerRef.current = null;
    }
    setShowScanner(false);
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

  useEffect(() => {
    const checkActiveOrder = async () => {
      if (phone.length === 9 && matchedCompany) {
        setIsCheckingActiveOrder(true);
        const { data: existingOrder } = await supabase
          .from('orders')
          .select('*')
          .eq('company_id', matchedCompany.id)
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
            timerLastStartedAt: existingOrder.timer_last_started_at,
            orderType: existingOrder.order_type as OrderType
          });
        }
        setIsCheckingActiveOrder(false);
      }
    };
    checkActiveOrder();
  }, [phone, matchedCompany]);

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

    if (selectedOrderType === OrderType.DELIVERY && !deliveryAddress.trim() && !deliveryCoords) {
      setError('Por favor, forneça o seu endereço ou partilhe a sua localização para a entrega.');
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

          if (selectedOrderType !== OrderType.DELIVERY && dist > STORE_RADIUS_METERS && !fullCode.startsWith('TEST')) {
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
              orderType: selectedOrderType as OrderType,
              deliveryAddress: deliveryAddress,
              deliveryCoords: deliveryCoords || undefined
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

  const handleSelectCompany = (companyId: number) => {
    const codeStr = companyId.toString().padStart(4, '0');
    setCode(codeStr.split(''));
    setShowCompanyModal(false);
    setCompanySearch('');
  };

  const filteredCompanies = companies.filter(c =>
    c.name.toLowerCase().includes(companySearch.toLowerCase()) ||
    c.id.toString().includes(companySearch)
  );

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

        {/* Dynamic Company Logo & Name */}
        {matchedCompany && (
          <div className="mb-10 flex flex-col items-center animate-fade-in text-center">
            {matchedCompany.logoUrl ? (
              <div className="size-24 rounded-3xl overflow-hidden shadow-xl shadow-primary/10 border-4 border-white mb-4 bg-white">
                <img
                  src={matchedCompany.logoUrl}
                  alt={matchedCompany.name}
                  className="size-full object-cover"
                />
              </div>
            ) : (
              <div className="size-24 rounded-3xl bg-primary/5 flex items-center justify-center mb-4 border-4 border-white shadow-xl shadow-primary/5">
                <span className="material-symbols-outlined text-4xl text-primary">store</span>
              </div>
            )}
            <h2 className="text-2xl font-black text-[#111111] tracking-tight truncate max-w-full px-4">
              {matchedCompany.name}
            </h2>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="size-1.5 bg-green-500 rounded-full animate-pulse"></span>
              <span className="text-[10px] font-black text-[#BBBBBB] uppercase tracking-[0.2em]">Estabelecimento Conectado</span>
            </div>
          </div>
        )}

        {/* Form Card */}
        <div className="w-full bg-white rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.06)] border border-[#F5F5F5] p-8 space-y-10">
          {/* Local Selection & QR Code Section */}
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-xl">pin</span>
                  <label className="text-[11px] font-black text-[#111111] uppercase tracking-widest">Código do Local</label>
                </div>
                <div className="flex justify-between gap-2">
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
                      className="w-full h-14 bg-[#F8F9FA] border-none rounded-xl text-xl font-black text-center text-[#111111] focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                      placeholder="•"
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[11px] font-black text-[#111111] uppercase tracking-widest block ml-1">Entrada Rápida</label>
                <button
                  type="button"
                  onClick={startScanner}
                  className="w-full h-14 bg-primary text-white rounded-xl flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-widest hover:bg-secondary transition-all shadow-lg shadow-primary/10 active:scale-[0.98]"
                >
                  <span className="material-symbols-outlined text-xl">qr_code_scanner</span>
                  Ler QR Code
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowCompanyModal(true)}
                className="w-full h-14 bg-[#F8F9FA] border border-slate-100 rounded-xl flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-widest text-[#555555] hover:text-primary transition-all active:scale-[0.98]"
              >
                <span className="material-symbols-outlined text-xl">map</span>
                Listar Todos os Locais
              </button>
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

          {/* Order Type Selection - Moved immediately after user data */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-primary text-xl">restaurant_menu</span>
              <label className="text-[11px] font-black text-[#111111] uppercase tracking-widest">Como vai querer o seu pedido?</label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setSelectedOrderType(selectedOrderType === OrderType.EAT_IN ? null : OrderType.EAT_IN)}
                className={`flex flex-col items-center justify-center p-4 rounded-[1.5rem] border-2 transition-all group ${selectedOrderType === OrderType.EAT_IN ? 'bg-white border-primary shadow-lg shadow-primary/10 scale-[1.02]' : 'bg-white border-[#EEEEEE] text-[#111111] hover:bg-primary/5 hover:border-primary/30'}`}
              >
                <span className="material-symbols-outlined text-4xl mb-2 text-[#E11D48] font-light">restaurant</span>
                <span className="text-[9px] font-black uppercase tracking-widest leading-tight text-center text-[#111111]">Vou comer<br />aqui</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedOrderType(selectedOrderType === OrderType.TAKE_AWAY ? null : OrderType.TAKE_AWAY)}
                className={`flex flex-col items-center justify-center p-4 rounded-[1.5rem] border-2 transition-all group ${selectedOrderType === OrderType.TAKE_AWAY ? 'bg-white border-primary shadow-lg shadow-primary/10 scale-[1.02]' : 'bg-white border-[#EEEEEE] text-[#111111] hover:bg-primary/5 hover:border-primary/30'}`}
              >
                <span className="material-symbols-outlined text-4xl mb-2 text-[#E11D48] font-light">local_mall</span>
                <span className="text-[9px] font-black uppercase tracking-widest leading-tight text-center text-[#111111]">Vou<br />levar</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedOrderType(selectedOrderType === OrderType.DELIVERY ? null : OrderType.DELIVERY)}
                className={`flex flex-col items-center justify-center p-4 rounded-[1.5rem] border-2 transition-all group ${selectedOrderType === OrderType.DELIVERY ? 'bg-white border-primary shadow-lg shadow-primary/10 scale-[1.02]' : 'bg-white border-[#EEEEEE] text-[#111111] hover:bg-primary/5 hover:border-primary/30'}`}
              >
                <span className="material-symbols-outlined text-4xl mb-2 text-[#E11D48] font-light">delivery_dining</span>
                <span className="text-[9px] font-black uppercase tracking-widest leading-tight text-center text-[#111111]">Entrega-me</span>
              </button>
            </div>
          </div>

          {/* Delivery Details */}
          {selectedOrderType === OrderType.DELIVERY && (
            <div className="space-y-4 pt-4 animate-scale-in">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-primary text-xl">location_on</span>
                <label className="text-[11px] font-black text-[#111111] uppercase tracking-widest">Onde devemos entregar?</label>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsCapturingLocation(true);
                    if ("geolocation" in navigator) {
                      navigator.geolocation.getCurrentPosition(
                        (pos) => {
                          setDeliveryCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                          setIsCapturingLocation(false);
                          setError(null);
                        },
                        () => {
                          setError('Não foi possível obter sua localização. Por favor, digite o endereço manualmente.');
                          setIsCapturingLocation(false);
                        }
                      );
                    }
                  }}
                  className={`w-full py-4 rounded-xl border-2 transition-all flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-widest ${deliveryCoords ? 'bg-green-50 border-green-200 text-green-600' : 'bg-white border-[#EEEEEE] text-[#555555] hover:bg-primary/5 hover:border-primary/30'}`}
                >
                  <span className="material-symbols-outlined text-lg">
                    {deliveryCoords ? 'check_circle' : 'my_location'}
                  </span>
                  {isCapturingLocation ? 'Capturando...' : deliveryCoords ? 'Localização Capturada' : 'Partilhar localização actual'}
                </button>

                <div className="relative">
                  <textarea
                    rows={2}
                    placeholder="Ou digite o endereço completo aqui..."
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    className="w-full bg-white border-2 border-[#EEEEEE] rounded-xl px-5 py-4 text-sm font-bold placeholder:text-[#BBBBBB] focus:border-primary/30 transition-all resize-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Terms Checkbox */}
          <label className="flex items-center gap-4 cursor-pointer group pt-4">
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
              Li e aceito os <button type="button" onClick={(e) => { e.preventDefault(); onShowTerms(); }} className="text-primary hover:underline underline-offset-4 font-black">Termos e Condições</button>
            </span>
          </label>

          {/* Action Button */}
          {matchedCompany && matchedCompany.isAcceptingOrders === false ? (
            <div className="w-full p-6 bg-red-50 border border-red-100 rounded-2xl text-center">
              <p className="text-primary font-black uppercase text-xs tracking-widest">
                Estamos temporariamente indisponíveis para pedidos pelo Kwikfood.
              </p>
            </div>
          ) : (
            selectedOrderType && (
              <button
                onClick={handleJoin}
                disabled={loading || code.some(d => !d) || phone.length < 9 || !termsAccepted || isCheckingActiveOrder}
                className="w-full h-16 bg-primary hover:bg-primary/95 text-white rounded-2xl font-black text-[13px] uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-40 disabled:grayscale-[0.5] disabled:cursor-not-allowed"
              >
                {loading || isCheckingActiveOrder ? (
                  <div className="size-6 border-3 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <>
                    ENTRAR NA FILA
                    <span className="material-symbols-outlined text-xl">chevron_right</span>
                  </>
                )}
              </button>
            )
          )}
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
          <br />
          <button onClick={onShowTerms} className="mt-4 text-[9px] font-black text-secondary hover:text-primary uppercase tracking-[0.2em] transition-colors">
            Privacidade & Termos Legais
          </button>
        </p>
      </footer>

      {/* Company Selection Modal */}
      {showCompanyModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 animate-fade-in">
          <div className="absolute inset-0 bg-secondary/40 backdrop-blur-md" onClick={() => setShowCompanyModal(false)}></div>

          <div className="bg-white w-full max-w-[600px] rounded-[3.5rem] shadow-premium relative z-10 overflow-hidden animate-scale-in flex flex-col max-h-[90vh]">
            <header className="p-10 border-b border-border/10 flex flex-col gap-6">
              <div className="flex justify-between items-center">
                <h3 className="text-3xl font-black text-secondary tracking-tight">Seleção de Local</h3>
                <button
                  onClick={() => setShowCompanyModal(false)}
                  className="size-12 rounded-2xl bg-background hover:bg-primary/10 text-text-muted hover:text-primary transition-all flex items-center justify-center"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="relative group">
                <span className="material-symbols-outlined absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-primary transition-colors">search</span>
                <input
                  type="text"
                  placeholder="Pesquisar por nome ou código..."
                  value={companySearch}
                  onChange={(e) => setCompanySearch(e.target.value)}
                  className="w-full h-16 bg-[#F8F9FA] border-2 border-border/20 rounded-2xl pl-16 pr-6 font-bold text-secondary outline-none focus:border-primary transition-all"
                />
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                {filteredCompanies.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => handleSelectCompany(c.id)}
                    className="flex flex-col items-center gap-4 p-5 rounded-[2rem] border-2 border-transparent hover:border-primary/20 hover:bg-primary/5 transition-all group"
                  >
                    <div className="size-20 bg-background rounded-[1.5rem] overflow-hidden shadow-sm group-hover:shadow-md transition-all flex items-center justify-center p-1 border border-border/10">
                      {c.logoUrl ? (
                        <img src={c.logoUrl} alt={c.name} className="size-full object-cover rounded-xl" />
                      ) : (
                        <span className="material-symbols-outlined text-3xl text-slate-300">store</span>
                      )}
                    </div>
                    <div className="text-center">
                      <p className="text-[11px] font-black text-secondary leading-tight truncate w-full max-w-[100px]">{c.name}</p>
                      <p className="text-[9px] font-bold text-primary mt-1">#{c.id.toString().padStart(4, '0')}</p>
                    </div>
                  </button>
                ))}
              </div>

              {filteredCompanies.length === 0 && (
                <div className="py-20 text-center">
                  <span className="material-symbols-outlined text-6xl text-slate-200 mb-4">search_off</span>
                  <p className="font-black text-text-muted/60 uppercase tracking-widest text-xs">Nenhum local encontrado</p>
                </div>
              )}
            </div>

            <footer className="p-8 bg-[#F8F9FA] text-center">
              <p className="text-[10px] font-black text-text-muted/40 uppercase tracking-widest">&copy; Kwikfood Rede de Parceiros</p>
            </footer>
          </div>
        </main>
      {/* QR Scanner Modal */}
      {showScanner && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 animate-fade-in">
          <div className="absolute inset-0 bg-secondary/80 backdrop-blur-md" onClick={stopScanner}></div>
          <div className="bg-white w-full max-w-[500px] rounded-[3rem] shadow-premium relative z-10 overflow-hidden animate-scale-in">
            <header className="p-8 border-b border-border/10 flex justify-between items-center bg-white">
              <div>
                <h3 className="text-2xl font-black text-secondary tracking-tight">Scanner QR Code</h3>
                <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mt-1">Aponte para o QR Code do local</p>
              </div>
              <button
                onClick={stopScanner}
                className="size-12 rounded-2xl bg-background hover:bg-primary/10 text-text-muted hover:text-primary transition-all flex items-center justify-center"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </header>

            <div className="p-8 bg-slate-50">
              <div id="reader" className="overflow-hidden rounded-2xl border-4 border-white shadow-inner bg-black aspect-square"></div>
              <div className="mt-8 text-center space-y-4">
                <div className="flex items-center justify-center gap-2 text-primary animate-pulse">
                  <span className="material-symbols-outlined text-xl">sensors</span>
                  <span className="text-[11px] font-black uppercase tracking-widest">A aguardar leitura...</span>
                </div>
                <p className="text-xs text-text-muted font-medium px-8">
                  Posicione o QR Code dentro do quadrado para entrar automaticamente na fila do estabelecimento.
                </p>
              </div>
            </div>

            <footer className="p-8 bg-white border-t border-border/5 border-dashed text-center">
              <p className="text-[9px] font-black text-text-muted/40 uppercase tracking-widest">Kwikfood Scanner Intelligence</p>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerEntryView;

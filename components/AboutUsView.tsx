import React, { useEffect } from 'react';
import Logo from './Logo';

interface AboutUsViewProps {
  onBack: () => void;
}

const AboutUsView: React.FC<AboutUsViewProps> = ({ onBack }) => {
  useEffect(() => {
    const handleAnchorClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const href = target.getAttribute('href');
      if (href && href.startsWith('#')) {
        e.preventDefault();
        const id = href.substring(1);
        const element = document.getElementById(id);
        if (element) {
          window.scrollTo({
            top: element.offsetTop - 80, // Offset for fixed navbar
            behavior: 'smooth'
          });
        }
      }
    };

    const anchors = document.querySelectorAll('nav a');
    anchors.forEach(anchor => anchor.addEventListener('click', handleAnchorClick as any));
    
    return () => {
      anchors.forEach(anchor => anchor.removeEventListener('click', handleAnchorClick as any));
    };
  }, []);

  return (
    <div className="min-h-screen bg-white font-sans text-[#0F172A] overflow-x-hidden scroll-smooth">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 glass border-b border-border/10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Logo variant="full" size={32} />
          </div>
          
          <div className="hidden md:flex items-center gap-8 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
            <a href="#funcionalidades" className="hover:text-primary transition-all">Funcionalidades</a>
            <a href="#solucao" className="hover:text-primary transition-all">A Solução</a>
            <a href="#como-funciona" className="hover:text-primary transition-all">Como Funciona</a>
            <a href="#beneficios" className="hover:text-primary transition-all">Benefícios</a>
          </div>

          <button 
            onClick={onBack}
            className="px-6 py-2 bg-primary rounded-2xl text-[11px] font-black text-white uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-primary/20 active:scale-95"
          >
            Faça já um pedido
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-8 animate-fade-in">
            <div className="inline-block px-4 py-1.5 bg-primary/5 rounded-full border border-primary/10">
              <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">SISTEMA OPERACIONAL SMART</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-black leading-[1.1] tracking-tight text-[#111111]">
              Mais fácil, Mais Rápido, <span className="text-primary">Mais Controle</span>
            </h1>
            <p className="text-lg text-slate-500 max-w-lg leading-relaxed font-medium">
              Chega do "Caos no Balcão". Elimina clientes impacientes, erro de comunicação e filas intermináveis com um sistema logístico de precisão.
            </p>
            <div className="flex flex-wrap gap-4 pt-4">
              <button className="px-8 py-4 bg-primary text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-105 transition-all">
                Digitalizar seu negócio
              </button>
              <button className="px-8 py-4 bg-white border-2 border-slate-100 text-slate-600 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-slate-50 transition-all">
                Ver Demonstração
              </button>
            </div>
          </div>
          <div className="relative animate-scale-in">
            <div className="absolute -inset-10 bg-primary/5 rounded-full blur-[100px] -z-10"></div>
            <div className="rounded-[40px] overflow-hidden shadow-2xl border-8 border-white">
              <img src="/images/luanda_queue_chaos.png" alt="Caos de Fila" className="w-full h-auto object-cover" />
            </div>
            <div className="absolute -bottom-10 -left-10 bg-white p-6 rounded-3xl shadow-xl flex items-center gap-4 border border-slate-50 max-w-[280px]">
              <div className="size-12 bg-primary/10 rounded-2xl flex items-center justify-center">
                <Logo variant="icon" size={24} />
              </div>
              <div>
                <p className="text-sm font-black text-[#111111]">Fim das Filas Físicas</p>
                <p className="text-[10px] text-slate-500 font-bold">Transforme seu atendimento agora.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Revolution Section */}
      <section id="solucao" className="py-24 bg-slate-50/50">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-20 items-center">
          <div className="order-2 md:order-1">
             <div className="rounded-[40px] overflow-hidden shadow-2xl border-8 border-white">
              <img src="/images/luanda_solucao_premium.jpg" alt="Solução Premium" className="w-full h-auto object-cover" />
            </div>
          </div>
          <div className="order-1 md:order-2 space-y-8">
            <h2 className="text-4xl font-black text-[#111111] tracking-tight">A Revolução do Balcão</h2>
            <p className="text-lg text-slate-500 leading-relaxed font-medium">
              A Kwikfood transforma o seu balcão em um sistema logístico de precisão. O cliente entra na fila pelo telemóvel e só se aproxima quando o pedido estiver pronto.
            </p>
            <ul className="space-y-6">
              {[
                { title: "Foco na Cozinha", desc: "Sua equipa trabalha sem interrupções constantes." },
                { title: "Experiência VIP", desc: "Clientes esperam onde quiserem com total conforto." },
                { title: "Dados em Tempo Real", desc: "Controle total sobre o tempo de espera e produção." }
              ].map((item, i) => (
                <li key={i} className="flex gap-4">
                  <div className="size-6 bg-primary rounded-full flex items-center justify-center shrink-0 mt-1">
                    <span className="material-symbols-outlined text-white text-[14px]">check</span>
                  </div>
                  <div>
                    <p className="font-black text-[#111111] uppercase tracking-wide text-sm">{item.title}</p>
                    <p className="text-sm text-slate-500 font-bold">{item.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="funcionalidades" className="py-24 px-6">
        <div className="max-w-7xl mx-auto text-center space-y-4 mb-20">
          <h2 className="text-4xl font-black text-[#111111]">Funcionalidades Desenhadas para Fast Food</h2>
          <p className="text-slate-400 font-black text-[10px] uppercase tracking-[0.3em]">Tecnologia que entende a dinâmica do seu negócio.</p>
        </div>
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {[
            { icon: "qr_code_2", title: "QR Code Personalizado", desc: "QR Code exclusivo com a sua logo. Sem necessidade de instalar apps, rápido e direto." },
            { icon: "schedule", title: "Tempo Real", desc: "Status 'Na Fila', 'A Preparar', 'Pronto' com cronómetro de precisão para cada cliente." },
            { icon: "sms", title: "Notificações SMS", desc: "Aviso automático por SMS sobre o estado do pedido. O cliente nunca perde a vez." },
            { icon: "restaurant_menu", title: "Menu Virtual", desc: "Sistema de cardápio com fotos e detalhes diretamente no smartphone do cliente." },
            { icon: "settings", title: "Flexibilidade Total", desc: "Clientes podem cancelar ou esperar em qualquer lugar com total segurança." },
            { icon: "contact_page", title: "Gestão de Contactos", desc: "Crie a sua própria lista de clientes para campanhas de marketing e fidelização." }
          ].map((feat, i) => (
            <div key={i} className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm hover:shadow-xl hover:border-primary/20 transition-all group">
              <div className="size-14 bg-primary rounded-2xl flex items-center justify-center mb-8 shadow-lg shadow-primary/20">
                <span className="material-symbols-outlined text-white text-3xl">{feat.icon}</span>
              </div>
              <h3 className="text-xl font-black text-[#111111] mb-4 uppercase tracking-tight">{feat.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed font-bold">{feat.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it Works */}
      <section id="como-funciona" className="py-32 bg-[#0F172A] text-white">
        <div className="max-w-7xl mx-auto px-6 text-center space-y-4 mb-24">
          <h2 className="text-4xl font-black">Como Funciona?</h2>
          <p className="text-slate-500 font-black text-[10px] uppercase tracking-[0.3em]">Simplicidade do balcão à entrega.</p>
        </div>
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-16">
          {[
            { num: 1, title: "Leitura QR Code", desc: "O cliente lê o QR Code e descobre o menu/fila." },
            { num: 2, title: "Entra na Fila", desc: "Reserva o seu lugar e recebe o bilhete digital." },
            { num: 3, title: "Gestão Cozinha", desc: "A equipa gere tudo via painel simples e intuitivo." },
            { num: 4, title: "Recolha", desc: "O cliente é notificado quando o pedido sai da cozinha." }
          ].map((step, i) => (
            <div key={i} className="text-center space-y-8 group">
              <div className="size-20 bg-primary rounded-full flex items-center justify-center mx-auto text-3xl font-black shadow-lg shadow-primary/30 group-hover:scale-110 transition-all">
                {step.num}
              </div>
              <h3 className="text-xl font-black uppercase tracking-tight">{step.title}</h3>
              <p className="text-slate-400 text-sm font-bold leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Benefits */}
      <section id="beneficios" className="py-32 px-6">
        <div className="max-w-7xl mx-auto text-center space-y-4 mb-20">
          <h2 className="text-4xl font-black text-[#111111]">Por que o seu Fast Food precisa do KwikFood?</h2>
        </div>
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            { icon: "group_remove", title: "Redução de Aglomeração", desc: "Mantenha o ambiente limpo e organizado." },
            { icon: "speed", title: "Aumento da Eficiência", desc: "Produza mais em menos tempo." },
            { icon: "star", title: "Branding Premium", desc: "Posicione-se como inovador e tecnológico." },
            { icon: "sync_disabled", title: "Zero Atrito", desc: "Elimine barreiras entre o pedido e o cliente." }
          ].map((item, i) => (
            <div key={i} className="bg-white p-10 rounded-[40px] border-2 border-slate-50 text-center hover:border-primary/20 hover:scale-105 transition-all">
              <div className="mb-8">
                <span className="material-symbols-outlined text-primary text-5xl">{item.icon}</span>
              </div>
              <h3 className="text-[13px] font-black text-[#111111] mb-4 uppercase tracking-widest">{item.title}</h3>
              <p className="text-slate-500 text-[11px] font-bold leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto bg-primary rounded-[60px] p-16 md:p-24 text-center text-white relative overflow-hidden shadow-2xl shadow-primary/30 animate-scale-in">
          <div className="absolute top-0 right-0 size-80 bg-white/10 rounded-full blur-[120px] -mr-40 -mt-40"></div>
          <div className="relative z-10 space-y-10">
            <div className="size-20 bg-white rounded-3xl flex items-center justify-center mx-auto mb-10 shadow-xl">
              <Logo variant="icon" size={40} />
            </div>
            <h2 className="text-5xl md:text-6xl font-black tracking-tight leading-tight">Pronto para organizar o seu balcão?</h2>
            <p className="text-white/80 text-xl font-bold max-w-2xl mx-auto">
              Junte-se às 30 marcas que já transformaram seu atendimento com o Kwikfood.
            </p>
            <div className="flex flex-wrap justify-center gap-6 pt-6">
              <button className="px-12 py-6 bg-[#0F172A] text-white rounded-3xl font-black text-xs uppercase tracking-[0.2em] hover:scale-110 transition-all shadow-2xl">
                Começar Agora
              </button>
              <button className="px-12 py-6 bg-white/10 backdrop-blur-md text-white border-2 border-white/20 rounded-3xl font-black text-xs uppercase tracking-[0.2em] hover:bg-white/20 transition-all">
                Falar com especialista
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-20 border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-12">
          <div className="flex items-center gap-4">
            <Logo variant="icon" size={32} />
            <span className="text-2xl font-black tracking-tighter text-[#111111]">Kwikfood</span>
          </div>
          <div className="flex flex-wrap justify-center gap-10 text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">
            <a href="#" className="hover:text-primary transition-colors">Termos</a>
            <a href="#" className="hover:text-primary transition-colors">Privacidade</a>
            <a href="#" className="hover:text-primary transition-colors">Ajuda</a>
            <a href="#" className="hover:text-primary transition-colors">Sobre Nós</a>
          </div>
          <p className="text-[10px] text-slate-300 font-black uppercase tracking-[0.3em]">
            © 2026 Kwikfood Angola. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default AboutUsView;

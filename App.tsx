
import React, { useState, useEffect } from 'react';
import { supabase } from './src/lib/supabase';
import { AppView, Company, Order, OrderStatus } from './types';
import { fetchCompanies, createOrder } from './constants';
import SuperAdminView from './components/SuperAdminView';
import CompanyAdminView from './components/CompanyAdminView';
import CustomerEntryView from './components/CustomerEntryView';
import CustomerTrackingView from './components/CustomerTrackingView';
import AdminAuthView from './components/AdminAuthView';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(() => {
    return (localStorage.getItem('kwikfood_view') as AppView) || 'CUSTOMER_ENTRY';
  });
  const [activeCompany, setActiveCompany] = useState<Company | null>(() => {
    const saved = localStorage.getItem('kwikfood_company');
    return saved ? JSON.parse(saved) : null;
  });
  const [activeOrder, setActiveOrder] = useState<Order | null>(() => {
    const saved = localStorage.getItem('kwikfood_order');
    return saved ? JSON.parse(saved) : null;
  });
  const [companies, setCompanies] = useState<Company[]>([]);

  useEffect(() => {
    localStorage.setItem('kwikfood_view', currentView);
  }, [currentView]);

  useEffect(() => {
    if (activeCompany) localStorage.setItem('kwikfood_company', JSON.stringify(activeCompany));
    else localStorage.removeItem('kwikfood_company');
  }, [activeCompany]);

  useEffect(() => {
    if (activeOrder) localStorage.setItem('kwikfood_order', JSON.stringify(activeOrder));
    else localStorage.removeItem('kwikfood_order');
  }, [activeOrder]);

  // Keep activeCompany synced with the updated companies list (Realtime)
  useEffect(() => {
    if (activeCompany) {
      const updated = companies.find(c => c.id === activeCompany.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(activeCompany)) {
        setActiveCompany(updated);
      }
    }
  }, [companies, activeCompany]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchCompanies();
        setCompanies(data);
      } catch (err) {
        console.error("Failed to load companies:", err);
      }
    };
    load();

    const channel = supabase
      .channel('app-companies-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'companies' }, () => {
        load();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Simple Router based on state
  const renderView = () => {
    switch (currentView) {
      case 'SUPER_ADMIN':
        return <SuperAdminView onBack={() => setCurrentView('CUSTOMER_ENTRY')} />;
      case 'COMPANY_ADMIN':
        return <CompanyAdminView
          company={activeCompany!}
          onLogout={() => {
            setActiveCompany(null);
            setCurrentView('CUSTOMER_ENTRY');
          }}
        />;
      case 'CUSTOMER_TRACKING':
        return <CustomerTrackingView
          key={activeOrder?.id}
          order={activeOrder!}
          onNewOrder={async (company, phone) => {
            if (company && phone) {
              try {
                const newOrder = await createOrder({
                  companyId: company.id,
                  customerPhone: phone,
                  status: OrderStatus.PENDING,
                  queuePosition: 1,
                  estimatedMinutes: 5,
                });
                setActiveOrder(newOrder);
              } catch (err) {
                console.error("Failed to create new order:", err);
                setActiveOrder(null);
                setCurrentView('CUSTOMER_ENTRY');
              }
            } else {
              setActiveOrder(null);
              setCurrentView('CUSTOMER_ENTRY');
            }
          }}
        />;
      case 'CUSTOMER_ENTRY':
      default:
        return <CustomerEntryView
          companies={companies}
          onJoinQueue={(order) => {
            setActiveOrder(order);
            setCurrentView('CUSTOMER_TRACKING');
          }}
          onAdminAccess={() => {
            setCurrentView('ADMIN_AUTH');
          }}
        />;
      case 'ADMIN_AUTH':
        return <AdminAuthView
          onBack={() => setCurrentView('CUSTOMER_ENTRY')}
          onSuccess={(type, id) => {
            if (type === 'SUPER') {
              setCurrentView('SUPER_ADMIN');
            } else {
              const co = companies.find(c => c.id === id);
              setActiveCompany(co || companies[0]);
              setCurrentView('COMPANY_ADMIN');
            }
          }}
        />;
    }
  };

  return (
    <div className="min-h-screen">
      {renderView()}
    </div>
  );
};

export default App;

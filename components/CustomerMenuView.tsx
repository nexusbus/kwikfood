import React, { useState, useEffect } from 'react';
import { Product, Category, Company, ProductStatus } from '../types';
import { supabase } from '../src/lib/supabase';
import Logo from './Logo';

interface CustomerMenuViewProps {
  company: Company;
  onBack: () => void;
  onSelectItem?: (product: Product) => void;
}

const CustomerMenuView: React.FC<CustomerMenuViewProps> = ({ company, onBack, onSelectItem }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [customizationLoading, setCustomizationLoading] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [selectedExtras, setSelectedExtras] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const loadMenu = async () => {
      setLoading(true);
      try {
        // Load Categories
        const { data: catData, error: catErr } = await supabase
          .from('categories')
          .select('*')
          .eq('company_id', Number(company.id))
          .order('sort_order', { ascending: true });
        
        if (catErr) throw catErr;
        if (catData) setCategories(catData.map(c => ({ ...c, companyId: c.company_id, sortOrder: c.sort_order })));

        // Load Products
        const { data: prodData, error: prodErr } = await supabase
          .from('products')
          .select('*')
          .eq('company_id', Number(company.id))
          .eq('status', ProductStatus.ACTIVE);
        
        if (prodErr) throw prodErr;
        if (prodData) {
          setProducts(prodData.map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            category: p.category,
            category_id: p.category_id,
            imageUrl: p.image_url,
            details: p.details || '',
            status: p.status as ProductStatus
          })));
        }
      } catch (err) {
        console.error('Error loading menu:', err);
      } finally {
        setLoading(false);
      }
    };

    loadMenu();

    const pChannel = supabase
      .channel(`customer-prod-${company.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products', filter: `company_id=eq.${company.id}` }, () => loadMenu())
      .subscribe();

    const cChannel = supabase
      .channel(`customer-cat-${company.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories', filter: `company_id=eq.${company.id}` }, () => loadMenu())
      .subscribe();

    const agChannel = supabase
      .channel(`customer-ag-${company.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accompaniment_groups', filter: `company_id=eq.${company.id}` }, () => loadMenu())
      .subscribe();

    return () => {
      supabase.removeChannel(pChannel);
      supabase.removeChannel(cChannel);
      supabase.removeChannel(agChannel);
    };
  }, [company.id]);

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                         (p.details && p.details.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = selectedCategory === 'Todos' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categoryOptions = ['Todos', ...categories.map(c => c.name)];

  const handleOpenCustomization = async (product: Product) => {
    setSelectedProduct(product);
    setIsCustomizing(true);
    setCustomizationLoading(true);
    setQuantity(1);
    setSelectedExtras({});

    try {
      // Fetch Accompaniment Groups for this specific product
      const { data: groupsData, error: groupsError } = await supabase
        .from('product_to_accompaniment_groups')
        .select(`
          group_id,
          accompaniment_groups (
            id,
            name,
            isRequired:is_required,
            minSelection:min_selection,
            maxSelection:max_selection,
            accompaniment_items (
              id,
              name,
              price,
              isActive:is_active
            )
          )
        `)
        .eq('product_id', product.id);

      if (groupsError) throw groupsError;

      if (groupsData) {
        const enrichedGroups = groupsData.map((g: any) => {
          const group = g.accompaniment_groups;
          if (!group) return null;
          return {
            ...group,
            items: (group.accompaniment_items || []).filter((i: any) => i.isActive)
          };
        }).filter(Boolean);
        
        setSelectedProduct({ ...product, accompanimentGroups: enrichedGroups });
      }
    } catch (err) {
      console.error('Error loading accompaniments:', err);
    } finally {
      setCustomizationLoading(false);
    }
  };

  const calculateTotal = () => {
    if (!selectedProduct) return 0;
    let total = selectedProduct.price;
    
    // Add extras
    Object.values(selectedExtras).flat().forEach(extraId => {
      const item = selectedProduct.accompanimentGroups?.flatMap(g => g.items || []).find(i => i.id === extraId);
      if (item) total += item.price;
    });

    return total * quantity;
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] font-sans selection:bg-primary/20">
      {/* Premium Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-zinc-100 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button 
            onClick={onBack}
            className="size-10 rounded-full bg-zinc-50 flex items-center justify-center text-zinc-400 hover:text-primary transition-all active:scale-90"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          
          <div className="flex flex-col items-center">
            <h1 className="text-lg font-black text-secondary tracking-tight">{company.name}</h1>
            <p className="text-[10px] font-bold text-primary uppercase tracking-[0.2em]">Cardápio Digital</p>
          </div>

          <div className="size-10 bg-primary/10 rounded-full flex items-center justify-center">
            <Logo variant="icon" size={20} />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-10">
        {/* Central Search Bar */}
        <section className="text-center space-y-6">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl font-black text-secondary leading-tight mb-2">
              O que vamos <span className="text-primary">pedir hoje?</span>
            </h2>
            <div className="relative group">
              <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-zinc-300 group-focus-within:text-primary transition-colors">search</span>
              <input 
                type="text"
                placeholder="Pesquisar no cardápio..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-16 bg-white border-2 border-zinc-100 rounded-[2rem] pl-14 pr-6 font-bold text-secondary outline-none focus:border-primary/30 transition-all shadow-sm"
              />
            </div>
          </div>

          {/* Categories Pills */}
          <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide justify-center">
            {categoryOptions.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-6 py-3 rounded-full text-xs font-black uppercase tracking-widest transition-all ${selectedCategory === cat ? 'bg-secondary text-white shadow-lg' : 'bg-white text-zinc-400 border border-zinc-100 hover:border-primary/20'}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </section>

        {/* Products Grid */}
        {loading ? (
          <div className="flex flex-col items-center py-20 gap-4">
            <div className="size-12 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
            <p className="text-zinc-400 font-bold text-xs uppercase tracking-widest">Carregando delícias...</p>
          </div>
        ) : filteredProducts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredProducts.map(product => (
              <button
                key={product.id}
                onClick={() => handleOpenCustomization(product)}
                className="group bg-white p-4 rounded-[2.5rem] border border-zinc-100 shadow-sm hover:shadow-xl hover:shadow-zinc-200/50 transition-all flex flex-col sm:flex-row gap-5 text-left"
              >
                <div className="size-full sm:size-32 rounded-[2rem] overflow-hidden bg-zinc-50 flex-shrink-0">
                  <img 
                    src={product.imageUrl} 
                    alt={product.name} 
                    className="size-full object-cover group-hover:scale-110 transition-transform duration-700"
                  />
                </div>
                <div className="flex-1 flex flex-col justify-between py-1">
                  <div>
                    <span className="text-[9px] font-black text-primary uppercase tracking-widest">{product.category}</span>
                    <h3 className="text-lg font-black text-secondary group-hover:text-primary transition-colors mt-1">{product.name}</h3>
                    <p className="text-zinc-400 text-xs font-medium mt-1 line-clamp-2 leading-relaxed italic">{product.details}</p>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-xl font-black text-secondary">
                      <span className="text-[10px] text-zinc-300 mr-1">Kz</span>
                      {product.price.toLocaleString()}
                    </span>
                    <div className="size-10 bg-zinc-50 rounded-2xl flex items-center justify-center text-zinc-400 group-hover:bg-primary group-hover:text-white transition-all transform group-hover:rotate-12">
                      <span className="material-symbols-outlined">add</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 space-y-4">
            <span className="material-symbols-outlined text-6xl text-zinc-200">sentiment_very_dissatisfied</span>
            <p className="text-zinc-400 font-bold text-xs uppercase tracking-widest">Nenhum prato encontrado com esses critérios</p>
          </div>
        )}
      </main>

      {/* Footer Info */}
      <footer className="text-center py-20 pb-20 space-y-4">
        <p className="text-[10px] font-black text-zinc-300 uppercase tracking-[0.4em]">KwikFood Angola • Experiência Premium</p>
        <div className="size-2 bg-primary/20 rounded-full mx-auto"></div>
      </footer>

      {/* Product Customization Modal */}
      {isCustomizing && selectedProduct && (
        <div className="fixed inset-0 z-[100] bg-secondary/90 backdrop-blur-3xl flex items-end sm:items-center justify-center p-0 sm:p-6 animate-in fade-in duration-500">
          <div className="bg-white w-full max-w-2xl h-[92vh] sm:h-auto sm:max-h-[90vh] rounded-t-[3rem] sm:rounded-[3.5rem] overflow-hidden flex flex-col relative shadow-premium animate-in slide-in-from-bottom-20 duration-500">
            {/* Header / Image Area */}
            <div className="relative h-64 sm:h-80 w-full flex-shrink-0">
              <img src={selectedProduct.imageUrl} className="size-full object-cover" alt={selectedProduct.name} />
              <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent"></div>
              <button 
                onClick={() => setIsCustomizing(false)}
                className="absolute top-6 right-6 size-12 bg-white/20 backdrop-blur-xl rounded-full flex items-center justify-center text-white hover:bg-white hover:text-secondary transition-all"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto px-8 sm:px-12 pb-12 custom-scrollbar">
              <div className="space-y-8 mt-2">
                <header>
                  <span className="text-[10px] font-black text-primary uppercase tracking-[0.3em]">{selectedProduct.category}</span>
                  <div className="flex justify-between items-start gap-4 mt-2">
                    <h2 className="text-3xl font-black text-secondary tracking-tight">{selectedProduct.name}</h2>
                    <span className="text-2xl font-black text-primary">{(selectedProduct.price).toLocaleString()} Kz</span>
                  </div>
                  <p className="text-zinc-500 font-medium text-lg mt-4 italic leading-relaxed">{selectedProduct.details}</p>
                </header>

                {/* Accompaniments Sections */}
                {customizationLoading ? (
                  <div className="py-10 flex flex-col items-center gap-4">
                    <div className="size-8 border-4 border-primary/10 border-t-primary rounded-full animate-spin"></div>
                    <p className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">Carregando opções...</p>
                  </div>
                ) : (
                  <div className="space-y-10">
                    {selectedProduct.accompanimentGroups?.map(group => (
                      <section key={group.id} className="space-y-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-black text-secondary tracking-widest uppercase">{group.name}</h4>
                            <p className="text-zinc-400 text-[10px] font-bold mt-1">
                              {group.isRequired ? `Obrigatório • Selecione pelo menos ${group.minSelection}` : `Opcional • Escolha até ${group.maxSelection}`}
                            </p>
                          </div>
                          {group.isRequired && (
                            <span className="px-3 py-1 bg-primary/10 text-primary rounded-full text-[9px] font-black uppercase tracking-widest">Obrigatório</span>
                          )}
                        </div>
                        <div className="space-y-3">
                          {group.items?.map(item => {
                            const isSelected = selectedExtras[group.id]?.includes(item.id);
                            return (
                              <button
                                key={item.id}
                                onClick={() => {
                                  setSelectedExtras(prev => {
                                    const current = prev[group.id] || [];
                                    if (isSelected) {
                                      return { ...prev, [group.id]: current.filter(id => id !== item.id) };
                                    } else {
                                      // Check max selection
                                      if (group.maxSelection === 1) {
                                        return { ...prev, [group.id]: [item.id] };
                                      }
                                      if (current.length < group.maxSelection) {
                                        return { ...prev, [group.id]: [...current, item.id] };
                                      }
                                      return prev;
                                    }
                                  });
                                }}
                                className={`w-full p-5 rounded-2xl border-2 flex items-center justify-between transition-all ${isSelected ? 'border-primary bg-rose-50' : 'border-zinc-50 bg-zinc-50 hover:border-zinc-200'}`}
                              >
                                <div className="flex items-center gap-4">
                                  <div className={`size-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'border-primary bg-primary' : 'border-zinc-300 bg-white'}`}>
                                    {isSelected && <span className="material-symbols-outlined text-white text-[12px] font-black">check</span>}
                                  </div>
                                  <span className={`font-bold text-sm ${isSelected ? 'text-primary' : 'text-zinc-700'}`}>{item.name}</span>
                                </div>
                                {item.price > 0 && (
                                  <span className={`text-xs font-black ${isSelected ? 'text-primary' : 'text-zinc-400'}`}>+ {item.price.toLocaleString()} Kz</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Action Bar */}
            <div className="p-8 sm:p-12 bg-white border-t border-zinc-100 flex flex-col sm:flex-row items-center gap-6">
              <div className="flex items-center bg-zinc-50 p-2 rounded-2xl gap-4">
                <button 
                  onClick={() => quantity > 1 && setQuantity(quantity - 1)}
                  className="size-12 rounded-xl bg-white shadow-sm flex items-center justify-center text-zinc-400 hover:text-primary transition-all active:scale-90"
                >
                  <span className="material-symbols-outlined">remove</span>
                </button>
                <span className="w-10 text-center font-black text-xl text-secondary">{quantity}</span>
                <button 
                  onClick={() => setQuantity(quantity + 1)}
                  className="size-12 rounded-xl bg-white shadow-sm flex items-center justify-center text-zinc-400 hover:text-primary transition-all active:scale-90"
                >
                  <span className="material-symbols-outlined">add</span>
                </button>
              </div>
              <button 
                onClick={() => {
                  // TODO: Add to cart logic integration
                  alert(`Adicionado ao pedido: ${quantity}x ${selectedProduct.name}`);
                  setIsCustomizing(false);
                }}
                className="flex-1 w-full h-16 bg-primary text-white rounded-2xl font-black text-[12px] uppercase tracking-[0.2em] flex items-center justify-between px-8 hover:bg-secondary transition-all shadow-xl shadow-rose-200"
              >
                <span>Adicionar ao Pedido</span>
                <span>{calculateTotal().toLocaleString()} Kz</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerMenuView;

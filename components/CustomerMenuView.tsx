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

  useEffect(() => {
    const loadMenu = async () => {
      setLoading(true);
      
      // Load Categories
      const { data: catData } = await supabase
        .from('categories')
        .select('*')
        .eq('company_id', company.id)
        .order('sort_order', { ascending: true });
      
      if (catData) setCategories(catData.map(c => ({ ...c, companyId: c.company_id, sortOrder: c.sort_order })));

      // Load Products
      const { data: prodData } = await supabase
        .from('products')
        .select('*')
        .eq('company_id', company.id)
        .eq('status', ProductStatus.ACTIVE);
      
      if (prodData) setProducts(prodData.map(p => ({
        id: p.id,
        name: p.name,
        price: p.price,
        category: p.category,
        imageUrl: p.imageUrl,
        details: p.details,
        status: p.status as ProductStatus
      })));

      setLoading(false);
    };

    loadMenu();
  }, [company.id]);

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                         (p.details && p.details.toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = selectedCategory === 'Todos' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categoryOptions = ['Todos', ...Array.from(new Set(products.map(p => p.category)))];

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
                onClick={() => onSelectItem?.(product)}
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
                      <span className="text-[10px] text-zinc-300 mr-1">R$</span>
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
    </div>
  );
};

export default CustomerMenuView;

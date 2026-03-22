-- REESTRUTURAÇÃO DE CARDÁPIO - CATEGORIAS E ACOMPANHAMENTOS

-- 1. Tabela de Categorias
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id BIGINT REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT, -- Ex: '🍔', '🍕', '🥤'
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabela de Grupos de Acompanhamentos (ex: "Extras para Hamburgueres")
CREATE TABLE IF NOT EXISTS public.accompaniment_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id BIGINT REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_required BOOLEAN DEFAULT false,
    min_selection INTEGER DEFAULT 0,
    max_selection INTEGER DEFAULT 10,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabela de Itens de Acompanhamento (ex: "Queijo Cheddar", "Bacon")
CREATE TABLE IF NOT EXISTS public.accompaniment_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES public.accompaniment_groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price NUMERIC DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabela de Vínculo: Produto <-> Grupos de Acompanhamentos
CREATE TABLE IF NOT EXISTS public.product_to_accompaniment_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    group_id UUID REFERENCES public.accompaniment_groups(id) ON DELETE CASCADE,
    unique(product_id, group_id)
);

-- 5. Atualizar Tabela de Produtos (referência opcional à categoria)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;

-- 6. Habilitar RLS e Políticas
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accompaniment_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accompaniment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_to_accompaniment_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public select categories" ON public.categories;
CREATE POLICY "Allow public select categories" ON public.categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public select accompaniment_groups" ON public.accompaniment_groups;
CREATE POLICY "Allow public select accompaniment_groups" ON public.accompaniment_groups FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public select accompaniment_items" ON public.accompaniment_items;
CREATE POLICY "Allow public select accompaniment_items" ON public.accompaniment_items FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public select product_to_accompaniment_groups" ON public.product_to_accompaniment_groups;
CREATE POLICY "Allow public select product_to_accompaniment_groups" ON public.product_to_accompaniment_groups FOR SELECT USING (true);

-- 7. Forçar recarga do PostgREST
NOTIFY pgrst, 'reload schema';

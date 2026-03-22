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

-- 6. Habilitar RLS e Políticas Permissivas para o Parceiro
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accompaniment_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accompaniment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_to_accompaniment_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow any categories" ON public.categories;
CREATE POLICY "Allow any categories" ON public.categories FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow any accompaniment_groups" ON public.accompaniment_groups;
CREATE POLICY "Allow any accompaniment_groups" ON public.accompaniment_groups FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow any accompaniment_items" ON public.accompaniment_items;
CREATE POLICY "Allow any accompaniment_items" ON public.accompaniment_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow any product_to_accompaniment_groups" ON public.product_to_accompaniment_groups;
CREATE POLICY "Allow any product_to_accompaniment_groups" ON public.product_to_accompaniment_groups FOR ALL USING (true) WITH CHECK (true);

-- 6.5 Garante Identidade Completa (Necessário para DELETE no Realtime funcionar com filtros)
ALTER TABLE public.categories REPLICA IDENTITY FULL;
ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.accompaniment_groups REPLICA IDENTITY FULL;
ALTER TABLE public.accompaniment_items REPLICA IDENTITY FULL;
ALTER TABLE public.product_to_accompaniment_groups REPLICA IDENTITY FULL;

-- 6.1 Políticas para Produtos (Garantir que o parceiro possa gerir)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for products" ON public.products;
CREATE POLICY "Allow all for products" ON public.products FOR ALL USING (true) WITH CHECK (true);
-- 7. Ativar Realtime para todas as tabelas (de forma idempotente)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'categories') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE categories;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'accompaniment_groups') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE accompaniment_groups;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'accompaniment_items') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE accompaniment_items;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'product_to_accompaniment_groups') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE product_to_accompaniment_groups;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'products') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE products;
    END IF;
END $$;

-- 8. Forçar recarga do PostgREST
NOTIFY pgrst, 'reload schema';

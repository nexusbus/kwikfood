-- Adicionar novos campos à tabela de produtos para o novo design de parceiro
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS preparation_time TEXT;

-- Garantir que a estrutura de cache do PostgREST seja atualizada
NOTIFY pgrst, 'reload schema';

-- Adicionando campos bancários na tabela de empresas
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS iban TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS express_number TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS kwik_number TEXT;

-- Recarregar esquema do PostgREST para refletir as mudanças na API
NOTIFY pgrst, 'reload schema';

-- 0. Garante que a extensão para UUID existe
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Garante que todas as colunas novas existem na tabela companies
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS province TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- 2. Ativa todos os estabelecimentos existentes (corrige o valor 0 no dashboard)
UPDATE public.companies SET is_active = true WHERE is_active IS NULL;

-- 3. Preenche valores padrão para cidade/tipo se estiverem vazios
UPDATE public.companies SET city = 'Luanda' WHERE (city IS NULL OR city = '') AND id > 0;
UPDATE public.companies SET type = 'Restaurante' WHERE (type IS NULL OR type = '') AND id > 0;

-- 4. Cria a tabela de logs de SMS (caso ainda não exista)
CREATE TABLE IF NOT EXISTS public.sms_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id BIGINT REFERENCES public.companies(id) ON DELETE CASCADE,
    recipient TEXT NOT NULL,
    message TEXT NOT NULL,
    cost NUMERIC DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Configura RLS para SMS Logs para permitir leitura no Dashboard
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

-- Remove políticas antigas se existirem para evitar duplicados
DROP POLICY IF EXISTS "Allow public select sms_logs" ON public.sms_logs;
DROP POLICY IF EXISTS "Allow system insert sms_logs" ON public.sms_logs;

-- Cria novas políticas
CREATE POLICY "Allow public select sms_logs" ON public.sms_logs FOR SELECT USING (true);
CREATE POLICY "Allow system insert sms_logs" ON public.sms_logs FOR INSERT WITH CHECK (true);

-- 6. Força a recarga do esquema para o PostgREST
NOTIFY pgrst, 'reload schema';

-- ==========================================
-- SCRIPT DE TESTE (OPCIONAL)
-- Se quiser ver números no dashboard agora, descomente e execute as linhas abaixo:
-- INSERT INTO sms_logs (company_id, recipient, message, cost) 
-- VALUES ((SELECT id FROM companies LIMIT 1), '900000000', 'Teste de Sistema', 5);
-- ==========================================

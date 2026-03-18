-- CONFIGURAÇÃO ROBUSTA DE REALTIME PARA KWIKFOOD
-- Execute este script no SQL Editor do Supabase

-- 1. Garante Identidade Completa (para enviar campos nulos e deletados corretamente)
ALTER TABLE public.orders REPLICA IDENTITY FULL;

-- 2. Garante que a tabela está na publicação de Realtime
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
    END IF;
END $$;

-- 3. Lista tabelas no realtime para verificação (opcional)
-- SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

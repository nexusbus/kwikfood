-- Adicionar coluna de detalhes aos produtos
ALTER TABLE products ADD COLUMN IF NOT EXISTS details TEXT;

-- Garantir que a tabela products está incluída na publicação de realtime caso ainda não esteja
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'products'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE products;
    END IF;
END $$;

-- SCRIPT DE CONFIGURAÇÃO KWIKFOOD - SUPABASE

-- 1. Tabela de Pedidos (Orders)
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id BIGINT REFERENCES public.companies(id) ON DELETE CASCADE,
    customer_phone TEXT NOT NULL,
    customer_name TEXT,
    ticket_code TEXT NOT NULL,
    ticket_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    queue_position INTEGER NOT NULL DEFAULT 1,
    estimated_minutes INTEGER DEFAULT 5,
    items JSONB DEFAULT '[]'::jsonb,
    total NUMERIC DEFAULT 0,
    payment_method TEXT,
    payment_proof_url TEXT,
    order_type TEXT,
    timer_accumulated_seconds INTEGER DEFAULT 0,
    timer_last_started_at TIMESTAMPTZ,
    cancelled_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Habilitar RLS e criar políticas de visibilidade
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public select orders" ON public.orders;
DROP POLICY IF EXISTS "Allow public insert orders" ON public.orders;
DROP POLICY IF EXISTS "Allow public update orders" ON public.orders;

CREATE POLICY "Allow public select orders" ON public.orders FOR SELECT USING (true);
CREATE POLICY "Allow public insert orders" ON public.orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update orders" ON public.orders FOR UPDATE USING (true);

-- 3. Função p_entry_queue para entrada inteligente na fila
CREATE OR REPLACE FUNCTION public.p_entry_queue(p_payload JSONB)
RETURNS JSONB AS $body$
DECLARE
    v_co_id BIGINT;
    v_phone TEXT;
    v_next_number INTEGER;
    v_ticket_code TEXT;
    v_initial_pos INTEGER;
    v_est_mins INTEGER;
    v_status TEXT;
    v_created_at TIMESTAMPTZ;
    v_result JSONB;
BEGIN
    v_co_id := (p_payload->>'company_id')::BIGINT;
    v_phone := (p_payload->>'customer_phone')::TEXT;
    v_status := COALESCE((p_payload->>'status')::TEXT, 'PENDING');
    v_created_at := now();

    -- 1. Obter próximo número de ticket para o dia e estabelecimento
    SELECT COALESCE(MAX(ticket_number), 0) + 1 
    INTO v_next_number 
    FROM public.orders 
    WHERE company_id = v_co_id 
      AND created_at::DATE = CURRENT_DATE;

    -- 2. Gerar código de ticket (ex: A001)
    v_ticket_code := 'A' || LPAD(v_next_number::TEXT, 3, '0');

    -- 3. Calcular posição inicial (número de pedidos ativos)
    SELECT COUNT(*) + 1 
    INTO v_initial_pos 
    FROM public.orders 
    WHERE company_id = v_co_id 
      AND status NOT IN ('DELIVERED', 'CANCELLED');

    -- 4. Tempo estimado (simples: 5 min por pedido na fila)
    v_est_mins := v_initial_pos * 5;

    -- 5. Inserir pedido
    INSERT INTO public.orders (
        company_id,
        customer_phone,
        customer_name,
        ticket_code,
        ticket_number,
        status,
        queue_position,
        estimated_minutes,
        payment_method,
        payment_proof_url,
        order_type,
        created_at
    ) VALUES (
        v_co_id,
        v_phone,
        (p_payload->>'customer_name')::TEXT,
        v_ticket_code,
        v_next_number,
        v_status,
        v_initial_pos,
        v_est_mins,
        (p_payload->>'payment_method')::TEXT,
        (p_payload->>'payment_proof_url')::TEXT,
        (p_payload->>'order_type')::TEXT,
        v_created_at
    ) 
    RETURNING json_build_object(
        'id', id,
        'ticket_code', ticket_code,
        'ticket_number', ticket_number,
        'company_id', company_id,
        'customer_phone', customer_phone,
        'customer_name', customer_name,
        'status', status,
        'queue_position', queue_position,
        'estimated_minutes', estimated_minutes,
        'order_type', order_type,
        'created_at', created_at
    ) INTO v_result;

    RETURN v_result;
END;
$body$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Permissões de execução
GRANT EXECUTE ON FUNCTION public.p_entry_queue TO anon, authenticated;

-- 5. Recarga do cache do PostgREST
NOTIFY pgrst, 'reload schema';

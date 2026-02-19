-- KWIKFOOD FULL DATABASE SETUP
-- IMPORTANT: Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- 0. Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Companies Table (Updated for Numeric IDs)
CREATE TABLE IF NOT EXISTS companies (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    nif TEXT NOT NULL,
    lat NUMERIC NOT NULL,
    lng NUMERIC NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Products Table
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id BIGINT REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price NUMERIC NOT NULL,
    category TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Orders Table (Nuclear Recreation)
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id BIGINT REFERENCES companies(id) ON DELETE CASCADE,
    customer_phone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'RECEIVED',
    items JSONB DEFAULT '[]'::jsonb,
    total NUMERIC DEFAULT 0,
    queue_position INTEGER DEFAULT 1,
    estimated_minutes INTEGER DEFAULT 5,
    ticket_code TEXT,
    ticket_number INTEGER,
    timer_last_started_at TIMESTAMPTZ,
    timer_accumulated_seconds INTEGER DEFAULT 0,
    payment_method TEXT,
    payment_proof_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Super Admins Table
CREATE TABLE IF NOT EXISTS super_admins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Enable RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies (Public/Anonymous friendly for this project)
CREATE POLICY "Allow public select companies" ON companies FOR SELECT USING (true);
CREATE POLICY "Allow admin all companies" ON companies FOR ALL USING (true);

CREATE POLICY "Allow public select products" ON products FOR SELECT USING (true);
CREATE POLICY "Allow admin all products" ON products FOR ALL USING (true);

CREATE POLICY "Allow anonymous insertion orders" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select orders" ON orders FOR SELECT USING (true);
CREATE POLICY "Allow public update orders" ON orders FOR UPDATE USING (true);
CREATE POLICY "Allow public delete orders" ON orders FOR DELETE USING (true);

CREATE POLICY "Allow public select sa" ON super_admins FOR SELECT USING (true);
CREATE POLICY "Allow first admin creation" ON super_admins FOR INSERT WITH CHECK ((SELECT count(*) FROM super_admins) = 0);
CREATE POLICY "Allow admin all sa" ON super_admins FOR ALL USING (true);

-- 1. FORCE COLUMN CONSISTENCY (Fixes "operator does not exist: text = bigint")
ALTER TABLE public.orders ALTER COLUMN company_id TYPE BIGINT USING company_id::BIGINT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ticket_code TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ticket_number INTEGER;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS timer_accumulated_seconds INTEGER DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS timer_last_started_at TIMESTAMPTZ;

-- 2. COMPLETE RESET OF ORDER FUNCTIONS
DROP FUNCTION IF EXISTS public.create_order_v1(text, text, text, text);
DROP FUNCTION IF EXISTS public.create_order_v2(text, text, text, text);
DROP FUNCTION IF EXISTS public.create_order_v3(text, text, text, text);
DROP FUNCTION IF EXISTS public.create_order_v4(text, text, text, text);
DROP FUNCTION IF EXISTS public.create_order_v5(text, text, text, text);
DROP FUNCTION IF EXISTS public.create_order_v6(jsonb);
DROP FUNCTION IF EXISTS public.create_order_v7(jsonb);
DROP FUNCTION IF EXISTS public.create_order_v8(jsonb);

-- 3. FINAL DEFINITIVE FUNCTION (p_entry_queue)
-- namespaced for cache-busting
CREATE OR REPLACE FUNCTION public.p_entry_queue(p_payload JSONB) 
RETURNS JSONB AS $$
DECLARE
  v_next_number INTEGER;
  v_initial_pos INTEGER;
  v_ticket_code TEXT;
  v_order_id UUID;
  v_created_at TIMESTAMPTZ;
  v_co_id BIGINT;
  v_phone TEXT;
  v_status TEXT;
  v_est_mins INTEGER;
  v_result JSONB;
BEGIN
  -- Explicitly cast everything from JSON
  v_co_id := (p_payload->>'company_id')::BIGINT;
  v_phone := (p_payload->>'customer_phone')::TEXT;
  v_status := (p_payload->>'status')::TEXT;
  v_est_mins := (p_payload->>'estimated_minutes')::INTEGER;

  -- Use explicit casts in EVERY comparison to avoid type mismatch
  SELECT COALESCE(MAX(ticket_number), 0) + 1 INTO v_next_number 
  FROM public.orders 
  WHERE (company_id::BIGINT = v_co_id::BIGINT) 
    AND (created_at::date = CURRENT_DATE);

  v_ticket_code := LPAD(v_next_number::text, 3, '0');

  SELECT COUNT(*) + 1 INTO v_initial_pos 
  FROM public.orders 
  WHERE (company_id::BIGINT = v_co_id::BIGINT) 
    AND (status::TEXT IN ('RECEIVED', 'PREPARING', 'READY'));

  INSERT INTO public.orders (
    company_id, customer_phone, status, queue_position, 
    estimated_minutes, ticket_code, ticket_number, timer_accumulated_seconds,
    payment_method, payment_proof_url
  ) VALUES (
    v_co_id, v_phone, v_status, v_initial_pos, 
    v_est_mins, v_ticket_code, v_next_number, 0,
    (p_payload->>'payment_method')::TEXT, (p_payload->>'payment_proof_url')::TEXT
  ) RETURNING id, created_at INTO v_order_id, v_created_at;

  SELECT jsonb_build_object(
    'id', v_order_id,
    'ticket_code', v_ticket_code,
    'ticket_number', v_next_number,
    'company_id', v_co_id,
    'customer_phone', v_phone,
    'status', v_status,
    'queue_position', v_initial_pos,
    'estimated_minutes', v_est_mins,
    'payment_method', p_payload->>'payment_method',
    'payment_proof_url', p_payload->>'payment_proof_url',
    'created_at', v_created_at
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.p_entry_queue TO anon, authenticated;

-- 4. FINAL CACHE RELOAD
COMMENT ON SCHEMA public IS 'KwikFood API Schema Refreshed';
NOTIFY pgrst, 'reload schema';

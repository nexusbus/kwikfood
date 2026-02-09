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

-- 7. RPC - Optimized Order Creation (create_order_v6)
-- Handles ticket number generation, queue position, and insertion atomicity.
-- Uses JSONB payload to bypass PostgREST cache/signature matching issues.
CREATE OR REPLACE FUNCTION create_order_v6(p_payload JSONB) 
RETURNS orders AS $$
DECLARE
  v_next_number INTEGER;
  v_initial_pos INTEGER;
  v_ticket_code TEXT;
  v_order orders;
  v_today DATE := CURRENT_DATE;
  v_co_id BIGINT;
  v_phone TEXT;
  v_status TEXT;
  v_est_mins INTEGER;
BEGIN
  -- Extract values safely from JSON payload
  v_co_id := (p_payload->>'company_id')::BIGINT;
  v_phone := (p_payload->>'customer_phone');
  v_status := (p_payload->>'status');
  v_est_mins := (p_payload->>'estimated_minutes')::INTEGER;

  -- 1. Get next ticket number for today
  SELECT COALESCE(MAX(ticket_number), 0) + 1 
  INTO v_next_number 
  FROM orders 
  WHERE company_id = v_co_id 
    AND created_at::date = v_today;

  -- 2. Format ticket code
  v_ticket_code := LPAD(v_next_number::text, 3, '0');

  -- 3. Get initial queue position
  SELECT COUNT(*) + 1 
  INTO v_initial_pos 
  FROM orders 
  WHERE company_id = v_co_id 
    AND status IN ('RECEIVED', 'PREPARING', 'READY');

  -- 4. Insert order
  INSERT INTO orders (
    company_id,
    customer_phone,
    status,
    queue_position,
    estimated_minutes,
    ticket_code,
    ticket_number,
    timer_last_started_at,
    timer_accumulated_seconds
  ) VALUES (
    v_co_id,
    v_phone,
    v_status,
    v_initial_pos,
    v_est_mins,
    v_ticket_code,
    v_next_number,
    NULL,
    0
  ) RETURNING * INTO v_order;

  RETURN v_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_order_v6 TO anon, authenticated;

-- Force reload PostgREST cache
NOTIFY pgrst, 'reload schema';

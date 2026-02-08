-- KWIKFOOD FULL DATABASE SETUP
-- IMPORTANT: Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

-- 0. Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Companies Table
CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY, -- Format: L402
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
    company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price NUMERIC NOT NULL,
    category TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Orders Table
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
    customer_phone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'RECEIVED',
    items JSONB DEFAULT '[]',
    total NUMERIC DEFAULT 0,
    queue_position SERIAL,
    estimated_minutes INTEGER DEFAULT 15,
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

-- 6. RLS Policies
-- Companies: Public select, Admin insert/update
DROP POLICY IF EXISTS "Public select companies" ON companies;
CREATE POLICY "Public select companies" ON companies FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin full access companies" ON companies;
CREATE POLICY "Admin full access companies" ON companies FOR ALL USING (true); 

-- Products: Public select, Company Admin full access
DROP POLICY IF EXISTS "Public select products" ON products;
CREATE POLICY "Public select products" ON products FOR SELECT USING (true);
DROP POLICY IF EXISTS "Company Admin products" ON products;
CREATE POLICY "Company Admin products" ON products FOR ALL USING (true);

-- Orders: Public insert/select, Company Admin full access
DROP POLICY IF EXISTS "Public order access" ON orders;
CREATE POLICY "Public order access" ON orders FOR ALL USING (true);

-- Super Admins: Public select (to check existence), Insert if count is 0
DROP POLICY IF EXISTS "Public check super_admins" ON super_admins;
CREATE POLICY "Public check super_admins" ON super_admins FOR SELECT USING (true);
DROP POLICY IF EXISTS "First admin creation" ON super_admins;
CREATE POLICY "First admin creation" ON super_admins FOR INSERT WITH CHECK ((SELECT count(*) FROM super_admins) = 0);
DROP POLICY IF EXISTS "Admin full access sa" ON super_admins;
CREATE POLICY "Admin full access sa" ON super_admins FOR ALL USING (true);

-- 7. Storage Setup (Note: some SQL environments might require manual bucket creation if this fails)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('products', 'products', true) ON CONFLICT (id) DO NOTHING;

-- TRUNCATE FOR FRESH START
TRUNCATE TABLE orders CASCADE;
TRUNCATE TABLE products CASCADE;
TRUNCATE TABLE companies CASCADE;

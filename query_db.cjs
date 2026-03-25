
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zbywyjkiicsrnylzfwzi.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpieXd5amtpaWNzcm55bHpmd3ppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDY1NzYsImV4cCI6MjA4NTEyMjU3Nn0.F-B01E4qzJDuYbWN-t4JS1RTiBtZyXc1MRACFZ6rSRY';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const { data: companies, error: cError } = await supabase
    .from('companies')
    .select('id, name')
    .eq('id', 1);

  console.log('Company:', JSON.stringify(companies, null, 2));

  const { data: categories, error: catError } = await supabase
    .from('categories')
    .select('id, name')
    .eq('company_id', 1)
    .eq('name', 'PACOTE FAST MIX DE GARFOS');

  console.log('Category:', JSON.stringify(categories, null, 2));
}

run();

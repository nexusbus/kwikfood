
import { Company, Product, Order, OrderStatus } from './types';
import { supabase } from './src/lib/supabase';

export const STORE_RADIUS_METERS = 40;

export const fetchCompanies = async (): Promise<Company[]> => {
  const { data, error } = await supabase.from('companies').select('*');
  if (error) throw error;
  return data as Company[];
};

export const fetchProducts = async (companyId: string): Promise<Product[]> => {
  const { data, error } = await supabase.from('products').select('*').eq('company_id', companyId);
  if (error) throw error;
  return data.map(p => ({
    ...p,
    imageUrl: p.image_url // map snake_case to camelCase
  })) as Product[];
};

export const getNextCompanyId = async (): Promise<number> => {
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('id')
      .order('id', { ascending: false })
      .limit(1);

    if (error) throw error;
    if (!data || data.length === 0) return 1;
    return Number(data[0].id) + 1;
  } catch (err) {
    console.error('Error fetching next company ID:', err);
    return 1;
  }
};

export const createOrder = async (order: Omit<Order, 'id' | 'timestamp' | 'ticketCode' | 'ticketNumber' | 'timerAccumulatedSeconds' | 'timerLastStartedAt'>) => {
  try {
    const { data, error: insertError } = await supabase
      .rpc('create_order_v5', {
        p_company_id: order.companyId.toString(),
        p_customer_phone: order.customerPhone,
        p_status: order.status,
        p_estimated_minutes: order.estimatedMinutes.toString()
      });

    if (insertError) {
      console.error('Database RPC Error:', insertError);
      throw insertError;
    }

    return {
      ...data,
      id: data.id,
      ticketCode: data.ticket_code,
      ticketNumber: data.ticket_number,
      companyId: data.company_id,
      customerPhone: data.customer_phone,
      queuePosition: data.queue_position,
      estimatedMinutes: data.estimated_minutes,
      timerAccumulatedSeconds: data.timer_accumulated_seconds,
      timerLastStartedAt: data.timer_last_started_at,
      timestamp: data.created_at
    } as Order;
  } catch (err) {
    console.error('Fatal createOrder Error:', err);
    throw err;
  }
};

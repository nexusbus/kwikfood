
import { Company, Product, Order, ProductStatus } from './types';
import { supabase } from './src/lib/supabase';

export const STORE_RADIUS_METERS = 20;

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

export const createOrder = async (order: Omit<Order, 'id' | 'timestamp' | 'ticketCode'>) => {
  // Generate a random 4-digit ticket code
  const ticketCode = Math.floor(1000 + Math.random() * 9000).toString();

  const { data, error } = await supabase
    .from('orders')
    .insert([{
      company_id: order.companyId,
      customer_phone: order.customerPhone,
      status: order.status,
      queue_position: order.queuePosition,
      estimated_minutes: order.estimatedMinutes,
      ticket_code: ticketCode
    }])
    .select()
    .single();

  if (error) throw error;
  return {
    ...data,
    id: data.id,
    ticketCode: data.ticket_code,
    companyId: data.company_id,
    customerPhone: data.customer_phone,
    queuePosition: data.queue_position,
    estimatedMinutes: data.estimated_minutes,
    timestamp: data.created_at
  } as Order;
};


import { Company, Product, Order, OrderStatus } from './types';
import { supabase } from './src/lib/supabase';

export const STORE_RADIUS_METERS = 40;

export const fetchCompanies = async (): Promise<Company[]> => {
  const { data, error } = await supabase.from('companies').select('*');
  if (error) throw error;
  return data.map(co => ({
    ...co,
    logoUrl: co.logo_url,
    marketingEnabled: co.marketing_enabled,
    isActive: co.is_active,
    city: co.city,
    province: co.province,
    type: co.type,
    telegramChatId: co.telegram_chat_id,
    telegramBotToken: co.telegram_bot_token
  })) as Company[];
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
      .rpc('p_entry_queue', {
        p_payload: {
          company_id: Number(order.companyId),
          customer_phone: order.customerPhone,
          customer_name: order.customerName,
          status: order.status,
          estimated_minutes: order.estimatedMinutes,
          payment_method: order.paymentMethod,
          payment_proof_url: order.paymentProofUrl
        }
      });

    if (insertError) {
      console.error('RPC Error (create_order_v9):', insertError);
      throw new Error(`Erro na base de dados: ${insertError.message}`);
    }

    // Since v7 returns JSONB, the data is already the object with the properties as defined in the function
    return {
      ...data,
      id: data.id,
      ticketCode: data.ticket_code,
      ticketNumber: data.ticket_number,
      companyId: data.company_id,
      customerPhone: data.customer_phone,
      customerName: data.customer_name,
      queuePosition: data.queue_position,
      estimatedMinutes: data.estimated_minutes,
      timerAccumulatedSeconds: 0,
      timerLastStartedAt: null,
      timestamp: data.created_at
    } as Order;
  } catch (err) {
    console.error('Fatal createOrder Error:', err);
    throw err;
  }
};

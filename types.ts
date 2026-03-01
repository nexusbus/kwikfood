
export enum OrderStatus {
  PENDING = 'PENDING',
  RECEIVED = 'RECEIVED',
  PREPARING = 'PREPARING',
  READY = 'READY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED'
}

export enum OrderType {
  EAT_IN = 'EAT_IN',
  TAKE_AWAY = 'TAKE_AWAY',
  DELIVERY = 'DELIVERY'
}

export enum ProductStatus {
  ACTIVE = 'ACTIVE',
  LOW_STOCK = 'LOW_STOCK',
  OUT_OF_STOCK = 'OUT_OF_STOCK'
}

export interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  status: ProductStatus;
  imageUrl: string;
  details?: string;
}

export interface Company {
  id: number; // Numeric ID
  name: string;
  location: string;
  city?: string;
  province?: string;
  type?: string;
  nif: string;
  lat: number;
  lng: number;
  email?: string;
  password?: string;
  logoUrl?: string; // Add logo URL
  marketingEnabled?: boolean;
  isActive?: boolean;
  telegramChatId?: string;
  telegramBotToken?: string;
  isAcceptingOrders?: boolean;
  iban?: string;
  expressNumber?: string;
  kwikNumber?: string;
}

export interface CartItem extends Product {
  observation?: string;
  quantity: number;
}

export interface Order {
  id: string;
  ticketCode: string;
  ticketNumber: number;
  companyId: number;
  customerPhone: string;
  status: OrderStatus;
  items?: CartItem[];
  total?: number;
  queuePosition: number;
  estimatedMinutes: number;
  timerAccumulatedSeconds: number;
  timerLastStartedAt?: string;
  paymentMethod?: 'CASH' | 'TPA' | 'TRANSFER';
  paymentProofUrl?: string;
  timestamp: string;
  customerName?: string;
  cancelledBy?: 'admin' | 'customer';
  orderType?: OrderType;
  deliveryAddress?: string;
  deliveryCoords?: { lat: number; lng: number };
}
export interface SuperAdmin {
  id: string;
  email: string;
}

export type AppView = 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'CUSTOMER_ENTRY' | 'CUSTOMER_TRACKING' | 'ADMIN_AUTH' | 'LEGAL_TERMS';


export enum OrderStatus {
  PENDING = 'PENDING',
  RECEIVED = 'RECEIVED',
  PREPARING = 'PREPARING',
  READY = 'READY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED'
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
}

export interface Company {
  id: number; // Numeric ID
  name: string;
  location: string;
  nif: string;
  lat: number;
  lng: number;
  email?: string;
  password?: string;
  logoUrl?: string; // Add logo URL
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
  timestamp: string;
  cancelledBy?: 'admin' | 'customer';
}

export interface SuperAdmin {
  id: string;
  email: string;
}

export type AppView = 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'CUSTOMER_ENTRY' | 'CUSTOMER_TRACKING' | 'ADMIN_AUTH';

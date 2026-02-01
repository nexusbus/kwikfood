
export enum OrderStatus {
  RECEIVED = 'RECEIVED',
  PREPARING = 'PREPARING',
  READY = 'READY',
  DELIVERED = 'DELIVERED'
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
  id: string; // Format: 1 Letter + 3 Digits, e.g., L402
  name: string;
  location: string;
  nif: string;
  lat: number;
  lng: number;
  email?: string;
  password?: string;
}

export interface CartItem extends Product {
  observation?: string;
}

export interface Order {
  id: string;
  ticketCode: string;
  companyId: string;
  customerPhone: string;
  status: OrderStatus;
  items?: CartItem[];
  total?: number;
  queuePosition: number;
  estimatedMinutes: number;
  timestamp: string;
}

export interface SuperAdmin {
  id: string;
  email: string;
}

export type AppView = 'SUPER_ADMIN' | 'COMPANY_ADMIN' | 'CUSTOMER_ENTRY' | 'CUSTOMER_TRACKING' | 'ADMIN_AUTH';

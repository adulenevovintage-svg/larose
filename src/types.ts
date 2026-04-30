export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  isFasting?: boolean;
}

export interface Category {
  id: string;
  name: string;
  startTime?: string;
  endTime?: string;
}

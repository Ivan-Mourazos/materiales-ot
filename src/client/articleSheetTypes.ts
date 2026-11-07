import type { Article, StockDetailRow } from './types';

export type SheetArticle = Article & {
  genericCode: string; genericDescription: string; technicalDescription: string;
  blockedSales: boolean; blockedMaintenance: boolean; netWeight: number | null; grossWeight: number | null;
  purchasePriceUnit: string;
  widthSource: string | null;
  attributes: { slot: number; name: string; code: string; value: string; valueCode: string }[];
};
export type Supplier = { code: string; name: string; reference: string; blocked: boolean; isDefault: boolean; deliveryDays: number | null };
export type Tariff = { supplier: string; from: string | null; to: string | null; quantityFrom: number; quantityUnit: string; price: number | null; priceUnit: string; currency: string | null; discounts: number[]; purchaseLot: number; minimumLot: number; reference: string };
export type ArticleSheet = {
  queriedAt: string;
  article: SheetArticle;
  stock: { total: number; reserved: number; pending: { unit: string; quantity: number; nextDate: string | null }[]; rows: StockDetailRow[]; reserves: { order: string; situation: string; quantity: number; series: string; warehouseCode: string }[] };
  purchases: {
    stockMin: number | null; pointOrder: number | null; purchaseLot: number | null; deliveryDays: number | null; usualSupplier: string | null;
    valuation: { lastPrice: number | null; date: string | null; averagePrice: number | null; unit: string; currency: string | null };
    suppliers: Supplier[];
    delivery: { supplierId: string; quantityFrom: number; unit: string; days: number | null }[];
    lastReceipt: { supplier: string; code: string; date: string | null; documentPrice: number | null; documentUnit: string; documentUnitSource: string; priceConversion: string; movementPrice: number | null; stockUnit: string; currency: string | null; valuationCurrency: string | null; reference: string; discounts: number[] } | null;
    pending: { code: string; supplier: string; quantity: number; unit: string; expectedDate: string | null; requestedDate: string | null; reference: string }[];
    tariffs: Tariff[];
  };
  documents: { id: string; name: string; type: string; path: string; origin: string }[];
  /** El servidor llega a la carpeta de documentos de RPS: se puede ofrecer «Abrir». */
  documentsCanOpen?: boolean;
};
export type Variants = { total: number; offset: number; limit: number; articles: (Article & { attributes: string[]; blockedSales: boolean; blockedMaintenance: boolean })[] };
export type Usage = {
  queriedAt: string; unit: string;
  consumption: { net: number; positive: number; negative: number; rejected: number; imputations: number; manufacturingOrders: number; salesOrders: number; lastDate: string | null };
  recent: { code: string; situation: string; date: string | null; quantity: number; order: string }[];
  needs: { total: number; groups: { situation: string; type: number; quantity: number; orders: number }[]; lines: { code: string; situation: string; quantity: number; plannedDate: string | null }[] };
  nonConformities: { code: string; date: string | null; closedDate: string | null; status: string; supplier: string; rejectedQuantity: number; severity: number; repetitive: boolean; order: string; manufacturingOrder: string }[];
};

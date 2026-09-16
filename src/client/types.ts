export type Article = {
  idArticle: string;
  code: string;
  description: string;
  warehouseUnit?: string;
  purchaseUnit?: string;
  unitCode?: string;
  unitDescription?: string;
  productLine?: string;
  family?: string;
  subfamily?: string;
  productionSection?: string;
  businessLine?: string;
  normaUne?: string;
  blockedPurchase?: boolean;
  blockedManufacturing?: boolean;
  inactiveDate?: string | null;
  isActive?: boolean;
  detectedWidth?: number | null;
  widthWarning?: string | null;
  stockTotal?: number | null;
  stocks?: { warehouseCode: string; warehouse: string; quantity: number }[];
  stockSeries?: string[];
};

export type StockDetailRow = {
  warehouseCode: string;
  warehouse: string;
  locationCode?: string | null;
  location?: string | null;
  series?: string | null;
  quantity: number;
  lastEntryDate?: string | null;
  lastMovementDate?: string | null;
};

export type StockDetailResponse = {
  article: Pick<Article, 'idArticle' | 'code' | 'description'>;
  total: number;
  rows: StockDetailRow[];
};

export type MaterialLine = {
  id: string;
  code: string;
  description: string;
  quantity: number;
  width?: number | null;
  widthWarning?: string | null;
};

export type OfBlock = {
  id: string;
  of: string;
  description: string;
  materials: MaterialLine[];
};

export type PersistedState = {
  orderCode: string;
  ofs: OfBlock[];
};

export type ToastType = 'ok' | 'error' | 'warn' | 'info';

export type ToastAction = {
  label: string;
  run: () => void;
};

export type Toast = {
  id: string;
  text: string;
  type: ToastType;
  action?: ToastAction;
  leaving?: boolean;
};

export type ThemeMode = 'light' | 'dark' | 'system';

export type ConnectionState = 'checking' | 'ok' | 'error';

export type HistoryEntry = {
  id: string;
  createdAt: string;
  orderCode: string;
  ofs: { of: string; description?: string; materials: { code: string; description: string; quantity: number }[] }[];
  files: { of: string; filename: string; overwritten: boolean }[];
  orderArchive: { filename: string; overwritten: boolean } | null;
  totals: { ofs: number; lines: number; units: number };
};

export type ArticleFilters = {
  family: string[];
  subfamily: string[];
  unit: string[];
  productionSection: string[];
};

export type CatalogFilterState = {
  q: string;
  family: string;
  subfamily: string;
  unit: string;
  productionSection: string;
  active: boolean;
  hideBlocked: boolean;
  includeOmitted: boolean;
};

// Modelos y Grupos de Asignación
export type ModelMaterial = {
  id: string;
  code: string;
  description: string;
  quantity: number;
  width?: number | null;
  widthWarning?: string | null;
};

export type ModelPart = {
  id: string;
  name: string;
  description?: string;
  materials: ModelMaterial[];
};

export type AssignmentModel = {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt?: string;
  parts: ModelPart[];
};

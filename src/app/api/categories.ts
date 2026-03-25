export type CargoCategory = 'ELECTRONICS' | 'RAW_MATERIALS' | 'MEDS_BEVERAGE';

const REQUIRED_DOCS: Record<CargoCategory, string[]> = {
  ELECTRONICS: ['BILL_OF_LADING', 'COMMERCIAL_INVOICE', 'PACKING_LIST', 'TYPE_APPROVAL', 'WH7', 'ASSESSMENT', 'DRAFT_DECLARATION', 'T1', 'EXIT_NOTE'],
  RAW_MATERIALS: ['BILL_OF_LADING', 'COMMERCIAL_INVOICE', 'PACKING_LIST', 'WH7', 'ASSESSMENT', 'DRAFT_DECLARATION', 'T1', 'EXIT_NOTE'],
  MEDS_BEVERAGE: ['BILL_OF_LADING', 'COMMERCIAL_INVOICE', 'PACKING_LIST', 'IMPORT_LICENSE', 'WH7', 'ASSESSMENT', 'DRAFT_DECLARATION', 'T1', 'EXIT_NOTE'],
};

export function requiredDocsForCategory(category: CargoCategory): string[] {
  return REQUIRED_DOCS[category] ?? REQUIRED_DOCS.OTHER;
}

export function formatLabel(value?: string | null): string {
  if (!value) return 'Unknown';
  return value.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (s) => s.toUpperCase());
}

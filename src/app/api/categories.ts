export type CargoCategory = 'ELECTRONICS' | 'RAW_MATERIALS' | 'MEDS_BEVERAGE';

const REQUIRED_DOCS: Record<CargoCategory, string[]> = {
  ELECTRONICS: ['BILL_OF_LADING', 'COMMERCIAL_INVOICE', 'PACKING_LIST', 'TYPE_APPROVAL', 'T1_FORM'],
  RAW_MATERIALS: ['BILL_OF_LADING', 'COMMERCIAL_INVOICE', 'PACKING_LIST', 'T1_FORM'],
  MEDS_BEVERAGE: ['BILL_OF_LADING', 'COMMERCIAL_INVOICE', 'PACKING_LIST', 'IMPORT_LICENSE', 'T1_FORM'],
};

export function requiredDocsForCategory(category: CargoCategory): string[] {
  return REQUIRED_DOCS[category] ?? REQUIRED_DOCS.OTHER;
}

export function formatLabel(value?: string | null): string {
  if (!value) return 'Unknown';
  return value.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (s) => s.toUpperCase());
}

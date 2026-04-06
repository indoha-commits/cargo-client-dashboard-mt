export type CargoCategory = 'ELECTRONICS' | 'RAW_MATERIALS' | 'MEDS_BEVERAGE';
export type ClearancePathway = 'PORT_CLEARANCE' | 'T1_TRANSIT';

// Common documents for all cargo
const COMMON_DOCS = ['BILL_OF_LADING', 'COMMERCIAL_INVOICE', 'PACKING_LIST'];

// Category-specific documents
const CATEGORY_SPECIFIC_DOCS: Record<CargoCategory, string[]> = {
  ELECTRONICS: ['TYPE_APPROVAL'],
  RAW_MATERIALS: [],
  MEDS_BEVERAGE: ['IMPORT_LICENSE'],
};

// Clearance pathway documents
const PATHWAY_DOCS: Record<ClearancePathway, string[]> = {
  // Pay tax at port
  PORT_CLEARANCE: ['WH7', 'DRAFT_DECLARATION', 'ASSESSMENT', 'EXIT_NOTE'],
  // Pay tax after transport (deferred) - also needs EXIT_NOTE when container leaves
  T1_TRANSIT: ['T1_FORM', 'IM8_FORM', 'EXIT_NOTE'],
};

export function requiredDocsForCategory(category: CargoCategory, pathway?: ClearancePathway): string[] {
  const categoryDocs = CATEGORY_SPECIFIC_DOCS[category] || [];
  const pathwayDocs = pathway ? PATHWAY_DOCS[pathway] : PATHWAY_DOCS.PORT_CLEARANCE; // Default to PORT_CLEARANCE for backwards compatibility
  
  return [...COMMON_DOCS, ...categoryDocs, ...pathwayDocs];
}

// Get documents that are NOT needed for a specific pathway (should be marked as _not_available_)
export function getNotAvailableDocsForPathway(category: CargoCategory, pathway: ClearancePathway): string[] {
  const allPathwayDocs = [...PATHWAY_DOCS.PORT_CLEARANCE, ...PATHWAY_DOCS.T1_TRANSIT];
  const requiredPathwayDocs = PATHWAY_DOCS[pathway];
  
  // Return pathway docs that are NOT in the required list
  return allPathwayDocs.filter(doc => !requiredPathwayDocs.includes(doc));
}

export function getClearancePathwayLabel(pathway: ClearancePathway): string {
  return pathway === 'PORT_CLEARANCE' 
    ? 'Port Clearance (Pay Tax at Port)' 
    : 'T1 Transit (Pay Tax After Transport)';
}

export function getPathwayDescription(pathway: ClearancePathway): string {
  if (pathway === 'PORT_CLEARANCE') {
    return 'Customs clearance at port with immediate tax payment. Exit note issued when container leaves port.';
  }
  return 'Transport under bond with deferred tax payment. Requires T1 form and IM8 for ownership change. Exit note issued when container leaves.';
}

export function formatLabel(value?: string | null): string {
  if (!value) return 'Unknown';
  return value.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (s) => s.toUpperCase());
}

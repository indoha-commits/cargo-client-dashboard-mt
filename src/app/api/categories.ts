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

// Pathway-specific docs are shown under "Customs clearance" (ops); client-required stays category + common only.
const PATHWAY_DOCS: Record<ClearancePathway, string[]> = {
  PORT_CLEARANCE: [],
  T1_TRANSIT: [],
};

/** Customs clearance document rows by tax / clearance pathway (aligned with ops import seeding). */
export function customsClearanceSlots(pathway: ClearancePathway): { label: string; docTypes: string[] }[] {
  if (pathway === 'PORT_CLEARANCE') {
    return [
      { label: 'Draft declaration', docTypes: ['DRAFT_DECLARATION'] },
      { label: 'Assessment', docTypes: ['ASSESSMENT'] },
      { label: 'WH7', docTypes: ['WH7'] },
      { label: 'Exit note', docTypes: ['EXIT_NOTE'] },
    ];
  }
  return [
    { label: 'Draft declaration', docTypes: ['DRAFT_DECLARATION'] },
    { label: 'Assessment', docTypes: ['ASSESSMENT'] },
    { label: 'T1', docTypes: ['T1'] },
    { label: 'T1 form', docTypes: ['T1_FORM'] },
    { label: 'WH7', docTypes: ['WH7'] },
    { label: 'Change of ownership', docTypes: ['CHANGE_OF_OWNERSHIP'] },
    { label: 'IM7 / IM8', docTypes: ['IM7', 'IM8'] },
  ];
}

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
    return 'Customs clearance at port with immediate tax payment. Draft, assessment, WH7, and exit note are prepared by operations.';
  }
  return 'T1 transit: draft, assessment, T1, T1 form, WH7, change of ownership, and IM7 or IM8 are prepared by operations under this pathway.';
}

export function formatLabel(value?: string | null): string {
  if (!value) return 'Unknown';
  return value.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (s) => s.toUpperCase());
}

import {
  ArrowRight,
  Check,
  ChevronRight,
  Circle,
  Clock,
  Download,
  FileText,
  Ship,
  TriangleAlert,
  Upload,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Toast, ToastType } from './Toast';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import {
  requiredDocsForCategory,
  formatLabel as formatCategoryLabel,
  customsClearanceSlots,
  getClearancePathwayLabel,
  type ClearancePathway,
} from '../api/categories';
import {
  approveClientCargoApproval,
  getClientApprovalSignedUrl,
  getClientCargoApprovals,
  getClientCargoDetail,
  getClientDocumentSignedUrl,
  getClientDocumentsBulkSignedUrls,
  rejectClientCargoApproval,
  type CargoApproval,
  insertClientDocument,
  type ClientCargoDetail,
} from '../api/client';
import { uploadClientDocumentFile } from '../auth/storage';
import { getSupabase } from '../auth/supabase';

interface CargoDetailProps {
  cargoId: string;
  onBack: () => void;
  onToggleTheme: () => void;
  theme: 'light' | 'dark';
}

type UiDocument = {
  id: string;
  name: string;
  type: string;
  status: 'uploaded' | 'pending' | 'verified' | 'rejected' | 'not_available';
  uploadedDate?: string;
  driveUrl?: string;
  rejectionReason?: string;
};

type UiTimelineEvent = {
  date: string;
  time: string;
  status: string;
  location: string;
  completed: boolean;
  detail?: string;
};

type NextRequiredActionInfo = {
  title: string;
  subtitle?: string;
  raw: string;
};

function mapDocStatus(status: string): UiDocument['status'] {
  if (status === 'VERIFIED') return 'verified';
  if (status === 'UPLOADED') return 'uploaded';
  if (status === 'REJECTED') return 'rejected';
  if (status === 'NOT_AVAILABLE') return 'not_available';
  return 'pending';
}

function rankDocStatus(s: UiDocument['status']): number {
  if (s === 'verified') return 4;
  if (s === 'uploaded') return 3;
  if (s === 'not_available') return 2;
  if (s === 'rejected') return 1;
  return 0;
}

/** Prefer the strongest row among IM7/IM8 (or other alternates in one slot). */
function pickPrimaryDocForSlot(
  documentsByType: Record<string, UiDocument[]>,
  docTypes: string[]
): UiDocument | null {
  let best: UiDocument | null = null;
  for (const t of docTypes) {
    const row = documentsByType[t]?.[0];
    if (!row) continue;
    if (!best || rankDocStatus(row.status) > rankDocStatus(best.status)) best = row;
  }
  return best;
}

function docDisplayName(documentType: string): string {
  switch (documentType) {
    case 'BILL_OF_LADING':
      return 'Bill of Lading';
    case 'COMMERCIAL_INVOICE':
      return 'Commercial Invoice';
    case 'PACKING_LIST':
      return 'Packing List';
    case 'IMPORT_PERMIT':
      return 'Import Permit';
    case 'IMPORT_LICENSE':
      return 'Import License';
    case 'TYPE_APPROVAL':
      return 'Type Approval';
    case 'DRAFT_DECLARATION':
      return 'Draft declaration';
    case 'ASSESSMENT':
      return 'Assessment';
    case 'WH7':
      return 'WH7';
    case 'T1':
      return 'T1';
    case 'T1_FORM':
      return 'T1 form';
    case 'IM7':
      return 'IM7';
    case 'IM8':
      return 'IM8';
    case 'IM4':
      return 'IM4 Document';
    case 'WH7_DOC':
      return 'WH7 Document';
    case 'EXIT_NOTE':
      return 'Exit Note';
    default:
      return documentType;
  }
}

function formatLabel(value: string): string {
  return value.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (s) => s.toUpperCase());
}

function formatIso(ts: string | null | undefined): { date: string; time: string } {
  if (!ts) return { date: '—', time: '—' };
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return { date: ts, time: '' };
  const date = d.toISOString().slice(0, 10);
  const time = d.toISOString().slice(11, 16) + ' UTC';
  return { date, time };
}

function mapEventHeadline(eventType: string): { status: string; location?: string } {
  switch (eventType) {
    case 'PORT_OFFLOADED':
      return {
        status: 'Port offloaded',
        location: 'Container discharged at the port of arrival.',
      };
    case 'CREATED':
      return {
        status: 'Cargo created',
        location: 'Shipment record initiated in the system.',
      };
    case 'ALL_DOCUMENTS_UPLOADED':
    case 'DOCUMENTS_UPLOADED':
      return {
        status: 'All files uploaded',
        location: 'All required documents have been uploaded.',
      };
    case 'ALL_DOCUMENTS_APPROVED':
    case 'DOCUMENTS_APPROVED':
      return {
        status: 'All Documents Approved',
        location: 'All uploaded documents have been verified and approved.',
      };
    case 'CLIENT_VALIDATED_ASSESSMENT_DRAFT_DOCUMENTS':
    case 'DRAFT_ASSESSMENT_VALIDATED':
      return {
        status: 'Draft/Assessment validated',
        location: 'Client approved draft and assessment documents.',
      };
    case 'PHYSICAL_VERIFICATION_PENDING':
      return {
        status: 'Physical verification pending',
        location: 'Awaiting on-site inspection scheduling.',
      };
    case 'PHYSICAL_VERIFICATION_COMPLETED':
    case 'PHYSICAL_VERIFICATION':
      return {
        status: 'Physical verification completed',
        location: 'On-site inspection completed by ops team.',
      };
    case 'ASSESSMENT_AND_DRAFT_WAITING_ON_VALIDATION':
    case 'ASSESSMENT_AND_DRAFT_WAITING_ON_VALIDATION'.toLowerCase():
    case 'ASSESSMENT_AND_DRAFT_WAITING_ON_VALIDATION'.toUpperCase():
    case 'ASSESSMENT_AND_DRAFT_WAITING_ON_VALIDATION'.replace(/_/g, ' '):
    case 'ASSESSMENT_AND_DRAFT_WAITING_ON_VALIDATION'.replace(/_/g, ' ').toLowerCase():
      return {
        status: 'Assessment and Draft waiting on validation',
        location: 'Ops validation is in progress for the draft and assessment documents.',
      };
    case 'WAREHOUSE_ARRIVAL':
    case 'CARGO_REACHED_WAREHOUSE':
      return {
        status: 'Warehouse arrival',
        location: 'Shipment received at the warehouse.',
      };
    case 'CARGO_ARRIVED_DESTINATION':
    case 'DESTINATION_ARRIVAL':
      return {
        status: 'Cargo arrived at destination',
        location: 'Shipment has reached its final destination.',
      };
    case 'DEPARTED_PORT':
      return {
        status: 'Departed from port',
        location: 'Shipment has departed from the port of origin.',
      };
    case 'IN_ROUTE_RUSUMO':
      return {
        status: 'In route to Rusumo',
        location: 'Shipment is in transit to Rusumo entry office.',
      };
    default:
      return { status: formatLabel(eventType) };
  }
}

function mapEventsToTimeline(events: ClientCargoDetail['events']): UiTimelineEvent[] {
  if (!events?.length) return [];
  return events
    .slice()
    .sort((a, b) => {
      const at = Date.parse(a.event_time);
      const bt = Date.parse(b.event_time);
      if (at !== bt) return at - bt;
      return Date.parse(a.recorded_at) - Date.parse(b.recorded_at);
    })
    .map((e) => {
      const { date, time } = formatIso(e.event_time);
      const headline = mapEventHeadline(e.event_type);
      return {
        date,
        time,
        status: headline.status,
        location: headline.location ?? e.location_id ?? '—',
        completed: true,
      };
    });
}

/**
 * For ops imports that already reached the warehouse, show the full milestone chain as complete
 * even when only the final event was persisted.
 */
function mergeImportWarehouseTimeline(
  events: ClientCargoDetail['events'],
  isImport: boolean
): UiTimelineEvent[] | null {
  if (!isImport || !events?.length) return null;
  const whEvents = events.filter(
    (e) => e.event_type === 'WAREHOUSE_ARRIVAL' || e.event_type === 'CARGO_REACHED_WAREHOUSE'
  );
  if (!whEvents.length) return null;
  const whEvent = whEvents.reduce((best, e) =>
    Date.parse(e.event_time) > Date.parse(best.event_time) ? e : best
  );
  const order = [
    'PORT_OFFLOADED',
    'ALL_DOCUMENTS_APPROVED',
    'DEPARTED_PORT',
    'IN_ROUTE_RUSUMO',
    'PHYSICAL_VERIFICATION',
    'WAREHOUSE_ARRIVAL',
  ] as const;
  const byType = new Map(events.map((e) => [e.event_type, e]));
  const eventTimeFor = (eventType: string) => {
    const direct = byType.get(eventType)?.event_time;
    if (direct) return direct;
    if (eventType === 'WAREHOUSE_ARRIVAL') {
      return byType.get('CARGO_REACHED_WAREHOUSE')?.event_time;
    }
    return undefined;
  };
  const baseTime = Date.parse(whEvent.event_time);
  return order.map((eventType, i) => {
    const iso =
      eventTimeFor(eventType) ?? new Date(baseTime - (order.length - 1 - i) * 1500).toISOString();
    const headline = mapEventHeadline(eventType);
    const { date, time } = formatIso(iso);
    return {
      date,
      time,
      status: headline.status,
      location: headline.location ?? '—',
      completed: true,
    };
  });
}

function buildDerivedTimeline(detail: ClientCargoDetail, approvals: CargoApproval[]): UiTimelineEvent[] {
  // This mirrors `cargo-internal-dashboard/src/app/components/pages/CargoTimelinePage.tsx`.
  const events: Array<{ label: string; at: string; detail?: string; location?: string; completed: boolean }> = [];

  // 1) Cargo created
  events.push({
    label: 'Cargo created',
    at: detail.cargo.created_at,
    location: 'Shipment record initiated in the system.',
    completed: true,
  });

  // 2) Document-based milestones (bucket evidence)
  const uploadedDocs = detail.documents.filter((d) => d.status === 'UPLOADED' && d.uploaded_at);
  const verifiedDocs = detail.documents.filter((d) => d.status === 'VERIFIED' && d.verified_at);

  const earliestUpload = uploadedDocs
    .map((d) => d.uploaded_at as string)
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0];

  const latestUpload = uploadedDocs
    .map((d) => d.uploaded_at as string)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];

  const latestVerified = verifiedDocs
    .map((d) => d.verified_at as string)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];

  if (earliestUpload) {
    events.push({
      label: 'All files uploaded',
      at: earliestUpload,
      location: 'All required documents have been uploaded.',
      completed: true,
    });
  }

  if (latestVerified) {
    events.push({
      label: 'All Documents Approved',
      at: latestVerified,
      location: 'All uploaded documents have been verified and approved.',
      completed: true,
    });
  }

  // 3) Approvals (draft/assessment) visibility - only show when BOTH are approved
  const draftApproval = approvals.find((a) => a.kind === 'DRAFT_VALIDATION');
  const assessmentApproval = approvals.find((a) => a.kind === 'ASSESSMENT_VALIDATION');
  
  // Only add the "Draft/Assessment validated" event if BOTH are approved
  if (draftApproval?.status === 'APPROVED' && assessmentApproval?.status === 'APPROVED') {
    // Use the later of the two approval timestamps
    const draftTime = draftApproval.decided_at ?? draftApproval.created_at;
    const assessmentTime = assessmentApproval.decided_at ?? assessmentApproval.created_at;
    const laterTime = Date.parse(draftTime) > Date.parse(assessmentTime) ? draftTime : assessmentTime;
    
    events.push({
      label: 'Draft/Assessment validated',
      at: laterTime,
      location: 'Client approved draft and assessment documents.',
      completed: true,
    });
  }

  // Sort chronologically
  return events
    .filter((e) => !Number.isNaN(Date.parse(e.at)))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .map((ev) => {
      const t = formatIso(ev.at);
      return {
        date: t.date,
        time: t.time,
        status: ev.label,
        location: ev.location ?? 'Ops update recorded.',
        completed: ev.completed,
        detail: ev.detail,
      };
    });
}

function formatFriendlyDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
}

function maxIso(...values: Array<string | null | undefined>): string | null {
  const best = values
    .filter((v): v is string => Boolean(v))
    .map((v) => ({ raw: v, t: Date.parse(v) }))
    .filter((v) => !Number.isNaN(v.t))
    .sort((a, b) => b.t - a.t)[0];
  return best?.raw ?? null;
}

function getNextRequiredActionInfo(rawAction: string): NextRequiredActionInfo {
  // UI-only mapping: keep raw enum available, but present client-friendly wording.
  switch (rawAction) {
    case 'OPS_INSERT_PORT_OFFLOADED':
      return {
        title: 'Waiting for port offloading confirmation',
        subtitle: 'Our operations team is confirming the port offloading update.',
        raw: rawAction,
      };
    case 'OPS_UPLOAD_YOUR_DOCUMENTS_FOR_DRAFT_AND_ASSESSMENT':
      return {
        title: 'Ops is preparing draft & assessment',
        subtitle: 'We’ll notify you once they’re ready.',
        raw: rawAction,
      };
    case 'CLIENT_UPLOAD_REQUIRED_DOCUMENTS':
      return {
        title: 'Upload your required documents',
        subtitle: 'Please submit all requested files to keep the shipment moving.',
        raw: rawAction,
      };
    case 'COMPLETE':
      return {
        title: 'Shipment complete',
        subtitle: 'All milestones for this import are recorded.',
        raw: rawAction,
      };
    default:
      // Soft fallback: make enums readable without exposing raw as the primary label.
      return {
        title: rawAction
          .replace(/^CLIENT_/, '')
          .replace(/^OPS_/, '')
          .replace(/_/g, ' ')
          .toLowerCase()
          .replace(/^\w/, (c) => c.toUpperCase()),
        raw: rawAction,
      };
  }
}

function computeSlaHint(
  eta: string | null | undefined,
  nextRequiredAction: string | null | undefined
): { label: string; tone: 'ok' | 'risk' } | null {
  const action = String(nextRequiredAction || '').toUpperCase();
  if (['WAREHOUSE_ARRIVAL', 'CARGO_ARRIVED_TO_YOUR_LOCATION', 'COMPLETE'].includes(action)) {
    return { label: 'SLA: Completed', tone: 'ok' };
  }
  if (!eta) return null;
  const etaTime = Date.parse(eta);
  if (Number.isNaN(etaTime)) return null;

  const msRemaining = etaTime - Date.now();
  const abs = Math.abs(msRemaining);
  const hours = Math.round(abs / (1000 * 60 * 60));
  const days = Math.floor(abs / (1000 * 60 * 60 * 24));

  const remainingText = msRemaining >= 0 ? 'remaining' : 'overdue';
  const timeText = days >= 2 ? `${days} days ${remainingText}` : `${hours} hours ${remainingText}`;

  // Enterprise-safe heuristic: < 24h is "At Risk".
  const atRisk = msRemaining >= 0 && msRemaining <= 24 * 60 * 60 * 1000;
  return {
    label: `SLA: ${atRisk ? 'At Risk' : 'On Track'} (${timeText})`,
    tone: atRisk ? 'risk' : 'ok',
  };
}

// Helper function to download a file without popup
async function downloadFileBlob(url: string, filename: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Download failed');
  
  // Sanitize filename to prevent XSS and path traversal
  const sanitizedFilename = filename
    .replace(/[^a-zA-Z0-9._-]/g, '_') // Remove special characters
    .replace(/^\.+/, '') // Remove leading dots
    .substring(0, 255); // Limit length
  
  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = sanitizedFilename || 'document.pdf'; // Fallback if empty
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(downloadUrl);
}

export function CargoDetail({ cargoId, onBack, onToggleTheme, theme }: CargoDetailProps) {
  const workersEnabled = (import.meta.env.VITE_WORKERS_ENABLED ?? 'true') === 'true';

  const [detail, setDetail] = useState<ClientCargoDetail | null>(null);
  const [approvals, setApprovals] = useState<CargoApproval[]>([]);
  const [approvalsError, setApprovalsError] = useState<string | null>(null);
  const [approvalsBusyId, setApprovalsBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isUploading, setIsUploading] = useState<string | null>(null);
  const [uploadDocType, setUploadDocType] = useState<string | null>(null);
  const [uploadReplaceDocId, setUploadReplaceDocId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [timelineExpanded, setTimelineExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  // Toast notifications
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const showToast = (message: string, type: ToastType = 'error') => {
    setToast({ message, type });
  };

  // Fetch initial cargo detail and approvals
  useEffect(() => {
    let cancelled = false;
    if (!workersEnabled) {
      setDetail(null);
      return;
    }

    setLoading(true);
    getClientCargoDetail(cargoId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setApprovalsError(null);
        return getClientCargoApprovals(cargoId)
          .then((approvalsRes) => {
            if (cancelled) return;
            setApprovals(approvalsRes.approvals);
          })
          .catch((e) => {
            if (cancelled) return;
            setApprovals([]);
            setApprovalsError(e instanceof Error ? e.message : String(e));
          });
      })
      .catch((e) => {
        if (cancelled) return;
        setDetail(null);
        setApprovals([]);
        setApprovalsError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cargoId, workersEnabled]);

  // Real-time subscriptions for cargo updates
  useEffect(() => {
    if (!workersEnabled) return;

    const supabase = getSupabase();

    const refreshCargoData = () => {
      getClientCargoDetail(cargoId)
        .then((d) => {
          setDetail(d);
          return getClientCargoApprovals(cargoId);
        })
        .then((approvalsRes) => {
          setApprovals(approvalsRes.approvals);
        })
        .catch((e) => {
          console.error('Failed to refresh cargo data:', e);
        });
    };

    // Subscribe to cargo_events table (timeline updates)
    const eventsSubscription = supabase
      .channel(`cargo_events_${cargoId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'cargo_events',
          filter: `cargo_id=eq.${cargoId}`,
        },
        () => {
          refreshCargoData();
        }
      )
      .subscribe();

    // Subscribe to client_documents table (document uploads/updates)
    const documentsSubscription = supabase
      .channel(`client_documents_${cargoId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'client_documents',
          filter: `cargo_id=eq.${cargoId}`,
        },
        () => {
          refreshCargoData();
        }
      )
      .subscribe();

    // Subscribe to cargo_client_approvals table (approval status changes)
    const approvalsSubscription = supabase
      .channel(`cargo_approvals_${cargoId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cargo_client_approvals',
          filter: `cargo_id=eq.${cargoId}`,
        },
        () => {
          refreshCargoData();
        }
      )
      .subscribe();

    // Subscribe to cargo table (general cargo updates)
    const cargoSubscription = supabase
      .channel(`cargo_${cargoId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'cargo',
          filter: `id=eq.${cargoId}`,
        },
        () => {
          refreshCargoData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(eventsSubscription);
      supabase.removeChannel(documentsSubscription);
      supabase.removeChannel(approvalsSubscription);
      supabase.removeChannel(cargoSubscription);
    };
  }, [cargoId, workersEnabled]);

  const nextRequiredAction = detail?.projection?.next_required_action ?? 'CLIENT_UPLOAD_REQUIRED_DOCUMENTS';
  const nextRequiredActionLabel = nextRequiredAction
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (s) => s.toUpperCase());
  const nextRequiredActionInfo = useMemo(() => getNextRequiredActionInfo(nextRequiredAction), [nextRequiredAction]);

  const documentsLastUpdated = useMemo(() => {
    if (!detail) return null;
    // Use the freshest doc activity timestamp (verified_at preferred when present).
    const values = detail.documents.flatMap((d) => [d.verified_at, d.uploaded_at]);
    return maxIso(...values);
  }, [detail]);

  const timelineLastUpdated = useMemo(() => {
    if (!detail) return null;
    const values = detail.events.flatMap((e) => [e.event_time, e.recorded_at]);
    return maxIso(...values);
  }, [detail]);

  const slaHint = useMemo(
    () => computeSlaHint(detail?.cargo.eta, detail?.projection?.next_required_action ?? null),
    [detail?.cargo.eta, detail?.projection?.next_required_action]
  );

  const clearancePathway = (detail?.cargo.clearance_pathway || 'PORT_CLEARANCE') as ClearancePathway;

  const customsTypeSet = useMemo(() => {
    const s = new Set<string>();
    customsClearanceSlots(clearancePathway).forEach((slot) => slot.docTypes.forEach((t) => s.add(t)));
    return s;
  }, [clearancePathway]);

  const requiredDocs = useMemo(() => {
    if (!detail?.cargo.category) return [] as string[];
    const docs = requiredDocsForCategory(detail.cargo.category as any, clearancePathway);
    return docs.filter((doc) => !customsTypeSet.has(doc));
  }, [detail?.cargo.category, clearancePathway, customsTypeSet]);

  const documentsByType = useMemo(() => {
    if (!detail) return {} as Record<string, UiDocument[]>;
    const grouped = detail.documents.reduce<Record<string, UiDocument[]>>((acc, d) => {
      const entry: UiDocument = {
        id: d.id,
        name: docDisplayName(d.document_type),
        type: d.document_type,
        status: mapDocStatus(d.status),
        uploadedDate: d.uploaded_at ? d.uploaded_at.slice(0, 10) : undefined,
        driveUrl: d.source_storage_path || d.provider_path || d.drive_url || undefined,
        rejectionReason: d.rejection_reason ?? undefined,
      };
      acc[d.document_type] = acc[d.document_type] ? [...acc[d.document_type], entry] : [entry];
      return acc;
    }, {});
    Object.values(grouped).forEach((list) => {
      list.sort((a, b) => {
        const rank = (s: UiDocument['status']) => (s === 'verified' ? 3 : s === 'uploaded' ? 2 : s === 'not_available' ? 1 : 0);
        const r = rank(b.status) - rank(a.status);
        if (r !== 0) return r;
        return (b.uploadedDate ?? '').localeCompare(a.uploadedDate ?? '');
      });
    });
    return grouped;
  }, [detail]);

  const customsSlots = useMemo(() => customsClearanceSlots(clearancePathway), [clearancePathway]);

  const customsRows = useMemo(
    () =>
      customsSlots.map((slot) => ({
        slot,
        doc: pickPrimaryDocForSlot(documentsByType, slot.docTypes),
      })),
    [customsSlots, documentsByType]
  );

  const timelineEvents: UiTimelineEvent[] = useMemo(() => {
    if (!detail) return [];
    const merged = mergeImportWarehouseTimeline(detail.events, detail.cargo.is_import);
    if (merged?.length) return merged;
    const mapped = mapEventsToTimeline(detail.events);
    if (mapped.length) return mapped;

    const derived = buildDerivedTimeline(detail, approvals);
    return derived.length ? derived : [];
  }, [detail, approvals]);
  const lastMilestone = useMemo(() => {
    if (!timelineEvents.length) return null;
    return timelineEvents[timelineEvents.length - 1];
  }, [timelineEvents]);

  const uploadProgress = useMemo(() => {
    if (!detail || requiredDocs.length === 0) {
      return { total: 0, uploaded: 0, verified: 0 };
    }
    const treatNaAsDone = Boolean(detail.cargo.is_import);
    return requiredDocs.reduce(
      (acc, docType) => {
        const doc = documentsByType[docType]?.[0];
        const st = doc?.status;
        if (st === 'verified') acc.verified += 1;
        else if (treatNaAsDone && st === 'not_available') acc.verified += 1;
        if (st === 'uploaded' || st === 'verified' || (treatNaAsDone && st === 'not_available')) acc.uploaded += 1;
        acc.total += 1;
        return acc;
      },
      { total: 0, uploaded: 0, verified: 0 }
    );
  }, [documentsByType, requiredDocs, detail]);

  const handleApprovalApprove = async (approvalId: string) => {
    try {
      setApprovalsBusyId(approvalId);
      const res = await approveClientCargoApproval(approvalId);
      setApprovals((prev) => prev.map((a) => (a.id === approvalId ? res.approval : a)));
    } catch (e) {
      setApprovalsError(e instanceof Error ? e.message : String(e));
    } finally {
      setApprovalsBusyId(null);
    }
  };

  const [rejectionDialog, setRejectionDialog] = useState<{
    approvalId: string;
    reason: string;
  } | null>(null);

  const handleApprovalReject = async () => {
    if (!rejectionDialog) return;
    const reason = rejectionDialog.reason.trim();
    if (!reason) return;
    try {
      setApprovalsBusyId(rejectionDialog.approvalId);
      const res = await rejectClientCargoApproval(rejectionDialog.approvalId, reason);
      setApprovals((prev) => prev.map((a) => (a.id === rejectionDialog.approvalId ? res.approval : a)));
      setRejectionDialog(null);
    } catch (e) {
      setApprovalsError(e instanceof Error ? e.message : String(e));
    } finally {
      setApprovalsBusyId(null);
    }
  };

  const handleUploadClick = (docType: string, replaceDocId?: string | null) => {
    if (!workersEnabled) {
      showToast('Uploads are disabled in preview mode.', 'info');
      return;
    }
    setUploadError(null);
    setUploadDocType(docType);
    setUploadReplaceDocId(replaceDocId ?? null);
  };

  const handleFileChosen = async (file: File) => {
    if (!uploadDocType) return;

    try {
      setIsUploading(uploadDocType);
      setUploadError(null);

      const { path } = await uploadClientDocumentFile({
        cargoId,
        documentType: uploadDocType,
        file,
      });

      // For private buckets, the backend stores the storage object path (not a public URL)
      await insertClientDocument({
        cargoId,
        documentType: uploadDocType,
        driveUrl: path,
        replaceDocumentId: uploadReplaceDocId ?? undefined,
      });

      const [refreshed, approvalsRes] = await Promise.all([
        getClientCargoDetail(cargoId),
        getClientCargoApprovals(cargoId),
      ]);
      setDetail(refreshed);
      setApprovals(approvalsRes.approvals);
      setUploadDocType(null);
      setUploadReplaceDocId(null);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsUploading(null);
    }
  };

  return (
    <div className="min-h-screen h-full overflow-y-auto bg-background text-foreground">
      {/* Hidden file input used by the upload modal */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // reset so selecting the same file twice still triggers change
          e.currentTarget.value = '';
          if (file) void handleFileChosen(file);
        }}
      />

      {uploadDocType && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg bg-card rounded-sm border border-border">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="text-foreground" style={{ fontWeight: 600 }}>
                Upload {docDisplayName(uploadDocType)}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setUploadDocType(null)}
                className="text-foreground hover:bg-muted/60"
                disabled={isUploading === uploadDocType}
              >
                Close
              </Button>
            </div>

            <div className="p-4">
              {uploadError && (
                <div className="mb-3 rounded-sm border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
                  {uploadError}
                </div>
              )}

              <div
                className="border-2 border-dashed border-border rounded-sm p-6 text-center bg-background"
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) void handleFileChosen(file);
                }}
              >
                <div className="text-foreground mb-2">Drag & drop a file here</div>
                <div className="text-sm text-muted-foreground mb-4">or choose a file from your computer</div>
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading === uploadDocType}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-60"
                >
                  Choose file
                </Button>
                {isUploading === uploadDocType && (
                  <div className="mt-3 text-sm text-muted-foreground">Uploading…</div>
                )}
              </div>

              <div className="mt-3 text-xs text-muted-foreground">
                Note: Uploads are stored in the project storage bucket and linked to this shipment.
              </div>
            </div>
          </div>
        </div>
      )}

      {rejectionDialog && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg bg-card rounded-sm border border-border">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="text-foreground" style={{ fontWeight: 600 }}>
                Reject document
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRejectionDialog(null)}
                className="text-foreground hover:bg-muted/60"
              >
                Close
              </Button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-sm text-foreground" htmlFor="rejection-reason">
                  Reason for rejection
                </label>
                <textarea
                  id="rejection-reason"
                  value={rejectionDialog.reason}
                  onChange={(e) => setRejectionDialog((prev) => (prev ? { ...prev, reason: e.target.value } : prev))}
                  rows={4}
                  className="mt-2 w-full rounded-sm border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
                  placeholder="Add a short reason to help the ops team address the issue"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setRejectionDialog(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleApprovalReject()}
                  disabled={!rejectionDialog.reason.trim() || approvalsBusyId === rejectionDialog.approvalId}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {approvalsBusyId === rejectionDialog.approvalId ? 'Submitting…' : 'Submit rejection'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      <header className="bg-[#0F1117] text-white border-b border-border">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 sm:gap-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="text-primary-foreground hover:bg-primary-foreground/10 px-2 shrink-0"
            >
              <ChevronRight className="size-4 rotate-180" />
              <span className="hidden sm:inline ml-1">Back</span>
            </Button>
            <img
              src="/indataflow-logo.png"
              alt="InDataFlow"
              className="h-10 sm:h-16 w-auto brightness-0 invert shrink-0"
            />
            <h1 className="text-primary-foreground text-sm sm:text-lg truncate">Cargo Details</h1>
          </div>
          <div className="flex items-center gap-1 sm:gap-3 shrink-0">
            <span className="hidden sm:inline text-primary-foreground/80 text-sm">Client Portal</span>
            <button
              type="button"
              onClick={onToggleTheme}
              className="px-2 py-1.5 sm:px-3 sm:py-2 rounded-sm border border-primary-foreground/30 text-primary-foreground text-xs sm:text-sm hover:bg-primary-foreground/10 transition-colors inline-flex"
            >
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
          </div>
        </div>
      </header>

      {/* Full-screen loading overlay */}
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-background/70 backdrop-blur-md" />
          <div className="relative flex flex-col items-center gap-3">
            <div className="h-10 w-10 rounded-full border-4 border-primary/30 border-t-primary animate-spin" />
            <div className="text-sm text-foreground">Loading shipment…</div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
        <div className="mb-4 sm:mb-6">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-2 text-xs sm:text-base flex-wrap">
            <span>Active Shipments</span>
            <ArrowRight className="size-3 sm:size-4 shrink-0" />
            <span className="text-foreground truncate">{cargoId}</span>
          </div>
          <div>
            <h2 className="text-foreground mb-1 text-base sm:text-2xl break-all">Shipment Reference: {cargoId}</h2>
            {detail?.cargo.bill_of_lading_group && (
              <p className="text-muted-foreground text-sm sm:text-base">BoL Group: {detail.cargo.bill_of_lading_group}</p>
            )}
            <p className="text-muted-foreground text-sm sm:text-base">
              Route:{' '}
              {detail?.cargo.route ??
                (detail?.cargo.origin && detail?.cargo.destination
                  ? `${detail.cargo.origin} → ${detail.cargo.destination}`
                  : 'Mombasa, KN → Kigali, RW')}
            </p>
            <p className="text-muted-foreground text-sm sm:text-base">
              Vessel: {detail?.cargo.vessel ?? 'MSC'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            <div className="bg-card border border-border rounded-sm p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                <div className="min-w-0">
                  <h3 className="text-foreground text-sm sm:text-xl">Upload required documents</h3>
                  <div className="text-xs sm:text-sm text-muted-foreground mt-1 flex flex-col sm:flex-row sm:items-center gap-2">
                    {detail?.cargo.category
                      ? `Category: ${formatCategoryLabel(detail.cargo.category)}`
                      : 'Category not set'}
                    {' · '}
                    {getClearancePathwayLabel(clearancePathway)}
                    {' · '}Updated: {formatFriendlyDate(documentsLastUpdated)}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-xs sm:text-base text-muted-foreground">
                    {uploadProgress.total > 0
                      ? (detail?.cargo.is_import || uploadProgress.uploaded === 0)
                        ? `${uploadProgress.verified}/${uploadProgress.total} verified`
                        : `${uploadProgress.verified}/${uploadProgress.total} verified · ${uploadProgress.uploaded}/${uploadProgress.total} submitted`
                      : '—'}
                  </div>
                  {/* Download All — shown when all docs are verified */}
                  {uploadProgress.verified > 0 && uploadProgress.verified === uploadProgress.total && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const { getBaseUrl, getAuthHeader } = await import('../api/http');
                          
                          const url = `${getBaseUrl()}/client/cargo/${encodeURIComponent(cargoId)}/documents/signed-urls`;
                          
                          const response = await fetch(url, {
                            headers: getAuthHeader(),
                          });
                          
                          if (!response.ok) {
                            const error = await response.json().catch(() => ({ error: 'download_failed' }));
                            showToast(`Failed to download documents: ${error.error || response.statusText}`);
                            return;
                          }
                          
                          // Get the ZIP file blob
                          const blob = await response.blob();
                          
                          // Create download link
                          const downloadUrl = window.URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = downloadUrl;
                          a.download = `${cargoId}_documents.zip`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          window.URL.revokeObjectURL(downloadUrl);
                          showToast('Documents downloaded successfully!', 'success');
                        } catch (e) {
                          showToast(`Download error: ${String(e)}`);
                        }
                      }}
                      className="inline-flex items-center gap-1.5 text-xs sm:text-sm px-3 py-1.5 rounded-sm border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors whitespace-nowrap"
                    >
                      <Download className="size-3 sm:size-4" />
                      Download All (ZIP)
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-2 sm:space-y-3">
                {requiredDocs.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No required documents configured.</div>
                ) : (
                  requiredDocs.map((docType) => {
                    const doc = documentsByType[docType]?.[0];
                    const status = doc?.status ?? 'pending'; // already mapped via documentsByType
                    const name = doc?.name ?? formatCategoryLabel(docType);
                    return (
                      <div
                        key={docType}
                        className="flex flex-col gap-2 p-3 sm:p-4 border border-border rounded-sm"
                      >
                        {/* Top row: icon + name + badge */}
                        <div className="flex items-start gap-2">
                          <FileText className="size-4 sm:size-6 text-muted-foreground shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="text-foreground text-sm sm:text-lg font-medium">{name}</div>
                            <div className="text-xs sm:text-base text-muted-foreground mt-0.5">
                              {status === 'not_available'
                                ? 'Not available for this shipment'
                                : doc?.driveUrl
                                  ? doc?.uploadedDate ? `Uploaded ${doc.uploadedDate}` : 'Uploaded'
                                  : status === 'verified'
                                    ? doc?.uploadedDate ? `Verified by ops · ${doc.uploadedDate}` : 'Verified by ops'
                                    : 'Not uploaded'}
                            </div>
                            {status === 'rejected' && (
                              <div className="mt-1.5 flex flex-wrap items-center gap-1 rounded-sm border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">
                                <TriangleAlert className="size-3 shrink-0" />
                                <span className="font-medium">Rejected:</span>
                                <span className="text-destructive/80 break-words">
                                  {doc?.rejectionReason?.trim() || 'Pending from ops team'}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="shrink-0">
                            {status === 'verified' && (
                              <Badge className="bg-[#10b981] text-white rounded-sm text-xs sm:text-sm">
                                <Check className="size-3 mr-1" />
                                Verified
                              </Badge>
                            )}
                            {status === 'uploaded' && (
                              <Badge className="bg-[#f59e0b] text-white rounded-sm text-xs sm:text-sm">Uploaded</Badge>
                            )}
                            {status === 'rejected' && (
                              <Badge className="bg-[#ef4444] text-white rounded-sm text-xs sm:text-sm">Rejected</Badge>
                            )}
                            {status === 'not_available' && (
                              <Badge className="bg-[#6b7280] text-white rounded-sm text-xs sm:text-sm">
                                {detail?.cargo.is_import ? 'Verified (N/A)' : 'Not Available'}
                              </Badge>
                            )}
                            {status === 'pending' && (
                              <Badge className="bg-muted text-foreground rounded-sm text-xs sm:text-sm">Required</Badge>
                            )}
                          </div>
                        </div>
                        {/* Action button row — hidden when not_available */}
                        {status !== 'not_available' && (
                        <div className="flex justify-end">
                          {status === 'pending' || status === 'rejected' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-border text-foreground hover:bg-muted/60 text-xs sm:text-sm sm:h-9"
                              onClick={() => handleUploadClick(docType, doc?.id ?? null)}
                              disabled={!workersEnabled || isUploading === docType}
                            >
                              <Upload className="size-3 mr-1.5" />
                              {!workersEnabled
                                ? 'Disabled'
                                : isUploading === docType
                                  ? 'Uploading…'
                                  : status === 'rejected'
                                    ? 'Re-upload'
                                    : docType === 'T1_FORM'
                                      ? 'Upload T1'
                                      : 'Upload'}
                            </Button>
                          ) : doc?.driveUrl ? (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const { url } = await getClientDocumentSignedUrl(doc.id);
                                  const filename = `${docDisplayName(doc.type)}.pdf`;
                                  await downloadFileBlob(url, filename);
                                  showToast('Document downloaded successfully!', 'success');
                                } catch (e) {
                                  showToast(`Failed to download document: ${String(e)}`);
                                }
                              }}
                              className="inline-flex items-center text-xs sm:text-sm text-muted-foreground hover:text-foreground"
                            >
                              <Download className="size-3 sm:size-4 mr-1.5" />
                              Download
                            </button>
                          ) : status === 'verified' ? (
                            <span className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1">
                              <Check className="size-3 sm:size-4 text-emerald-500" />
                              Verified by Ops
                            </span>
                          ) : null}
                        </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="bg-card border border-border rounded-sm p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="min-w-0">
                  <h3 className="text-foreground text-sm sm:text-xl">Customs clearance documents</h3>
                  <div className="text-xs sm:text-base text-muted-foreground mt-0.5">
                    {getClearancePathwayLabel(clearancePathway)} — prepared by operations; download when available.
                  </div>
                </div>
                <div className="text-xs sm:text-base text-muted-foreground shrink-0 ml-2">{approvals.length} approvals</div>
              </div>

              {approvalsError && (
                <div className="mb-3 rounded-sm border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
                  {approvalsError}
                </div>
              )}

              <div className="space-y-2 sm:space-y-3">
                {customsRows.map(({ slot, doc }) => {
                  const status = doc?.status ?? 'pending';
                  const isNotAvailable = status === 'not_available';
                  const countsAsVerified = status === 'verified' || (Boolean(detail?.cargo.is_import) && isNotAvailable);
                  return (
                    <div key={slot.label} className="flex flex-col gap-2 p-3 sm:p-4 border border-border rounded-sm">
                      <div className="flex items-start gap-2">
                        <FileText className="size-4 sm:size-6 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="text-foreground text-sm sm:text-lg font-medium">{slot.label}</div>
                          <div className="text-xs sm:text-base text-muted-foreground mt-0.5">
                            {!doc
                              ? 'Not recorded yet'
                              : isNotAvailable
                                ? detail?.cargo.is_import
                                  ? 'Marked not applicable — counts as cleared for this import.'
                                  : 'Not available for this shipment'
                                : doc?.driveUrl
                                  ? doc?.uploadedDate
                                    ? `Uploaded ${doc.uploadedDate}`
                                    : 'Uploaded'
                                  : status === 'verified'
                                    ? doc?.uploadedDate
                                      ? `Verified by ops · ${doc.uploadedDate}`
                                      : 'Verified by ops'
                                    : 'No file uploaded yet'}
                          </div>
                        </div>
                        <div className="shrink-0">
                          {countsAsVerified && (
                            <Badge className="bg-[#10b981] text-white rounded-sm text-xs sm:text-sm">Verified</Badge>
                          )}
                          {status === 'uploaded' && (
                            <Badge className="bg-[#f59e0b] text-white rounded-sm text-xs sm:text-sm">Uploaded</Badge>
                          )}
                          {status === 'rejected' && (
                            <Badge className="bg-[#ef4444] text-white rounded-sm text-xs sm:text-sm">Rejected</Badge>
                          )}
                          {isNotAvailable && !detail?.cargo.is_import && (
                            <Badge className="bg-[#6b7280] text-white rounded-sm text-xs sm:text-sm">Not Available</Badge>
                          )}
                          {status === 'pending' && !countsAsVerified && (
                            <Badge className="bg-muted text-foreground rounded-sm text-xs sm:text-sm">Pending</Badge>
                          )}
                        </div>
                      </div>
                      {!isNotAvailable && (
                        <div className="flex justify-end">
                          {doc?.driveUrl ? (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const { url } = await getClientDocumentSignedUrl(doc.id);
                                  const filename = `${docDisplayName(doc.type)}.pdf`;
                                  await downloadFileBlob(url, filename);
                                  showToast('Document downloaded successfully!', 'success');
                                } catch (e) {
                                  showToast(`Failed to download document: ${String(e)}`);
                                }
                              }}
                              className="inline-flex items-center text-xs sm:text-sm text-muted-foreground hover:text-foreground"
                            >
                              <Download className="size-3 sm:size-4 mr-1.5" />
                              Download
                            </button>
                          ) : status === 'verified' ? (
                            <span className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1">
                              <Check className="size-3 sm:size-4 text-emerald-500" />
                              Verified by Ops
                            </span>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}

                {approvals.length === 0 && customsRows.every(({ doc }) => !doc) ? (
                  <div className="text-sm text-muted-foreground">
                    No customs clearance documents are on file yet for this pathway.
                  </div>
                ) : approvals.length === 0 ? null : (
                  approvals.map((a) => (
                    <div key={a.id} className="flex flex-col gap-2 p-3 sm:p-4 border border-border rounded-sm">
                      <div className="flex items-start gap-2">
                        <FileText className="size-4 sm:size-5 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="text-foreground text-sm sm:text-base font-medium">{formatCategoryLabel(a.kind)}</div>
                          <div className="text-xs sm:text-sm text-muted-foreground mt-0.5">Shared {a.created_at?.slice(0, 10)}</div>
                        </div>
                        <div className="shrink-0">
                          {a.status === 'APPROVED' && <Badge className="bg-[#10b981] text-white rounded-sm text-xs">Approved</Badge>}
                          {a.status === 'REJECTED' && <Badge className="bg-[#ef4444] text-white rounded-sm text-xs">Rejected</Badge>}
                          {a.status === 'PENDING' && <Badge className="bg-[#f59e0b] text-white rounded-sm text-xs">Pending</Badge>}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const { url } = await getClientApprovalSignedUrl(a.id);
                              await downloadFileBlob(url, `${a.kind}_approval.pdf`);
                              showToast('Approval document downloaded successfully!', 'success');
                            } catch (e) {
                              showToast(`Failed to download approval: ${String(e)}`);
                            }
                          }}
                          className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                          disabled={!a.file_url && !a.file_path}
                        >
                          <Download className="size-3 mr-1.5" />
                          Download
                        </button>

                        {a.status === 'PENDING' && (
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-border text-foreground hover:bg-muted/60 text-xs h-8"
                              onClick={() => setRejectionDialog({ approvalId: a.id, reason: '' })}
                              disabled={approvalsBusyId === a.id}
                            >
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-8"
                              onClick={() => handleApprovalApprove(a.id)}
                              disabled={approvalsBusyId === a.id}
                            >
                              Approve
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-card border border-border rounded-sm p-4 sm:p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-foreground text-sm sm:text-xl">Shipment Timeline</h3>
                  <div className="text-xs sm:text-sm text-muted-foreground mt-1">
                    Updated: {formatFriendlyDate(timelineLastUpdated)}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground hover:bg-muted/60 text-xs h-8 shrink-0"
                  onClick={() => setTimelineExpanded((v) => !v)}
                >
                  {timelineExpanded ? 'Collapse' : 'Expand'}
                </Button>
              </div>

              {timelineExpanded && (
                <div className="space-y-4">
                  {timelineEvents.map((event, index, arr) => (
                    <div key={index} className="relative">
                      {index < arr.length - 1 && (
                        <div
                          className={`absolute left-[11px] top-6 w-px h-full ${event.completed ? 'bg-[#10b981]' : 'bg-border'}`}
                        />
                      )}
                      <div className="flex gap-3">
                        <div className="flex flex-col items-center shrink-0">
                          {event.completed ? (
                            <div className="size-6 rounded-full bg-[#10b981] flex items-center justify-center">
                              <Check className="size-4 text-white" />
                            </div>
                          ) : (
                            <div className="size-6 rounded-full border-2 border-border flex items-center justify-center">
                              <Circle className="size-2 text-muted-foreground fill-current" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 pb-4 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 mb-1">
                            <div className="text-foreground text-sm">{event.status}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="size-3 shrink-0" />
                              <span className="truncate">{event.date} {event.time}</span>
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">{event.location}</div>
                          {event.detail && <div className="text-xs text-muted-foreground mt-1 break-words">{event.detail}</div>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 sm:space-y-6">
            <div className="bg-card border border-border rounded-sm p-4 sm:p-6">
              <div className="mb-3">
                <h3 className="text-foreground text-sm sm:text-xl">Action Required</h3>
                <div className="text-xs sm:text-sm text-muted-foreground mt-0.5">Next Required Action</div>
              </div>

              <div
                className={`flex items-start gap-3 rounded-md border p-3 sm:p-4 ${
                  nextRequiredAction === 'COMPLETE'
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : 'border-primary/30 bg-primary/10'
                }`}
              >
                <div
                  className={`mt-0.5 rounded-full p-1.5 sm:p-2 shrink-0 ${
                    nextRequiredAction === 'COMPLETE' ? 'bg-emerald-500/20' : 'bg-primary/20'
                  }`}
                >
                  {nextRequiredAction === 'COMPLETE' ? (
                    <Check className="size-4 text-emerald-600" />
                  ) : (
                    <TriangleAlert className="size-4 text-primary" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-foreground text-xs sm:text-sm uppercase tracking-wide">
                    {nextRequiredAction === 'COMPLETE' ? 'Status' : 'Action needed'}
                  </div>
                  <div className="text-sm sm:text-xl text-foreground font-semibold mt-1 break-words">
                    {nextRequiredActionInfo.title}
                  </div>
                  {nextRequiredActionInfo.subtitle ? (
                    <div className="text-xs sm:text-base text-muted-foreground mt-1 break-words">
                      {nextRequiredActionInfo.subtitle}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-sm p-4 sm:p-6">
              <h3 className="text-foreground mb-3 text-sm sm:text-xl">Notifications</h3>
              <div className="space-y-3">
                <div className="p-3 sm:p-4 border border-border rounded-md bg-muted/30">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <div className="mt-0.5 rounded-full bg-primary/15 p-1.5 sm:p-2 shrink-0">
                      <TriangleAlert className="size-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-foreground font-semibold text-sm sm:text-base">Last milestone</div>
                      <div className="text-xs sm:text-base text-muted-foreground mt-1 break-words">
                        {lastMilestone
                          ? `${lastMilestone.status} · ${lastMilestone.date} ${lastMilestone.time}`
                          : 'No milestone recorded yet'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-sm p-4 sm:p-6">
              <h3 className="text-foreground mb-3 text-sm sm:text-xl">Shipment Details</h3>
              <div className="space-y-2.5">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground text-xs sm:text-base">Last Milestone</span>
                  <span className="text-foreground text-xs sm:text-base text-right">
                    {lastMilestone ? `${lastMilestone.status} (${lastMilestone.date} ${lastMilestone.time})` : '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground text-xs sm:text-base">Container Count</span>
                  <span className="text-foreground text-xs sm:text-base">{detail?.cargo.container_count ?? 0}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground text-xs sm:text-base">Arrival Date</span>
                  <span className="text-foreground text-xs sm:text-base text-right">{detail?.cargo.expected_arrival_date ?? '—'}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground text-xs sm:text-base">ETA</span>
                  <span className="text-foreground text-xs sm:text-base text-right">{detail?.cargo.eta ?? '—'}</span>
                </div>
                {slaHint && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground text-xs sm:text-base">SLA</span>
                    <span className={`text-xs sm:text-base text-right ${slaHint.tone === 'risk' ? 'text-[#b45309]' : 'text-foreground'}`}>
                      {slaHint.label.replace(/^SLA:\s*/, '')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Toast Notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

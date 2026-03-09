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
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { requiredDocsForCategory, formatLabel as formatCategoryLabel } from '../api/categories';
import {
  approveClientCargoApproval,
  getClientApprovalSignedUrl,
  getClientCargoApprovals,
  getClientCargoDetail,
  getClientDocumentSignedUrl,
  rejectClientCargoApproval,
  type CargoApproval,
  insertClientDocument,
  type ClientCargoDetail,
} from '../api/client';
import { uploadClientDocumentFile } from '../auth/storage';

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
  status: 'uploaded' | 'pending' | 'verified' | 'rejected';
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
  return 'pending';
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
    case 'CREATED':
      return {
        status: 'Cargo created',
        location: 'Files detected in bucket (pre-validation).',
      };
    case 'CLIENT_VALIDATED_ASSESSMENT_DRAFT_DOCUMENTS':
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
    case 'CARGO_IN_TRANSIT_TO_WAREHOUSE':
      return {
        status: 'Cargo in transit to warehouse',
        location: 'Shipment en route to the warehouse facility.',
      };
    case 'CARGO_REACHED_WAREHOUSE':
    case 'WAREHOUSE_ARRIVAL':
      return {
        status: 'Cargo reached warehouse',
        location: 'Shipment received at the warehouse.',
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

function buildDerivedTimeline(detail: ClientCargoDetail, approvals: CargoApproval[]): UiTimelineEvent[] {
  // This mirrors `cargo-internal-dashboard/src/app/components/pages/CargoTimelinePage.tsx`.
  const events: Array<{ label: string; at: string; detail?: string; location?: string; completed: boolean }> = [];

  // 1) Cargo created
  events.push({
    label: 'Cargo created',
    at: detail.cargo.created_at,
    location: 'Files detected in bucket (pre-validation).',
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
      label: 'Documents uploaded',
      at: earliestUpload,
      location: 'Upload evidence captured in storage.',
      detail: 'Files detected in bucket (pre-validation).',
      completed: true,
    });
  }

  // 3) Validation step (explicit when we see bucket uploads without verification)
  const hasUploaded = detail.documents.some((d) => d.status === 'UPLOADED');
  const hasAnyVerified = detail.documents.some((d) => d.status === 'VERIFIED');
  const hasPendingValidation = hasUploaded && !hasAnyVerified;

  if (hasPendingValidation) {
    events.push({
      label: 'Validation in progress',
      at: latestUpload ?? earliestUpload ?? detail.cargo.created_at,
      location: 'Ops validation checks underway.',
      detail: 'Documents are present in the bucket and awaiting verification.',
      completed: false,
    });
  }

  if (latestVerified) {
    events.push({
      label: 'Documents verified',
      at: latestVerified,
      location: 'Verification complete (ops review).',
      completed: true,
    });
  }

  // 4) Approvals (draft/assessment) visibility
  for (const a of approvals) {
    events.push({
      label: `${formatLabel(a.kind)} ${formatLabel(a.status)}`,
      at: a.decided_at ?? a.created_at,
      location: 'Draft shared for client review.',
      detail: a.decided_at ? `Decided ${new Date(a.decided_at).toLocaleString()}` : 'Awaiting decision',
      completed: a.status !== 'PENDING',
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
        location: ev.location ?? '—',
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
        title: 'No action required',
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

function computeSlaHint(eta: string | null | undefined): { label: string; tone: 'ok' | 'risk' } | null {
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

  const slaHint = useMemo(() => computeSlaHint(detail?.cargo.eta), [detail?.cargo.eta]);

  const documentsByType = useMemo(() => {
    if (!detail) return {} as Record<string, UiDocument[]>;
    const grouped = detail.documents.reduce<Record<string, UiDocument[]>>((acc, d) => {
      const entry: UiDocument = {
        id: d.id,
        name: docDisplayName(d.document_type),
        type: d.document_type,
        status: mapDocStatus(d.status),
        uploadedDate: d.uploaded_at ? d.uploaded_at.slice(0, 10) : undefined,
        driveUrl: d.drive_url ?? undefined,
        rejectionReason: d.rejection_reason ?? undefined,
      };
      acc[d.document_type] = acc[d.document_type] ? [...acc[d.document_type], entry] : [entry];
      return acc;
    }, {});
    Object.values(grouped).forEach((list) => {
      list.sort((a, b) => {
        const rank = (s: UiDocument['status']) => (s === 'verified' ? 2 : s === 'uploaded' ? 1 : 0);
        const r = rank(b.status) - rank(a.status);
        if (r !== 0) return r;
        return (b.uploadedDate ?? '').localeCompare(a.uploadedDate ?? '');
      });
    });
    return grouped;
  }, [detail]);

  const requiredDocs = useMemo(() => {
    if (!detail?.cargo.category) return [] as string[];
    const docs = requiredDocsForCategory(detail.cargo.category as any);
    return docs.filter((doc) => !['WH7_DOC', 'EXIT_NOTE', 'IMPORT_PERMIT'].includes(doc));
  }, [detail?.cargo.category]);

  const uploadProgress = useMemo(() => {
    if (requiredDocs.length === 0) {
      return { total: 0, uploaded: 0, verified: 0 };
    }
    return requiredDocs.reduce(
      (acc, docType) => {
        const doc = documentsByType[docType]?.[0];
        if (doc?.status === 'verified') acc.verified += 1;
        if (doc?.status === 'uploaded') acc.uploaded += 1;
        acc.total += 1;
        return acc;
      },
      { total: 0, uploaded: 0, verified: 0 }
    );
  }, [documentsByType, requiredDocs]);

  const timelineEvents: UiTimelineEvent[] = useMemo(() => {
    if (!detail) return [];
    const mapped = mapEventsToTimeline(detail.events);
    if (mapped.length) return mapped;

    const derived = buildDerivedTimeline(detail, approvals);
    return derived.length ? derived : [];
  }, [detail, approvals]);

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
      window.alert('Uploads are disabled in preview mode.');
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
    <div className="min-h-screen bg-background text-foreground">
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
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className="text-primary-foreground hover:bg-primary-foreground/10"
            >
              <ChevronRight className="size-4 rotate-180" />
              Back
            </Button>
            <img
              src="/indataflow-logo.png"
              alt="InDataFlow"
              className="h-16 w-auto brightness-0 invert"
            />
            <h1 className="text-primary-foreground">Cargo Details</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-primary-foreground/80">Client Portal</span>
            <button
              type="button"
              onClick={onToggleTheme}
              className={`px-3 py-2 rounded-sm border border-primary-foreground/30 text-primary-foreground text-sm hover:bg-primary-foreground/10 transition-colors ${
                theme === 'dark' ? 'hidden' : 'inline-flex'
              }`}
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

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <span>Active Shipments</span>
            <ArrowRight className="size-4" />
            <span className="text-foreground">{cargoId}</span>
          </div>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-foreground mb-1">Shipment Reference: {cargoId}</h2>
              <p className="text-muted-foreground">
                Route:{' '}
                {detail?.cargo.route ??
                  (detail?.cargo.origin && detail?.cargo.destination
                    ? `${detail.cargo.origin} → ${detail.cargo.destination}`
                    : 'Mombasa, KN → Kigali, RW')}
              </p>
              <p className="text-muted-foreground">
                Vessel: {detail?.cargo.vessel ?? 'MSC'}
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-card border border-border rounded-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-foreground">Required Documents</h3>
                  <div className="text-xs text-muted-foreground mt-1">
                    {detail?.cargo.category
                      ? `Category: ${formatCategoryLabel(detail.cargo.category)}`
                      : 'Category not set'}
                    {' · '}Documents last updated: {formatFriendlyDate(documentsLastUpdated)}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground text-right">
                  {uploadProgress.total > 0 ? `${uploadProgress.verified}/${uploadProgress.total} verified` : '—'}
                </div>
              </div>
              <div className="space-y-3">
                {requiredDocs.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No required documents configured.</div>
                ) : (
                  requiredDocs.map((docType) => {
                    const doc = documentsByType[docType]?.[0];
                    const status = doc?.status ?? 'pending';
                    const name = doc?.name ?? formatCategoryLabel(docType);
                    return (
                      <div
                        key={docType}
                        className="flex items-center justify-between p-4 border border-border rounded-sm"
                      >
                        <div className="flex items-center gap-3">
                          <FileText className="size-5 text-muted-foreground" />
                          <div>
                            <div className="text-foreground">{name}</div>
                            <div className="text-sm text-muted-foreground">
                              {doc?.uploadedDate ? `Uploaded ${doc.uploadedDate}` : 'Not uploaded'}
                              {doc?.status === 'rejected' ? (
                                <span className="ml-2 text-xs text-destructive">Rejected</span>
                              ) : null}
                              {doc?.status === 'rejected' && (
                                <div className="mt-2">
                                  <div className="inline-flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs text-destructive">
                                    <TriangleAlert className="size-3" />
                                    <span className="font-medium">Rejection reason</span>
                                    <span className="text-destructive/80">·</span>
                                    <span className="text-destructive/80">
                                      {doc?.rejectionReason?.trim() || 'Pending from ops team'}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {status === 'verified' && (
                            <Badge className="bg-[#10b981] text-white rounded-sm">
                              <Check className="size-3 mr-1" />
                              Verified
                            </Badge>
                          )}
                          {status === 'uploaded' && (
                            <Badge className="bg-[#f59e0b] text-white rounded-sm">Uploaded</Badge>
                          )}
                          {status === 'rejected' && (
                            <Badge className="bg-[#ef4444] text-white rounded-sm">Rejected</Badge>
                          )}
                          {status === 'pending' && (
                            <Badge className="bg-muted text-foreground rounded-sm">Required</Badge>
                          )}

                          {status === 'pending' || status === 'rejected' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-border text-foreground hover:bg-muted/60"
                              onClick={() => handleUploadClick(docType, doc?.id ?? null)}
                              disabled={!workersEnabled || isUploading === docType}
                            >
                              <Upload className="size-4 mr-2" />
                              {!workersEnabled
                                ? 'Disabled'
                                : isUploading === docType
                                  ? 'Uploading…'
                                  : status === 'rejected'
                                    ? 'Re-upload'
                                    : 'Upload'}
                            </Button>
                          ) : doc?.driveUrl ? (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const isHttpLink = doc.driveUrl.startsWith('http');
                                  if (isHttpLink) {
                                    window.open(doc.driveUrl, '_blank', 'noreferrer');
                                    return;
                                  }

                                  const { url } = await getClientDocumentSignedUrl(doc.id);
                                  window.open(url, '_blank', 'noreferrer');
                                } catch (e) {
                                  alert(String(e));
                                }
                              }}
                              className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
                            >
                              <Download className="size-4 mr-2" />
                              View / Download
                            </button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-muted-foreground hover:text-foreground"
                              disabled
                            >
                              <Download className="size-4 mr-2" />
                              View
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="bg-card border border-border rounded-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-foreground">Drafts, Assessments &amp; Ops Docs</h3>
                  <div className="text-sm text-muted-foreground">Review internal drafts and assessments and approve for taxes/clearance.</div>
                </div>
                <div className="text-sm text-muted-foreground">{approvals.length} items</div>
              </div>

              {approvalsError && (
                <div className="mb-3 rounded-sm border border-border bg-muted/40 px-3 py-2 text-sm text-foreground">
                  {approvalsError}
                </div>
              )}

              <div className="space-y-3">
                {approvals.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No drafts or assessments have been shared yet.</div>
                ) : (
                  approvals.map((a) => (
                    <div key={a.id} className="flex items-center justify-between p-4 border border-border rounded-sm">
                      <div className="flex items-center gap-3">
                        <FileText className="size-5 text-muted-foreground" />
                        <div>
                          <div className="text-foreground">{formatCategoryLabel(a.kind)}</div>
                          <div className="text-sm text-muted-foreground">Shared {a.created_at?.slice(0, 10)}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {a.status === 'APPROVED' && <Badge className="bg-[#10b981] text-white rounded-sm">Approved</Badge>}
                        {a.status === 'REJECTED' && <Badge className="bg-[#ef4444] text-white rounded-sm">Rejected</Badge>}
                        {a.status === 'PENDING' && <Badge className="bg-[#f59e0b] text-white rounded-sm">Pending</Badge>}

                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const { url } = await getClientApprovalSignedUrl(a.id);
                              window.open(url, '_blank', 'noreferrer');
                            } catch (e) {
                              alert(String(e));
                            }
                          }}
                          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                          disabled={!a.file_url && !a.file_path}
                        >
                          <Download className="size-4 mr-2" />
                          Download
                        </button>

                        {a.status === 'PENDING' && (
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-border text-foreground hover:bg-muted/60"
                              onClick={() => setRejectionDialog({ approvalId: a.id, reason: '' })}
                              disabled={approvalsBusyId === a.id}
                            >
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              className="bg-primary hover:bg-primary/90 text-primary-foreground"
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

            <div className="bg-card border border-border rounded-sm p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-foreground">Shipment Timeline</h3>
                  <div className="text-xs text-muted-foreground mt-1">
                    Timeline last updated: {formatFriendlyDate(timelineLastUpdated)}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  onClick={() => setTimelineExpanded((v) => !v)}
                >
                  {timelineExpanded ? 'Collapse' : 'Expand Timeline'}
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
                      <div className="flex gap-4">
                        <div className="flex flex-col items-center">
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
                        <div className="flex-1 pb-4">
                          <div className="flex items-center justify-between mb-1">
                            <div className="text-foreground">{event.status}</div>
                            <div className="text-sm text-muted-foreground flex items-center gap-1">
                              <Clock className="size-3" />
                              {event.date} {event.time}
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground">{event.location}</div>
                          {event.detail && <div className="text-xs text-muted-foreground mt-1">{event.detail}</div>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-card border border-border rounded-sm p-6">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-foreground">Action Required</h3>
                  <div className="text-xs text-muted-foreground mt-1">Next Required Action</div>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-md border border-primary/30 bg-primary/10 p-4">
                <div className="mt-0.5 rounded-full bg-primary/20 p-2">
                  <TriangleAlert className="size-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="text-foreground text-sm uppercase tracking-wide">Action needed</div>
                  <div className="text-lg text-foreground font-semibold mt-1 break-words">
                    {nextRequiredActionInfo.title}
                  </div>
                  {nextRequiredActionInfo.subtitle ? (
                    <div className="text-sm text-muted-foreground mt-1 break-words">
                      {nextRequiredActionInfo.subtitle}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-sm p-6">
              <h3 className="text-foreground mb-4">Notifications</h3>
              <div className="space-y-3">
                <div className="p-4 border border-border rounded-md bg-muted/30">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-full bg-primary/15 p-2">
                      <TriangleAlert className="size-4 text-primary" />
                    </div>
                    <div>
                      <div className="text-foreground font-semibold">Next step</div>
                      <div className="text-sm text-muted-foreground mt-1 break-words">
                        {nextRequiredActionInfo.title}{' '}
                        {nextRequiredActionInfo.subtitle ? nextRequiredActionInfo.subtitle : ''}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-sm p-6">
              <h3 className="text-foreground mb-4">Shipment Details</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Container Count</span>
                  <span className="text-foreground">{detail?.cargo.container_count ?? 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Arrival Date</span>
                  <span className="text-foreground">{detail?.cargo.expected_arrival_date ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ETA</span>
                  <span className="text-foreground">{detail?.cargo.eta ?? '—'}</span>
                </div>
                {slaHint && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">SLA</span>
                    <span className={slaHint.tone === 'risk' ? 'text-[#b45309]' : 'text-foreground'}>
                      {slaHint.label.replace(/^SLA:\s*/, '')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

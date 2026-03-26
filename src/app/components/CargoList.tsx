import { Search, Ship, Package, Clock, LogOut, Container, Upload, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  getClientMe,
  type ClientMeResponse,
  getClientShipments,
  type ClientShipmentRow,
  getClientStats,
  type ClientStats,
  createClientValidationRequest,
  getClientValidationRequests,
  type ClientValidationRequest,
} from '../api/client';
import { getSupabase } from '../auth/supabase';
import { uploadClientRequestFile } from '../auth/storage';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';

type CargoStatus = 'COMPLETE' | 'CLIENT_ACTION_REQUIRED' | 'OPS_ACTION_REQUIRED' | 'IN_PROGRESS' | 'UNKNOWN';

type CargoRow = {
  id: string;
  referenceNumber: string;
  origin: string | null;
  destination: string | null;
  vessel: string | null;
  eta: string | null;
  expectedArrivalDate: string | null;
  lastUpdate: string;
  nextRequiredAction: string;
  status: CargoStatus;
  statusLabel: string;
  completionLabel: string;
  showGroupIcon: boolean;
  isGroupRow: boolean;
  groupKey: string;
};

interface CargoListProps {
  onSelectCargo: (cargoId: string) => void;
  onLogout: () => void;
  onToggleTheme: () => void;
  theme: 'light' | 'dark';
}

const statusConfig: Record<CargoStatus, { label: string; color: string }> = {
  COMPLETE: { label: 'Complete', color: 'bg-green-600 dark:bg-green-500 text-white' },
  CLIENT_ACTION_REQUIRED: { label: 'Waiting on You', color: 'bg-blue-600 dark:bg-blue-500 text-white' },
  OPS_ACTION_REQUIRED: { label: 'Waiting on Ops', color: 'bg-amber-600 dark:bg-amber-500 text-white' },
  IN_PROGRESS: { label: 'In Progress', color: 'bg-slate-600 dark:bg-slate-500 text-white' },
  UNKNOWN: { label: 'Unknown', color: 'bg-slate-400 dark:bg-slate-600 text-white' },
};

function deriveStatusFromNextAction(nextRequiredAction: string): CargoStatus {
  const action = String(nextRequiredAction || '').toUpperCase();
  const completeActions = new Set([
    'COMPLETE',
    'CARGO_ARRIVED_TO_YOUR_LOCATION',
    'WAREHOUSE_ARRIVAL',
    'CARGO_REACHED_WAREHOUSE',
  ]);
  if (completeActions.has(action)) return 'COMPLETE';
  if (action === 'CLIENT_VERIFY_UPLOADED_DOCUMENTS') {
    return 'IN_PROGRESS';
  }
  if (action.includes('OPS')) return 'OPS_ACTION_REQUIRED';
  if (action.startsWith('CLIENT_')) return 'CLIENT_ACTION_REQUIRED';
  if (action) return 'IN_PROGRESS';
  return 'UNKNOWN';
}

function mapActionLabel(action: string): string {
  if (!action) return 'Unknown';
  return action
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (s) => s.toUpperCase());
}

function mapShipmentToRow(s: ClientShipmentRow): CargoRow[] {
  const completeActions = new Set([
    'COMPLETE',
    'CARGO_ARRIVED_TO_YOUR_LOCATION',
    'WAREHOUSE_ARRIVAL',
    'CARGO_REACHED_WAREHOUSE',
  ]);
  const isCompleted = (action: string) => completeActions.has(String(action || '').toUpperCase());
  const totalContainers = s.containers.length;
  const completedCount = s.containers.filter((c) => isCompleted(c.next_required_action)).length;
  const completionLabel = `${completedCount}/${totalContainers} containers complete`;

  const groupStatus = deriveStatusFromNextAction(s.next_required_action);
  const groupRow: CargoRow = {
    id: `${s.bill_of_lading}-group`,
    referenceNumber: s.bill_of_lading,
    origin: s.origin,
    destination: s.destination,
    vessel: s.vessel,
    eta: s.eta,
    expectedArrivalDate: s.expected_arrival_date,
    lastUpdate: s.created_at,
    nextRequiredAction: s.next_required_action,
    status: groupStatus,
    statusLabel: groupStatus === 'IN_PROGRESS' ? 'Docs verified' : statusConfig[groupStatus].label,
    completionLabel,
    showGroupIcon: true,
    isGroupRow: true,
    groupKey: s.bill_of_lading,
  };

  const containerRows = s.containers.map((container) => {
    const lastUpdate = container.latest_event_time ?? container.created_at;
    const status = deriveStatusFromNextAction(container.next_required_action);
    return {
      id: container.cargo_id,
      referenceNumber: container.cargo_id,
      origin: s.origin,
      destination: s.destination,
      vessel: s.vessel,
      eta: s.eta,
      expectedArrivalDate: s.expected_arrival_date,
      lastUpdate,
      nextRequiredAction: container.next_required_action,
      status,
      statusLabel: statusConfig[status].label,
      completionLabel: '',
      showGroupIcon: false,
      isGroupRow: false,
      groupKey: s.bill_of_lading,
    };
  });

  return [groupRow, ...containerRows];
}

export function CargoList({ onSelectCargo, onLogout, onToggleTheme, theme }: CargoListProps) {
  const [search, setSearch] = useState('');
  const [requestUpload, setRequestUpload] = useState<{ file: File } | null>(null);
  const [requestStatus, setRequestStatus] = useState<'idle' | 'uploading' | 'submitted' | 'error'>('idle');
  const [requestError, setRequestError] = useState<string | null>(null);
  const [validationRequests, setValidationRequests] = useState<ClientValidationRequest[]>([]);

  const formatRelativeTime = (timestamp: string) => {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return timestamp;
    return date.toLocaleString();
  };
  const [clientContext, setClientContext] = useState<ClientMeResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getClientMe();
        if (!cancelled) setClientContext(data);
      } catch (e) {
        if (!cancelled) setClientContext(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [rows, setRows] = useState<CargoRow[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stats, setStats] = useState<ClientStats | null>(null);

  // Fetch initial shipments and stats
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);

    Promise.all([
      getClientShipments(),
      getClientStats().catch(() => null), // Don't fail if stats unavailable
      getClientValidationRequests().catch(() => ({ requests: [] })),
    ])
      .then(([shipmentsRes, statsRes, requestsRes]) => {
        if (cancelled) return;
        setRows(shipmentsRes.shipments.flatMap(mapShipmentToRow));
        if (statsRes) setStats(statsRes);
        const sortedRequests = (requestsRes.requests ?? []).slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        setValidationRequests(sortedRequests);
      })
      .catch((e) => {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : String(e));
        setRows([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Real-time subscription for cargo updates
  useEffect(() => {
    const supabase = getSupabase();
    
    // Subscribe to changes in cargo table
    const cargoSubscription = supabase
      .channel('cargo_changes')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'cargo',
        },
        () => {
          // Refetch shipments when any cargo changes
          getClientShipments()
            .then((res) => {
              setRows(res.shipments.flatMap(mapShipmentToRow));
            })
            .catch((e) => {
              console.error('Failed to refresh shipments:', e);
            });
        }
      )
      .subscribe();

    // Subscribe to changes in cargo_events table (for timeline updates)
    const eventsSubscription = supabase
      .channel('cargo_events_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'cargo_events',
        },
        () => {
          // Refetch shipments when new events are added
          getClientShipments()
            .then((res) => {
              setRows(res.shipments.flatMap(mapShipmentToRow));
            })
            .catch((e) => {
              console.error('Failed to refresh shipments:', e);
            });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(cargoSubscription);
      supabase.removeChannel(eventsSubscription);
    };
  }, []);

  const handleRequestSubmit = async () => {
    if (!requestUpload?.file) return;
    setRequestStatus('uploading');
    setRequestError(null);
    try {
      const { path } = await uploadClientRequestFile({ file: requestUpload.file });
      await createClientValidationRequest({ filePath: path, fileName: requestUpload.file.name });
      setRequestStatus('submitted');
      setRequestUpload(null);
      const requestsRes = await getClientValidationRequests();
      const sortedRequests = (requestsRes.requests ?? []).slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      setValidationRequests(sortedRequests);
      window.setTimeout(() => setRequestStatus('idle'), 3000);
    } catch (e) {
      setRequestStatus('error');
      setRequestError(e instanceof Error ? e.message : String(e));
    }
  };

  const latestRequest = validationRequests[0];
  const requestStep = requestStatus === 'uploading'
    ? 'uploading'
    : latestRequest?.status === 'rejected'
      ? 'rejected'
      : latestRequest?.status === 'approved'
        ? 'approved'
        : latestRequest?.status === 'pending'
          ? 'pending'
          : 'idle';

  const stepIndex = requestStep === 'approved'
    ? 2
    : requestStep === 'pending'
      ? 1
      : requestStep === 'uploading'
        ? 0
        : requestStep === 'rejected'
          ? 1
          : -1;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? rows.filter((r) => {
          return (
            r.referenceNumber.toLowerCase().includes(q) ||
            (r.vessel ?? '').toLowerCase().includes(q) ||
            (r.origin ?? '').toLowerCase().includes(q) ||
            (r.destination ?? '').toLowerCase().includes(q)
          );
        })
      : rows;

    return base.filter((row) => row.isGroupRow || expandedGroups.has(row.groupKey));
  }, [rows, search, expandedGroups]);

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="bg-[#0F1117] text-white border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/indataflow-logo.png"
              alt="InDataFlow"
              className="h-16 w-auto brightness-0 invert"
            />
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
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-4 py-2 text-primary-foreground hover:bg-primary-foreground/10 transition-colors rounded-sm"
            >
              <LogOut className="size-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <div className="bg-card border border-border rounded-sm p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-foreground mb-1">New Clearance Request</h2>
                <div className="text-sm text-muted-foreground">
                  Upload your Bill of Lading to start review. Ops will approve or reject it before cargo creation.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 px-3 py-2 border border-border rounded-sm bg-background text-sm cursor-pointer">
                  <Upload className="size-4 text-muted-foreground" />
                  <span>{requestUpload?.file ? requestUpload.file.name : 'Upload Bill of Lading'}</span>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      if (file) {
                        setRequestUpload({ file });
                        setRequestStatus('idle');
                        setRequestError(null);
                      }
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={handleRequestSubmit}
                  disabled={!requestUpload?.file || requestStatus === 'uploading'}
                  className="px-4 py-2 rounded-sm text-sm border border-primary text-primary hover:bg-primary/10 disabled:opacity-60"
                >
                  {requestStatus === 'uploading' ? 'Submitting…' : 'Submit Request'}
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {[
                { key: 'uploading', label: 'Upload' },
                { key: 'pending', label: 'Pending review' },
                { key: 'approved', label: 'Approved' },
              ].map((step, index) => {
                const active = index <= stepIndex && stepIndex >= 0 && step.key !== 'approved';
                const approvedActive = requestStep === 'approved' && step.key === 'approved';
                const rejectedActive = requestStep === 'rejected' && step.key === 'pending';
                const isActive = approvedActive || rejectedActive || index <= stepIndex;
                const color = approvedActive
                  ? 'border-green-600 text-green-600'
                  : rejectedActive
                    ? 'border-red-500 text-red-500'
                    : isActive
                      ? 'border-primary text-primary'
                      : 'border-border text-muted-foreground';
                return (
                  <div key={step.key} className={`rounded-sm border px-3 py-2 text-xs ${color}`}>
                    <div className="text-[11px] uppercase tracking-wide">Step {index + 1}</div>
                    <div className="text-sm font-medium mt-1">{step.label}</div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 text-xs text-muted-foreground">
              {requestStep === 'uploading' && 'Uploading your Bill of Lading…'}
              {requestStep === 'pending' && (
                `Your request is pending review by Ops. ${latestRequest?.file_name ?? 'Bill of Lading'} · Uploaded ${latestRequest ? new Date(latestRequest.created_at).toLocaleString() : ''}`
              )}
              {requestStep === 'approved' && 'Cargo creation completed. Please re-upload for another shipment request.'}
              {requestStep === 'rejected' && latestRequest?.rejection_reason && `Rejected: ${latestRequest.rejection_reason}`}
              {requestStep === 'idle' && 'Select a file to begin.'}
              {requestStatus === 'error' && requestError && ` ${requestError}`}
            </div>
          </div>
        </div>

        {validationRequests[0]?.status === 'rejected' && (
          <div className="mb-6 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Your Bill of Lading request was rejected. Please review the reason below and upload a corrected file.
            <div className="mt-2">
              {validationRequests[0].file_name ?? 'Bill of Lading'} — {validationRequests[0].rejection_reason ?? 'No reason provided'}
              {' · '}Uploaded {new Date(validationRequests[0].created_at).toLocaleString()}
            </div>
          </div>
        )}

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-card border border-border rounded-sm p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-500/10 rounded-lg">
                  <Ship className="size-6 text-blue-500" />
                </div>
                <div>
                  <div className="text-2xl font-semibold text-foreground">{stats.total_cargo}</div>
                  <div className="text-sm text-muted-foreground">Total Shipments</div>
                </div>
              </div>
            </div>
            
            <div className="bg-card border border-border rounded-sm p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-500/10 rounded-lg">
                  <CheckCircle2 className="size-6 text-emerald-500" />
                </div>
                <div>
                  <div className="text-2xl font-semibold text-foreground">{stats.completed_shipments ?? 0}</div>
                  <div className="text-sm text-muted-foreground">
                    Completed Shipments
                    <span className="ml-2 text-xs opacity-70">(all containers complete)</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-sm p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-500/10 rounded-lg">
                  <Package className="size-6 text-purple-500" />
                </div>
                <div>
                  <div className="text-2xl font-semibold text-foreground">{stats.total_containers}</div>
                  <div className="text-sm text-muted-foreground">Total Containers</div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by reference number..."
              className="pl-10 bg-card border-border"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="bg-card border border-border rounded-sm">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border hover:bg-transparent">
                <TableHead className="text-foreground">Container</TableHead>
                <TableHead className="text-foreground">Route</TableHead>
                <TableHead className="text-foreground">Vessel</TableHead>
                <TableHead className="text-foreground">Status</TableHead>
                <TableHead className="text-foreground">ETA</TableHead>
                <TableHead className="text-foreground">Last Update</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((cargo) => (
                <TableRow
                  key={cargo.id}
                  onClick={() => {
                    if (cargo.isGroupRow) {
                      toggleGroup(cargo.groupKey);
                    } else {
                      onSelectCargo(cargo.referenceNumber);
                    }
                  }}
                  className={`border-b border-border ${cargo.isGroupRow ? 'bg-muted/20' : 'cursor-pointer hover:bg-muted/60'} ${cargo.showGroupIcon ? 'border-t-2 border-primary/40' : ''}`}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {cargo.isGroupRow ? (
                        <Package className="size-4 text-muted-foreground" />
                      ) : (
                        <Container className="size-4 text-muted-foreground" />
                      )}
                      <span className="text-foreground">{cargo.referenceNumber}</span>
                      {cargo.isGroupRow && (
                        <span className="text-muted-foreground">
                          {expandedGroups.has(cargo.groupKey) ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-foreground">
                      {(cargo.origin ?? 'Mombasa, KN')} → {(cargo.destination ?? 'Kigali, RW')}
                    </div>
                  </TableCell>
                  <TableCell className="text-foreground">{cargo.vessel ?? 'MSC'}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <Badge className={`${statusConfig[cargo.status].color} rounded-sm px-2 py-1 w-fit`}>
                        {cargo.statusLabel}
                      </Badge>
                      {cargo.isGroupRow && cargo.completionLabel && (
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5">
                            {cargo.completionLabel}
                          </span>
                        </div>
                      )}
                      {!cargo.isGroupRow && cargo.completionLabel && (
                        <span className="text-xs text-muted-foreground">{cargo.completionLabel}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-foreground">{cargo.eta ?? cargo.expectedArrivalDate ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="size-4" />
                      <span>{formatRelativeTime(cargo.lastUpdate)}</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}

              {filtered.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    {loadError ? (
                      <div>
                        <div className="text-foreground mb-1">Could not load shipments</div>
                        <div className="text-sm">{loadError}</div>
                      </div>
                    ) : (
                      <div>No active shipments found.</div>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 text-muted-foreground">Showing {filtered.length} containers</div>
      </div>
    </div>
  );
}

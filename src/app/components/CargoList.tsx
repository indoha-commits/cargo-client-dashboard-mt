import { Search, Ship, Package, Clock, LogOut } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getClientMe, type ClientMeResponse, getClientShipments, type ClientShipmentRow } from '../api/client';
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
};

interface CargoListProps {
  onSelectCargo: (cargoId: string) => void;
  onLogout: () => void;
  onToggleTheme: () => void;
  theme: 'light' | 'dark';
}

const statusConfig: Record<CargoStatus, { label: string; color: string }> = {
  COMPLETE: { label: 'Complete', color: 'bg-[#10b981] text-white' },
  CLIENT_ACTION_REQUIRED: { label: 'Waiting on You', color: 'bg-primary text-primary-foreground' },
  OPS_ACTION_REQUIRED: { label: 'Waiting on Ops', color: 'bg-[#f59e0b] text-white' },
  IN_PROGRESS: { label: 'In Progress', color: 'bg-muted text-foreground' },
  UNKNOWN: { label: 'Unknown', color: 'bg-muted text-foreground' },
};

function deriveStatusFromNextAction(nextRequiredAction: string): CargoStatus {
  if (nextRequiredAction === 'COMPLETE') return 'COMPLETE';
  if (nextRequiredAction.startsWith('CLIENT_')) return 'CLIENT_ACTION_REQUIRED';
  if (nextRequiredAction.startsWith('OPS_')) return 'OPS_ACTION_REQUIRED';
  if (nextRequiredAction) return 'IN_PROGRESS';
  return 'UNKNOWN';
}

function mapActionLabel(action: string): string {
  if (!action) return 'Unknown';
  return action
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (s) => s.toUpperCase());
}

function mapShipmentToRow(s: ClientShipmentRow): CargoRow {
  const lastUpdate = s.latest_event_time ?? s.created_at;
  const status = deriveStatusFromNextAction(s.next_required_action);
  return {
    id: s.cargo_id,
    referenceNumber: s.cargo_id,
    origin: s.origin,
    destination: s.destination,
    vessel: s.vessel,
    eta: s.eta,
    expectedArrivalDate: s.expected_arrival_date,
    lastUpdate,
    nextRequiredAction: s.next_required_action,
    status,
    statusLabel: s.next_required_action ? mapActionLabel(s.next_required_action) : statusConfig[status].label,
  };
}

export function CargoList({ onSelectCargo, onLogout, onToggleTheme, theme }: CargoListProps) {
  const [search, setSearch] = useState('');
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

  const greeting = useMemo(() => {
    const tenantName = clientContext?.tenant?.company_name || clientContext?.tenant?.slug || 'Tenant';
    const clientName = clientContext?.client?.name;
    if (clientName) {
      return `Hello ${clientName} (Tenant: ${tenantName})`;
    }
    return `Hello ${tenantName}`;
  }, [clientContext]);
  const [rows, setRows] = useState<CargoRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);

    getClientShipments()
      .then((res) => {
        if (cancelled) return;
        setRows(res.shipments.map(mapShipmentToRow));
      })
      .catch((e) => {
        if (cancelled) return;
        // In dev/preview, workers might be disabled. Don't silently show a single mock record,
        // because it looks like "only one shipment exists".
        setLoadError(e instanceof Error ? e.message : String(e));
        setRows([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      return (
        r.referenceNumber.toLowerCase().includes(q) ||
        (r.vessel ?? '').toLowerCase().includes(q) ||
        (r.origin ?? '').toLowerCase().includes(q) ||
        (r.destination ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, search]);

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
          <h2 className="text-foreground mb-1">Active Shipments</h2>
          <p className="text-muted-foreground">{greeting}</p>
        </div>

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
                <TableHead className="text-foreground">Reference</TableHead>
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
                  onClick={() => onSelectCargo(cargo.id)}
                  className="border-b border-border cursor-pointer hover:bg-muted/60"
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Package className="size-4 text-muted-foreground" />
                      <span className="text-foreground">{cargo.referenceNumber}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-foreground">
                      {(cargo.origin ?? 'Mombasa, KN')} → {(cargo.destination ?? 'Kigali, RW')}
                    </div>
                  </TableCell>
                  <TableCell className="text-foreground">{cargo.vessel ?? 'MSC'}</TableCell>
                  <TableCell>
                    <Badge className={`${statusConfig[cargo.status].color} rounded-sm px-2 py-1`}>
                      {cargo.statusLabel}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-foreground">{cargo.eta ?? cargo.expectedArrivalDate ?? '—'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="size-4" />
                      <span>{cargo.lastUpdate}</span>
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

        <div className="mt-4 text-muted-foreground">Showing {filtered.length} shipments</div>
      </div>
    </div>
  );
}

import { fetchJson } from './http';

export type InsertClientDocumentInput = {
  cargoId: string;
  documentType: string;
  // For private storage, this should be the storage object path returned by the worker signed upload.
  driveUrl: string;
  replaceDocumentId?: string;
};

export async function insertClientDocument(input: InsertClientDocumentInput): Promise<{ id: string }> {
  const data = await fetchJson<{ id: string }>(`/client/documents`, {
    method: 'POST',
    body: JSON.stringify({
      cargo_id: input.cargoId,
      document_type: input.documentType,
      drive_url: input.driveUrl,
      replace_document_id: input.replaceDocumentId,
    }),
  });

  if (!data?.id) {
    throw new Error('insertClientDocument: missing id');
  }
  return { id: data.id };
}

export type ClientShipmentRow = {
  cargo_id: string;

  route: string | null;
  vessel: string | null;
  origin: string | null;
  destination: string | null;

  expected_arrival_date: string | null;
  eta: string | null;

  latest_event: string | null;
  latest_event_time: string | null;
  next_required_action: string;

  documents: {
    total_required: number;
    total_submitted: number;
    total_verified: number;
    all_submitted: boolean;
    all_verified: boolean;
  };

  created_at: string;
};

export type ClientMeResponse = {
  tenant: { company_name?: string | null; subdomain?: string | null; slug?: string | null } | null;
  tenant_subdomain: string | null;
  membership: { role?: string | null } | null;
  subscription: { status?: string | null } | null;
  client: { id: string; name: string; slug: string } | null;
  client_slug: string | null;
};

export async function getClientMe(): Promise<ClientMeResponse> {
  return await fetchJson<ClientMeResponse>(`/client/me`, { method: 'GET' });
}

export async function getClientShipments(): Promise<{ shipments: ClientShipmentRow[] }> {
  const data = await fetchJson<{ shipments: ClientShipmentRow[] }>(`/client/shipments`, { method: 'GET' });
  return { shipments: data?.shipments ?? [] };
}

export type ClientCargoDetail = {
  cargo: {
    cargo_id: string;
    client_id: string;
    container_count: number;
    expected_arrival_date: string | null;
    eta: string | null;
    created_at: string;
    origin?: string | null;
    destination?: string | null;
    route?: string | null;
    vessel?: string | null;
    category?: string | null;
  };
  projection: {
    next_required_action: string;
    latest_event: string | null;
    latest_event_time: string | null;
    documents: {
      total_required: number;
      total_submitted: number;
      total_verified: number;
      all_submitted: boolean;
      all_verified: boolean;
    };
  };
  documents: Array<{
    id: string;
    document_type: string;
    status: string;
    drive_url: string | null;
    uploaded_at: string | null;
    verified_at: string | null;
    rejection_reason: string | null;
  }>;
  events: Array<{
    id: string;
    event_type: string;
    event_time: string;
    actor_type: string;
    actor_id: string | null;
    location_id: string | null;
    recorded_at: string;
  }>;
};

export async function getClientCargoDetail(cargoId: string): Promise<ClientCargoDetail> {
  return await fetchJson<ClientCargoDetail>(`/client/cargo/${encodeURIComponent(cargoId)}`, { method: 'GET' });
}

export type CargoApproval = {
  id: string;
  cargo_id: string;
  kind: 'DECLARATION_DRAFT' | 'ASSESSMENT' | 'WH7_DOC' | 'EXIT_NOTE';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  // While pending, this is typically a Supabase Storage URL.
  // After client approval, the worker migrates the file to Google Drive and replaces this with a Drive URL.
  file_url: string | null;
  // Optional storage path (usually cleared after migration)
  file_path?: string | null;
  notes: string | null;
  created_at: string;
  created_by: string;
  decided_at: string | null;
  decided_by: string | null;
  rejection_reason: string | null;
};

export async function getClientCargoApprovals(cargoId: string): Promise<{ approvals: CargoApproval[] }> {
  const data = await fetchJson<{ approvals: CargoApproval[] }>(
    `/client/cargo/${encodeURIComponent(cargoId)}/approvals`,
    { method: 'GET' }
  );
  return { approvals: data?.approvals ?? [] };
}

export async function getClientApprovalSignedUrl(approvalId: string): Promise<{ url: string; kind: 'storage' | 'drive' }> {
  return await fetchJson<{ url: string; kind: 'storage' | 'drive' }>(
    `/client/approvals/${encodeURIComponent(approvalId)}/signed-url`,
    { method: 'GET' }
  );
}

export async function getClientDocumentSignedUrl(documentId: string): Promise<{ url: string; kind: 'storage' | 'drive' }> {
  return await fetchJson<{ url: string; kind: 'storage' | 'drive' }>(
    `/client/documents/${encodeURIComponent(documentId)}/signed-url`,
    { method: 'GET' }
  );
}

export async function createClientDocumentUploadUrl(input: {
  cargoId: string;
  documentType: string;
  fileName: string;
}): Promise<{ path: string; signed_url: string; expires_in: number }> {
  return await fetchJson<{ path: string; signed_url: string; expires_in: number }>(
    `/client/cargo/${encodeURIComponent(input.cargoId)}/upload-url`,
    {
      method: 'POST',
      body: JSON.stringify({ document_type: input.documentType, file_name: input.fileName }),
    }
  );
}

export async function approveClientCargoApproval(approvalId: string): Promise<{ approval: CargoApproval }> {
  return await fetchJson<{ approval: CargoApproval }>(
    `/client/approvals/${encodeURIComponent(approvalId)}/approve`,
    { method: 'POST' }
  );
}

export async function rejectClientCargoApproval(approvalId: string, rejectionReason: string): Promise<{ approval: CargoApproval }> {
  return await fetchJson<{ approval: CargoApproval }>(
    `/client/approvals/${encodeURIComponent(approvalId)}/reject`,
    { method: 'POST', body: JSON.stringify({ reason: rejectionReason }) }
  );
}

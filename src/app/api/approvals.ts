import { fetchJson } from './http';

export type CargoApprovalKind = 'DECLARATION_DRAFT' | 'ASSESSMENT' | 'WH7_DOC' | 'EXIT_NOTE';
export type CargoApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type CargoApproval = {
  id: string;
  cargo_id: string;
  kind: CargoApprovalKind;
  status: CargoApprovalStatus;
  file_url: string;
  notes: string | null;
  created_at: string;
  decided_at: string | null;
  rejection_reason: string | null;
};

export async function getCargoApprovals(cargoId: string): Promise<{ approvals: CargoApproval[] }> {
  const data = await fetchJson<{ approvals: CargoApproval[] }>(
    `/client/cargo/${encodeURIComponent(cargoId)}/approvals`,
    { method: 'GET' }
  );
  return { approvals: data?.approvals ?? [] };
}

export async function approveCargoApproval(approvalId: string): Promise<{ approval: CargoApproval }> {
  return await fetchJson<{ approval: CargoApproval }>(
    `/client/approvals/${encodeURIComponent(approvalId)}/approve`,
    { method: 'POST' }
  );
}

export async function rejectCargoApproval(approvalId: string, rejectionReason: string): Promise<{ approval: CargoApproval }> {
  return await fetchJson<{ approval: CargoApproval }>(
    `/client/approvals/${encodeURIComponent(approvalId)}/reject`,
    { method: 'POST', body: JSON.stringify({ reason: rejectionReason }) }
  );
}

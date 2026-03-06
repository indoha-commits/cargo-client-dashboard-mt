import { createClientDocumentUploadUrl } from '../api/client';

// Upload helper that uses a worker-issued signed upload URL.
// Returns the storage object path (to be stored in DB), not a public URL.
export async function uploadClientDocumentFile(args: {
  cargoId: string;
  documentType: string;
  file: File;
}): Promise<{ path: string }> {
  const upload = await createClientDocumentUploadUrl({
    cargoId: args.cargoId,
    documentType: args.documentType,
    fileName: args.file.name,
  });

  const res = await fetch(upload.signed_url, {
    method: 'PUT',
    headers: {
      'content-type': args.file.type || 'application/octet-stream',
    },
    body: args.file,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Signed upload failed: ${res.status} ${text}`);
  }

  return { path: upload.path };
}

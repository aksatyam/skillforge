'use client';

/**
 * ArtifactUploader — Sprint 2 drag-drop upload panel for a single
 * assessment. Delegates the two-step flow to hooks:
 *   1. POST /artifacts/upload-url → { artifactId, uploadUrl, headers }
 *   2. PUT   uploadUrl            → raw file bytes
 * Refetches the parent assessment on success so the artifact list updates.
 */
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, X, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import type { ArtifactType } from '@skillforge/shared-types';
import {
  useRequestArtifactUpload,
  useUploadArtifact,
  type ArtifactSummary,
} from '@/hooks/use-assessments';

const MAX_BYTES = 25 * 1024 * 1024;

const ALLOWED_MIME: Record<string, ArtifactType> = {
  'application/pdf': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'presentation',
  'application/vnd.ms-excel': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
  'text/plain': 'prompt',
  'text/markdown': 'prompt',
  'text/csv': 'document',
  'image/png': 'other',
  'image/jpeg': 'other',
  'application/zip': 'code',
  'application/json': 'code',
};

const ACCEPT_ATTR = Object.keys(ALLOWED_MIME).join(',');

type PendingUpload = {
  id: string; // local key
  file: File;
  progress: number; // 0..100
  error?: string;
  done?: boolean;
};

export function ArtifactUploader({
  assessmentId,
  existing,
  disabled = false,
}: {
  assessmentId: string;
  existing: ArtifactSummary[];
  disabled?: boolean;
}) {
  const qc = useQueryClient();
  const requestUrl = useRequestArtifactUpload();
  const putUpload = useUploadArtifact();

  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || disabled) return;
    setBanner(null);

    for (const file of Array.from(fileList)) {
      const mime = file.type || guessMime(file.name);
      const artifactType = ALLOWED_MIME[mime];
      if (!artifactType) {
        setBanner(`Unsupported file type: ${file.name} (${mime || 'unknown'})`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        setBanner(`${file.name} exceeds 25MB limit`);
        continue;
      }

      const localId = crypto.randomUUID();
      setPending((p) => [...p, { id: localId, file, progress: 10 }]);

      try {
        const upload = await requestUrl.mutateAsync({
          assessmentId,
          fileName: file.name,
          fileSizeBytes: file.size,
          mimeType: mime,
          artifactType,
        });
        updatePending(setPending, localId, { progress: 40 });

        await putUpload.mutateAsync({
          uploadUrl: upload.uploadUrl,
          file,
          contentType: mime,
          headers: upload.headers,
        });
        updatePending(setPending, localId, { progress: 100, done: true });

        // Refresh assessment so new artifact appears server-confirmed
        qc.invalidateQueries({ queryKey: ['assessments', assessmentId] });

        // Drop completed entry after a short moment so the check is visible
        setTimeout(() => {
          setPending((p) => p.filter((x) => x.id !== localId));
        }, 1500);
      } catch (err) {
        updatePending(setPending, localId, {
          error: err instanceof Error ? err.message : 'Upload failed',
          progress: 0,
        });
      }
    }
  }

  function removePending(id: string) {
    setPending((p) => p.filter((x) => x.id !== id));
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <h3 className="font-semibold text-brand-navy">Evidence artifacts</h3>
      <p className="mt-1 text-xs text-brand-medium">
        Attach up to 25MB per file. PDF, DOCX, PPTX, XLSX, PNG, JPG, TXT, MD, CSV, ZIP, JSON.
      </p>

      {banner && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-brand-red/30 bg-red-50 p-2 text-xs text-brand-red">
          <AlertCircle size={14} /> <span>{banner}</span>
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) inputRef.current?.click();
        }}
        className={`mt-3 flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-6 text-center transition ${
          disabled
            ? 'cursor-not-allowed border-neutral-200 bg-neutral-50 text-brand-medium'
            : dragging
              ? 'border-brand-blue bg-blue-50 text-brand-blue'
              : 'border-neutral-300 text-brand-medium hover:border-brand-blue hover:text-brand-blue'
        }`}
      >
        <Upload size={22} />
        <p className="mt-2 text-sm font-medium">
          {disabled ? 'Uploads locked' : 'Drop files here or click to browse'}
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        multiple
        hidden
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* In-flight uploads */}
      {pending.length > 0 && (
        <ul className="mt-4 space-y-2">
          {pending.map((p) => (
            <li key={p.id} className="rounded-md border border-neutral-200 p-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="truncate font-medium text-brand-dark">{p.file.name}</span>
                <button
                  onClick={() => removePending(p.id)}
                  className="text-brand-medium hover:text-brand-red"
                  title="Remove"
                  type="button"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="mt-1 flex items-center gap-2 text-brand-medium">
                <span>{formatSize(p.file.size)}</span>
                {p.done && (
                  <span className="inline-flex items-center gap-1 text-brand-green">
                    <CheckCircle2 size={12} /> Uploaded
                  </span>
                )}
                {p.error && (
                  <span className="inline-flex items-center gap-1 text-brand-red">
                    <AlertCircle size={12} /> {p.error}
                  </span>
                )}
              </div>
              {!p.error && !p.done && (
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full bg-brand-blue transition-all"
                    style={{ width: `${p.progress}%` }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Already-persisted artifacts */}
      {existing.length > 0 && (
        <ul className="mt-4 divide-y divide-neutral-100 rounded-md border border-neutral-200">
          {existing.map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-3 py-2 text-xs">
              <FileText size={14} className="text-brand-medium" />
              <span className="flex-1 truncate font-medium text-brand-dark">{a.fileName}</span>
              {a.fileSizeBytes && (
                <span className="text-brand-medium">{formatSize(a.fileSizeBytes)}</span>
              )}
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] uppercase tracking-wider text-brand-medium">
                {a.artifactType}
              </span>
            </li>
          ))}
        </ul>
      )}

      {existing.length === 0 && pending.length === 0 && (
        <p className="mt-3 text-xs text-brand-medium">
          No artifacts attached yet. Evidence helps your manager score your impact.
        </p>
      )}
    </div>
  );
}

function updatePending(
  setPending: React.Dispatch<React.SetStateAction<PendingUpload[]>>,
  id: string,
  patch: Partial<PendingUpload>,
) {
  setPending((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function guessMime(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    txt: 'text/plain',
    md: 'text/markdown',
    csv: 'text/csv',
    zip: 'application/zip',
    json: 'application/json',
  };
  return map[ext] ?? '';
}

import type { Attachment, SessionResponse, SessionState, SessionUser } from '@pausa/shared';
import { type ClientErrorCode, RequestError } from './errors';

async function parseError(res: Response): Promise<RequestError> {
  try {
    const body = (await res.json()) as { error?: { code?: ClientErrorCode; message?: string } };
    if (body.error?.code) return new RequestError(body.error.code, body.error.message);
  } catch {
    /* not JSON */
  }
  return new RequestError('INTERNAL', `HTTP ${res.status}`);
}

/** null when there is no valid session cookie. */
export async function fetchSession(): Promise<SessionUser | null> {
  const res = await fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' });
  if (!res.ok) throw await parseError(res);
  return ((await res.json()) as SessionState).user;
}

export async function join(code: string, displayName: string): Promise<SessionUser> {
  const res = await fetch('/api/join', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, displayName }),
  });
  if (!res.ok) throw await parseError(res);
  return ((await res.json()) as SessionResponse).user;
}

export async function logout(): Promise<void> {
  await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
}

/** Uploads one image with progress (fetch has no upload progress, so XHR). */
export function uploadImage(
  file: Blob,
  name: string,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/uploads');
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onerror = () => reject(new RequestError('OFFLINE'));
    xhr.onabort = () => reject(new RequestError('INTERNAL', 'aborted'));
    xhr.onload = () => {
      const body = xhr.response as {
        attachment?: Attachment;
        error?: { code: ClientErrorCode };
      } | null;
      if (xhr.status === 200 && body?.attachment) resolve(body.attachment);
      else reject(new RequestError(body?.error?.code ?? 'INTERNAL'));
    };
    signal?.addEventListener('abort', () => xhr.abort());
    const form = new FormData();
    form.append('file', file, name);
    xhr.send(form);
  });
}

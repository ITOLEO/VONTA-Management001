type TokenResponse = { access_token?: string; error?: string; scope?: string };
type GoogleIdentity = {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        include_granted_scopes: boolean;
        callback: (token: TokenResponse) => void;
        error_callback: () => void;
      }) => { requestAccessToken: () => void };
    };
  };
};
declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}
const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
export const googleConfigured = Boolean(clientId);
let loader: Promise<void> | undefined;
export function prepareGoogle() {
  if (!googleConfigured || window.google?.accounts.oauth2) return Promise.resolve();
  return (loader ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loader = undefined;
      script.remove();
      reject(new Error('Google sign-in could not load.'));
    };
    document.head.appendChild(script);
  }));
}
function authorize(scope: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts.oauth2) {
      reject(new Error('Google sign-in is still loading. Try again.'));
      return;
    }
    window.google.accounts.oauth2
      .initTokenClient({
        client_id: clientId,
        scope,
        include_granted_scopes: false,
        callback: (result) =>
          result.access_token && result.scope?.split(' ').includes(scope)
            ? resolve(result.access_token)
            : reject(new Error('Google did not grant the requested permission.')),
        error_callback: () => reject(new Error('Google sign-in was closed or blocked.')),
      })
      .requestAccessToken();
  });
}
export interface ProjectBrief {
  name: string;
  url: string;
  text: string;
}
function utf8Base64(data: string) {
  return btoa(
    Array.from(new TextEncoder().encode(data), (byte) => String.fromCharCode(byte)).join(''),
  );
}
export async function createGmailDraft(brief: ProjectBrief) {
  const token = await authorize('https://www.googleapis.com/auth/gmail.compose');
  const mime = [
    'Subject: =?UTF-8?B?' + utf8Base64(brief.name + ' — project handoff') + '?=',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    utf8Base64(brief.text),
  ].join('\r\n');
  const raw = utf8Base64(mime).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { raw } }),
  });
  if (!res.ok)
    throw new Error(
      'Gmail could not create the draft. Check the account permission and Gmail API setup.',
    );
}
export async function saveDriveBrief(brief: ProjectBrief) {
  const token = await authorize('https://www.googleapis.com/auth/drive.file');
  const boundary = 'vonta-' + crypto.randomUUID();
  const metadata = { name: brief.name + ' — project handoff.txt', mimeType: 'text/plain' };
  const body = [
    '--' + boundary,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    '--' + boundary,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    brief.text,
    '--' + boundary + '--',
  ].join('\r\n');
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'multipart/related; boundary=' + boundary,
      },
      body,
    },
  );
  if (!res.ok)
    throw new Error(
      'Drive could not save the handoff. Check the account permission and Drive API setup.',
    );
  const data = await res.json();
  return 'https://drive.google.com/open?id=' + encodeURIComponent(data.id);
}

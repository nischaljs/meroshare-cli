const BASE_URL = 'https://webbackend.cdsc.com.np/api';
const RESULT_BASE_URL = 'https://iporesult.cdsc.com.np';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export interface RequestOptions {
  method?: 'GET' | 'POST';
  token?: string;
  body?: unknown;
  baseUrl?: string;
}

export async function apiRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', token, body, baseUrl = BASE_URL } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': BROWSER_UA,
    Origin: baseUrl === RESULT_BASE_URL ? RESULT_BASE_URL : BASE_URL.replace('/api', ''),
    Referer: baseUrl === RESULT_BASE_URL ? `${RESULT_BASE_URL}/` : BASE_URL.replace('/api', '/'),
  };

  if (token) {
    headers['Authorization'] = token;
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
  };

  if (body !== undefined) {
    fetchOptions.body = JSON.stringify(body);
  }

  const url = `${baseUrl}${endpoint}`;
  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    let errorMessage = `API error ${response.status}: ${response.statusText}`;
    try {
      const errorBody = await response.text();
      if (errorBody) {
        errorMessage += ` - ${errorBody}`;
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(errorMessage);
  }

  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return (await response.json()) as T;
  }

  return (await response.text()) as unknown as T;
}

export async function loginRequest(
  endpoint: string,
  body: unknown,
): Promise<{ token: string; responseBody: unknown }> {
  const url = `${BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': BROWSER_UA,
      Origin: BASE_URL.replace('/api', ''),
      Referer: BASE_URL.replace('/api', '/'),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    let errorMessage = `Login failed (${response.status})`;
    try {
      const errorBody = await response.text();
      if (errorBody) {
        errorMessage += `: ${errorBody}`;
      }
    } catch {
      // ignore
    }
    throw new Error(errorMessage);
  }

  const token = response.headers.get('authorization') || '';
  const responseBody = await response.json();

  return { token, responseBody };
}

// ─── Result API (iporesult.cdsc.com.np) needs cookie session ───────────

let resultCookies: string = '';

async function refreshResultSession(): Promise<void> {
  const response = await fetch(`${RESULT_BASE_URL}/`, {
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  const setCookies = response.headers.getSetCookie?.() ?? [];
  resultCookies = setCookies.map((c) => c.split(';')[0]).join('; ');

  // Read body to complete the request
  await response.text();
}

async function ensureResultSession(): Promise<void> {
  if (resultCookies) return;
  await refreshResultSession();
}

async function doResultFetch(url: string, method: string, headers: Record<string, string>, body?: unknown): Promise<Response> {
  const fetchOptions: RequestInit = { method, headers };
  if (body !== undefined) {
    fetchOptions.body = JSON.stringify(body);
  }
  return fetch(url, fetchOptions);
}

export async function resultApiRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  await ensureResultSession();

  const { method = 'GET', body } = options;
  const url = `${RESULT_BASE_URL}${endpoint}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': BROWSER_UA,
    Referer: `${RESULT_BASE_URL}/`,
    Cookie: resultCookies,
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let response = await doResultFetch(url, method, headers, body);

  // Update cookies from response
  const newCookies = response.headers.getSetCookie?.() ?? [];
  if (newCookies.length > 0) {
    const extra = newCookies.map((c) => c.split(';')[0]).join('; ');
    resultCookies = resultCookies ? `${resultCookies}; ${extra}` : extra;
  }

  const contentType = response.headers.get('content-type');
  const responseText = await response.text();

  if (response.ok && contentType?.includes('application/json')) {
    return JSON.parse(responseText) as T;
  }

  // Not JSON or not OK — refresh session and retry
  await refreshResultSession();
  headers['Cookie'] = resultCookies;

  response = await doResultFetch(url, method, headers, body);
  const retryText = await response.text();
  const retryContentType = response.headers.get('content-type');

  if (!response.ok) {
    throw new Error(`Result API error ${response.status}: ${response.statusText} — ${retryText.substring(0, 200)}`);
  }

  if (!retryContentType?.includes('application/json')) {
    throw new Error(`Result API WAF block. Status: ${response.status}, Content-Type: ${retryContentType}, Body: ${retryText.substring(0, 200)}`);
  }

  return JSON.parse(retryText) as T;
}

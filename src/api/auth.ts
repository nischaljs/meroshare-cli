import { loginRequest } from './client.js';
import type { LoginResponse } from '../store/types.js';

export async function login(
  dpId: number,
  username: string,
  password: string,
): Promise<LoginResponse> {
  const { token, responseBody } = await loginRequest('/meroShare/auth/', {
    clientId: dpId,
    username,
    password,
  });

  if (!token) {
    throw new Error('No authorization token received from server');
  }

  const body = responseBody as Record<string, unknown>;

  return {
    token,
    demat: (body.demat as string) || '',
    name: (body.name as string) || username,
  };
}

export async function logout(token: string): Promise<void> {
  try {
    await fetch('https://webbackend.cdsc.com.np/api/meroShare/auth/', {
      method: 'GET',
      headers: { Authorization: token },
    });
  } catch {
    // ignore logout errors
  }
}

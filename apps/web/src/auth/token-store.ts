let currentToken: string | null = null;

export function setAccessToken(token: string | null) {
  currentToken = token;
}

export function getAccessToken(): string | null {
  return currentToken;
}

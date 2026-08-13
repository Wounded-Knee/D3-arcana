export interface AuthenticatedUser {
  userId: string;
  displayName: string;
}

export interface Authenticator {
  authenticate(token: string): Promise<AuthenticatedUser | null>;
}

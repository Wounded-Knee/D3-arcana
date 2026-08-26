/** Flip to false to hide the top-bar switcher even in development. */
export const DEV_USER_SWITCHER_ENABLED = true;

export function isDevUserSwitcherEnabled(): boolean {
  return __DEV__ && DEV_USER_SWITCHER_ENABLED;
}

let inCall = false;
let pendingJoinCall = false;

export function setDevInCall(value: boolean): void {
  inCall = value;
}

export function isDevInCall(): boolean {
  return inCall;
}

export function setPendingDevRestore(intent: { joinCall: boolean } | null): void {
  pendingJoinCall = intent?.joinCall === true;
}

export function consumePendingDevCallJoin(): boolean {
  const shouldJoin = pendingJoinCall;
  pendingJoinCall = false;
  return shouldJoin;
}

export function conversationIdFromPath(pathname: string): string | null {
  const match = pathname.match(/\/conversation\/([^/]+)/);
  return match?.[1] ?? null;
}

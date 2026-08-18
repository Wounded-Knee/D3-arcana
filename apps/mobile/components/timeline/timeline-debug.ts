type PanLogData = Record<string, string | number | boolean | null | undefined>;

let sequence = 0;

export function panLog(event: string, data?: PanLogData): void {
  if (!__DEV__) {
    return;
  }

  sequence += 1;
  if (data) {
    console.log(`[timeline.pan #${sequence}] ${event}`, data);
    return;
  }

  console.log(`[timeline.pan #${sequence}] ${event}`);
}

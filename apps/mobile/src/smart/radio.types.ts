import type { SmartModel, SmartTransport } from "@cubers/core";
export type SmartCandidate = { id: string; name: string };
export type SmartConnection = { transport: SmartTransport; address?: string };
export interface SmartRadio {
  scan(
    model: SmartModel,
    onCandidates: (devices: SmartCandidate[]) => void,
  ): Promise<void>;
  stopScan(): void;
  connect(id: string, model: SmartModel): Promise<SmartConnection>;
  close(): Promise<void>;
}

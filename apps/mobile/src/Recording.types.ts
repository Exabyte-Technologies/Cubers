export type RecordedVideo = { path: string; duration: number };
export type RecordingHandle = {
  setScanPreview?: (
    preview: import("./ScanOverlay").ScanPreview | null,
  ) => void;
  start: () => Promise<void>;
  stop: () => Promise<RecordedVideo>;
  cancel: () => Promise<void>;
  capturePhoto: () => Promise<string>;
};

export type RecordedVideo = { path: string; duration: number };
export type RecordingHandle = {
  start: () => Promise<void>;
  stop: () => Promise<RecordedVideo>;
  cancel: () => Promise<void>;
  capturePhoto: () => Promise<string>;
};

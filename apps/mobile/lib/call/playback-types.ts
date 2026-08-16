export type RecordingSegment = {
  id: string;
  userId: string;
  callOffsetMs: number;
  durationMs: number;
  playbackUrl: string | null;
  status: string;
};

export type PlaybackClock = {
  play: (options: {
    playheadMs: number;
    untilMs: number;
    segments: RecordingSegment[];
    soloUserId: string | null;
    playbackRate?: number;
    onPlayhead: (playheadMs: number) => void;
    onEnded: () => void;
  }) => void;
  pause: () => void;
  setPlaybackRate: (rate: number) => void;
  update: (options: {
    segments?: RecordingSegment[];
    untilMs?: number;
  }) => void;
  dispose?: () => void;
};

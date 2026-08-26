import { Room, RoomEvent, Track } from 'livekit-client';

export function startLocalVolumeMonitor(
  room: Room,
  onLevel: (level: number) => void,
): () => void {
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let data: Float32Array | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const detachGraph = () => {
    source?.disconnect();
    analyser?.disconnect();
    source = null;
    analyser = null;
    data = null;
  };

  const attach = () => {
    const publication = room.localParticipant.getTrackPublication(
      Track.Source.Microphone,
    );
    const media = publication?.track?.mediaStreamTrack;
    if (!media) {
      return;
    }

    const Context =
      globalThis.AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Context) {
      return;
    }

    if (!audioContext) {
      audioContext = new Context();
    }
    void audioContext.resume();
    detachGraph();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0;
    source = audioContext.createMediaStreamSource(new MediaStream([media]));
    source.connect(analyser);
    data = new Float32Array(analyser.fftSize);
  };

  const poll = () => {
    if (!analyser || !data) {
      onLevel(0);
      return;
    }

    analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      const sample = data[i] ?? 0;
      sum += sample * sample;
    }
    onLevel(Math.sqrt(sum / data.length));
  };

  room.on(RoomEvent.LocalTrackPublished, attach);
  attach();
  timer = setInterval(poll, 50);

  return () => {
    room.off(RoomEvent.LocalTrackPublished, attach);
    if (timer) {
      clearInterval(timer);
    }
    detachGraph();
    void audioContext?.close();
    audioContext = null;
  };
}

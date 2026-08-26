import { NativeEventEmitter, NativeModules } from 'react-native';
import { Room, RoomEvent, Track } from 'livekit-client';

type NativeVolumeTrack = {
  id: string;
  _peerConnectionId?: number;
};

export function startLocalVolumeMonitor(
  room: Room,
  onLevel: (level: number) => void,
): () => void {
  const LiveKitModule = NativeModules.LivekitReactNativeModule as
    | {
        createVolumeProcessor: (pcId: number, trackId: string) => string;
        deleteVolumeProcessor: (
          reactTag: string,
          pcId: number,
          trackId: string,
        ) => void;
      }
    | undefined;

  if (!LiveKitModule) {
    return () => {};
  }

  const emitter = new NativeEventEmitter(LiveKitModule);
  let reactTag: string | null = null;
  let pcId = -1;
  let trackId: string | null = null;

  const detach = () => {
    if (reactTag && trackId) {
      LiveKitModule.deleteVolumeProcessor(reactTag, pcId, trackId);
    }
    reactTag = null;
    trackId = null;
  };

  const attach = () => {
    detach();
    const publication = room.localParticipant.getTrackPublication(
      Track.Source.Microphone,
    );
    const media = publication?.track?.mediaStreamTrack as
      | NativeVolumeTrack
      | undefined;
    if (!media?.id) {
      return;
    }

    pcId = media._peerConnectionId ?? -1;
    trackId = media.id;
    reactTag = LiveKitModule.createVolumeProcessor(pcId, trackId);
  };

  const subscription = emitter.addListener(
    'LK_VOLUME_PROCESSED',
    (event: { id?: string; volume?: number }) => {
      if (event?.id === reactTag && typeof event.volume === 'number') {
        onLevel(event.volume);
      }
    },
  );

  room.on(RoomEvent.LocalTrackPublished, attach);
  room.on(RoomEvent.LocalTrackUnpublished, detach);
  attach();

  return () => {
    room.off(RoomEvent.LocalTrackPublished, attach);
    room.off(RoomEvent.LocalTrackUnpublished, detach);
    subscription.remove();
    detach();
  };
}

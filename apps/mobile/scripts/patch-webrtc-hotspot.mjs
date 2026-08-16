/**
 * Android WebRTC's NetworkMonitor skips tethering/hotspot interfaces
 * (unknown type). ICE then only gathers cellular, and LAN LiveKit fails
 * with "could not establish pc connection".
 *
 * @livekit/react-native-webrtc does not expose PeerConnectionFactory.Options.
 * This postinstall patch disables the monitor so ICE enumerates all ifaces.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const require = createRequire(path.join(mobileRoot, 'package.json'));

const pkgRoot = path.dirname(require.resolve('@livekit/react-native-webrtc/package.json'));
const target = path.join(
  pkgRoot,
  'android/src/main/java/com/oney/WebRTCModule/WebRTCModule.java',
);

const source = fs.readFileSync(target, 'utf8');

if (source.includes('disableNetworkMonitor')) {
  console.log('[patch-webrtc-hotspot] already applied');
  process.exit(0);
}

const needle = `        if (audioProcessingFactory != null) {
            pcFactoryBuilder.setAudioProcessingFactory(audioProcessingFactory);
        }

        mFactory = pcFactoryBuilder.createPeerConnectionFactory();`;

const insert = `        if (audioProcessingFactory != null) {
            pcFactoryBuilder.setAudioProcessingFactory(audioProcessingFactory);
        }

        // Enumerate tethering/hotspot interfaces that Android NetworkMonitor skips.
        PeerConnectionFactory.Options factoryOptions = new PeerConnectionFactory.Options();
        factoryOptions.disableNetworkMonitor = true;
        pcFactoryBuilder.setOptions(factoryOptions);

        mFactory = pcFactoryBuilder.createPeerConnectionFactory();`;

if (!source.includes(needle)) {
  console.error('[patch-webrtc-hotspot] WebRTCModule.java shape changed; cannot patch');
  process.exit(1);
}

fs.writeFileSync(target, source.replace(needle, insert));
console.log('[patch-webrtc-hotspot] disabled Android NetworkMonitor in', target);

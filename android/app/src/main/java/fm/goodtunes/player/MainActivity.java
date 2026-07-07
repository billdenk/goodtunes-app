package fm.goodtunes.player;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the in-tree SecureKeyStore plugin (hardware-backed offline
        // download key + root detection) before the bridge starts.
        registerPlugin(SecureKeyStorePlugin.class);
        // NowPlaying is a no-op stub on Android (Android Auto removed due to
        // Play Console policy; JS bridge still calls it so it must be registered).
        registerPlugin(NowPlayingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

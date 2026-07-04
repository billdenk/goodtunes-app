package fm.goodtunes.player;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the in-tree SecureKeyStore plugin (hardware-backed offline
        // download key + root detection) before the bridge starts.
        registerPlugin(SecureKeyStorePlugin.class);
        // NowPlaying mirrors the web player's metadata/state/queue into an
        // app-owned MediaSession that AutoMediaBrowserService exposes to
        // Android Auto, and forwards Auto's transport back to JS (Task #2504).
        registerPlugin(NowPlayingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

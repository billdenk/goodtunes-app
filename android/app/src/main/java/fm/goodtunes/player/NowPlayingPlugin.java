package fm.goodtunes.player;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * NowPlaying (Android) — no-op stub.
 *
 * Android Auto has been removed (Play Console rejection: Auto App Quality
 * Guidelines: Login Credentials). The JS wrapper (nativeNowPlaying.ts) still
 * calls these methods so they must exist; they simply resolve immediately with
 * no side effects. The phone lock-screen / background-audio notification comes
 * from the WebView's own navigator.mediaSession unchanged.
 */
@CapacitorPlugin(name = "NowPlaying")
public class NowPlayingPlugin extends Plugin {

    @PluginMethod
    public void setMetadata(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void setPlaybackState(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void setQueue(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        call.resolve();
    }
}

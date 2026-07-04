package fm.goodtunes.player;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * NowPlaying (Android) — mirrors the web player's now-playing metadata,
 * playback state, and Up Next queue into the app-owned {@link MediaSessionHolder}
 * so {@link AutoMediaBrowserService} can present them to Android Auto, and
 * forwards Auto's transport commands back to JS as {@code remoteCommand} events.
 *
 * <p>This is the Android counterpart to {@code ios/App/App/NowPlayingPlugin.swift}
 * and the same JS wrapper ({@code client/src/lib/nativeNowPlaying.ts}) drives
 * both. The phone lock-screen / background-audio notification still comes from
 * the WebView's own {@code navigator.mediaSession} (unchanged) — this plugin
 * only adds the Android Auto surface, which is why the native session is kept
 * inactive until a car connects (see MediaSessionHolder / the browser service).
 */
@CapacitorPlugin(name = "NowPlaying")
public class NowPlayingPlugin extends Plugin {

    @Override
    public void load() {
        MediaSessionHolder holder = MediaSessionHolder.getInstance(getContext());
        // Forward car transport to JS, matching the iOS remoteCommand contract.
        holder.setCommandSink(new MediaSessionHolder.CommandSink() {
            @Override public void onCommand(String action, double value) {
                JSObject data = new JSObject();
                data.put("action", action);
                if ("seek".equals(action) || "playIndex".equals(action)) {
                    data.put("value", value);
                }
                notifyListeners("remoteCommand", data);
            }
        });
    }

    @PluginMethod
    public void setMetadata(PluginCall call) {
        MediaSessionHolder holder = MediaSessionHolder.getInstance(getContext());
        String title = call.getString("title", "");
        String artist = call.getString("artist", "");
        String album = call.getString("album", "");
        double durationSec = call.getDouble("duration", 0.0);
        String artworkUrl = call.getString("artworkUrl", null);
        holder.setMetadata(title, artist, album, (long) (durationSec * 1000), artworkUrl);
        call.resolve();
    }

    @PluginMethod
    public void setPlaybackState(PluginCall call) {
        MediaSessionHolder holder = MediaSessionHolder.getInstance(getContext());
        boolean isPlaying = call.getBoolean("isPlaying", false);
        double elapsedSec = call.getDouble("elapsed", 0.0);
        holder.setPlaybackState(isPlaying, (long) (elapsedSec * 1000));
        call.resolve();
    }

    @PluginMethod
    public void setQueue(PluginCall call) {
        MediaSessionHolder holder = MediaSessionHolder.getInstance(getContext());
        int currentIndex = call.getInt("currentIndex", 0);
        List<MediaSessionHolder.QueueEntry> entries = new ArrayList<>();
        JSArray items = call.getArray("items", new JSArray());
        if (items == null) items = new JSArray();
        for (int i = 0; i < items.length(); i++) {
            JSONObject o = items.optJSONObject(i);
            if (o == null) continue;
            entries.add(new MediaSessionHolder.QueueEntry(
                    o.optString("id", ""),
                    o.optString("title", ""),
                    o.optString("artist", ""),
                    o.has("artworkUrl") ? o.optString("artworkUrl", null) : null
            ));
        }
        holder.setQueue(entries, currentIndex);
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        MediaSessionHolder holder = MediaSessionHolder.getInstance(getContext());
        holder.clear();
        call.resolve();
    }
}

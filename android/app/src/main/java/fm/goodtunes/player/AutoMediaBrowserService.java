package fm.goodtunes.player;

import android.os.Bundle;
import android.support.v4.media.MediaBrowserCompat;
import android.support.v4.media.MediaDescriptionCompat;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.media.MediaBrowserServiceCompat;

import java.util.ArrayList;
import java.util.List;

/**
 * AutoMediaBrowserService — the {@link MediaBrowserServiceCompat} Android Auto
 * binds to for GoodTunes.
 *
 * <p>It exposes the app-owned {@link MediaSessionHolder} session (metadata +
 * transport, mirrored from the web player) and a single-level browse tree built
 * from the current Up Next queue. Tapping a browse row sends the tapped index
 * back to the web player as a {@code playIndex} command.
 *
 * <p>Deliberately NOT a foreground service and it requests no
 * {@code FOREGROUND_SERVICE*} permission: audio keeps playing in the WebView,
 * this service only surfaces controls/metadata. To keep the phone from showing
 * a duplicate media notification (the WebView already posts one), the session
 * is set active only while a recognised car projection client is connected.
 */
public class AutoMediaBrowserService extends MediaBrowserServiceCompat {

    private static final String ROOT_ID = "root";
    private static final String EMPTY_ROOT_ID = "empty";

    private MediaSessionHolder holder;

    @Override
    public void onCreate() {
        super.onCreate();
        holder = MediaSessionHolder.getInstance(this);
        setSessionToken(holder.getSession().getSessionToken());
        // Refresh the browse list whenever the web player republishes its queue.
        holder.setOnQueueChanged(new Runnable() {
            @Override public void run() {
                notifyChildrenChanged(ROOT_ID);
            }
        });
    }

    @Nullable
    @Override
    public BrowserRoot onGetRoot(@NonNull String clientPackageName, int clientUid,
                                 @Nullable Bundle rootHints) {
        if (isCarClient(clientPackageName)) {
            // A car head unit is connecting — go active so Auto renders us.
            holder.setActive(true);
            return new BrowserRoot(ROOT_ID, null);
        }
        // Unknown caller (e.g. a system probe): allow a connection but expose no
        // children and do NOT activate, so no phone duplicate notification.
        return new BrowserRoot(EMPTY_ROOT_ID, null);
    }

    @Override
    public void onLoadChildren(@NonNull String parentMediaId,
                               @NonNull Result<List<MediaBrowserCompat.MediaItem>> result) {
        List<MediaBrowserCompat.MediaItem> items = new ArrayList<>();
        if (ROOT_ID.equals(parentMediaId)) {
            List<MediaSessionHolder.QueueEntry> queue = holder.getQueue();
            for (int i = 0; i < queue.size(); i++) {
                MediaSessionHolder.QueueEntry e = queue.get(i);
                MediaDescriptionCompat desc = new MediaDescriptionCompat.Builder()
                        .setMediaId(MediaSessionHolder.mediaIdForIndex(i))
                        .setTitle(e.title)
                        .setSubtitle(e.artist)
                        .build();
                items.add(new MediaBrowserCompat.MediaItem(
                        desc, MediaBrowserCompat.MediaItem.FLAG_PLAYABLE));
            }
        }
        result.sendResult(items);
    }

    /** Recognise the phone-projection / car clients we want to go active for. */
    private static boolean isCarClient(String pkg) {
        if (pkg == null) return false;
        return pkg.equals("com.google.android.projection.gearhead")   // Android Auto
                || pkg.equals("com.google.android.googlequicksearchbox") // Assistant driving
                || pkg.equals("com.google.android.carassistant")
                || pkg.equals("com.google.android.autosimulator")
                || pkg.startsWith("com.google.android.apps.automotive");
    }
}

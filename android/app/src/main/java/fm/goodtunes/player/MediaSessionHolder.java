package fm.goodtunes.player;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.support.v4.media.MediaDescriptionCompat;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

import java.io.InputStream;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;

/**
 * MediaSessionHolder — the process-wide bridge between {@link NowPlayingPlugin}
 * (which talks to JS) and {@link AutoMediaBrowserService} (which Android Auto
 * binds to).
 *
 * <p>GoodTunes is a Capacitor thin-wrap: audio plays in the WebView and the
 * phone lock-screen notification comes for free from the WebView's own
 * {@code navigator.mediaSession}. This holder adds a SECOND, app-owned
 * {@link MediaSessionCompat} purely so Android Auto has something to render and
 * drive. To avoid the phone showing a duplicate media notification, the session
 * is only set active while a car client is connected (the browser service
 * flips {@link #setActive}); the rest of the time it holds metadata silently.
 *
 * <p>Transport from the car (play/pause/next/prev/seek, tapping a browse row)
 * arrives on the session callback and is forwarded to JS through the
 * {@link CommandSink} the plugin registers, mirroring the iOS remote-command
 * path. Audio itself is never played here — only the web player plays.
 */
public final class MediaSessionHolder {

    /** Forwards a car transport command to JS. {@code value} is the seek
     *  position in seconds for "seek", the queue index for "playIndex", else 0. */
    public interface CommandSink {
        void onCommand(String action, double value);
    }

    /** A flat browse/queue entry mirrored from the web player's Up Next. */
    public static final class QueueEntry {
        final String id;
        final String title;
        final String artist;
        final String artworkUrl;

        QueueEntry(String id, String title, String artist, String artworkUrl) {
            this.id = id;
            this.title = title;
            this.artist = artist;
            this.artworkUrl = artworkUrl;
        }
    }

    private static MediaSessionHolder instance;

    public static synchronized MediaSessionHolder getInstance(Context ctx) {
        if (instance == null) {
            instance = new MediaSessionHolder(ctx.getApplicationContext());
        }
        return instance;
    }

    /** Non-creating accessor for the plugin (which may run before the service). */
    public static synchronized MediaSessionHolder peek() {
        return instance;
    }

    private final MediaSessionCompat session;
    private final List<QueueEntry> queue = new ArrayList<>();
    private int currentIndex = 0;
    private CommandSink sink;
    private Runnable onQueueChanged;

    // Latched metadata so a bitmap that finishes loading after a skip is dropped.
    private String metaTitle = "";
    private String metaArtist = "";
    private String metaAlbum = "";
    private long metaDurationMs = 0;
    private String artworkUrl;

    private MediaSessionHolder(Context ctx) {
        session = new MediaSessionCompat(ctx, "GoodTunes");
        session.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay() { emit("play", 0); }
            @Override public void onPause() { emit("pause", 0); }
            @Override public void onSkipToNext() { emit("next", 0); }
            @Override public void onSkipToPrevious() { emit("prev", 0); }
            @Override public void onStop() { emit("stop", 0); }

            @Override public void onSeekTo(long pos) {
                // Session positions are milliseconds; JS seeks in seconds.
                emit("seek", pos / 1000.0);
            }

            @Override public void onSkipToQueueItem(long id) {
                // Now-Playing queue tap — id is the 0-based queue index.
                emit("playIndex", id);
            }

            @Override public void onPlayFromMediaId(String mediaId, Bundle extras) {
                // Browse-list tap — mediaId is "index:<n>".
                emit("playIndex", indexFromMediaId(mediaId));
            }
        });
    }

    public MediaSessionCompat getSession() {
        return session;
    }

    public synchronized void setCommandSink(CommandSink sink) {
        this.sink = sink;
    }

    public synchronized void setOnQueueChanged(Runnable r) {
        this.onQueueChanged = r;
    }

    /** Flip active state — the browser service activates while a car is
     *  connected so the phone doesn't get a duplicate media notification. */
    public void setActive(boolean active) {
        session.setActive(active);
    }

    private void emit(String action, double value) {
        CommandSink s;
        synchronized (this) { s = sink; }
        if (s != null) {
            s.onCommand(action, value);
        }
    }

    // MARK: - Metadata + playback state (mirrored from the web player)

    public void setMetadata(String title, String artist, String album,
                            long durationMs, String artworkUrl) {
        this.metaTitle = title != null ? title : "";
        this.metaArtist = artist != null ? artist : "";
        this.metaAlbum = album != null ? album : "";
        this.metaDurationMs = durationMs;
        publishMetadata(null);
        if (artworkUrl != null && !artworkUrl.isEmpty()) {
            if (!artworkUrl.equals(this.artworkUrl)) {
                this.artworkUrl = artworkUrl;
                loadArtwork(artworkUrl);
            }
        } else {
            this.artworkUrl = null;
        }
    }

    private void publishMetadata(Bitmap art) {
        MediaMetadataCompat.Builder b = new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, metaTitle)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, metaArtist)
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, metaAlbum);
        if (metaDurationMs > 0) {
            b.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, metaDurationMs);
        }
        if (art != null) {
            b.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, art);
        }
        session.setMetadata(b.build());
    }

    private void loadArtwork(final String url) {
        final String requested = url;
        new Thread(new Runnable() {
            @Override public void run() {
                try {
                    InputStream in = new URL(url).openStream();
                    Bitmap bmp = BitmapFactory.decodeStream(in);
                    in.close();
                    if (bmp == null) return;
                    // Drop if the user skipped tracks while this loaded.
                    synchronized (MediaSessionHolder.this) {
                        if (!requested.equals(artworkUrl)) return;
                    }
                    publishMetadata(bmp);
                } catch (Exception ignored) {
                    // Best-effort: no artwork just means a text-only car row.
                }
            }
        }).start();
    }

    public void setPlaybackState(boolean isPlaying, long elapsedMs) {
        long actions = PlaybackStateCompat.ACTION_PLAY
                | PlaybackStateCompat.ACTION_PAUSE
                | PlaybackStateCompat.ACTION_PLAY_PAUSE
                | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
                | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
                | PlaybackStateCompat.ACTION_SEEK_TO
                | PlaybackStateCompat.ACTION_STOP
                | PlaybackStateCompat.ACTION_PLAY_FROM_MEDIA_ID
                | PlaybackStateCompat.ACTION_SKIP_TO_QUEUE_ITEM;
        int state = isPlaying
                ? PlaybackStateCompat.STATE_PLAYING
                : PlaybackStateCompat.STATE_PAUSED;
        PlaybackStateCompat ps = new PlaybackStateCompat.Builder()
                .setActions(actions)
                .setState(state, elapsedMs, isPlaying ? 1.0f : 0.0f)
                .build();
        session.setPlaybackState(ps);
    }

    // MARK: - Queue (browse list + Now-Playing queue)

    public synchronized List<QueueEntry> getQueue() {
        return new ArrayList<>(queue);
    }

    public synchronized int getCurrentIndex() {
        return currentIndex;
    }

    public void setQueue(List<QueueEntry> entries, int currentIndex) {
        Runnable notify;
        synchronized (this) {
            queue.clear();
            queue.addAll(entries);
            this.currentIndex = currentIndex;
            notify = onQueueChanged;
        }
        // Mirror into the session's Now-Playing queue (the car's queue button).
        List<MediaSessionCompat.QueueItem> items = new ArrayList<>();
        for (int i = 0; i < entries.size(); i++) {
            QueueEntry e = entries.get(i);
            MediaDescriptionCompat desc = new MediaDescriptionCompat.Builder()
                    .setMediaId(mediaIdForIndex(i))
                    .setTitle(e.title)
                    .setSubtitle(e.artist)
                    .build();
            items.add(new MediaSessionCompat.QueueItem(desc, i));
        }
        session.setQueue(items);
        if (notify != null) {
            notify.run();
        }
    }

    public void clear() {
        setQueue(new ArrayList<QueueEntry>(), 0);
        session.setMetadata(new MediaMetadataCompat.Builder().build());
        this.artworkUrl = null;
    }

    // MARK: - Browse mediaId helpers

    static String mediaIdForIndex(int index) {
        return "index:" + index;
    }

    static long indexFromMediaId(String mediaId) {
        if (mediaId == null) return -1;
        int c = mediaId.indexOf(':');
        if (c < 0) return -1;
        try {
            return Long.parseLong(mediaId.substring(c + 1));
        } catch (NumberFormatException e) {
            return -1;
        }
    }
}

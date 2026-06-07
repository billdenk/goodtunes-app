package fm.goodtunes.player;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register the in-tree SecureKeyStore plugin (hardware-backed offline
        // download key + root detection) before the bridge starts.
        registerPlugin(SecureKeyStorePlugin.class);
        super.onCreate(savedInstanceState);
    }
}

package app.mantralayayatra;

import android.os.Bundle;
import app.mantralayayatra.db.DatabasePlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own plugin must be registered before the bridge starts.
        registerPlugin(DatabasePlugin.class);
        super.onCreate(savedInstanceState);
    }
}

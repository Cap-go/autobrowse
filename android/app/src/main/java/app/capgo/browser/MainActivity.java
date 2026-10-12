package app.capgo.browser;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BrowserLayoutPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

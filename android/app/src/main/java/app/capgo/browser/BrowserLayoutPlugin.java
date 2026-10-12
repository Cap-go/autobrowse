package app.capgo.browser;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BrowserLayout")
public class BrowserLayoutPlugin extends Plugin {
    @PluginMethod
    public void getOrigin(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            int[] origin = new int[2];
            getBridge().getWebView().getLocationOnScreen(origin);
            float density = getContext().getResources().getDisplayMetrics().density;
            JSObject result = new JSObject();
            result.put("x", origin[0] / density);
            result.put("y", origin[1] / density);
            call.resolve(result);
        });
    }
}

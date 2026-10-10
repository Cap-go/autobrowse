package app.capgo.oauthloopback;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import fi.iki.elonen.NanoHTTPD;

import java.io.IOException;
import java.net.ServerSocket;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@CapacitorPlugin(name = "OAuthLoopback")
public class OAuthLoopbackPlugin extends Plugin {
    private static final String TAG = "OAuthLoopback";
    private final Map<String, LoopbackSession> sessions = new ConcurrentHashMap<>();

    @PluginMethod
    public void start(PluginCall call) {
        String path = call.getString("path", "/auth/callback");
        if (!path.startsWith("/")) {
            path = "/" + path;
        }
        Integer requestedPort = call.getInt("port");
        String completionUri = call.getString("completionUri");
        int port = requestedPort != null ? requestedPort : findFreePort();
        String sessionId = UUID.randomUUID().toString();
        String redirectUri = "http://127.0.0.1:" + port + path;

        LoopbackSession session = new LoopbackSession(sessionId, port, path, completionUri);
        try {
            session.start();
            sessions.put(sessionId, session);
            JSObject ret = new JSObject();
            ret.put("sessionId", sessionId);
            ret.put("redirectUri", redirectUri);
            ret.put("port", port);
            call.resolve(ret);
        } catch (IOException e) {
            Log.e(TAG, "Failed to start loopback server", e);
            call.reject("Failed to start loopback server: " + e.getMessage());
        }
    }

    @PluginMethod
    public void waitForCallback(PluginCall call) {
        String sessionId = call.getString("sessionId");
        if (sessionId == null) {
            call.reject("sessionId is required");
            return;
        }
        LoopbackSession session = sessions.get(sessionId);
        if (session == null) {
            call.reject("Unknown session");
            return;
        }
        long timeoutMs = call.getLong("timeoutMs", 300_000L);

        try {
            JSObject result = session.awaitCallback(timeoutMs);
            if (result == null) {
                call.reject("OAuth loopback timed out");
                return;
            }
            call.resolve(result);
        } catch (InterruptedException e) {
            call.reject("Interrupted while waiting for OAuth callback");
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        String sessionId = call.getString("sessionId");
        if (sessionId == null) {
            call.reject("sessionId is required");
            return;
        }
        LoopbackSession session = sessions.remove(sessionId);
        if (session != null) {
            session.destroy();
        }
        call.resolve();
    }

    private int findFreePort() {
        try (ServerSocket socket = new ServerSocket(0)) {
            return socket.getLocalPort();
        } catch (IOException e) {
            return 1455;
        }
    }

    private static final class LoopbackSession extends NanoHTTPD {
        private final String sessionId;
        private final String path;
        private final String completionUri;
        private final CountDownLatch latch = new CountDownLatch(1);
        private final AtomicReference<JSObject> callback = new AtomicReference<>();

        LoopbackSession(String sessionId, int port, String path, String completionUri) {
            super(port);
            this.sessionId = sessionId;
            this.path = path;
            this.completionUri = completionUri;
        }

        void start() throws IOException {
            start(NanoHTTPD.SOCKET_READ_TIMEOUT, false);
        }

        void destroy() {
            try {
                closeAllConnections();
            } catch (Exception ignored) {
                // ignore
            }
            try {
                stop();
            } catch (Exception ignored) {
                // ignore
            }
        }

        JSObject awaitCallback(long timeoutMs) throws InterruptedException {
            boolean ok = latch.await(timeoutMs, TimeUnit.MILLISECONDS);
            if (!ok) {
                return null;
            }
            return callback.get();
        }

        @Override
        public Response serve(IHTTPSession session) {
            String uri = session.getUri();
            if (!uri.equals(path)) {
                return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "Not found");
            }

            Map<String, String> params = session.getParms();
            JSObject obj = new JSObject();
            putIfPresent(obj, "code", params.get("code"));
            putIfPresent(obj, "state", params.get("state"));
            putIfPresent(obj, "clientId", params.get("client_id"));
            putIfPresent(obj, "error", params.get("error"));
            putIfPresent(obj, "errorDescription", params.get("error_description"));

            // Ignore stray requests (favicon, retries) so they never wipe the captured code.
            if (!obj.has("code") && !obj.has("error")) {
                return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "Not found");
            }
            if (callback.compareAndSet(null, obj)) {
                latch.countDown();
            }

            if (completionUri != null && !completionUri.isEmpty()) {
                Response redirect = newFixedLengthResponse(Response.Status.REDIRECT, MIME_PLAINTEXT, "");
                redirect.addHeader("Location", completionUri);
                return redirect;
            }
            String html =
                "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"></head>" +
                "<body style=\"margin:0;height:100vh;display:grid;place-items:center;background:#0b0d12;color:#f4f6fb;font-family:sans-serif;text-align:center\">" +
                "<div><h2>You're signed in</h2><p>Return to Capgo Browser.</p></div></body></html>";
            return newFixedLengthResponse(Response.Status.OK, "text/html", html);
        }

        private void putIfPresent(JSObject obj, String key, String value) {
            if (value != null && !value.isEmpty()) {
                obj.put(key, value);
            }
        }
    }
}

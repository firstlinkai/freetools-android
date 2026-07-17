package click.freetools.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Bridges web "downloads" to Android's Storage Access Framework.
 *
 * begin() opens the system "Save to…" dialog (ACTION_CREATE_DOCUMENT); the
 * user picks any location — Downloads, Drive, SD card — with no storage
 * permission required. Bytes then stream across the bridge in base64 chunks
 * (write()) so 100MB+ video outputs never materialise as one giant string.
 */
@CapacitorPlugin(name = "SaveFile")
public class SaveFilePlugin extends Plugin {

    private static class Session {
        OutputStream stream;
        Uri uri;
    }

    private final Map<String, Session> sessions = new HashMap<>();

    @PluginMethod
    public void begin(PluginCall call) {
        String filename = call.getString("filename", "download.bin");
        String mime = call.getString("mime", "application/octet-stream");

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, filename);

        startActivityForResult(call, intent, "onDocumentCreated");
    }

    @ActivityCallback
    private void onDocumentCreated(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("cancelled");
            return;
        }
        Uri uri = result.getData().getData();
        if (uri == null) {
            call.reject("cancelled");
            return;
        }
        try {
            Session session = new Session();
            session.uri = uri;
            // "rwt" truncates any pre-existing document the user chose to overwrite.
            session.stream = getContext().getContentResolver().openOutputStream(uri, "rwt");
            if (session.stream == null) throw new IllegalStateException("null stream");
            String token = UUID.randomUUID().toString();
            sessions.put(token, session);
            JSObject ret = new JSObject();
            ret.put("token", token);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not open document: " + e.getMessage());
        }
    }

    @PluginMethod
    public void write(PluginCall call) {
        String token = call.getString("token");
        String chunk = call.getString("chunk");
        Session session = token != null ? sessions.get(token) : null;
        if (session == null || chunk == null) {
            call.reject("invalid session");
            return;
        }
        try {
            session.stream.write(Base64.decode(chunk, Base64.DEFAULT));
            call.resolve();
        } catch (Exception e) {
            call.reject("write failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void end(PluginCall call) {
        String token = call.getString("token");
        Session session = token != null ? sessions.remove(token) : null;
        if (session == null) {
            call.reject("invalid session");
            return;
        }
        try {
            session.stream.flush();
            session.stream.close();
            JSObject ret = new JSObject();
            ret.put("uri", session.uri.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("close failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void abort(PluginCall call) {
        String token = call.getString("token");
        Session session = token != null ? sessions.remove(token) : null;
        if (session != null) {
            try {
                session.stream.close();
            } catch (Exception ignored) {}
            try {
                DocumentsContract.deleteDocument(getContext().getContentResolver(), session.uri);
            } catch (Exception ignored) {}
        }
        call.resolve();
    }
}

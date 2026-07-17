package click.freetools.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.media.projection.MediaProjectionManager;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;

/**
 * Screen recording via MediaProjection — the WebView cannot use
 * getDisplayMedia, so the native side records and hands the finished file
 * back to the tool (served through the Capacitor local asset origin).
 */
@CapacitorPlugin(
        name = "ScreenRecorder",
        permissions = @Permission(strings = {android.Manifest.permission.RECORD_AUDIO}, alias = "microphone")
)
public class ScreenRecorderPlugin extends Plugin {

    private String pendingOutput;

    @PluginMethod
    public void start(PluginCall call) {
        if (ScreenRecorderService.running) {
            call.reject("already recording");
            return;
        }
        boolean withMic = Boolean.TRUE.equals(call.getBoolean("mic", false));
        if (withMic && getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "onMicPermission");
            return;
        }
        launchProjectionConsent(call);
    }

    @PermissionCallback
    private void onMicPermission(PluginCall call) {
        // Mic denied → record without audio rather than failing the whole flow.
        launchProjectionConsent(call);
    }

    private void launchProjectionConsent(PluginCall call) {
        MediaProjectionManager mpm = (MediaProjectionManager)
                getContext().getSystemService(Context.MEDIA_PROJECTION_SERVICE);
        startActivityForResult(call, mpm.createScreenCaptureIntent(), "onProjectionConsent");
    }

    @ActivityCallback
    private void onProjectionConsent(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("cancelled");
            return;
        }
        boolean withMic = Boolean.TRUE.equals(call.getBoolean("mic", false))
                && getPermissionState("microphone") == PermissionState.GRANTED;

        File output = ScreenRecorderService.outputFile(getContext());
        pendingOutput = output.getAbsolutePath();

        Intent intent = new Intent(getContext(), ScreenRecorderService.class);
        intent.setAction(ScreenRecorderService.ACTION_START);
        intent.putExtra(ScreenRecorderService.EXTRA_RESULT_CODE, result.getResultCode());
        intent.putExtra(ScreenRecorderService.EXTRA_RESULT_DATA, result.getData());
        intent.putExtra(ScreenRecorderService.EXTRA_WITH_MIC, withMic);
        intent.putExtra(ScreenRecorderService.EXTRA_OUTPUT, pendingOutput);
        getContext().startForegroundService(intent);

        JSObject ret = new JSObject();
        ret.put("mic", withMic);
        call.resolve(ret);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), ScreenRecorderService.class);
        intent.setAction(ScreenRecorderService.ACTION_STOP);
        getContext().startService(intent);

        String path = pendingOutput;
        pendingOutput = null;
        if (path == null) {
            call.reject("not recording");
            return;
        }
        // Give MediaRecorder a moment to finalise the moov atom before the
        // WebView fetches the file.
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
            File f = new File(path);
            if (ScreenRecorderService.lastError != null) {
                call.reject("recording failed: " + ScreenRecorderService.lastError);
            } else if (!f.exists() || f.length() == 0) {
                call.reject("recording failed: empty output");
            } else {
                JSObject ret = new JSObject();
                ret.put("path", path);
                ret.put("webPath", bridge.getLocalUrl() + "/_capacitor_file_" + path);
                ret.put("size", f.length());
                call.resolve(ret);
            }
        }, 500);
    }

    @PluginMethod
    public void isSupported(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("supported", true);
        call.resolve(ret);
    }
}

package click.freetools.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.MediaRecorder;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.IBinder;
import android.util.DisplayMetrics;

import java.io.File;

/**
 * Foreground service that owns the MediaProjection + MediaRecorder pipeline.
 * Android requires screen capture to run inside a foreground service with the
 * mediaProjection type (API 34+). Output lands in the app cache dir; the
 * WebView side previews it and routes saving through the SAF bridge.
 */
public class ScreenRecorderService extends Service {

    public static final String ACTION_START = "start";
    public static final String ACTION_STOP = "stop";
    public static final String EXTRA_RESULT_CODE = "resultCode";
    public static final String EXTRA_RESULT_DATA = "resultData";
    public static final String EXTRA_WITH_MIC = "withMic";
    public static final String EXTRA_OUTPUT = "output";

    private static final String CHANNEL_ID = "screen_recording";
    private static final int NOTIFICATION_ID = 42;

    /** Latest error, readable by the plugin after a failed start. */
    static volatile String lastError = null;
    static volatile boolean running = false;

    private MediaProjection projection;
    private MediaRecorder recorder;
    private VirtualDisplay virtualDisplay;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null || ACTION_STOP.equals(intent.getAction())) {
            stopRecording();
            stopSelf();
            return START_NOT_STICKY;
        }

        createChannel();
        Notification notification = new Notification.Builder(this, CHANNEL_ID)
                .setContentTitle("FreeTools is recording the screen")
                .setSmallIcon(android.R.drawable.presence_video_online)
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        try {
            int resultCode = intent.getIntExtra(EXTRA_RESULT_CODE, 0);
            Intent resultData = intent.getParcelableExtra(EXTRA_RESULT_DATA);
            boolean withMic = intent.getBooleanExtra(EXTRA_WITH_MIC, false);
            String output = intent.getStringExtra(EXTRA_OUTPUT);

            MediaProjectionManager mpm =
                    (MediaProjectionManager) getSystemService(Context.MEDIA_PROJECTION_SERVICE);
            projection = mpm.getMediaProjection(resultCode, resultData);
            projection.registerCallback(new MediaProjection.Callback() {
                @Override
                public void onStop() {
                    stopRecording();
                }
            }, null);

            DisplayMetrics metrics = getResources().getDisplayMetrics();
            // MediaRecorder wants even dimensions.
            int width = metrics.widthPixels & ~1;
            int height = metrics.heightPixels & ~1;

            recorder = new MediaRecorder();
            if (withMic) recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setVideoSource(MediaRecorder.VideoSource.SURFACE);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setVideoEncoder(MediaRecorder.VideoEncoder.H264);
            if (withMic) recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setVideoSize(width, height);
            recorder.setVideoFrameRate(30);
            recorder.setVideoEncodingBitRate(8_000_000);
            recorder.setOutputFile(output);
            recorder.prepare();

            virtualDisplay = projection.createVirtualDisplay(
                    "FreeToolsScreenRecorder", width, height, metrics.densityDpi,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                    recorder.getSurface(), null, null);

            recorder.start();
            lastError = null;
            running = true;
        } catch (Exception e) {
            lastError = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            stopRecording();
            stopSelf();
        }
        return START_NOT_STICKY;
    }

    private void stopRecording() {
        running = false;
        try {
            if (recorder != null) {
                recorder.stop();
            }
        } catch (Exception ignored) {
            // stop() throws if nothing was recorded; the partial file is useless anyway.
        }
        if (recorder != null) {
            recorder.release();
            recorder = null;
        }
        if (virtualDisplay != null) {
            virtualDisplay.release();
            virtualDisplay = null;
        }
        if (projection != null) {
            projection.stop();
            projection = null;
        }
        stopForeground(STOP_FOREGROUND_REMOVE);
    }

    @Override
    public void onDestroy() {
        stopRecording();
        super.onDestroy();
    }

    private void createChannel() {
        NotificationManager nm = getSystemService(NotificationManager.class);
        nm.createNotificationChannel(new NotificationChannel(
                CHANNEL_ID, "Screen recording", NotificationManager.IMPORTANCE_LOW));
    }

    static File outputFile(Context context) {
        File dir = new File(context.getCacheDir(), "recordings");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return new File(dir, "screen-" + System.currentTimeMillis() + ".mp4");
    }
}

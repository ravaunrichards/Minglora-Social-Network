package com.minglora.social;

import android.app.DownloadManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInstaller;
import android.database.Cursor;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.widget.Toast;
import java.io.InputStream;
import java.io.FileInputStream;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.Locale;

public final class UpdateDownloadReceiver extends BroadcastReceiver {
    private static final String PREFS_NAME = "minglora_android_updates";
    private static final String LAST_CHECK_KEY = "last_successful_check";
    private static final String EXPECTED_SHA_KEY = "pending_update_sha256";
    private static final String DOWNLOAD_ID_KEY = "pending_update_download_id";
    private static final String INSTALL_STATUS_ACTION = "com.minglora.social.INSTALL_UPDATE_STATUS";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction())) return;
        long completedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        long expectedId = prefs.getLong(DOWNLOAD_ID_KEY, -1L);
        if (completedId < 0 || completedId != expectedId) return;

        DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        DownloadManager.Query query = new DownloadManager.Query().setFilterById(completedId);
        long apkSize = -1L;
        try (Cursor cursor = manager.query(query)) {
            if (cursor == null || !cursor.moveToFirst()) {
                fail(context, prefs, completedId, manager, "The update download could not be found.");
                return;
            }
            int statusColumn = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            int sizeColumn = cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES);
            if (statusColumn < 0 || cursor.getInt(statusColumn) != DownloadManager.STATUS_SUCCESSFUL) {
                fail(context, prefs, completedId, manager, "The update download did not complete.");
                return;
            }
            if (sizeColumn >= 0) apkSize = cursor.getLong(sizeColumn);
        } catch (Exception error) {
            fail(context, prefs, completedId, manager, "Minglora could not inspect the downloaded update.");
            return;
        }

        String expectedSha = prefs.getString(EXPECTED_SHA_KEY, "");
        if (expectedSha == null || !expectedSha.matches("(?i)[a-f0-9]{64}")) {
            fail(context, prefs, completedId, manager, "The update checksum is missing or invalid.");
            return;
        }

        try {
            String actualSha;
            try (ParcelFileDescriptor downloadedFile = manager.openDownloadedFile(completedId);
                 InputStream input = new FileInputStream(downloadedFile.getFileDescriptor())) {
                actualSha = sha256(input);
            }
            if (!MessageDigest.isEqual(expectedSha.toLowerCase(Locale.ROOT).getBytes("US-ASCII"),
                    actualSha.getBytes("US-ASCII"))) {
                fail(context, prefs, completedId, manager, "The downloaded Minglora package failed its checksum check.");
                return;
            }

            PackageInstaller installer = context.getPackageManager().getPackageInstaller();
            PackageInstaller.SessionParams params =
                    new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
            params.setAppPackageName(context.getPackageName());
            int sessionId = installer.createSession(params);

            try (PackageInstaller.Session session = installer.openSession(sessionId);
                 ParcelFileDescriptor downloadedFile = manager.openDownloadedFile(completedId);
                 InputStream input = new FileInputStream(downloadedFile.getFileDescriptor());
                 OutputStream output = session.openWrite("minglora-update.apk", 0L, apkSize)) {
                byte[] buffer = new byte[64 * 1024];
                int count;
                while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                session.fsync(output);

                Intent statusIntent = new Intent(context, PackageInstallStatusReceiver.class)
                        .setAction(INSTALL_STATUS_ACTION)
                        .putExtra(PackageInstaller.EXTRA_SESSION_ID, sessionId);
                int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) pendingFlags |= PendingIntent.FLAG_MUTABLE;
                PendingIntent callback = PendingIntent.getBroadcast(context, sessionId,
                        statusIntent, pendingFlags);
                session.commit(callback.getIntentSender());
            }
            prefs.edit().remove(DOWNLOAD_ID_KEY).remove(EXPECTED_SHA_KEY).apply();
            manager.remove(completedId);
            Toast.makeText(context, "Minglora package verified. Android will now ask you to approve the update.",
                    Toast.LENGTH_LONG).show();
        } catch (Exception error) {
            fail(context, prefs, completedId, manager, "Minglora could not prepare the verified update for Android.");
        }
    }

    private static String sha256(InputStream input) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[64 * 1024];
        int count;
        while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
        byte[] bytes = digest.digest();
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format(Locale.ROOT, "%02x", value & 0xff));
        return result.toString();
    }

    private static void fail(Context context, SharedPreferences prefs, long downloadId,
                             DownloadManager manager, String message) {
        prefs.edit().putLong(LAST_CHECK_KEY, 0L).remove(DOWNLOAD_ID_KEY).remove(EXPECTED_SHA_KEY).apply();
        if (downloadId >= 0 && manager != null) manager.remove(downloadId);
        Toast.makeText(context, message, Toast.LENGTH_LONG).show();
    }
}

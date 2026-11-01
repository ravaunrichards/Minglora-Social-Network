package com.minglora.social;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInstaller;
import android.os.Build;
import android.util.Log;
import android.widget.Toast;

public final class PackageInstallStatusReceiver extends BroadcastReceiver {
    private static final String TAG = "MingloraInstaller";
    private static final String PREFS_NAME = "minglora_android_updates";
    private static final String LAST_CHECK_KEY = "last_successful_check";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            Intent userAction;
            if (Build.VERSION.SDK_INT >= 33) {
                userAction = intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent.class);
            } else {
                userAction = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            }
            if (userAction != null) {
                userAction.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(userAction);
            } else {
                Log.e(TAG, "Android did not provide the installation approval activity.");
            }
            return;
        }

        if (status == PackageInstaller.STATUS_SUCCESS) {
            Toast.makeText(context, "Minglora was updated successfully.", Toast.LENGTH_LONG).show();
            Log.i(TAG, "Minglora update installed successfully.");
        } else {
            String detail = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
            Log.e(TAG, "Minglora update installation failed: " + detail);
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putLong(LAST_CHECK_KEY, 0L).apply();
            Toast.makeText(context, "Minglora update was not installed. You can try again.",
                    Toast.LENGTH_LONG).show();
        }
    }
}

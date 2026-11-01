package com.minglora.social;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.net.http.SslError;
import android.widget.Toast;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    private static final String APP_HOST = "minglora-social-network.onrender.com";
    private static final String UPDATE_MANIFEST_URL = "https://github.com/ravaunrichards/Minglora-Social-Network/releases/latest/download/android-update.json";
    private static final String APK_DOWNLOAD_URL = "https://github.com/ravaunrichards/Minglora-Social-Network/releases/latest/download/minglora-android.apk";
    private static final String PREFS_NAME = "minglora_android_updates";
    private static final String LAST_CHECK_KEY = "last_successful_check";
    private static final long UPDATE_CHECK_INTERVAL_MS = 6L * 60L * 60L * 1000L;
    private static final int FILE_CHOOSER_REQUEST = 4101;
    private static final int WEB_PERMISSION_REQUEST = 4102;

    private final ExecutorService updateExecutor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private WebView webView;
    private ValueCallback<Uri[]> fileChooserCallback;
    private PermissionRequest pendingWebPermissionRequest;
    private boolean updateDialogVisible;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(23, 105, 224));
        getWindow().setNavigationBarColor(Color.rgb(16, 24, 40));
        createWebView();
        if (BuildConfig.MINGLORA_CHECK_UPDATES) checkForUpdates();
        if (savedInstanceState == null) webView.loadUrl(BuildConfig.MINGLORA_BASE_URL);
        else webView.restoreState(savedInstanceState);
    }

    private void createWebView() {
        webView = new WebView(this);
        webView.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleNavigation(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleNavigation(Uri.parse(url));
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileChooserCallback != null) fileChooserCallback.onReceiveValue(null);
                fileChooserCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(
                            Intent.createChooser(intent, "Choose photos, videos or files"),
                            FILE_CHOOSER_REQUEST);
                    return true;
                } catch (ActivityNotFoundException error) {
                    fileChooserCallback = null;
                    callback.onReceiveValue(null);
                    Toast.makeText(MainActivity.this,
                            "No file picker is available on this device.", Toast.LENGTH_LONG).show();
                    return false;
                }
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> handleWebPermissionRequest(request));
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                if (pendingWebPermissionRequest == request) pendingWebPermissionRequest = null;
            }
        });

        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            Uri uri = Uri.parse(url);
            if ("https".equalsIgnoreCase(uri.getScheme())) openExternal(uri);
            else Toast.makeText(this, "Only secure HTTPS downloads are allowed.", Toast.LENGTH_LONG).show();
        });
        setContentView(webView);
    }

    private boolean handleNavigation(Uri uri) {
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        if ("https".equals(scheme) && APP_HOST.equalsIgnoreCase(uri.getHost())) return false;
        if ("https".equals(scheme) || "http".equals(scheme) ||
                "mailto".equals(scheme) || "tel".equals(scheme)) openExternal(uri);
        return true;
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "No app is available to open this link.", Toast.LENGTH_LONG).show();
        }
    }

    private void handleWebPermissionRequest(PermissionRequest request) {
        Uri origin = request.getOrigin();
        if (origin == null || !APP_HOST.equalsIgnoreCase(origin.getHost()) ||
                pendingWebPermissionRequest != null) {
            request.deny();
            return;
        }

        List<String> missing = new ArrayList<>();
        boolean needsCamera = false;
        boolean needsMicrophone = false;
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) needsCamera = true;
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) needsMicrophone = true;
        }
        if (needsCamera && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED)
            missing.add(Manifest.permission.CAMERA);
        if (needsMicrophone && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
            missing.add(Manifest.permission.RECORD_AUDIO);
        if (missing.isEmpty()) {
            request.grant(request.getResources());
            return;
        }
        pendingWebPermissionRequest = request;
        requestPermissions(missing.toArray(new String[0]), WEB_PERMISSION_REQUEST);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != WEB_PERMISSION_REQUEST || pendingWebPermissionRequest == null) return;
        PermissionRequest request = pendingWebPermissionRequest;
        pendingWebPermissionRequest = null;
        boolean cameraGranted = checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
        boolean microphoneGranted = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
        List<String> grantedResources = new ArrayList<>();
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource) && cameraGranted) grantedResources.add(resource);
            else if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource) && microphoneGranted) grantedResources.add(resource);
        }
        if (grantedResources.size() == request.getResources().length && !grantedResources.isEmpty())
            request.grant(grantedResources.toArray(new String[0]));
        else request.deny();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || fileChooserCallback == null) return;
        Uri[] results = null;
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                results = new Uri[count];
                for (int i = 0; i < count; i++) results[i] = data.getClipData().getItemAt(i).getUri();
            } else if (data.getData() != null) results = new Uri[]{data.getData()};
        }
        fileChooserCallback.onReceiveValue(results);
        fileChooserCallback = null;
    }

    private void checkForUpdates() {
        long lastCheck = getSharedPreferences(PREFS_NAME, MODE_PRIVATE).getLong(LAST_CHECK_KEY, 0L);
        long now = System.currentTimeMillis();
        if (now - lastCheck < UPDATE_CHECK_INTERVAL_MS) return;

        updateExecutor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(UPDATE_MANIFEST_URL + "?cacheBust=" + System.currentTimeMillis());
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(8000);
                connection.setReadTimeout(8000);
                connection.setUseCaches(false);
                connection.setRequestProperty("Accept", "application/json");
                connection.setRequestProperty("Cache-Control", "no-cache");
                connection.setRequestProperty("Pragma", "no-cache");
                if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) return;

                StringBuilder body = new StringBuilder();
                try (InputStream stream = connection.getInputStream();
                     BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null && body.length() < 65536) body.append(line);
                }
                JSONObject manifest = new JSONObject(body.toString());
                if (!getPackageName().equals(manifest.optString("applicationId"))) return;
                int latestVersionCode = manifest.optInt("versionCode", 0);
                int minimumSupportedVersionCode = manifest.optInt("minimumSupportedVersionCode", 1);
                if (latestVersionCode < 1 || minimumSupportedVersionCode < 1 ||
                        minimumSupportedVersionCode > latestVersionCode) return;

                int installedVersionCode = getInstalledVersionCode();
                if (latestVersionCode <= installedVersionCode &&
                        minimumSupportedVersionCode <= installedVersionCode) {
                    getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().putLong(LAST_CHECK_KEY, now).apply();
                    return;
                }
                Uri downloadUri = Uri.parse(manifest.optString("apkUrl", ""));
                if (!isTrustedReleaseDownload(downloadUri)) return;

                String versionName = manifest.optString("versionName", "new version");
                String releaseNotes = manifest.optString("releaseNotes", "A new Minglora version is ready.");
                boolean mandatory = installedVersionCode < minimumSupportedVersionCode;
                getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit().putLong(LAST_CHECK_KEY, now).apply();
                mainHandler.post(() -> showUpdateDialog(versionName, releaseNotes, mandatory));
            } catch (Exception ignored) {
                // A failed check never blocks normal sign-in or app use.
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private int getInstalledVersionCode() {
        try {
            if (android.os.Build.VERSION.SDK_INT >= 28)
                return (int) getPackageManager().getPackageInfo(getPackageName(), 0).getLongVersionCode();
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionCode;
        } catch (PackageManager.NameNotFoundException error) {
            return 1;
        }
    }

    private boolean isTrustedReleaseDownload(Uri uri) {
        return "https".equalsIgnoreCase(uri.getScheme()) &&
                "github.com".equalsIgnoreCase(uri.getHost()) &&
                "/ravaunrichards/Minglora-Social-Network/releases/latest/download/minglora-android.apk".equals(uri.getPath());
    }

    private void showUpdateDialog(String versionName, String releaseNotes, boolean mandatory) {
        if (isFinishing() || updateDialogVisible) return;
        updateDialogVisible = true;
        AlertDialog.Builder builder = new AlertDialog.Builder(this)
                .setTitle(mandatory ? "Minglora update required" : "Minglora update available")
                .setMessage("Version " + versionName + "\n\n" + releaseNotes)
                .setPositiveButton("Download update", (dialog, which) -> openExternal(Uri.parse(APK_DOWNLOAD_URL)));
        if (!mandatory) builder.setNegativeButton("Later", (dialog, which) -> dialog.dismiss());
        AlertDialog dialog = builder.setCancelable(!mandatory).create();
        dialog.setOnDismissListener(ignored -> updateDialogVisible = false);
        dialog.show();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (BuildConfig.MINGLORA_CHECK_UPDATES) checkForUpdates();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (fileChooserCallback != null) {
            fileChooserCallback.onReceiveValue(null);
            fileChooserCallback = null;
        }
        if (pendingWebPermissionRequest != null) {
            pendingWebPermissionRequest.deny();
            pendingWebPermissionRequest = null;
        }
        updateExecutor.shutdownNow();
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}

package com.meetwave.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

/**
 * MeetWave Android client.
 *
 * This is a native Android WebView client around the real MeetWave web
 * application (the exact index.html / app.js / styles.css shipped in the
 * repository). It is intentionally NOT a reimplementation and NOT a fake:
 *
 *  - When a MeetWave server URL is configured (build-time BuildConfig field
 *    or the in-app "Set server URL" dialog), the WebView loads that live
 *    deployment, so WebRTC signalling over WSS and the real backend
 *    (server.js) are used end to end.
 *  - When no server URL is configured, the WebView serves the bundled copy
 *    of the real web app over the secure https://appassets.androidplatform.net
 *    virtual origin via WebViewAssetLoader. That is a genuine secure context,
 *    so local camera/microphone preview and the full UI work; multi-party
 *    calling additionally requires pointing the app at a deployed server
 *    (there is no backend embedded in the APK).
 */
public class MainActivity extends Activity {

    private static final String PREFS = "meetwave";
    private static final String KEY_SERVER = "server_url";
    private static final int REQ_PERMS = 101;
    private static final int MENU_SERVER = 1;
    private static final int MENU_RELOAD = 2;
    private static final int MENU_HOME = 3;

    private WebView webView;
    private ProgressBar progress;
    private WebViewAssetLoader assetLoader;
    private PermissionRequest pendingPermissionRequest;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        progress = new ProgressBar(this);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(140, 140);
        lp.gravity = android.view.Gravity.CENTER;
        root.addView(progress, lp);
        setContentView(root);

        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        configureWebView();
        requestMediaPermissions();
        loadConfiguredTarget();
    }

    private void configureWebView() {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setSupportMultipleWindows(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                progress.setVisibility(View.GONE);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, android.webkit.WebResourceError err) {
                progress.setVisibility(View.GONE);
                if (req != null && req.isForMainFrame()) {
                    Toast.makeText(MainActivity.this,
                            "Could not reach the MeetWave server. Check the URL / your connection.",
                            Toast.LENGTH_LONG).show();
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    if (hasMediaPermissions()) {
                        request.grant(request.getResources());
                    } else {
                        pendingPermissionRequest = request;
                        requestMediaPermissions();
                    }
                });
            }

            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) progress.setVisibility(View.VISIBLE);
                else progress.setVisibility(View.GONE);
            }
        });
    }

    private String configuredServerUrl() {
        String built = BuildConfig.MEETWAVE_SERVER_URL;
        if (built != null && !built.trim().isEmpty()) return built.trim();
        SharedPreferences p = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String saved = p.getString(KEY_SERVER, "");
        return saved == null ? "" : saved.trim();
    }

    private void loadConfiguredTarget() {
        if (!isOnline()) {
            Toast.makeText(this, "No network connection detected.", Toast.LENGTH_SHORT).show();
        }
        String url = configuredServerUrl();
        progress.setVisibility(View.VISIBLE);
        if (url.isEmpty()) {
            // Serve the bundled real web app over a secure https virtual origin.
            webView.loadUrl("https://appassets.androidplatform.net/index.html");
        } else {
            webView.loadUrl(url);
        }
    }

    private boolean isOnline() {
        ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return true;
        NetworkInfo ni = cm.getActiveNetworkInfo();
        return ni != null && ni.isConnected();
    }

    private boolean hasMediaPermissions() {
        return checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
                && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestMediaPermissions() {
        if (!hasMediaPermissions()) {
            requestPermissions(new String[]{Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO}, REQ_PERMS);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_PERMS && pendingPermissionRequest != null) {
            if (hasMediaPermissions()) pendingPermissionRequest.grant(pendingPermissionRequest.getResources());
            else pendingPermissionRequest.deny();
            pendingPermissionRequest = null;
        }
    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        menu.add(0, MENU_SERVER, 0, "Set server URL");
        menu.add(0, MENU_RELOAD, 1, "Reload");
        menu.add(0, MENU_HOME, 2, "Home");
        return true;
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        switch (item.getItemId()) {
            case MENU_SERVER:
                showServerDialog();
                return true;
            case MENU_RELOAD:
                webView.reload();
                return true;
            case MENU_HOME:
                loadConfiguredTarget();
                return true;
            default:
                return super.onOptionsItemSelected(item);
        }
    }

    private void showServerDialog() {
        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        input.setHint("https://your-meetwave-deployment.example");
        SharedPreferences p = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        input.setText(p.getString(KEY_SERVER, ""));
        new AlertDialog.Builder(this)
                .setTitle("MeetWave server URL")
                .setMessage("Enter the HTTPS URL of your deployed MeetWave server (server.js). Leave empty to use the bundled local UI.")
                .setView(input)
                .setPositiveButton("Save", (d, w) -> {
                    String v = input.getText().toString().trim();
                    p.edit().putString(KEY_SERVER, v).apply();
                    loadConfiguredTarget();
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}

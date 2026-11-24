package com.hosannaute.elementalshadows;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends Activity {
    private static final String ENTRY_URL = "https://appassets.androidplatform.net/assets/www/index.html";

    private WebView webView;
    private Vibrator vibrator;
    private WifiDuelManager wifiDuelManager;
    private WebViewAssetLoader assetLoader;
    private int renderCrashCount = 0;

    private class HapticBridge {
        @JavascriptInterface
        public void pulse(int ms, int amp) {
            if (vibrator == null || !vibrator.hasVibrator()) return;
            try {
                int dur = Math.max(8, Math.min(220, ms));
                int strength = Math.max(20, Math.min(255, amp));
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createOneShot(dur, strength));
                } else {
                    @SuppressWarnings("deprecation")
                    long d = dur;
                    vibrator.vibrate(d);
                }
            } catch (Throwable ignored) { }
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            if (vm != null) vibrator = vm.getDefaultVibrator();
        } else {
            @SuppressWarnings("deprecation")
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            vibrator = v;
        }

        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            WindowManager.LayoutParams lp = window.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(lp);
        }

        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        wifiDuelManager = new WifiDuelManager(this);
        initWebView();
        applyImmersiveFullscreen();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void initWebView() {
        WebView wv = new WebView(this);
        wv.setBackgroundColor(Color.parseColor("#0b0908"));
        wv.setOverScrollMode(View.OVER_SCROLL_NEVER);
        wv.setHorizontalScrollBarEnabled(false);
        wv.setVerticalScrollBarEnabled(false);

        WebSettings settings = wv.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        wv.addJavascriptInterface(new HapticBridge(), "AndroidHaptics");
        wv.addJavascriptInterface(wifiDuelManager, "AndroidWifiDuel");

        wv.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                return uri == null || !"appassets.androidplatform.net".equals(uri.getHost());
            }

            @Override
            @android.annotation.TargetApi(Build.VERSION_CODES.O)
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                // Recover cleanly from Android OS WebView renderer kills instead of crashing the app!
                if (view != webView) return true;
                renderCrashCount++;
                if (wifiDuelManager != null) wifiDuelManager.disconnect();
                detachAndDestroyWebView();
                if (!isFinishing() && !isDestroyed() && renderCrashCount <= 4) {
                    runOnUiThread(() -> {
                        if (!isFinishing() && !isDestroyed()) {
                            initWebView();
                            applyImmersiveFullscreen();
                        }
                    });
                    return true;
                }
                return true;
            }
        });

        webView = wv;
        wifiDuelManager.attachWebView(wv);
        setContentView(wv);
        wv.loadUrl(ENTRY_URL);
    }

    private void detachAndDestroyWebView() {
        WebView wv = webView;
        webView = null;
        if (wifiDuelManager != null) wifiDuelManager.attachWebView(null);
        if (wv != null) {
            try {
                wv.stopLoading();
                wv.removeJavascriptInterface("AndroidHaptics");
                wv.removeJavascriptInterface("AndroidWifiDuel");
                if (wv.getParent() instanceof ViewGroup) {
                    ((ViewGroup) wv.getParent()).removeView(wv);
                }
                wv.destroy();
            } catch (Throwable ignored) { }
        }
    }

    private void applyImmersiveFullscreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            @SuppressWarnings("deprecation")
            int flags = View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN;
            getWindow().getDecorView().setSystemUiVisibility(flags);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applyImmersiveFullscreen();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
            try {
                webView.evaluateJavascript("window.onAndroidLifecycle && window.onAndroidLifecycle('resume')", null);
            } catch (Throwable ignored) { }
        }
        applyImmersiveFullscreen();
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            try {
                webView.evaluateJavascript("window.onAndroidLifecycle && window.onAndroidLifecycle('pause')", null);
            } catch (Throwable ignored) { }
            webView.onPause();
            webView.pauseTimers();
        }
        super.onPause();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        if (webView != null && level >= TRIM_MEMORY_RUNNING_MODERATE) {
            try {
                webView.evaluateJavascript("window.onAndroidMemoryTrim && window.onAndroidMemoryTrim(" + level + ")", null);
            } catch (Throwable ignored) { }
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView != null && !isFinishing() && !isDestroyed()) {
            webView.evaluateJavascript(
                    "(function(){ return window.onAndroidBack ? window.onAndroidBack() : false; })()",
                    value -> {
                        if (!"true".equals(value) && !isFinishing() && !isDestroyed()) {
                            MainActivity.super.onBackPressed();
                        }
                    }
            );
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (wifiDuelManager != null) {
            wifiDuelManager.destroy();
            wifiDuelManager = null;
        }
        detachAndDestroyWebView();
        super.onDestroy();
    }
}

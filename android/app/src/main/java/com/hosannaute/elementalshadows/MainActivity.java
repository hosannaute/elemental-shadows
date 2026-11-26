package com.hosannaute.elementalshadows;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.TypedValue;
import android.view.Gravity;
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
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends Activity {
    private static final String ENTRY_URL = "https://appassets.androidplatform.net/assets/www/index.html";
    private static final long BACK_DEBOUNCE_MS = 180L;
    private static final long BACK_EVAL_TIMEOUT_MS = 600L;

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private WebView webView;
    private Vibrator vibrator;
    private WifiDuelManager wifiDuelManager;
    private WebViewAssetLoader assetLoader;
    private OnBackInvokedCallback backInvokedCallback;

    private int renderCrashCount = 0;
    private long lastRenderCrashAt = 0L;
    private boolean backEvalPending = false;
    private long lastBackHandledAt = 0L;
    private final Runnable backWatchdogRunnable = () -> backEvalPending = false;

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

        // Register Android 13-15 (targetSdk 35) Predictive Back callback (L-2)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            backInvokedCallback = this::handleSystemBack;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                    backInvokedCallback
            );
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
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
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
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (renderCrashCount > 0 && SystemClock.elapsedRealtime() - lastRenderCrashAt > 30000L) {
                    renderCrashCount = 0;
                }
            }

            @Override
            @android.annotation.TargetApi(Build.VERSION_CODES.O)
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if (view != webView) return true;
                long now = SystemClock.elapsedRealtime();
                if (now - lastRenderCrashAt > 60000L) {
                    renderCrashCount = 1;
                } else {
                    renderCrashCount++;
                }
                lastRenderCrashAt = now;
                backEvalPending = false;
                mainHandler.removeCallbacks(backWatchdogRunnable);
                if (wifiDuelManager != null) wifiDuelManager.disconnect();
                detachAndDestroyWebView();

                if (isFinishing() || isDestroyed()) {
                    return true;
                }
                if (renderCrashCount <= 4) {
                    runOnUiThread(() -> {
                        if (!isFinishing() && !isDestroyed()) {
                            initWebView();
                            applyImmersiveFullscreen();
                        }
                    });
                } else {
                    // Graceful native recovery screen when WebView crashes > 4 times in succession (L-5)
                    runOnUiThread(() -> {
                        if (!isFinishing() && !isDestroyed()) {
                            showRenderRecoveryFallback();
                            applyImmersiveFullscreen();
                        }
                    });
                }
                return true;
            }
        });

        webView = wv;
        wifiDuelManager.attachWebView(wv);
        setContentView(wv);
        wv.loadUrl(ENTRY_URL);
    }

    private void showRenderRecoveryFallback() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(Color.parseColor("#0b0908"));
        int pad = dp(28);
        root.setPadding(pad, pad, pad, pad);

        TextView title = new TextView(this);
        title.setText("ELEMENTAL SHADOWS");
        title.setTextColor(Color.parseColor("#f6dcb2"));
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22);
        title.setTypeface(Typeface.SERIF, Typeface.BOLD);
        title.setGravity(Gravity.CENTER);

        TextView msg = new TextView(this);
        msg.setText("Android reclaimed graphics memory multiple times. Tap Relaunch Dojo to restore the arena.");
        msg.setTextColor(Color.parseColor("#d8c6ac"));
        msg.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        msg.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams msgLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        msgLp.topMargin = dp(10);
        msgLp.bottomMargin = dp(20);
        msg.setLayoutParams(msgLp);

        LinearLayout btnRow = new LinearLayout(this);
        btnRow.setOrientation(LinearLayout.HORIZONTAL);
        btnRow.setGravity(Gravity.CENTER);

        Button retryBtn = createStyledButton("RELAUNCH DOJO", true);
        retryBtn.setOnClickListener(v -> {
            if (!isFinishing() && !isDestroyed()) {
                renderCrashCount = 0;
                initWebView();
                applyImmersiveFullscreen();
            }
        });

        Button exitBtn = createStyledButton("EXIT", false);
        LinearLayout.LayoutParams exitLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        exitLp.leftMargin = dp(14);
        exitBtn.setLayoutParams(exitLp);
        exitBtn.setOnClickListener(v -> finish());

        btnRow.addView(retryBtn);
        btnRow.addView(exitBtn);
        root.addView(title);
        root.addView(msg);
        root.addView(btnRow);
        setContentView(root);
    }

    private Button createStyledButton(String label, boolean primary) {
        Button b = new Button(this);
        b.setAllCaps(true);
        b.setText(label);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        b.setTypeface(Typeface.SERIF, Typeface.BOLD);
        b.setTextColor(primary ? Color.parseColor("#180c06") : Color.parseColor("#f6dcb2"));
        GradientDrawable bg = new GradientDrawable();
        bg.setCornerRadius(dp(6));
        bg.setColor(primary ? Color.parseColor("#e6a93c") : Color.parseColor("#1e1611"));
        bg.setStroke(dp(1), Color.parseColor("#e6c07b"));
        b.setBackground(bg);
        b.setPadding(dp(20), dp(11), dp(20), dp(11));
        return b;
    }

    private int dp(int v) {
        return Math.round(TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()
        ));
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
        if (wifiDuelManager != null) {
            wifiDuelManager.onResume();
        }
        applyImmersiveFullscreen();
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            try {
                webView.evaluateJavascript("window.onAndroidLifecycle && window.onAndroidLifecycle('pause')", null);
            } catch (Throwable ignored) { }
        }
        if (wifiDuelManager != null) {
            wifiDuelManager.onPause();
        }
        if (webView != null) {
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

    private void handleSystemBack() {
        if (isFinishing() || isDestroyed()) return;
        long now = SystemClock.uptimeMillis();
        if (backEvalPending || (now - lastBackHandledAt < BACK_DEBOUNCE_MS)) {
            return;
        }
        WebView wv = webView;
        if (wv != null) {
            backEvalPending = true;
            mainHandler.postDelayed(backWatchdogRunnable, BACK_EVAL_TIMEOUT_MS);
            try {
                wv.evaluateJavascript(
                        "(function(){ return window.onAndroidBack ? Boolean(window.onAndroidBack()) : false; })()",
                        value -> {
                            mainHandler.removeCallbacks(backWatchdogRunnable);
                            backEvalPending = false;
                            lastBackHandledAt = SystemClock.uptimeMillis();
                            if (!"true".equals(value) && !isFinishing() && !isDestroyed()) {
                                finish();
                            }
                        }
                );
            } catch (Throwable t) {
                mainHandler.removeCallbacks(backWatchdogRunnable);
                backEvalPending = false;
                finish();
            }
        } else {
            finish();
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        handleSystemBack();
    }

    @Override
    protected void onDestroy() {
        mainHandler.removeCallbacks(backWatchdogRunnable);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && backInvokedCallback != null) {
            try {
                getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backInvokedCallback);
            } catch (Throwable ignored) { }
            backInvokedCallback = null;
        }
        if (wifiDuelManager != null) {
            wifiDuelManager.destroy();
            wifiDuelManager = null;
        }
        detachAndDestroyWebView();
        super.onDestroy();
    }
}

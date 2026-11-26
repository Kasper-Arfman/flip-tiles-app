package com.kasperarfman.fliptiles;

import android.content.res.Configuration;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // On a tablet the game, made for phones (a column of at most 480px), is zoomed in, like a
    // browser's zoom: the page is laid out smaller and drawn larger, so it fills the screen. As
    // much zoom as leaves a page of at least 440 x 700 dp in portrait: as wide as a big phone, and
    // tall enough for the level screen. The same rule as on an iPad (the viewport script in
    // index.html). Phones stay as they are. Set once, at the start, for the
    // portrait shape (the app is portrait only, see AndroidManifest.xml; where a tablet turns it
    // anyway, from Android 17, it keeps this zoom and the level screen scrolls).
    private static final float MIN_WIDTH = 440f;
    private static final float MIN_HEIGHT = 700f;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // (dp: the web view's CSS pixels; the screen space the app has, without the system bars)
        Configuration config = getResources().getConfiguration();
        float shortSide = Math.min(config.screenWidthDp, config.screenHeightDp);
        float longSide = Math.max(config.screenWidthDp, config.screenHeightDp);
        float zoom = Math.min(shortSide / MIN_WIDTH, longSide / MIN_HEIGHT);
        if (zoom > 1.01f && bridge != null && bridge.getWebView() != null) {
            // setInitialScale counts in screen pixels per CSS pixel (in percent), not in dp
            float density = getResources().getDisplayMetrics().density;
            bridge.getWebView().setInitialScale(Math.round(zoom * density * 100));
        }
    }
}

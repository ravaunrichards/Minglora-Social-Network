# WebView + JS bridge safety (minify is disabled for release, kept for completeness)
-keep class com.meetwave.app.** { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

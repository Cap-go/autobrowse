# R8 shrinks and optimizes libraries (androidx, okhttp, kotlin) but keeps
# the Capacitor bridge and plugin code intact, since the bridge, the updater
# and the in-app browser call into them by name and through reflection.

-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Capacitor bridge and app code
-keep class com.getcapacitor.** { *; }
-keep class app.capgo.** { *; }

# Plugins
-keep class com.capacitorjs.plugins.** { *; }
-keep class ee.forgr.** { *; }
-keep class com.whitestein.securestorage.** { *; }

# Updater looks these up with reflection
-keep class androidx.webkit.WebViewFeature { *; }
-keep class androidx.webkit.WebViewCompat { *; }
-keep class * extends androidx.work.ListenableWorker { <init>(...); }

# WebView JS bridges
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

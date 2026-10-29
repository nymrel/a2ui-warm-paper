# Vosk calls native functions through JNA reflection; keep bridge names in R8.
-keep class org.vosk.** { *; }
-keep class com.sun.jna.** { *; }
# Match upstream Vosk/JNA Android guidance: these optional desktop AWT classes
# do not exist on Android and are not used by the speech bridge.
# https://github.com/alphacep/vosk-android-demo/blob/master/app/proguard-rules.pro
-keepclassmembers class * extends com.sun.jna.* { public *; }
-dontwarn java.awt.**

# Vosk calls native functions through JNA reflection; keep bridge names in R8.
-keep class org.vosk.** { *; }
-keep class com.sun.jna.** { *; }

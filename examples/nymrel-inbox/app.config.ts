import type { ExpoConfig } from "expo/config";
const config: ExpoConfig = {
  name: "Nymrel Inbox",
  slug: "nymrel-inbox",
  version: "0.1.0",
  scheme: "nymrel-inbox",
  orientation: "default",
  userInterfaceStyle: "light",
  platforms: ["ios", "android"],
  icon: "./assets/icon.png",
  ios: {
    bundleIdentifier: "com.nymrel.inbox",
    supportsTablet: true,
    buildNumber: "1",
    infoPlist: {
      InboxAppGroup: "group.com.nymrel.inbox",
      NSSpeechRecognitionUsageDescription:
        "Transcribe audio you explicitly import using supported on-device speech recognition.",
      ITSAppUsesNonExemptEncryption: true,
    },
  },
  android: {
    package: "com.nymrel.inbox",
    versionCode: 1,
    allowBackup: false,
    blockedPermissions: [
      "android.permission.INTERNET",
      "android.permission.ACCESS_NETWORK_STATE",
    ],
    permissions: ["RECORD_AUDIO"],
  },
  updates: { enabled: false },
  plugins: [
    "expo-asset",
    ["expo-sqlite", { enableFTS: true, useSQLCipher: true }],
    ["expo-secure-store", { configureAndroidBackup: true }],
    [
      "expo-audio",
      {
        microphonePermission: "Record a voice note when you tap Record.",
        enableBackgroundRecording: false,
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission:
          "Choose screenshots or images to save privately in your Inbox.",
        cameraPermission: false,
        microphonePermission: false,
      },
    ],
    [
      "expo-sharing",
      {
        ios: {
          enabled: true,
          appGroupId: "group.com.nymrel.inbox",
          activationRule: {
            supportsText: true,
            supportsWebUrlWithMaxCount: 1,
            supportsImageWithMaxCount: 5,
            supportsFileWithMaxCount: 5,
          },
        },
        android: {
          enabled: true,
          singleShareMimeTypes: [
            "text/plain",
            "image/*",
            "application/pdf",
            "audio/*",
          ],
          multipleShareMimeTypes: ["image/*", "application/pdf", "audio/*"],
        },
      },
    ],
    ["expo-build-properties", { ios: { deploymentTarget: "16.4" } }],
    "./plugins/with-inbox-sharing.cjs",
  ],
};
export default config;

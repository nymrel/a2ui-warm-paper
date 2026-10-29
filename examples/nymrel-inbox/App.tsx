import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { relatedItems, searchItems, suggestTags } from "./src/core";
import type { Item, Kind, SearchMatch } from "./src/core";
import {
  captureFile,
  discardTemporaryFile,
  exportBackup,
  getCapabilities,
  importBackup,
  listItems,
  listTrash,
  purgeTrash,
  openOriginal,
  openVault,
  processSharedItems,
  restoreItem,
  retryExtraction,
  saveNote,
  trashItem,
  updateItem,
} from "./src/service";

type Tab = "library" | "capture" | "settings";
type Notice = { message: string; error?: boolean };
type Capabilities = {
  ocr: boolean;
  pdf: boolean;
  audio: boolean;
  reason?: string;
};
const kinds: Array<{ value: Kind | "all"; label: string }> = [
  { value: "all", label: "Everything" },
  { value: "image", label: "Images" },
  { value: "pdf", label: "PDFs" },
  { value: "link", label: "Links" },
  { value: "audio", label: "Audio" },
  { value: "note", label: "Notes" },
];
const kindLabel: Record<Kind, string> = {
  image: "IMAGE",
  pdf: "PDF",
  link: "LINK",
  audio: "AUDIO",
  note: "NOTE",
};
const kindIcon: Record<Kind, string> = {
  image: "▧",
  pdf: "▤",
  link: "↗",
  audio: "◉",
  note: "≡",
};
const messageOf = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something could not be completed. Your saved captures are unchanged.";
const time = (milliseconds: number) =>
  `${Math.floor(milliseconds / 60000)}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, "0")}`;
const sourceLabel = (match: Pick<SearchMatch, "page" | "startMs" | "endMs">) =>
  match.page
    ? `Page ${match.page}`
    : typeof match.startMs === "number"
      ? `${time(match.startMs)}${typeof match.endMs === "number" ? `–${time(match.endMs)}` : ""}`
      : "Original text";
const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

function Action({
  children,
  onPress,
  disabled = false,
  primary = false,
  quiet = false,
  danger = false,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  quiet?: boolean;
  danger?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        primary && styles.actionPrimary,
        quiet && styles.actionQuiet,
        danger && styles.actionDanger,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.actionText,
          primary && styles.actionPrimaryText,
          danger && styles.dangerText,
        ]}
      >
        {children}
      </Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  secure = false,
  maxLength,
  url = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  secure?: boolean;
  maxLength?: number;
  url?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        multiline={multiline}
        secureTextEntry={secure}
        maxLength={maxLength}
        autoCapitalize={secure || url ? "none" : "sentences"}
        autoCorrect={!secure && !url}
        keyboardType={url ? "url" : "default"}
        textContentType={secure ? "newPassword" : url ? "URL" : "none"}
        style={[styles.input, multiline && styles.multiline]}
        textAlignVertical={multiline ? "top" : "center"}
      />
    </View>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  const words = query
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 1)
    .slice(0, 24);
  if (!words.length) return <Text>{text}</Text>;
  const escaped = words.map((word) =>
    word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  return (
    <Text>
      {text.split(regex).map((part, index) => (
        <Text
          key={`${index}-${part}`}
          style={
            words.some((word) => word.toLowerCase() === part.toLowerCase())
              ? styles.highlight
              : undefined
          }
        >
          {part}
        </Text>
      ))}
    </Text>
  );
}

function Inbox() {
  const [ready, setReady] = useState(false);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [trashedItems, setTrashedItems] = useState<Item[]>([]);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [tab, setTab] = useState<Tab>("library");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Kind | "all">("all");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftNotes, setDraftNotes] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [url, setUrl] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [lastTrash, setLastTrash] = useState<string | null>(null);
  const [voiceStage, setVoiceStage] = useState<
    "idle" | "recording" | "stopped"
  >("idle");
  const [pendingVoiceUri, setPendingVoiceUri] = useState<string | null>(null);
  const operation = useRef(false);
  const readyRef = useRef(false);
  const voiceRef = useRef(voiceStage);
  const voiceStartedAt = useRef(0);
  const draftFor = useRef<string | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);

  const refresh = useCallback(async () => {
    const [active, removed] = await Promise.all([listItems(), listTrash()]);
    setItems(active);
    setTrashedItems(removed);
  }, []);
  const tell = useCallback((message: string, error = false) => {
    setNotice({ message, error });
    AccessibilityInfo.announceForAccessibility(message);
  }, []);
  const perform = useCallback(
    async (label: string, action: () => Promise<void>, refreshAfter = true) => {
      if (operation.current) return;
      operation.current = true;
      setBusy(label);
      try {
        await action();
        if (refreshAfter) await refresh();
      } catch (error) {
        tell(messageOf(error), true);
      } finally {
        operation.current = false;
        setBusy("");
      }
    },
    [refresh, tell],
  );

  const receiveShares = useCallback(async () => {
    if (!readyRef.current || operation.current) return;
    await perform("Checking shared captures…", async () => {
      const result = await processSharedItems();
      if (result.added || result.warnings.length) {
        tell(
          [
            result.added
              ? `${result.added} shared ${result.added === 1 ? "capture" : "captures"} saved.`
              : "",
            ...result.warnings,
          ]
            .filter(Boolean)
            .join(" "),
          result.warnings.length > 0,
        );
      }
    });
  }, [perform, tell]);

  const boot = useCallback(async () => {
    setBooting(true);
    setBootError("");
    try {
      await openVault();
      const [saved, removed, supported] = await Promise.all([
        listItems(),
        listTrash(),
        getCapabilities(),
      ]);
      setItems(saved);
      setTrashedItems(removed);
      setCapabilities(supported);
      setReady(true);
      readyRef.current = true;
    } catch (error) {
      setBootError(messageOf(error));
      setReady(false);
      readyRef.current = false;
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);
  useEffect(() => {
    if (ready) void receiveShares();
  }, [ready, receiveShares]);
  useEffect(() => {
    voiceRef.current = voiceStage;
  }, [voiceStage]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        void receiveShares();
        return;
      }
      if (voiceRef.current === "recording") {
        void recorder
          .stop()
          .then(() => {
            setPendingVoiceUri(recorder.uri);
            setVoiceStage("stopped");
            tell(
              "Recording stopped when you left the app. Save it when you return.",
            );
          })
          .catch((error) => tell(messageOf(error), true));
      }
    });
    return () => subscription.remove();
  }, [receiveShares, recorder, tell]);
  useEffect(() => {
    if (
      voiceStage === "recording" &&
      recorderState.durationMillis > 0 &&
      !recorderState.isRecording &&
      !recorder.isRecording &&
      Date.now() - voiceStartedAt.current > 1000
    ) {
      setPendingVoiceUri(recorder.uri);
      setVoiceStage("stopped");
      tell(
        recorderState.durationMillis >= 119000
          ? "Two-minute recording finished. Save it to your inbox."
          : "Recording stopped. Save it to your inbox.",
      );
    }
  }, [
    recorder,
    recorderState.durationMillis,
    recorderState.isRecording,
    tell,
    voiceStage,
  ]);

  const selected = items.find((item) => item.id === selectedId) || null;
  useEffect(() => {
    if (!selected) {
      if (!selectedId) draftFor.current = null;
      return;
    }
    if (draftFor.current !== selected.id) {
      draftFor.current = selected.id;
      setDraftTitle(selected.title);
      setDraftNotes(selected.notes);
      setDraftTags(selected.tags.join(", "));
    }
  }, [selected, selectedId]);
  const results = useMemo(
    () =>
      searchItems(
        items.filter((item) => filter === "all" || item.kind === filter),
        query,
        1000,
      ),
    [filter, items, query],
  );
  const suggestions = useMemo(
    () => (selected ? suggestTags(selected) : []),
    [selected],
  );
  const related = useMemo(
    () => (selected ? relatedItems(selected, items, 3) : []),
    [selected, items],
  );
  const matched = useMemo(
    () => (selected ? searchItems([selected], query)[0]?.matches || [] : []),
    [selected, query],
  );

  const saveText = () =>
    perform("Saving your capture…", async () => {
      const result = await saveNote({
        title:
          title.trim() ||
          (url.trim() ? "Saved link" : notes.trim().slice(0, 80)),
        notes,
        url: url.trim() || undefined,
      });
      setTitle("");
      setNotes("");
      setUrl("");
      setTab("library");
      setSelectedId(result.item.id);
      tell(
        result.duplicate
          ? "This capture is already in your inbox. Opened the original."
          : "Saved on this device.",
      );
    });
  const importFile = () =>
    perform("Opening your file…", async () => {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*", "audio/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled) return;
      const file = picked.assets[0];
      const result = await captureFile({
        uri: file.uri,
        name: file.name,
        mimeType: file.mimeType || "application/octet-stream",
        size: file.size,
      });
      setSelectedId(result.item.id);
      setTab("library");
      tell(
        result.warning ||
          (result.duplicate
            ? "That original is already saved. Opened the existing capture."
            : "Original saved and ready to search."),
        Boolean(result.warning),
      );
    });
  const importImage = () =>
    perform("Opening your images…", async () => {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 1,
        allowsEditing: false,
      });
      if (picked.canceled) return;
      const image = picked.assets[0];
      const result = await captureFile({
        uri: image.uri,
        name: image.fileName || `image-${Date.now()}.jpg`,
        mimeType: image.mimeType || "image/jpeg",
        size: image.fileSize,
      });
      setSelectedId(result.item.id);
      setTab("library");
      tell(
        result.warning ||
          (result.duplicate
            ? "That image is already saved."
            : "Image saved on this device."),
        Boolean(result.warning),
      );
    });
  const startVoice = () =>
    perform(
      "Preparing your microphone…",
      async () => {
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted)
          throw new Error(
            "Microphone permission was not granted. You can still import an audio file.",
          );
        await setAudioModeAsync({
          allowsRecording: true,
          allowsBackgroundRecording: false,
          playsInSilentMode: true,
        });
        await recorder.prepareToRecordAsync();
        voiceStartedAt.current = Date.now();
        recorder.record({ forDuration: 120 });
        setPendingVoiceUri(null);
        setVoiceStage("recording");
        tell("Recording on this device. Stop and save when you are ready.");
      },
      false,
    );
  const saveVoice = () =>
    perform("Saving your recording…", async () => {
      if (recorder.isRecording) await recorder.stop();
      const recordingUri = pendingVoiceUri || recorder.uri;
      if (!recordingUri)
        throw new Error(
          "The recording is not available yet. Try stopping it again.",
        );
      setPendingVoiceUri(recordingUri);
      setVoiceStage("stopped");
      const result = await captureFile({
        uri: recordingUri,
        name: `voice-${new Date().toISOString().replace(/[:.]/g, "-")}.m4a`,
        mimeType: "audio/mp4",
      });
      await discardTemporaryFile(recordingUri);
      setPendingVoiceUri(null);
      setVoiceStage("idle");
      setSelectedId(result.item.id);
      setTab("library");
      await setAudioModeAsync({ allowsRecording: false });
      tell(
        result.warning || "Recording saved on this device.",
        Boolean(result.warning),
      );
    });

  if (!ready)
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.boot}>
          <View style={styles.monogram}>
            <Text style={styles.monogramText}>ni</Text>
          </View>
          <Text accessibilityRole="header" style={styles.heroTitle}>
            Your ideas,{"\n"}close to hand.
          </Text>
          {booting ? (
            <>
              <ActivityIndicator size="large" color={colors.ink} />
              <Text style={styles.body}>Opening your encrypted inbox…</Text>
            </>
          ) : (
            <>
              <Text style={styles.errorTitle}>Your inbox could not open.</Text>
              <Text style={styles.body}>{bootError}</Text>
              <Text style={styles.small}>
                Nymrel Inbox requires its native build with encryption enabled.
                Saved data is never opened through an unencrypted fallback.
              </Text>
              <Action
                onPress={() => {
                  void boot();
                }}
                primary
              >
                Try again
              </Action>
            </>
          )}
        </View>
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.smallMonogram}>
            <Text style={styles.smallMonogramText}>ni</Text>
          </View>
          <View>
            <Text style={styles.brandName}>Nymrel Inbox</Text>
            <Text style={styles.brandSub}>A PRIVATE PLACE TO KEEP THINGS</Text>
          </View>
        </View>
        <View style={styles.localPill}>
          <View style={styles.dot} />
          <Text style={styles.localText}>On device</Text>
        </View>
      </View>

      {notice && (
        <View style={[styles.notice, notice.error && styles.noticeError]}>
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.noticeText, notice.error && styles.dangerText]}
          >
            {notice.message}
          </Text>
          {lastTrash && (
            <Action
              quiet
              disabled={Boolean(busy)}
              onPress={() => {
                void perform("Restoring capture…", async () => {
                  await restoreItem(lastTrash);
                  setLastTrash(null);
                  tell("Capture restored.");
                });
              }}
            >
              Undo
            </Action>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss message"
            onPress={() => setNotice(null)}
            style={styles.dismiss}
          >
            <Text style={styles.dismissText}>×</Text>
          </Pressable>
        </View>
      )}
      {busy && (
        <View accessibilityLiveRegion="polite" style={styles.busy}>
          <ActivityIndicator color={colors.ink} />
          <Text style={styles.small}>{busy}</Text>
        </View>
      )}

      {tab === "library" && (
        <View style={styles.content}>
          <View style={styles.titleRow}>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>LESS SEARCHING. MORE FINDING.</Text>
              <Text accessibilityRole="header" style={styles.heroTitle}>
                Keep what matters.
              </Text>
            </View>
            <Text style={styles.itemCount}>{items.length}</Text>
          </View>
          <TextInput
            accessibilityLabel="Search saved captures"
            value={query}
            onChangeText={setQuery}
            maxLength={500}
            placeholder="Search a phrase, idea, or detail…"
            placeholderTextColor={colors.muted}
            style={styles.search}
            returnKeyType="search"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filters}
            contentContainerStyle={styles.filterContent}
          >
            {kinds.map((kind) => (
              <Pressable
                key={kind.value}
                accessibilityRole="button"
                accessibilityState={{ selected: filter === kind.value }}
                onPress={() => setFilter(kind.value)}
                style={[
                  styles.filter,
                  filter === kind.value && styles.filterSelected,
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    filter === kind.value && styles.filterTextSelected,
                  ]}
                >
                  {kind.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.sectionLine}>
            <Text style={styles.sectionTitle}>
              {query.trim()
                ? `${results.length} matching ${results.length === 1 ? "capture" : "captures"}`
                : "Your saved things"}
            </Text>
            {query.trim() && (
              <Text style={styles.small}>Local text search</Text>
            )}
          </View>
          <FlatList
            data={results}
            keyExtractor={(result) => result.item.id}
            contentContainerStyle={styles.libraryList}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={12}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptySymbol}>↘</Text>
                <Text style={styles.emptyTitle}>
                  {items.length
                    ? "A little more specific?"
                    : "Start with something worth keeping."}
                </Text>
                <Text style={styles.body}>
                  {items.length
                    ? "Try a name, a word from the original, or a different filter."
                    : "Save a screenshot, link, PDF, recording, or note. Find it again without sending it to a server."}
                </Text>
                <Action primary onPress={() => setTab("capture")}>
                  {items.length
                    ? "Capture something"
                    : "Save your first capture"}
                </Action>
              </View>
            }
            renderItem={({ item: result }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${result.item.title}, ${result.item.kind}`}
                onPress={() => setSelectedId(result.item.id)}
                style={({ pressed }) => [
                  styles.card,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.cardTop}>
                  <View style={styles.kindPill}>
                    <Text style={styles.kindIcon}>
                      {kindIcon[result.item.kind]}
                    </Text>
                    <Text style={styles.kindText}>
                      {kindLabel[result.item.kind]}
                    </Text>
                  </View>
                  <Text style={styles.small}>
                    {dateLabel(result.item.createdAt)}
                  </Text>
                </View>
                <Text style={styles.cardTitle}>{result.item.title}</Text>
                {result.matches.length > 0 ? (
                  <View style={styles.excerpt}>
                    <Text style={styles.excerptSource}>
                      {result.matches[0].field === "segment"
                        ? sourceLabel(result.matches[0])
                        : `Matched ${result.matches[0].field}`}
                    </Text>
                    <Text style={styles.excerptText} numberOfLines={4}>
                      <Highlight text={result.matches[0].text} query={query} />
                    </Text>
                  </View>
                ) : (
                  <Text numberOfLines={2} style={styles.previewText}>
                    {result.item.notes ||
                      result.item.segments[0]?.text ||
                      result.item.url ||
                      "Original file preserved. Open to view or extract text."}
                  </Text>
                )}
                <View style={styles.tagsRow}>
                  {result.item.tags.slice(0, 5).map((tag) => (
                    <Text key={tag} style={styles.tag}>
                      {tag}
                    </Text>
                  ))}
                </View>
                <View style={styles.cardFooter}>
                  <Text style={styles.small}>
                    {result.item.asset
                      ? `${result.item.asset.name} · ${(result.item.asset.size / 1048576).toFixed(1)} MB`
                      : result.item.url
                        ? "Original link attached"
                        : "Text kept on device"}
                  </Text>
                  <Text style={styles.cardArrow}>↗</Text>
                </View>
              </Pressable>
            )}
          />
        </View>
      )}

      {tab === "capture" && (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.eyebrow}>GIVE IT A PLACE TO LAND</Text>
            <Text accessibilityRole="header" style={styles.heroTitle}>
              A thought. A receipt.{"\n"}A little inspiration.
            </Text>
            <Text style={styles.body}>
              Save the original. Keep the useful detail close.
            </Text>
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Bring something in</Text>
              <Action
                disabled={Boolean(busy)}
                onPress={() => {
                  void importImage();
                }}
              >
                ▧ Choose an image or screenshot
              </Action>
              <Action
                disabled={Boolean(busy)}
                onPress={() => {
                  void importFile();
                }}
              >
                ▤ Import PDF, image, or audio
              </Action>
              <Action
                disabled={Boolean(busy)}
                onPress={() => {
                  void receiveShares();
                }}
              >
                ↙ Check items shared to Inbox
              </Action>
              <Text style={styles.small}>
                Use another app’s Share menu and choose Nymrel Inbox. Supported
                originals are retained even when extraction is unavailable.
              </Text>
            </View>
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Catch a thought in words</Text>
              <Field
                label="Title"
                value={title}
                onChangeText={setTitle}
                maxLength={240}
                placeholder="Something to remember"
              />
              <Field
                label="Link · optional"
                value={url}
                onChangeText={setUrl}
                maxLength={4096}
                placeholder="https://…"
                url
              />
              <Field
                label="Note"
                value={notes}
                onChangeText={setNotes}
                maxLength={10000}
                placeholder="What do you want to keep?"
                multiline
              />
              <Action
                primary
                disabled={Boolean(busy) || (!notes.trim() && !url.trim())}
                onPress={() => {
                  void saveText();
                }}
              >
                Save to my inbox
              </Action>
            </View>
            <View style={styles.panel}>
              <View style={styles.sectionLine}>
                <Text style={styles.panelTitle}>A voice note</Text>
                <Text style={styles.recordingTime}>
                  {voiceStage === "idle"
                    ? "0:00"
                    : time(recorderState.durationMillis)}
                </Text>
              </View>
              <Text style={styles.body}>
                {voiceStage === "recording"
                  ? "Recording on this device. Stop and save when you are ready."
                  : voiceStage === "stopped"
                    ? "Your recording is waiting to be saved."
                    : "Record for up to two minutes. The original stays in your inbox."}
              </Text>
              {voiceStage === "idle" ? (
                <Action
                  disabled={Boolean(busy)}
                  onPress={() => {
                    void startVoice();
                  }}
                >
                  ◉ Record a voice note
                </Action>
              ) : (
                <Action
                  primary
                  disabled={Boolean(busy)}
                  onPress={() => {
                    void saveVoice();
                  }}
                >
                  {voiceStage === "recording"
                    ? "Stop and save recording"
                    : "Save this recording"}
                </Action>
              )}
              {voiceStage !== "idle" && (
                <Action
                  quiet
                  disabled={Boolean(busy)}
                  onPress={() =>
                    Alert.alert(
                      "Discard this temporary recording?",
                      "This removes the temporary recording from this device. If you have not saved it to your inbox, it cannot be restored. Any capture already saved in your inbox is kept.",
                      [
                        { text: "Keep recording", style: "cancel" },
                        {
                          text: "Discard recording",
                          style: "destructive",
                          onPress: () => {
                            void perform(
                              "Discarding recording…",
                              async () => {
                                if (recorder.isRecording) await recorder.stop();
                                const temporaryUri =
                                  pendingVoiceUri || recorder.uri;
                                if (temporaryUri)
                                  await discardTemporaryFile(temporaryUri);
                                setPendingVoiceUri(null);
                                setVoiceStage("idle");
                                await setAudioModeAsync({
                                  allowsRecording: false,
                                });
                                tell("Temporary recording discarded.");
                              },
                              false,
                            );
                          },
                        },
                      ],
                    )
                  }
                >
                  Discard temporary recording
                </Action>
              )}
              <Text style={styles.small}>
                {capabilities?.audio
                  ? "On-device transcription is available. Recognition depends on the language installed on your device."
                  : "On-device transcription is unavailable in this build or on this device. You can save and play the original recording."}
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {tab === "settings" && (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.eyebrow}>YOURS, ALL THE WAY THROUGH</Text>
          <Text accessibilityRole="header" style={styles.heroTitle}>
            A quieter kind{"\n"}of ownership.
          </Text>
          <Text style={styles.body}>
            Your inbox lives here. A backup lets you take it with you.
          </Text>
          <View style={styles.panel}>
            <View style={styles.sectionLine}>
              <Text style={styles.panelTitle}>On this device</Text>
              <View style={styles.dot} />
            </View>
            <Capability label="Encrypted database" available />
            <Capability
              label="Image text recognition"
              available={Boolean(capabilities?.ocr)}
            />
            <Capability
              label="PDF text extraction"
              available={Boolean(capabilities?.pdf)}
            />
            <Capability
              label="On-device audio transcription"
              available={Boolean(capabilities?.audio)}
            />
            {capabilities?.reason && (
              <Text style={styles.small}>{capabilities.reason}</Text>
            )}
            <Text style={styles.small}>
              Search uses text stored on this device. Tag suggestions and
              related items use local keyword rules. No cloud model or remote AI
              service is enabled.
            </Text>
          </View>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>An encrypted, portable backup</Text>
            <Text style={styles.body}>
              Backups include saved text and original files. Choose a password
              of at least 12 characters and keep it separately. Nymrel cannot
              reset it.
            </Text>
            <Field
              label="Backup password"
              value={password}
              onChangeText={setPassword}
              secure
              maxLength={1024}
              placeholder="At least 12 characters"
            />
            <Field
              label="Confirm password · for export"
              value={confirmation}
              onChangeText={setConfirmation}
              secure
              maxLength={1024}
              placeholder="Type it again before exporting"
            />
            <Action
              primary
              disabled={
                Boolean(busy) ||
                password.length < 12 ||
                password !== confirmation
              }
              onPress={() => {
                void perform(
                  "Encrypting your backup…",
                  async () => {
                    await exportBackup(password);
                    setPassword("");
                    setConfirmation("");
                    tell(
                      "Encrypted backup prepared. Save it somewhere you trust.",
                    );
                  },
                  false,
                );
              }}
            >
              Export encrypted backup ↓
            </Action>
            <Action
              disabled={Boolean(busy) || password.length < 12}
              onPress={() => {
                void perform("Opening encrypted backup…", async () => {
                  const result = await importBackup(password);
                  setPassword("");
                  setConfirmation("");
                  tell(
                    `${result.added} captures imported; ${result.skipped} existing or duplicate captures kept unchanged.`,
                  );
                });
              }}
            >
              Import and merge backup ↑
            </Action>
            <Text style={styles.small}>
              Import validates and decrypts the entire backup before adding
              captures. Existing items stay unchanged. Backups contain active
              captures and exclude trash. A single original can be up to 20 MB;
              one backup supports up to 100 MB of original files.
            </Text>
          </View>
          <View style={styles.panel}>
            <View style={styles.sectionLine}>
              <Text style={styles.panelTitle}>Trash</Text>
              <Text style={styles.small}>{trashedItems.length} captures</Text>
            </View>
            <Text style={styles.small}>
              Removed captures stay here until you empty the trash. Restore them
              at any time.
            </Text>
            {trashedItems.length ? (
              <>
                {trashedItems.map((item) => (
                  <View key={item.id} style={styles.related}>
                    <View style={styles.flex}>
                      <Text style={styles.relatedTitle}>{item.title}</Text>
                      <Text style={styles.small}>
                        {kindLabel[item.kind]} · {dateLabel(item.createdAt)}
                      </Text>
                    </View>
                    <Action
                      disabled={Boolean(busy)}
                      onPress={() => {
                        void perform("Restoring capture…", async () => {
                          await restoreItem(item.id);
                          if (lastTrash === item.id) setLastTrash(null);
                          tell("Capture restored to your library.");
                        });
                      }}
                    >
                      Restore
                    </Action>
                  </View>
                ))}
                <Action
                  danger
                  disabled={Boolean(busy)}
                  onPress={() =>
                    Alert.alert(
                      "Permanently empty trash?",
                      "This removes every trashed capture and its original file from this device. They cannot be restored from the app. Active captures are kept.",
                      [
                        { text: "Keep trash", style: "cancel" },
                        {
                          text: "Empty trash",
                          style: "destructive",
                          onPress: () => {
                            void perform("Emptying trash…", async () => {
                              const count = await purgeTrash();
                              setLastTrash(null);
                              tell(
                                `${count} trashed captures permanently removed.`,
                              );
                            });
                          },
                        },
                      ],
                    )
                  }
                >
                  Empty trash permanently
                </Action>
              </>
            ) : (
              <Text style={styles.body}>Nothing in the trash.</Text>
            )}
          </View>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>A few useful boundaries</Text>
            <Text style={styles.body}>
              Deleting the app or clearing its storage can remove your inbox.
              Export a backup before changing devices. Imported originals may
              briefly exist in protected temporary storage while text is
              extracted or you open them in another app.
            </Text>
            <Text style={styles.small}>
              Nymrel Inbox 0.1.0 · MIT open source{"\n"}No account. No automatic
              sync. No advertising.
            </Text>
            <Action
              onPress={() => {
                void Linking.openURL(
                  "https://github.com/nymrel/a2ui-warm-paper/tree/main/examples/nymrel-inbox",
                ).catch((error) => tell(messageOf(error), true));
              }}
            >
              View source and license ↗
            </Action>
          </View>
        </ScrollView>
      )}

      <SafeAreaView edges={["bottom"]} style={styles.bottomSafe}>
        <View style={styles.tabs}>
          {(
            [
              ["library", "▱", "Library"],
              ["capture", "+", "Capture"],
              ["settings", "◌", "Your data"],
            ] as const
          ).map(([value, icon, label]) => (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: tab === value }}
              onPress={() => setTab(value)}
              style={[styles.tab, tab === value && styles.tabSelected]}
            >
              <Text
                style={[
                  styles.tabIcon,
                  tab === value && styles.tabTextSelected,
                ]}
              >
                {icon}
              </Text>
              <Text
                style={[
                  styles.tabText,
                  tab === value && styles.tabTextSelected,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>

      <Modal
        visible={Boolean(selected)}
        animationType="slide"
        onRequestClose={() => setSelectedId(null)}
        presentationStyle="pageSheet"
      >
        {selected && (
          <SafeAreaView style={styles.screen}>
            <View style={styles.detailHeader}>
              <Text style={styles.eyebrow}>
                {kindLabel[selected.kind]} · {dateLabel(selected.createdAt)}
              </Text>
              <Action quiet onPress={() => setSelectedId(null)}>
                Close ×
              </Action>
            </View>
            {notice && (
              <View style={[styles.notice, notice.error && styles.noticeError]}>
                <Text
                  accessibilityLiveRegion="polite"
                  style={[styles.noticeText, notice.error && styles.dangerText]}
                >
                  {notice.message}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss message"
                  onPress={() => setNotice(null)}
                  style={styles.dismiss}
                >
                  <Text style={styles.dismissText}>×</Text>
                </Pressable>
              </View>
            )}
            {busy && (
              <View accessibilityLiveRegion="polite" style={styles.busy}>
                <ActivityIndicator color={colors.ink} />
                <Text style={styles.small}>{busy}</Text>
              </View>
            )}
            <KeyboardAvoidingView
              style={styles.flex}
              behavior={Platform.OS === "ios" ? "padding" : undefined}
            >
              <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
              >
                <Text accessibilityRole="header" style={styles.heroTitle}>
                  {selected.title}
                </Text>
                {selected.asset || selected.url ? (
                  <Action
                    primary
                    disabled={Boolean(busy)}
                    onPress={() => {
                      void perform(
                        "Opening the original…",
                        async () => {
                          await openOriginal(selected);
                        },
                        false,
                      );
                    }}
                  >
                    {selected.asset
                      ? "Open or share original ↗"
                      : "Open saved link ↗"}
                  </Action>
                ) : (
                  <View style={styles.detailExcerpt}>
                    <Text style={styles.excerptSource}>Saved note text</Text>
                    <Text selectable style={styles.excerptText}>
                      {selected.notes}
                    </Text>
                  </View>
                )}
                {selected.asset && (
                  <Text style={styles.small}>
                    {selected.asset.name} ·{" "}
                    {(selected.asset.size / 1048576).toFixed(1)} MB{"\n"}
                    Original file preserved with a SHA-256 checksum.
                  </Text>
                )}
                {selected.url ? (
                  <Text selectable style={styles.sourceUrl}>
                    {selected.url}
                  </Text>
                ) : null}
                {query.trim() && matched.length > 0 && (
                  <View style={styles.panel}>
                    <Text style={styles.panelTitle}>Why this matched</Text>
                    {matched.slice(0, 5).map((match, index) => (
                      <View key={index} style={styles.detailExcerpt}>
                        <Text style={styles.excerptSource}>
                          {match.field === "segment"
                            ? sourceLabel(match)
                            : `Matched ${match.field}`}
                        </Text>
                        <Text selectable style={styles.excerptText}>
                          <Highlight text={match.text} query={query} />
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
                <View style={styles.panel}>
                  <Text style={styles.panelTitle}>Text from the source</Text>
                  {selected.segments.length ? (
                    selected.segments.slice(0, 40).map((segment, index) => (
                      <View key={index} style={styles.detailExcerpt}>
                        <Text style={styles.excerptSource}>
                          {sourceLabel(segment)}
                        </Text>
                        <Text selectable style={styles.excerptText}>
                          {segment.text.slice(0, 6000)}
                        </Text>
                        {segment.text.length > 6000 && (
                          <Text style={styles.small}>
                            Showing the first 6,000 characters of this source
                            segment. Its full text remains searchable.
                          </Text>
                        )}
                      </View>
                    ))
                  ) : (
                    <Text style={styles.body}>
                      {selected.kind === "note" || selected.kind === "link"
                        ? "Your own notes are saved below."
                        : "No text has been extracted. The original is safe to open, and its title and notes are searchable."}
                    </Text>
                  )}
                  {selected.segments.length > 40 && (
                    <Text style={styles.small}>
                      Showing the first 40 source segments. Search covers every
                      saved segment; use the original for the full document.
                    </Text>
                  )}
                  {selected.asset && (
                    <Action
                      disabled={Boolean(busy)}
                      onPress={() => {
                        void perform(
                          "Reading the original on device…",
                          async () => {
                            const result = await retryExtraction(selected);
                            tell(
                              result.warning || "Source text updated.",
                              Boolean(result.warning),
                            );
                          },
                        );
                      }}
                    >
                      Retry text extraction
                    </Action>
                  )}
                </View>
                <View style={styles.panel}>
                  <Text style={styles.panelTitle}>Make it easier to find</Text>
                  <Field
                    label="Capture title"
                    value={draftTitle}
                    onChangeText={setDraftTitle}
                    maxLength={240}
                  />
                  <Field
                    label="Your notes"
                    value={draftNotes}
                    onChangeText={setDraftNotes}
                    maxLength={10000}
                    multiline
                  />
                  <Field
                    label="Tags · comma separated"
                    value={draftTags}
                    onChangeText={setDraftTags}
                    maxLength={1230}
                    placeholder="ideas, home, work"
                  />
                  {suggestions.length > 0 && (
                    <View>
                      <Text style={styles.small}>
                        Suggested from local text · tap to add
                      </Text>
                      <View style={styles.tagsRow}>
                        {suggestions.map((tag) => (
                          <Pressable
                            key={tag}
                            accessibilityRole="button"
                            accessibilityLabel={`Add tag ${tag}`}
                            onPress={() =>
                              setDraftTags((current) =>
                                [
                                  ...new Set([
                                    ...current
                                      .split(",")
                                      .map((value) => value.trim())
                                      .filter(Boolean),
                                    tag,
                                  ]),
                                ].join(", "),
                              )
                            }
                            style={styles.suggestion}
                          >
                            <Text style={styles.suggestionText}>+ {tag}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  )}
                  <Action
                    primary
                    disabled={Boolean(busy) || !draftTitle.trim()}
                    onPress={() => {
                      void perform("Saving your changes…", async () => {
                        await updateItem({
                          ...selected,
                          title: draftTitle.trim(),
                          notes: draftNotes,
                          tags: [
                            ...new Map(
                              draftTags
                                .split(",")
                                .map((tag) => tag.trim())
                                .filter(Boolean)
                                .map((tag) => [tag.toLowerCase(), tag]),
                            ).values(),
                          ],
                        });
                        tell("Changes saved on this device.");
                      });
                    }}
                  >
                    Save changes
                  </Action>
                </View>
                {related.length > 0 && (
                  <View style={styles.panel}>
                    <Text style={styles.panelTitle}>
                      A few things connected by words
                    </Text>
                    {related.map((result) => (
                      <Pressable
                        key={result.item.id}
                        accessibilityRole="button"
                        onPress={() => setSelectedId(result.item.id)}
                        style={styles.related}
                      >
                        <Text style={styles.relatedTitle}>
                          {result.item.title}
                        </Text>
                        <Text style={styles.cardArrow}>↗</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                <Action
                  danger
                  disabled={Boolean(busy)}
                  onPress={() => {
                    void perform("Moving capture to trash…", async () => {
                      await trashItem(selected.id);
                      setLastTrash(selected.id);
                      setSelectedId(null);
                      tell("Capture moved to trash. You can undo this action.");
                    });
                  }}
                >
                  Move capture to trash
                </Action>
              </ScrollView>
            </KeyboardAvoidingView>
          </SafeAreaView>
        )}
      </Modal>
    </SafeAreaView>
  );
}

function Capability({
  label,
  available,
}: {
  label: string;
  available: boolean;
}) {
  return (
    <View style={styles.capability}>
      <Text style={styles.bodyCompact}>{label}</Text>
      <Text style={[styles.capabilityValue, !available && styles.unavailable]}>
        {available ? "Ready" : "Unavailable"}
      </Text>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Inbox />
    </SafeAreaProvider>
  );
}

const colors = {
  canvas: "#FAF8F2",
  paper: "#F4F0E6",
  linen: "#EFE9DC",
  ink: "#2A332E",
  muted: "#63695F",
  line: "#D9D4C8",
  terracotta: "#A8541F",
  green: "#2E5A44",
  error: "#8F351E",
};
const serif = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "Georgia",
});
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderColor: colors.line,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    flexShrink: 1,
  },
  brandName: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.5,
  },
  brandSub: {
    fontSize: 7,
    letterSpacing: 1.25,
    marginTop: 4,
    color: colors.muted,
  },
  smallMonogram: {
    width: 37,
    height: 39,
    borderRadius: 10,
    backgroundColor: colors.ink,
    justifyContent: "center",
    alignItems: "center",
  },
  smallMonogramText: {
    fontFamily: serif,
    color: colors.canvas,
    fontSize: 27,
    letterSpacing: -3,
  },
  localPill: { flexDirection: "row", alignItems: "center", gap: 5 },
  localText: { fontSize: 10, color: colors.muted },
  dot: { width: 6, height: 6, backgroundColor: colors.green, borderRadius: 3 },
  content: { flex: 1, paddingHorizontal: 20 },
  titleRow: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 29,
    alignItems: "center",
  },
  eyebrow: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  heroTitle: {
    fontFamily: serif,
    color: colors.ink,
    fontSize: 34,
    letterSpacing: -0.9,
    lineHeight: 41,
    marginBottom: 17,
  },
  itemCount: { fontFamily: serif, color: "#969E8F", fontSize: 36 },
  search: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 15,
    minHeight: 49,
    borderRadius: 11,
    fontSize: 14,
    color: colors.ink,
  },
  filters: { flexGrow: 0, marginTop: 13, marginHorizontal: -20 },
  filterContent: { paddingHorizontal: 20, gap: 7, paddingBottom: 4 },
  filter: {
    minHeight: 44,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 7,
    justifyContent: "center",
    backgroundColor: colors.paper,
  },
  filterSelected: { backgroundColor: colors.ink },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: "500" },
  filterTextSelected: { color: colors.canvas },
  sectionLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 14,
    marginTop: 16,
  },
  sectionTitle: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  libraryList: { paddingBottom: 24, gap: 13 },
  card: {
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: "#FDFCF8",
    padding: 17,
    gap: 11,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  kindPill: { flexDirection: "row", alignItems: "center", gap: 7 },
  kindIcon: { color: colors.terracotta, fontSize: 17 },
  kindText: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.3,
  },
  cardTitle: {
    fontFamily: serif,
    fontSize: 23,
    lineHeight: 29,
    color: colors.ink,
  },
  previewText: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 3 },
  tag: {
    fontSize: 10,
    color: colors.muted,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 4,
    backgroundColor: colors.paper,
  },
  cardFooter: {
    borderTopWidth: 1,
    borderColor: colors.line,
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },
  cardArrow: { color: colors.terracotta, fontSize: 20 },
  excerpt: {
    borderLeftWidth: 2,
    borderColor: "#B9C5AD",
    paddingLeft: 11,
    gap: 6,
  },
  excerptSource: { color: colors.green, fontSize: 10, fontWeight: "600" },
  excerptText: { color: colors.ink, fontSize: 14, lineHeight: 22 },
  highlight: { backgroundColor: "#E5D9B8", color: colors.ink },
  detailExcerpt: {
    gap: 6,
    borderLeftWidth: 2,
    borderColor: colors.line,
    paddingLeft: 12,
    paddingVertical: 4,
    marginBottom: 9,
  },
  empty: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.line,
    borderRadius: 12,
    padding: 24,
    gap: 17,
    alignItems: "stretch",
  },
  emptySymbol: { fontSize: 28, color: colors.terracotta },
  emptyTitle: {
    fontFamily: serif,
    color: colors.ink,
    fontSize: 27,
    lineHeight: 34,
  },
  scrollContent: { padding: 20, paddingTop: 28, paddingBottom: 40, gap: 15 },
  panel: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 12,
    padding: 18,
    gap: 16,
  },
  panelTitle: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  body: { color: colors.muted, fontSize: 14, lineHeight: 23 },
  bodyCompact: {
    color: colors.ink,
    fontSize: 13,
    lineHeight: 20,
    flexShrink: 1,
  },
  small: { color: colors.muted, fontSize: 11, lineHeight: 18, flexShrink: 1 },
  field: { gap: 8 },
  fieldLabel: { color: colors.ink, fontSize: 12, fontWeight: "600" },
  input: {
    color: colors.ink,
    fontSize: 14,
    lineHeight: 21,
    backgroundColor: colors.canvas,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 47,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  multiline: { minHeight: 112 },
  action: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.canvas,
    borderRadius: 8,
    paddingHorizontal: 13,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionText: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
  },
  actionPrimary: { backgroundColor: colors.ink, borderColor: colors.ink },
  actionPrimaryText: { color: colors.canvas },
  actionQuiet: {
    borderWidth: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 10,
  },
  actionDanger: { backgroundColor: "#F5E9DF", borderColor: "#DFC4AF" },
  dangerText: { color: colors.error },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.72 },
  bottomSafe: {
    backgroundColor: colors.paper,
    borderTopWidth: 1,
    borderColor: colors.line,
  },
  tabs: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: "row",
    gap: 8,
  },
  tab: {
    flex: 1,
    minHeight: 54,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  tabSelected: { backgroundColor: colors.ink },
  tabIcon: { fontSize: 21, color: colors.muted },
  tabText: { fontSize: 10, color: colors.muted, fontWeight: "600" },
  tabTextSelected: { color: colors.canvas },
  notice: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingLeft: 13,
    backgroundColor: "#E8EEDF",
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#C7D1BB",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  noticeError: { backgroundColor: "#F6E9DF", borderColor: "#DDC2AF" },
  noticeText: {
    flex: 1,
    color: colors.green,
    fontSize: 12,
    lineHeight: 18,
    paddingVertical: 11,
  },
  dismiss: {
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  dismissText: { color: colors.muted, fontSize: 23 },
  busy: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    gap: 10,
  },
  detailHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  sourceUrl: { color: colors.green, fontSize: 13, lineHeight: 21 },
  suggestion: {
    paddingHorizontal: 11,
    minHeight: 44,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    justifyContent: "center",
  },
  suggestionText: { color: colors.green, fontSize: 12 },
  related: {
    minHeight: 48,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: colors.line,
    paddingVertical: 10,
  },
  relatedTitle: { color: colors.ink, fontSize: 14, lineHeight: 21, flex: 1 },
  capability: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  capabilityValue: { color: colors.green, fontSize: 11, fontWeight: "600" },
  unavailable: { color: colors.muted },
  recordingTime: {
    color: colors.terracotta,
    fontSize: 17,
    fontVariant: ["tabular-nums"],
  },
  boot: { flex: 1, padding: 32, justifyContent: "center", gap: 25 },
  monogram: {
    width: 66,
    height: 70,
    borderRadius: 17,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  monogramText: {
    color: colors.canvas,
    fontFamily: serif,
    fontSize: 48,
    letterSpacing: -5,
  },
  errorTitle: { color: colors.error, fontSize: 16, fontWeight: "700" },
});

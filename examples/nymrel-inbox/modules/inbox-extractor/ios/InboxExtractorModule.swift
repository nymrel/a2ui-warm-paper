import ExpoModulesCore
import Foundation
import Vision
import PDFKit
import Speech
import AVFoundation
import UIKit
import ImageIO

private let maxFileBytes: Int64 = 20 * 1024 * 1024
private let maxTextCharacters = 200_000
private let maxPages = 20

private func inboxError(_ message: String) -> NSError {
  NSError(domain: "NymrelInboxExtractor", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
}

/// A one-shot result owns and cancels its recognition task on timeout or settlement.
private final class SpeechJob: @unchecked Sendable {
  private let lock = NSLock()
  private var settled = false
  private var task: SFSpeechRecognitionTask?
  private let promise: Promise
  private let onFinish: () -> Void
  init(_ promise: Promise, onFinish: @escaping () -> Void) { self.promise = promise; self.onFinish = onFinish }
  var isFinished: Bool { lock.lock(); defer { lock.unlock() }; return settled }
  func setTask(_ task: SFSpeechRecognitionTask) {
    lock.lock(); let done = settled; if !done { self.task = task }; lock.unlock()
    if done { task.cancel() }
  }
  func resolve(_ segments: [[String: Any]]) {
    lock.lock(); if settled { lock.unlock(); return }; settled = true
    let current = task; task = nil; lock.unlock()
    current?.cancel()
    onFinish()
    promise.resolve(["segments": segments, "truncated": false])
  }
  func reject(_ message: String) {
    lock.lock(); if settled { lock.unlock(); return }; settled = true
    let current = task; task = nil; lock.unlock()
    current?.cancel()
    onFinish()
    promise.reject("ERR_INBOX_TRANSCRIPTION", message)
  }
}

public final class InboxExtractorModule: Module {
  private let extractionLock = NSLock()
  private var extracting = false

  public func definition() -> ModuleDefinition {
    Name("InboxExtractor")
    Function("capabilities") { () -> [String: Any] in
      let audio = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))?.supportsOnDeviceRecognition == true
      var result: [String: Any] = ["ocr": true, "pdf": true, "audio": audio]
      if !audio { result["reason"] = "On-device speech recognition is unavailable for this device/language. The original audio can still be saved." }
      return result
    }
    AsyncFunction("extract") { (uri: String, mimeType: String, locale: String, promise: Promise) in
      self.extractionLock.lock()
      if self.extracting { self.extractionLock.unlock(); promise.reject("ERR_INBOX_BUSY", "An extraction is already running. Try again after it finishes."); return }
      self.extracting = true; self.extractionLock.unlock()
      DispatchQueue.global(qos: .userInitiated).async {
        var asynchronous = false
        defer { if !asynchronous { self.releaseExtraction() } }
        do {
          let url = try self.localFile(uri)
          let mime = mimeType.lowercased()
          if mime.hasPrefix("audio/") { asynchronous = true; self.transcribe(url, locale: locale, promise: promise); return }
          let result = try self.extractDocument(url, mime: mime)
          promise.resolve(result)
        } catch { promise.reject(error) }
      }
    }
    AsyncFunction("getSharedItems") { () throws -> [[String: Any]] in
      let directory = try self.queueDirectory()
      let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
        .filter { $0.pathExtension == "json" }.sorted { $0.lastPathComponent < $1.lastPathComponent }.prefix(100)
      return try files.map { file in
        let values = try file.resourceValues(forKeys: [.fileSizeKey])
        guard (values.fileSize ?? 0) <= 1_048_576 else { throw inboxError("A shared capture is too large to read.") }
        guard var item = try JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any],
              let id = item["id"] as? String, self.isSafeID(id), file.lastPathComponent == id + ".json"
        else { throw inboxError("A pending shared capture is malformed. Its original data has been preserved.") }
        if let fileName = item.removeValue(forKey: "fileName") as? String {
          let original = try self.queuedFile(directory, fileName: fileName, id: id)
          item["uri"] = original.absoluteString
        }
        return item
      }
    }
    AsyncFunction("acknowledgeShared") { (id: String) throws in
      guard self.isSafeID(id) else { throw inboxError("Invalid capture identifier.") }
      let directory = try self.queueDirectory()
      let metadata = directory.appendingPathComponent(id + ".json")
      guard FileManager.default.fileExists(atPath: metadata.path) else { return }
      let item = try JSONSerialization.jsonObject(with: Data(contentsOf: metadata)) as? [String: Any]
      if let fileName = item?["fileName"] as? String {
        let original = try self.queuedFile(directory, fileName: fileName, id: id)
        try FileManager.default.removeItem(at: original)
      }
      try FileManager.default.removeItem(at: metadata)
    }
  }

  private func releaseExtraction() { extractionLock.lock(); extracting = false; extractionLock.unlock() }

  private func isSafeID(_ id: String) -> Bool {
    !id.isEmpty && id.count <= 128 && id.range(of: "^[A-Za-z0-9-]+$", options: .regularExpression) != nil
  }
  private func queueDirectory() throws -> URL {
    guard let group = Bundle.main.object(forInfoDictionaryKey: "InboxAppGroup") as? String,
          let base = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group)
    else { throw inboxError("The shared inbox is unavailable in this build. Rebuild with its App Group entitlement.") }
    let directory = base.appendingPathComponent("InboxPending-v1", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory
  }
  private func queuedFile(_ directory: URL, fileName: String, id: String) throws -> URL {
    guard fileName.hasPrefix(id + "."), !fileName.contains("/"), !fileName.contains("\\"), fileName.count <= 180 else { throw inboxError("Invalid shared attachment path.") }
    let url = directory.appendingPathComponent(fileName).resolvingSymlinksInPath()
    guard url.path.hasPrefix(directory.resolvingSymlinksInPath().path + "/") else { throw inboxError("The shared attachment is outside the inbox.") }
    return url
  }
  private func localFile(_ uri: String) throws -> URL {
    guard let input = URL(string: uri), input.isFileURL, input.host == nil || input.host == "" || input.host == "localhost" else { throw inboxError("Extraction accepts a copied local file only.") }
    let url = input.resolvingSymlinksInPath().standardizedFileURL
    let home = URL(fileURLWithPath: NSHomeDirectory()).resolvingSymlinksInPath().path + "/"
    guard url.path.hasPrefix(home) else { throw inboxError("Copy the original into the app's private storage before extracting it.") }
    let values = try url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
    guard values.isRegularFile == true, let size = values.fileSize, size > 0, Int64(size) <= maxFileBytes else { throw inboxError("Choose a nonempty file no larger than 20 MiB.") }
    return url
  }
  private func recognize(_ image: CGImage) throws -> String {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
    return (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
  }
  private func extractDocument(_ url: URL, mime: String) throws -> [String: Any] {
    var segments: [[String: Any]] = []
    var truncated = false
    var remaining = maxTextCharacters
    let deadline = Date().addingTimeInterval(60)
    if mime == "application/pdf" {
      guard let document = PDFDocument(url: url), !document.isLocked else { throw inboxError("This PDF is unreadable or password protected.") }
      truncated = document.pageCount > maxPages
      for index in 0..<min(document.pageCount, maxPages) {
        guard Date() < deadline else { truncated = true; break }
        guard let page = document.page(at: index) else { continue }
        let text: String = try autoreleasepool {
          let embedded = (page.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
          if !embedded.isEmpty { return embedded }
          let bounds = page.bounds(for: .mediaBox)
          guard bounds.width > 0, bounds.height > 0 else { return "" }
          let scale = min(1600 / max(bounds.width, bounds.height), 3)
          let size = CGSize(width: max(1, bounds.width * scale), height: max(1, bounds.height * scale))
          let renderer = UIGraphicsImageRenderer(size: size)
          let image = renderer.image { context in
            UIColor.white.setFill(); context.fill(CGRect(origin: .zero, size: size))
            context.cgContext.translateBy(x: 0, y: size.height)
            context.cgContext.scaleBy(x: scale, y: -scale)
            page.draw(with: .mediaBox, to: context.cgContext)
          }
          guard let cgImage = image.cgImage else { return "" }
          return try self.recognize(cgImage)
        }
        let clipped = String(text.prefix(remaining))
        if !clipped.isEmpty { segments.append(["text": clipped, "page": index + 1]); remaining -= clipped.count }
        if text.count > clipped.count || remaining <= 0 { truncated = true; break }
      }
    } else if mime.hasPrefix("image/") {
      guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { throw inboxError("This image format could not be decoded.") }
      let options: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceThumbnailMaxPixelSize: 2400, kCGImageSourceCreateThumbnailWithTransform: true]
      guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { throw inboxError("This image could not be decoded.") }
      let text = try recognize(image)
      let clipped = String(text.prefix(remaining))
      truncated = text.count > clipped.count
      if !clipped.isEmpty { segments.append(["text": clipped]) }
    } else { throw inboxError("Only image, PDF, and supported audio files can be extracted.") }
    guard !segments.isEmpty else { throw inboxError("No readable text was found. The original can still be saved, and you can add your own note.") }
    return ["segments": segments, "truncated": truncated]
  }
  private func transcribe(_ url: URL, locale: String, promise: Promise) {
    let job = SpeechJob(promise, onFinish: { self.releaseExtraction() })
    DispatchQueue.global().asyncAfter(deadline: .now() + 90) { job.reject("On-device transcription timed out. The original audio has been kept.") }
    DispatchQueue.main.async {
      guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale)), recognizer.supportsOnDeviceRecognition else { job.reject("On-device speech is unavailable for this device/language. No audio was sent to a server."); return }
      do {
        let audio = try AVAudioPlayer(contentsOf: url)
        guard audio.duration.isFinite, audio.duration > 0, audio.duration <= 120 else { job.reject("On-device transcription currently accepts audio up to 2 minutes long. The original can still be saved."); return }
      } catch { job.reject("This audio format could not be read. The original can still be saved."); return }
      SFSpeechRecognizer.requestAuthorization { status in
        DispatchQueue.main.async {
          guard !job.isFinished else { return }
          guard status == .authorized else { job.reject("Speech permission was not granted. Add a transcript manually or enable Speech Recognition in Settings."); return }
          guard recognizer.supportsOnDeviceRecognition else { job.reject("On-device speech became unavailable. No network fallback is used."); return }
          let request = SFSpeechURLRecognitionRequest(url: url)
          request.requiresOnDeviceRecognition = true
          request.shouldReportPartialResults = false
          let task = recognizer.recognitionTask(with: request) { result, error in
            if let error { job.reject(error.localizedDescription); return }
            guard let result, result.isFinal else { return }
            let segments: [[String: Any]] = result.bestTranscription.segments.prefix(10_000).map { segment in
              ["text": segment.substring, "startMs": Int((segment.timestamp * 1000).rounded()), "endMs": Int(((segment.timestamp + segment.duration) * 1000).rounded())]
            }
            guard !segments.isEmpty else { job.reject("No speech was recognized. The original audio can still be saved."); return }
            job.resolve(segments)
          }
          job.setTask(task)
        }
      }
    }
  }
}

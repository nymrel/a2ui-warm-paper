import UIKit
import UniformTypeIdentifiers
import Foundation

/// The extension only stages captures and completes the request. It never opens the host app.
final class ShareViewController: UIViewController {
  private let status = UILabel()
  private let saveButton = UIButton(type: .system)
  private let cancelButton = UIButton(type: .system)
  private let lock = NSLock()
  private var saved = 0
  private var skipped = 0
  private var finished = false

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = UIColor(red: 0.98, green: 0.97, blue: 0.95, alpha: 1)
    let title = UILabel()
    title.text = "Save to Nymrel Inbox"
    title.font = .preferredFont(forTextStyle: .title2)
    title.adjustsFontForContentSizeCategory = true
    title.numberOfLines = 0
    status.text = "Keep a private copy on this device. Open Nymrel Inbox later to finish indexing it."
    status.font = .preferredFont(forTextStyle: .body)
    status.adjustsFontForContentSizeCategory = true
    status.numberOfLines = 0
    saveButton.setTitle("Save capture", for: .normal)
    saveButton.titleLabel?.font = .preferredFont(forTextStyle: .headline)
    saveButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
    saveButton.addTarget(self, action: #selector(save), for: .touchUpInside)
    cancelButton.setTitle("Cancel", for: .normal)
    cancelButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
    cancelButton.addTarget(self, action: #selector(cancel), for: .touchUpInside)
    let stack = UIStackView(arrangedSubviews: [title, status, saveButton, cancelButton])
    stack.axis = .vertical; stack.spacing = 24; stack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 28),
      stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -28),
      stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 32),
      stack.bottomAnchor.constraint(lessThanOrEqualTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24)
    ])
  }

  @objc private func cancel() {
    guard !finished else { extensionContext?.completeRequest(returningItems: nil, completionHandler: nil); return }
    extensionContext?.cancelRequest(withError: NSError(domain: NSCocoaErrorDomain, code: NSUserCancelledError))
  }
  @objc private func save() {
    if finished { extensionContext?.completeRequest(returningItems: nil, completionHandler: nil); return }
    saveButton.isEnabled = false; cancelButton.isEnabled = false; status.text = "Saving a private copy…"
    let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
    guard !providers.isEmpty else { finish(message: "This share contains no supported captures."); return }
    let group = DispatchGroup()
    for provider in providers.prefix(5) {
      group.enter()
      load(provider) { success in
        self.lock.lock(); if success { self.saved += 1 } else { self.skipped += 1 }; self.lock.unlock()
        group.leave()
      }
    }
    skipped += max(0, providers.count - 5)
    group.notify(queue: .main) {
      let result = self.saved == 0 ? "Nothing was saved. Choose a supported link, text, image, PDF, or audio file up to 20 MiB." : "Saved \(self.saved) capture\(self.saved == 1 ? "" : "s") on this device. Open Nymrel Inbox to index them."
      self.finish(message: result + (self.skipped > 0 ? " \(self.skipped) unsupported or oversized item(s) were skipped." : ""))
    }
  }
  private func finish(message: String) {
    finished = true; status.text = message; saveButton.setTitle("Done", for: .normal)
    saveButton.isEnabled = true; cancelButton.isHidden = true
  }
  private func queueDirectory() throws -> URL {
    guard let identifier = Bundle.main.object(forInfoDictionaryKey: "InboxAppGroup") as? String,
          let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: identifier)
    else { throw NSError(domain: "NymrelInbox", code: 1, userInfo: nil) }
    let directory = container.appendingPathComponent("InboxPending-v1", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory
  }
  private func writeMetadata(_ item: [String: Any], id: String, directory: URL) throws {
    var values = item; values["id"] = id
    let metadata = directory.appendingPathComponent(id + ".json")
    try JSONSerialization.data(withJSONObject: values).write(to: metadata, options: [.atomic, .completeFileProtection])
  }
  private func saveText(_ text: String, url: String? = nil) throws {
    guard !text.isEmpty, text.utf8.count <= 200_000 else { throw NSError(domain: "NymrelInbox", code: 2, userInfo: nil) }
    let id = UUID().uuidString
    var item: [String: Any] = ["text": text, "name": "Shared capture", "mimeType": "text/plain"]
    if let url { item["url"] = url }
    try writeMetadata(item, id: id, directory: queueDirectory())
  }
  private func saveFile(_ source: URL, type: UTType) throws {
    let scoped = source.startAccessingSecurityScopedResource()
    defer { if scoped { source.stopAccessingSecurityScopedResource() } }
    let values = try source.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
    guard values.isRegularFile == true, let bytes = values.fileSize, bytes > 0, bytes <= 20 * 1024 * 1024 else { throw NSError(domain: "NymrelInbox", code: 3, userInfo: nil) }
    let directory = try queueDirectory()
    let id = UUID().uuidString
    let ext = type.preferredFilenameExtension ?? "bin"
    let fileName = id + "." + ext
    let destination = directory.appendingPathComponent(fileName)
    try FileManager.default.copyItem(at: source, to: destination)
    do {
      try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: destination.path)
      try writeMetadata(["fileName": fileName, "name": source.lastPathComponent, "mimeType": type.preferredMIMEType ?? "application/octet-stream"], id: id, directory: directory)
    } catch { try? FileManager.default.removeItem(at: destination); throw error }
  }
  private func load(_ provider: NSItemProvider, completion: @escaping (Bool) -> Void) {
    let fileTypes: [UTType] = [.pdf, .image, .audio]
    if let requestedType = fileTypes.first(where: { provider.hasItemConformingToTypeIdentifier($0.identifier) }) {
      provider.loadFileRepresentation(forTypeIdentifier: requestedType.identifier) { url, error in
        guard error == nil, let url else { completion(false); return }
        let type = UTType(filenameExtension: url.pathExtension) ?? requestedType
        do { try self.saveFile(url, type: type); completion(true) } catch { completion(false) }
      }
    } else if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
      provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { item, error in
        guard error == nil, let url = item as? URL, ["http", "https"].contains(url.scheme?.lowercased() ?? ""), url.user == nil, url.password == nil else { completion(false); return }
        do { try self.saveText(url.absoluteString, url: url.absoluteString); completion(true) } catch { completion(false) }
      }
    } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
      provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { item, error in
        guard error == nil, let text = item as? String else { completion(false); return }
        do { try self.saveText(text); completion(true) } catch { completion(false) }
      }
    } else { completion(false) }
  }
}

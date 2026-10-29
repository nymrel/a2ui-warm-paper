Pod::Spec.new do |s|
  s.name = 'InboxExtractor'
  s.version = '0.1.0'
  s.summary = 'On-device, source-preserving capture extraction for Nymrel Inbox'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = { 'Nymrel' => 'contact@nymrel.com' }
  s.homepage = 'https://github.com/nymrel/a2ui-warm-paper'
  s.platforms = { :ios => '16.4' }
  s.source = { :git => 'https://github.com/nymrel/a2ui-warm-paper.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'PDFKit', 'Speech', 'AVFoundation', 'UIKit', 'ImageIO'
  s.swift_version = '5.9'
  s.source_files = 'InboxExtractorModule.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end

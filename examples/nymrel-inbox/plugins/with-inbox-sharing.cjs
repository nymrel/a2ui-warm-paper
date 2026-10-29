const fs = require('node:fs');
const path = require('node:path');
const { withBaseMod, withInfoPlist } = require('@expo/config-plugins');
const plistModule = require('@expo/plist');
const plist = plistModule.default || plistModule;

/**
 * Keep expo-sharing's generated target and App Group setup, but replace its
 * controller with a supported extension that never launches the host app.
 * Register AFTER expo-sharing. The base-mod wrapper deliberately runs the
 * prior dangerous-mod chain first, so generated files cannot overwrite it.
 */
module.exports = function withInboxSharing(config, options = {}) {
  const appGroup = options.appGroup || `group.${config.ios?.bundleIdentifier}`;
  if (!config.ios?.bundleIdentifier || !/^group\.[A-Za-z0-9.-]+$/.test(appGroup)) {
    throw new Error('Nymrel Inbox sharing requires an iOS bundle identifier and a valid App Group.');
  }
  config = withInfoPlist(config, (result) => {
    result.modResults.InboxAppGroup = appGroup;
    result.modResults.NSSpeechRecognitionUsageDescription ||= 'Extract a transcript on this device from audio you choose to save.';
    return result;
  });
  return withBaseMod(config, {
    platform: 'ios',
    mod: 'dangerous',
    isProvider: false,
    action: async (input) => {
      const result = await input.modRequest.nextMod(input);
      const root = result.modRequest.platformProjectRoot;
      const directory = path.join(root, 'expo-sharing-extension');
      const infoPath = path.join(directory, 'Info.plist');
      const controller = path.join(directory, 'ShareIntoViewController.swift');
      if (!fs.existsSync(infoPath) || !fs.existsSync(controller)) {
        throw new Error('The expo-sharing iOS extension must be enabled before with-inbox-sharing.');
      }
      const info = plist.parse(fs.readFileSync(infoPath, 'utf8'));
      if (info.AppGroupId !== appGroup) {
        throw new Error('The share extension and Nymrel Inbox must use the same App Group identifier.');
      }
      info.InboxAppGroup = appGroup;
      delete info.MainTargetUrlScheme;
      info.NSExtension.NSExtensionPrincipalClass = '$(PRODUCT_MODULE_NAME).ShareViewController';
      const source = path.join(result.modRequest.projectRoot, 'modules', 'inbox-extractor', 'ios', 'InboxShareViewController.swift');
      fs.copyFileSync(source, controller);
      fs.writeFileSync(infoPath, plist.build(info));
      const written = fs.readFileSync(controller, 'utf8');
      if (/UIApplication\.shared|openURL|NSExtensionContext.*open\(/.test(written)) {
        throw new Error('The share extension must not launch another application.');
      }
      return result;
    },
  });
};

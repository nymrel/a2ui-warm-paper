const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const plistModule = require('@expo/plist');
const plist = plistModule.default || plistModule;
const withInbox = require('../../plugins/with-inbox-sharing.cjs');

function setup(t, group = 'group.com.nymrel.inbox') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inbox-share-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'ios', 'expo-sharing-extension');
  const source = path.join(root, 'modules', 'inbox-extractor', 'ios');
  fs.mkdirSync(directory, { recursive: true }); fs.mkdirSync(source, { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'ios', 'InboxShareViewController.swift'), path.join(source, 'InboxShareViewController.swift'));
  const previous = async config => {
    fs.writeFileSync(path.join(directory, 'ShareIntoViewController.swift'), 'vendor controller that must be replaced');
    fs.writeFileSync(path.join(directory, 'Info.plist'), plist.build({ AppGroupId: group, MainTargetUrlScheme: 'nymrel-inbox', NSExtension: { NSExtensionPrincipalClass: 'VendorController' } }));
    return config;
  };
  const config = withInbox({ name: 'Inbox', slug: 'inbox', ios: { bundleIdentifier: 'com.nymrel.inbox' }, mods: { ios: { dangerous: previous } } }, { appGroup: 'group.com.nymrel.inbox' });
  const input = { ...config, modRequest: { projectRoot: root, platformProjectRoot: path.join(root, 'ios') } };
  return { input, directory, config };
}

test('share plugin runs generation first then replaces unsupported controller and plist', async t => {
  const {input,directory,config} = setup(t);
  await config.mods.ios.dangerous(input);
  const info = plist.parse(fs.readFileSync(path.join(directory, 'Info.plist'), 'utf8'));
  assert.equal(info.InboxAppGroup, 'group.com.nymrel.inbox');
  assert.equal(info.NSExtension.NSExtensionPrincipalClass, '$(PRODUCT_MODULE_NAME).ShareViewController');
  assert.equal(Object.hasOwn(info,'MainTargetUrlScheme'), false);
  const swift = fs.readFileSync(path.join(directory, 'ShareIntoViewController.swift'), 'utf8');
  assert.ok(swift.includes('final class ShareViewController'));
  assert.ok(swift.includes('completeRequest(returningItems: nil, completionHandler: nil)'));
  assert.doesNotMatch(swift,/UIApplication\.shared|openURL/);
});

test('share plugin rejects divergent App Group setup', async t => {
  const {input,config} = setup(t, 'group.some.other.app');
  await assert.rejects(() => config.mods.ios.dangerous(input), /same App Group/);
});

test('share plugin refuses missing bundle identity', () => {
  assert.throws(() => withInbox({name:'Inbox',slug:'inbox'}), /bundle identifier/);
});

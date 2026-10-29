const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const withModel = require('../../plugins/with-inbox-speech-model.cjs');
const model = require('./speech-model.json');

test('model preparation rejects missing, empty and wrong-hash source files', async t => {
  const {verifyModel} = await import('../../scripts/prepare-speech-model.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inbox-model-test-'));
  t.after(() => fs.rmSync(root, {recursive:true,force:true}));
  await assert.rejects(() => verifyModel(path.join(root,'missing.zip')));
  const bad = path.join(root,'bad.zip'); fs.writeFileSync(bad,'');
  await assert.rejects(() => verifyModel(bad), /nonempty/);
  fs.writeFileSync(bad,'not the official model');
  await assert.rejects(() => verifyModel(bad), /SHA-256/);
});

test('speech plugin refuses a missing or substituted model before copying it', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inbox-model-plugin-'));
  t.after(() => fs.rmSync(root, {recursive:true,force:true}));
  const config=withModel({name:'Inbox',slug:'inbox'});
  const input={...config,modRequest:{projectRoot:root,platformProjectRoot:path.join(root,'android')}};
  await assert.rejects(() => config.mods.android.dangerous(input), /missing/);
  fs.mkdirSync(path.join(root,'assets'));fs.writeFileSync(path.join(root,'assets','inbox-speech-model.zip'),'substituted');
  await assert.rejects(() => config.mods.android.dangerous(input), /integrity/);
  assert.equal(fs.existsSync(path.join(root,'android','app','src','main','assets','inbox-speech-model.zip')),false);
});

test('the Kotlin verifier and build helper share one pinned model digest', () => {
  const source=fs.readFileSync(path.join(__dirname,'android','src','main','java','com','nymrel','inboxextractor','OfflineSpeech.kt'),'utf8');
  assert.ok(source.includes(`const val MODEL_SHA = "${model.sha256}"`));
  assert.ok(source.includes(`const val MODEL_NAME = "${model.name}"`));
});

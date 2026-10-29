const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { withDangerousMod } = require('@expo/config-plugins');
const model = require('../modules/inbox-extractor/speech-model.json');

function verify(pathToZip) {
  const stat = fs.statSync(pathToZip);
  if (!stat.isFile() || stat.size <= 0 || stat.size > model.maxZipBytes) throw new Error('Invalid speech model ZIP. Run npm run prepare:speech-model.');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(pathToZip)).digest('hex');
  if (hash !== model.sha256) throw new Error('Speech model integrity check failed. Run npm run prepare:speech-model.');
}
module.exports = function withInboxSpeechModel(config) {
  return withDangerousMod(config, ['android', async result => {
    const source = path.join(result.modRequest.projectRoot, 'assets', 'inbox-speech-model.zip');
    if (!fs.existsSync(source)) throw new Error('The bundled offline speech model is missing. Run npm run prepare:speech-model before Android prebuild.');
    verify(source);
    const destination = path.join(result.modRequest.platformProjectRoot, 'app', 'src', 'main', 'assets', 'inbox-speech-model.zip');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    verify(destination);
    const notices = path.join(result.modRequest.projectRoot, 'modules', 'inbox-extractor', 'third-party');
    fs.copyFileSync(path.join(notices, 'Apache-2.0.txt'), path.join(path.dirname(destination), 'inbox-speech-license.txt'));
    fs.copyFileSync(path.join(notices, 'NOTICE.md'), path.join(path.dirname(destination), 'inbox-speech-notice.txt'));
    return result;
  }]);
};

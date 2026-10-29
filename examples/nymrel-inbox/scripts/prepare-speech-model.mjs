import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { readFile, mkdir, stat, rename, unlink, copyFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
export const model = JSON.parse(await readFile(new URL('../modules/inbox-extractor/speech-model.json', import.meta.url), 'utf8'));
export async function verifyModel(path) {
  const metadata = await stat(path);
  if (!metadata.isFile() || metadata.size <= 0 || metadata.size > model.maxZipBytes) throw new Error('The speech model ZIP must be a nonempty regular file smaller than 80 MiB.');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  if (hash.digest('hex') !== model.sha256) throw new Error('Speech model SHA-256 does not match the pinned release. The file was not accepted.');
  return metadata.size;
}
export async function prepareModel(source) {
  const output = resolve(root, 'assets/inbox-speech-model.zip');
  try {
    const bytes = await verifyModel(output);
    return { path: output, bytes, sha256: model.sha256, reused: true };
  } catch { /* An explicit preparation can replace a missing or invalid build asset. */ }
  await mkdir(dirname(output), { recursive: true });
  const pending = `${output}.partial`;
  try {
    if (source) {
      await verifyModel(resolve(source));
      await copyFile(resolve(source), pending);
    } else {
      const response = await fetch(model.url, { redirect: 'error', signal: AbortSignal.timeout(120_000) });
      if (!response.ok || !response.body) throw new Error(`Speech model download failed: HTTP ${response.status}.`);
      const declared = Number(response.headers.get('content-length'));
      if (declared && declared > model.maxZipBytes) throw new Error('Speech model download exceeds the 80 MiB limit.');
      let received = 0;
      const bounded = new Transform({ transform(chunk, _encoding, callback) {
        received += chunk.length;
        callback(received > model.maxZipBytes ? new Error('Speech model download exceeds the 80 MiB limit.') : null, chunk);
      } });
      await pipeline(Readable.fromWeb(response.body), bounded, createWriteStream(pending, { flags: 'w', mode: 0o600 }));
    }
    const bytes = await verifyModel(pending);
    await rename(pending, output);
    return { path: output, bytes, sha256: model.sha256, reused: false };
  } catch (error) { await unlink(pending).catch(() => {}); throw error; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--source')) {
    console.error('Usage: node scripts/prepare-speech-model.mjs [--source /path/to/pinned-model.zip]');
    process.exitCode = 1;
  } else {
    try { console.log(JSON.stringify(await prepareModel(args[1]))); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}

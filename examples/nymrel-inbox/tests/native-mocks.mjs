/** Node-only platform doubles. They do NOT implement or prove native SQLCipher. */
import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID } from "node:crypto";

const encode = (value) => new Uint8Array(Buffer.from(value, "utf8"));
let database;
export const mock = {
  files: new Map(),
  directories: new Set(),
  secure: new Map(),
  /** @type {{uri:string,size:number,name:string}|null} */
  selected: null,
  /** @type {{uri?:string,url?:string,options?:unknown,bytes?:Uint8Array}[]} */
  previews: [],
  /** @type {{uri:string,text:string,options:unknown}[]} */
  shares: [],
  sharedItems: [],
  acknowledged: [],
  cipherAvailable: true,
  /** @type {string|null} */
  failInsertId: null,
  closeCount: 0,
  /** @type {Error|{segments:{text:string,page?:number}[],truncated:boolean}} */
  extraction: { segments: [], truncated: false },
  reset() {
    if (database) {
      try {
        database.close();
      } catch {}
    }
    database = new DatabaseSync(":memory:");
    this.files.clear();
    this.directories.clear();
    this.directories.add("file:///docs/");
    this.directories.add("file:///cache/");
    this.secure.clear();
    this.selected = null;
    this.previews = [];
    this.shares = [];
    this.sharedItems = [];
    this.acknowledged = [];
    this.cipherAvailable = true;
    this.failInsertId = null;
    this.closeCount = 0;
    this.extraction = {
      segments: [{ text: "Receipt warranty source text", page: 1 }],
      truncated: false,
    };
  },
  put(uri, bytes) {
    this.files.set(
      uri,
      typeof bytes === "string" ? encode(bytes) : new Uint8Array(bytes),
    );
  },
  get(uri) {
    return this.files.get(uri);
  },
  rows() {
    return database.prepare("SELECT * FROM captures ORDER BY rowid").all();
  },
  async openDatabaseAsync() {
    mock.put("file:///db/nymrel-inbox-v1.db", "SQLite mock only");
    return {
      async getFirstAsync(sql, ...params) {
        if (sql === "PRAGMA cipher_version")
          return mock.cipherAvailable
            ? { cipher_version: "test-only-mock" }
            : null;
        return database.prepare(sql).get(...params) || null;
      },
      async getAllAsync(sql, ...params) {
        return database.prepare(sql).all(...params);
      },
      async runAsync(sql, ...params) {
        if (
          sql.startsWith("INSERT INTO captures") &&
          params[0] === mock.failInsertId
        )
          throw new Error("Injected database insert failure");
        return database.prepare(sql).run(...params);
      },
      async execAsync(sql) {
        database.exec(sql.replace(/PRAGMA key = [^;]+;/g, ""));
      },
      async closeAsync() {
        mock.closeCount++;
      },
    };
  },
  fs: {
    documentDirectory: "file:///docs/",
    cacheDirectory: "file:///cache/",
    EncodingType: { Base64: "base64" },
    async getInfoAsync(uri) {
      if (mock.files.has(uri))
        return {
          exists: true,
          isDirectory: false,
          size: mock.files.get(uri).length,
        };
      return {
        exists: mock.directories.has(uri),
        isDirectory: mock.directories.has(uri),
        size: 0,
      };
    },
    async makeDirectoryAsync(uri) {
      mock.directories.add(uri);
    },
    async deleteAsync(uri) {
      mock.files.delete(uri);
      mock.directories.delete(uri);
      for (const key of [...mock.files.keys()])
        if (key.startsWith(uri.endsWith("/") ? uri : uri + "/"))
          mock.files.delete(key);
    },
    async readDirectoryAsync(uri) {
      return [...mock.files.keys()]
        .filter((key) => key.startsWith(uri))
        .map((key) => key.slice(uri.length))
        .filter((key) => !key.includes("/"));
    },
    async copyAsync({ from, to }) {
      const bytes = mock.files.get(from);
      if (!bytes) throw new Error("Source is unavailable");
      mock.files.set(to, new Uint8Array(bytes));
    },
    async writeAsStringAsync(uri, text, options = {}) {
      mock.files.set(
        uri,
        new Uint8Array(
          Buffer.from(text, options.encoding === "base64" ? "base64" : "utf8"),
        ),
      );
    },
    async readAsStringAsync(uri, options = {}) {
      const bytes = mock.files.get(uri);
      if (!bytes) throw new Error("File is unavailable");
      return Buffer.from(bytes).toString(
        options.encoding === "base64" ? "base64" : "utf8",
      );
    },
  },
  secureStore: {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
    async getItemAsync(key) {
      return mock.secure.get(key) || null;
    },
    async setItemAsync(key, value) {
      mock.secure.set(key, value);
    },
  },
  crypto: {
    getRandomBytes: (length) => new Uint8Array(randomBytes(length)),
    randomUUID,
  },
  extractor: {
    async capabilities() {
      return { ocr: true, pdf: true, audio: true };
    },
    async extract() {
      if (mock.extraction instanceof Error) throw mock.extraction;
      return mock.extraction;
    },
    async getSharedItems() {
      return mock.sharedItems;
    },
    async acknowledgeShared(id) {
      mock.acknowledged.push(id);
    },
  },
};
mock.reset();
export class MockFile {
  constructor(uri) {
    this.uri = uri;
  }
  static async preview(file, options) {
    mock.previews.push({
      uri: file.uri,
      options,
      bytes: new Uint8Array(mock.files.get(file.uri)),
    });
  }
}

export function sourceFor(specifier) {
  const url = new URL("./native-mocks.mjs", import.meta.url).href;
  const prefix = `import {mock,MockFile} from ${JSON.stringify(url)};`;
  const exports = {
    "expo-sqlite": `export const defaultDatabaseDirectory='file:///db/';export const openDatabaseAsync=mock.openDatabaseAsync;`,
    "expo-secure-store": `export const WHEN_UNLOCKED_THIS_DEVICE_ONLY=1;export const getItemAsync=mock.secureStore.getItemAsync;export const setItemAsync=mock.secureStore.setItemAsync;`,
    "expo-crypto": `export const getRandomBytes=mock.crypto.getRandomBytes;export const randomUUID=mock.crypto.randomUUID;`,
    "expo-file-system/legacy": `export const documentDirectory=mock.fs.documentDirectory;export const cacheDirectory=mock.fs.cacheDirectory;export const EncodingType=mock.fs.EncodingType;export const getInfoAsync=mock.fs.getInfoAsync;export const makeDirectoryAsync=mock.fs.makeDirectoryAsync;export const deleteAsync=mock.fs.deleteAsync;export const readDirectoryAsync=mock.fs.readDirectoryAsync;export const copyAsync=mock.fs.copyAsync;export const writeAsStringAsync=mock.fs.writeAsStringAsync;export const readAsStringAsync=mock.fs.readAsStringAsync;`,
    "expo-file-system": `export const File=MockFile;`,
    "expo-sharing": `export async function shareAsync(uri,options){mock.shares.push({uri,options,text:await mock.fs.readAsStringAsync(uri)});}export function getSharedPayloads(){return [];}export function clearSharedPayloads(){}`,
    "expo-document-picker": `export async function getDocumentAsync(){return mock.selected?{canceled:false,assets:[mock.selected]}:{canceled:true,assets:[]};}`,
    "react-native": `export const Platform={OS:'ios'};export const Linking={async openURL(url){mock.previews.push({url});}};`,
    "../modules/inbox-extractor": `export default mock.extractor;`,
  };
  return exports[specifier] ? prefix + exports[specifier] : null;
}

// In-memory stand-ins for the Apps Script services Code.js uses, plus a
// loader that runs Code.js against them the way Apps Script would: as a
// plain script whose top-level functions become globals.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const MimeType = {
  GOOGLE_DOCS: 'application/vnd.google-apps.document',
  PDF: 'application/pdf',
};

function iterate(items) {
  let index = 0;

  return {
    hasNext: () => index < items.length,
    next: () => items[index++],
  };
}

class FakeFile {
  constructor(name, mimeType, lastUpdated) {
    this.name = name;
    this.mimeType = mimeType;
    this.lastUpdated = lastUpdated;
    this.trashed = false;
  }

  getName() {
    return this.name;
  }

  getLastUpdated() {
    return this.lastUpdated;
  }

  setTrashed(trashed) {
    this.trashed = trashed;

    return this;
  }

  getAs(mimeType) {
    const blob = {
      name: this.name,
      mimeType,
      setName(name) {
        blob.name = name;

        return blob;
      },
    };

    return blob;
  }
}

class FakeFolder {
  constructor(drive, name) {
    this.drive = drive;
    this.name = name;
    this.files = [];
    this.folders = [];
  }

  getName() {
    return this.name;
  }

  addDoc(name, lastUpdated = new Date('2026-01-01T00:00:00Z')) {
    const file = new FakeFile(name, MimeType.GOOGLE_DOCS, lastUpdated);
    this.files.push(file);

    return file;
  }

  addPdf(name, lastUpdated) {
    const file = new FakeFile(name, MimeType.PDF, lastUpdated);
    this.files.push(file);

    return file;
  }

  createFolder(name) {
    const folder = new FakeFolder(this.drive, name);
    this.folders.push(folder);

    return folder;
  }

  createFile(blob) {
    const file = new FakeFile(blob.name, blob.mimeType, this.drive.now);
    this.files.push(file);

    return file;
  }

  getFilesByType(mimeType) {
    return iterate(this.files.filter((file) => file.mimeType === mimeType));
  }

  getFilesByName(name) {
    return iterate(this.files.filter((file) => file.name === name && !file.trashed));
  }

  getFolders() {
    return iterate([...this.folders]);
  }

  getFoldersByName(name) {
    return iterate(this.folders.filter((folder) => folder.name === name));
  }

  subfolder(name) {
    return this.folders.find((folder) => folder.name === name);
  }

  activeFiles() {
    return this.files.filter((file) => !file.trashed);
  }
}

class FakeDrive {
  constructor() {
    this.roots = new Map();
    this.now = new Date('2026-06-01T00:00:00Z');
  }

  addRoot(id, name = id) {
    const folder = new FakeFolder(this, name);
    this.roots.set(id, folder);

    return folder;
  }

  getFolderById(id) {
    const folder = this.roots.get(id);

    if (folder === undefined) {
      throw new Error(`No folder with id ${id}`);
    }

    return folder;
  }
}

// Runs Code.js in a fresh context wired to a fake Drive and the given
// script properties. Returns the script's globals and the fake Drive.
function loadScript(properties = {}) {
  const drive = new FakeDrive();
  const context = vm.createContext({
    DriveApp: drive,
    MimeType,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => (key in properties ? properties[key] : null),
      }),
    },
    console: { log: () => {} },
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'Code.js'), 'utf8');
  vm.runInContext(source, context, { filename: 'Code.js' });

  return { script: context, drive };
}

module.exports = { loadScript, MimeType };

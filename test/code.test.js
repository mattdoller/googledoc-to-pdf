const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadScript, MimeType } = require('./fake-drive');

const OLD = new Date('2026-01-01T00:00:00Z');
const NEW = new Date('2026-03-01T00:00:00Z');

function names(files) {
  return files.map((file) => file.getName()).sort();
}

describe('loadConfig', () => {
  it('throws when ROOT_FOLDER_IDS is not set', () => {
    const { script } = loadScript();

    assert.throws(() => script.loadConfig(), /ROOT_FOLDER_IDS/);
  });

  it('throws when ROOT_FOLDER_IDS has only blanks and commas', () => {
    const { script } = loadScript({ ROOT_FOLDER_IDS: ' , ,' });

    assert.throws(() => script.loadConfig(), /ROOT_FOLDER_IDS/);
  });

  it('splits and trims comma-separated folder IDs', () => {
    const { script } = loadScript({ ROOT_FOLDER_IDS: ' a , b,,c ' });

    assert.deepEqual([...script.loadConfig().rootFolderIds], ['a', 'b', 'c']);
  });

  it('defaults the output folder name to "pdfs"', () => {
    const { script } = loadScript({ ROOT_FOLDER_IDS: 'a' });

    assert.equal(script.loadConfig().pdfFolderName, 'pdfs');
  });

  it('uses PDF_FOLDER_NAME when set', () => {
    const { script } = loadScript({ ROOT_FOLDER_IDS: 'a', PDF_FOLDER_NAME: ' exports ' });

    assert.equal(script.loadConfig().pdfFolderName, 'exports');
  });
});

describe('convertDocsUnder', () => {
  it('saves a PDF of each Doc into a pdfs folder beside it', () => {
    const { script, drive } = loadScript();
    const root = drive.addRoot('root');
    root.addDoc('Report');
    root.addDoc('Notes');

    script.convertDocsUnder('root', 'pdfs');

    const pdfs = root.subfolder('pdfs');
    assert.deepEqual(names(pdfs.activeFiles()), ['Notes.pdf', 'Report.pdf']);
    assert.ok(pdfs.activeFiles().every((file) => file.mimeType === MimeType.PDF));
  });

  it('keeps the original Docs', () => {
    const { script, drive } = loadScript();
    const root = drive.addRoot('root');
    const doc = root.addDoc('Report');

    script.convertDocsUnder('root', 'pdfs');

    assert.equal(doc.trashed, false);
    assert.ok(root.files.includes(doc));
  });

  it('recurses into subfolders and writes PDFs next to each Doc', () => {
    const { script, drive } = loadScript();
    const root = drive.addRoot('root');
    const deep = root.createFolder('a').createFolder('b');
    deep.addDoc('Deep');

    script.convertDocsUnder('root', 'pdfs');

    assert.deepEqual(names(deep.subfolder('pdfs').activeFiles()), ['Deep.pdf']);
  });

  it('does not create a pdfs folder where there are no Docs', () => {
    const { script, drive } = loadScript();
    const root = drive.addRoot('root');
    root.addPdf('loose.pdf', OLD);
    const child = root.createFolder('child');
    child.addDoc('Child');

    script.convertDocsUnder('root', 'pdfs');

    assert.equal(root.subfolder('pdfs'), undefined);
    assert.ok(child.subfolder('pdfs'));
  });

  it('does not scan inside existing output folders', () => {
    const { script, drive } = loadScript();
    const root = drive.addRoot('root');
    const output = root.createFolder('pdfs');
    output.addDoc('Stray');

    script.convertDocsUnder('root', 'pdfs');

    assert.equal(output.subfolder('pdfs'), undefined);
  });

  it('uses a custom output folder name', () => {
    const { script, drive } = loadScript();
    const root = drive.addRoot('root');
    root.addDoc('Report');

    script.convertDocsUnder('root', 'exports');

    assert.equal(root.subfolder('pdfs'), undefined);
    assert.deepEqual(names(root.subfolder('exports').activeFiles()), ['Report.pdf']);
  });

  it('reuses an existing output folder', () => {
    const { script, drive } = loadScript();
    const root = drive.addRoot('root');
    root.createFolder('pdfs');
    root.addDoc('Report');

    script.convertDocsUnder('root', 'pdfs');

    assert.equal(root.folders.filter((folder) => folder.name === 'pdfs').length, 1);
  });

  it('skips a Doc whose PDF is newer than it', () => {
    const { script, drive } = loadScript();
    const root = drive.addRoot('root');
    root.addDoc('Report', OLD);
    const existing = root.createFolder('pdfs').addPdf('Report.pdf', NEW);

    script.convertDocsUnder('root', 'pdfs');

    const pdfs = root.subfolder('pdfs').activeFiles();
    assert.deepEqual(pdfs, [existing]);
  });

  it('trashes a stale PDF and writes a fresh one', () => {
    const { script, drive } = loadScript();
    const root = drive.addRoot('root');
    root.addDoc('Report', NEW);
    const stale = root.createFolder('pdfs').addPdf('Report.pdf', OLD);

    script.convertDocsUnder('root', 'pdfs');

    const pdfs = root.subfolder('pdfs').activeFiles();
    assert.equal(stale.trashed, true);
    assert.equal(pdfs.length, 1);
    assert.notEqual(pdfs[0], stale);
    assert.equal(pdfs[0].getName(), 'Report.pdf');
  });

  it('does not duplicate PDFs when run twice', () => {
    const { script, drive } = loadScript();
    const root = drive.addRoot('root');
    root.addDoc('Report');

    script.convertDocsUnder('root', 'pdfs');
    script.convertDocsUnder('root', 'pdfs');

    assert.equal(root.subfolder('pdfs').activeFiles().length, 1);
  });
});

describe('run', () => {
  it('converts every configured root folder', () => {
    const { script, drive } = loadScript({ ROOT_FOLDER_IDS: 'one,two', PDF_FOLDER_NAME: 'out' });
    drive.addRoot('one').addDoc('First');
    drive.addRoot('two').addDoc('Second');

    script.run();

    assert.deepEqual(names(drive.getFolderById('one').subfolder('out').activeFiles()), ['First.pdf']);
    assert.deepEqual(names(drive.getFolderById('two').subfolder('out').activeFiles()), ['Second.pdf']);
  });

  it('fails before touching Drive when unconfigured', () => {
    const { script } = loadScript();

    assert.throws(() => script.run(), /ROOT_FOLDER_IDS/);
  });
});

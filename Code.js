/**
 * Configuration lives in Script Properties (Project Settings → Script
 * Properties in the Apps Script editor), not in code:
 *
 *   ROOT_FOLDER_IDS  required  comma-separated IDs of the folders to scan
 *   PDF_FOLDER_NAME  optional  name of the output folder (default "pdfs")
 */
const DEFAULT_PDF_FOLDER_NAME = 'pdfs';

/**
 * Entry point for the Apps Script editor and triggers.
 */
function run() {
  const config = loadConfig();

  config.rootFolderIds.forEach((folderId) => {
    convertDocsUnder(folderId, config.pdfFolderName);
  });
}

function loadConfig() {
  const props = PropertiesService.getScriptProperties();
  const rootFolderIds = (props.getProperty('ROOT_FOLDER_IDS') || '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '');

  if (rootFolderIds.length === 0) {
    throw new Error('Set the ROOT_FOLDER_IDS script property to one or more folder IDs.');
  }

  const pdfFolderName = (props.getProperty('PDF_FOLDER_NAME') || '').trim() || DEFAULT_PDF_FOLDER_NAME;

  return { rootFolderIds, pdfFolderName };
}

/**
 * Recursively finds every Google Doc under a folder and saves a PDF copy
 * of each into an output folder beside it. Originals are left untouched.
 * A PDF that is already newer than its Doc is skipped; a stale one is
 * trashed and replaced.
 *
 * @param {string} folderId The ID of the folder to scan.
 * @param {string} pdfFolderName The name of the output folder.
 */
function convertDocsUnder(folderId, pdfFolderName) {
  convertFolder(DriveApp.getFolderById(folderId), pdfFolderName);
}

function convertFolder(folder, pdfFolderName) {
  const docs = folder.getFilesByType(MimeType.GOOGLE_DOCS);
  let pdfFolder = null;

  while (docs.hasNext()) {
    const doc = docs.next();

    if (pdfFolder === null) {
      pdfFolder = getOrCreateSubfolder(folder, pdfFolderName);
    }

    exportDoc(doc, pdfFolder);
  }

  const subfolders = folder.getFolders();

  while (subfolders.hasNext()) {
    const subfolder = subfolders.next();

    if (subfolder.getName() === pdfFolderName) {
      continue;
    }

    convertFolder(subfolder, pdfFolderName);
  }
}

function exportDoc(doc, pdfFolder) {
  const pdfName = `${doc.getName()}.pdf`;
  const existing = pdfFolder.getFilesByName(pdfName);

  while (existing.hasNext()) {
    const pdf = existing.next();

    if (pdf.getLastUpdated() >= doc.getLastUpdated()) {
      console.log(`Up to date: ${pdfName}`);
      return;
    }

    pdf.setTrashed(true);
  }

  pdfFolder.createFile(doc.getAs(MimeType.PDF).setName(pdfName));
  console.log(`Exported: ${pdfName}`);
}

function getOrCreateSubfolder(parent, name) {
  const matches = parent.getFoldersByName(name);

  if (matches.hasNext()) {
    return matches.next();
  }

  return parent.createFolder(name);
}

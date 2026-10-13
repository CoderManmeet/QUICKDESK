// Shared by the server validator and the upload inputs.
export const MAX_FILES = 5;
export const MAX_FILE_MB = 10;
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
export const ACCEPT = ".png,.jpg,.jpeg,.gif,.webp,.pdf,.txt,.csv,.docx,.xlsx,.zip";
export const ATTACHMENT_HINT = `Up to ${MAX_FILES} files, ${MAX_FILE_MB} MB each. Images, PDF, TXT, CSV, DOCX, XLSX or ZIP.`;

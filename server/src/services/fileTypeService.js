// file-type je ESM-only paket pa se učitava dinamičkim importom.
// Izdvojeno u zaseban modul da se u testovima može mockati (Jest bez
// --experimental-vm-modules ne podržava native dynamic import).

const detectMimeType = async (filePath) => {
  const { fileTypeFromFile } = await import('file-type');
  const detected = await fileTypeFromFile(filePath);
  return detected ? detected.mime : null;
};

const detectMimeTypeFromBuffer = async (buffer) => {
  const { fileTypeFromBuffer } = await import('file-type');
  const detected = await fileTypeFromBuffer(buffer);
  return detected ? detected.mime : null;
};

module.exports = { detectMimeType, detectMimeTypeFromBuffer };

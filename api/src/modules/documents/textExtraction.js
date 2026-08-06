const path = require("node:path");
const zlib = require("node:zlib");

const DOCX_MAX_COMPRESSED_ENTRY = 8 * 1024 * 1024;
const DOCX_MAX_UNCOMPRESSED_ENTRY = 16 * 1024 * 1024;
const DOCX_MAX_ENTRIES_SCANNED = 2000;
const DOCX_MAX_TOTAL_COMPRESSED = 32 * 1024 * 1024;
const MAX_TEXT_EXTRACT_BYTES = 25 * 1024 * 1024;

function cleanText(value) {
  return String(value || "")
    .replace(/\u0000/g, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 20000);
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function readZipEntry(buffer, targetName, options = {}) {
  const maxCompressedEntry = options.maxCompressedEntry || DOCX_MAX_COMPRESSED_ENTRY;
  const maxUncompressedEntry = options.maxUncompressedEntry || DOCX_MAX_UNCOMPRESSED_ENTRY;
  const maxEntries = options.maxEntriesScanned || DOCX_MAX_ENTRIES_SCANNED;
  const maxTotalCompressed = options.maxTotalCompressed || DOCX_MAX_TOTAL_COMPRESSED;

  let offset = 0;
  let entries = 0;
  let totalCompressed = 0;
  while (offset + 30 < buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) {
      offset += 1;
      continue;
    }
    entries += 1;
    if (entries > maxEntries) return "";
    const compression = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + fileNameLength;
    const fileName = buffer.slice(nameStart, nameEnd).toString("utf8");
    const dataStart = nameEnd + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buffer.length) return "";
    if (compressedSize > maxCompressedEntry) return "";
    totalCompressed += compressedSize;
    if (totalCompressed > maxTotalCompressed) return "";
    // ZIP bomb guard: declared uncompressed size or inflate expansion.
    if (uncompressedSize > maxUncompressedEntry && uncompressedSize !== 0xffffffff) return "";
    if (fileName === targetName) {
      const data = buffer.slice(dataStart, dataEnd);
      if (compression === 0) {
        if (data.length > maxUncompressedEntry) return "";
        return data.toString("utf8");
      }
      if (compression === 8) {
        try {
          const inflated = zlib.inflateRawSync(data, { maxOutputLength: maxUncompressedEntry });
          if (inflated.length > maxUncompressedEntry) return "";
          return inflated.toString("utf8");
        } catch {
          return "";
        }
      }
      return "";
    }
    offset = dataEnd;
  }
  return "";
}

function extractDocxText(buffer) {
  try {
    const xml = readZipEntry(buffer, "word/document.xml");
    if (!xml) return "";
    return decodeXmlEntities(xml
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<w:br\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, " "));
  } catch {
    return "";
  }
}

function uploadBuffer(content) {
  if (!content) return null;
  if (Buffer.isBuffer(content)) {
    return content.length <= MAX_TEXT_EXTRACT_BYTES ? content : null;
  }
  const raw = String(content);
  const base64 = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
  // Reject oversized payloads before Buffer.from allocates decoded storage.
  if (base64.length > Math.ceil(MAX_TEXT_EXTRACT_BYTES * 4 / 3) + 4) return null;
  const buffer = Buffer.from(base64 || "", "base64");
  return buffer.length <= MAX_TEXT_EXTRACT_BYTES ? buffer : null;
}

function extractTextFromUpload(fileName, fileType, content) {
  const buffer = uploadBuffer(content);
  if (!buffer) return "";
  const ext = path.extname(String(fileName || "")).toLowerCase();
  const mime = String(fileType || "").toLowerCase();

  if (
    ext === ".txt" ||
    ext === ".md" ||
    ext === ".markdown" ||
    ext === ".csv" ||
    ext === ".tsv" ||
    ext === ".json" ||
    ext === ".xml" ||
    ext === ".html" ||
    ext === ".htm" ||
    ext === ".yaml" ||
    ext === ".yml" ||
    ext === ".log" ||
    ext === ".rtf" ||
    mime.startsWith("text/") ||
    [
      "application/json",
      "application/xml",
      "application/x-yaml",
      "application/yaml",
      "application/rtf",
      "text/rtf",
      "text/html",
      "text/csv",
      "text/tab-separated-values",
    ].includes(mime)
  ) {
    const raw = buffer.toString("utf8");
    if (ext === ".html" || ext === ".htm" || mime === "text/html") {
      return cleanText(raw
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, " "));
    }
    if (ext === ".rtf" || mime === "application/rtf" || mime === "text/rtf") {
      return cleanText(raw
        .replace(/\\par[d]?/g, "\n")
        .replace(/\\tab/g, "\t")
        .replace(/\\'[0-9a-fA-F]{2}/g, " ")
        .replace(/\\[a-zA-Z]+-?\d* ?/g, " ")
        .replace(/[{}]/g, " "));
    }
    return cleanText(raw);
  }
  if (ext === ".pdf" || mime === "application/pdf") {
    const raw = buffer.toString("latin1");
    const chunks = [];
    const literalStrings = raw.matchAll(/\(([^()]{2,500})\)\s*T[jJ]/g);
    for (const match of literalStrings) chunks.push(match[1]);
    const bracketStrings = raw.matchAll(/\[((?:\s*\([^()]{1,300}\)\s*){1,80})\]\s*TJ/g);
    for (const match of bracketStrings) {
      const inner = [...String(match[1]).matchAll(/\(([^()]{1,300})\)/g)].map((item) => item[1]).join("");
      if (inner) chunks.push(inner);
    }
    const decoded = chunks.join("\n")
      .replace(/\\([nrtbf()\\])/g, (_, ch) => ({ n: "\n", r: "\r", t: "\t", b: "", f: "", "(": "(", ")": ")", "\\": "\\" }[ch] || ch))
      .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
    const text = cleanText(decoded);
    if (text.length > 20) return text;
    return "PDF 文件已上传，但未能直接抽取可读正文。建议上传可复制文本的 PDF，或补充 Markdown/TXT 版本以提升 AI 分析质量。";
  }
  if (ext === ".docx" || ext === ".dotx") {
    const extractedDocx = extractDocxText(buffer);
    const matches = extractedDocx ? [[null, extractedDocx]] : [];
    if (matches.length) {
      return cleanText(matches.map((item) => item[1]).join(""));
    }
    return "DOCX 文件已上传。当前未安装 Word 解析器，无法稳定抽取正文；建议上传 TXT/Markdown 导出版，或在系统中启用文档解析依赖。";
  }
  if (ext === ".odt") {
    try {
      const xml = readZipEntry(buffer, "content.xml");
      if (xml) {
        return cleanText(decodeXmlEntities(xml
          .replace(/<text:line-break\/>/g, "\n")
          .replace(/<text:p[^>]*>/g, "\n")
          .replace(/<[^>]+>/g, " ")));
      }
    } catch {
      // fall through
    }
    return "ODT 文件已上传，但未能稳定抽取正文；建议另存为 DOCX/TXT/Markdown。";
  }
  if (ext === ".doc" || ext === ".dot" || ext === ".wps") {
    return cleanText(buffer.toString("utf8").replace(/[^\u4e00-\u9fa5\w\s.,;:!?()\-]/g, " "));
  }
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff"].includes(ext) || mime.startsWith("image/")) {
    return "图片文件已上传。当前版本不进行 OCR 识别；如需 AI 分析，请补充可复制文本说明或 TXT/Markdown 版本。";
  }
  if ([".xls", ".xlsx", ".xlt", ".xltx", ".ods", ".et", ".ppt", ".pptx", ".pot", ".potx", ".odp", ".dps"].includes(ext)) {
    return "办公文件已上传。当前仅对 TXT/Markdown/CSV/JSON/XML/HTML/RTF/PDF/DOCX/ODT 等格式做正文抽取；本格式将按附件保存，可在协同或 AI 场景中补充说明。";
  }
  const text = cleanText(buffer.toString("utf8"));
  return text || "文件已上传，但当前格式无法直接抽取正文。";
}

module.exports = {
  cleanText,
  decodeXmlEntities,
  extractDocxText,
  extractTextFromUpload,
  readZipEntry,
  DOCX_MAX_COMPRESSED_ENTRY,
  DOCX_MAX_UNCOMPRESSED_ENTRY,
  MAX_TEXT_EXTRACT_BYTES,
  uploadBuffer,
};

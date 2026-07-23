const assert = require("node:assert/strict");
const zlib = require("node:zlib");
const test = require("node:test");
const {
  decodeXmlEntities,
  extractDocxText,
  extractTextFromUpload,
  readZipEntry,
} = require("../src/modules/documents/textExtraction");

function base64(value) {
  return Buffer.from(value, "utf8").toString("base64");
}

function localZipEntry(name, content, compression = 0) {
  const nameBuffer = Buffer.from(name, "utf8");
  const raw = Buffer.from(content, "utf8");
  const data = compression === 8 ? zlib.deflateRawSync(raw) : raw;
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(compression, 8);
  header.writeUInt32LE(data.length, 18);
  header.writeUInt16LE(nameBuffer.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, nameBuffer, data]);
}

test("document text extraction handles plain text and entity-decoded docx content", () => {
  assert.equal(decodeXmlEntities("A&amp;B &lt;C&gt; &quot;D&quot; &apos;E&apos;"), "A&B <C> \"D\" 'E'");
  assert.equal(
    extractTextFromUpload("note.txt", "text/plain", base64(" 第一行  \n\n\n第二行 ")),
    "第一行 \n\n第二行",
  );

  const docxXml = "<w:document><w:body><w:p><w:r><w:t>设计&amp;开发</w:t></w:r></w:p><w:p><w:r><w:t>完成</w:t></w:r></w:p></w:body></w:document>";
  const docx = localZipEntry("word/document.xml", docxXml, 8);
  assert.match(readZipEntry(docx, "word/document.xml"), /设计&amp;开发/);
  assert.match(extractDocxText(docx), /设计&开发/);
  assert.match(extractTextFromUpload("design.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", docx.toString("base64")), /设计&开发/);
});

test("document text extraction handles simple PDF text and bounded unknown fallback", () => {
  const pdfText = "BT (This is a readable PDF text payload with enough content) Tj ET";
  assert.match(extractTextFromUpload("report.pdf", "application/pdf", Buffer.from(pdfText, "latin1").toString("base64")), /readable PDF text payload/);

  const fallback = extractTextFromUpload("binary.bin", "application/octet-stream", Buffer.from([0, 1, 2, 3]).toString("base64"));
  assert.equal(typeof fallback, "string");
  assert.ok(fallback.length > 0);
});

test("docx zip reader refuses oversized compressed entries (zip-bomb guard)", () => {
  // Craft a local-file header claiming a huge compressed size beyond the hard limit.
  const name = Buffer.from("word/document.xml", "utf8");
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(0, 8); // store
  header.writeUInt32LE(20 * 1024 * 1024, 18); // compressed size > 8MB limit
  header.writeUInt32LE(20 * 1024 * 1024, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);
  const bomb = Buffer.concat([header, name, Buffer.alloc(100)]);
  assert.equal(readZipEntry(bomb, "word/document.xml"), "");
  assert.equal(extractDocxText(bomb), "");
});

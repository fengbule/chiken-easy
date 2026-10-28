import path from "node:path";

// Multipart parsers commonly decode filename parameters as Latin-1 even when
// browsers sent UTF-8. Only repair a losslessly decodable UTF-8 sequence.
export function uploadFileName(value) {
  let name = String(value || "");
  if ([...name].every((char) => char.codePointAt(0) <= 255)) {
    try { name = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(name, "latin1")); } catch {}
  }
  name = path.posix.basename(name.replaceAll("\\", "/")).normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "_").trim();
  while (Buffer.byteLength(name) > 200) name = [...name].slice(0, -1).join("");
  return !name || name === "." || name === ".." ? "file" : name;
}

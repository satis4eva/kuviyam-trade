'use strict';

/**
 * Small multipart/form-data parser for document uploads (receipts, KYC files).
 * Returns { fields: { name: value | [values] }, files: [{ field, filename, mime, data }] }.
 */
function parseMultipart(body, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) throw new Error('missing multipart boundary');
  const boundary = Buffer.from('--' + (m[1] || m[2]).trim());
  const fields = {}; const files = [];
  let pos = body.indexOf(boundary);
  while (pos !== -1) {
    const start = pos + boundary.length;
    if (body.slice(start, start + 2).toString() === '--') break; // closing boundary
    const headerEnd = body.indexOf('\r\n\r\n', start);
    if (headerEnd === -1) break;
    const headers = body.slice(start + 2, headerEnd).toString('utf8');
    const next = body.indexOf(boundary, headerEnd + 4);
    if (next === -1) break;
    const data = body.slice(headerEnd + 4, next - 2); // strip CRLF before boundary
    const dline = (/content-disposition:([^\r\n]*)/i.exec(headers) || [])[1];
    const nameM = dline && /(?:^|;)\s*name="([^"]*)"/i.exec(dline);
    const fileM = dline && /(?:^|;)\s*filename="([^"]*)"/i.exec(dline);
    const disp = nameM ? [null, nameM[1], fileM ? fileM[1] : undefined] : null;
    if (disp) {
      const name = disp[1];
      if (disp[2] !== undefined) {
        const mime = (/content-type:\s*([^\r\n]+)/i.exec(headers) || [])[1] || 'application/octet-stream';
        if (disp[2] && data.length) files.push({ field: name, filename: disp[2].replace(/[\\/]/g, '_').slice(0, 120), mime: mime.trim().toLowerCase(), data });
      } else {
        const v = data.toString('utf8');
        if (fields[name] === undefined) fields[name] = v;
        else if (Array.isArray(fields[name])) fields[name].push(v);
        else fields[name] = [fields[name], v];
      }
    }
    pos = next;
  }
  return { fields, files };
}

const ALLOWED = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_FILE = 5 * 1024 * 1024;

const MAX_VIDEO = 20 * 1024 * 1024;
function sniff(b) {
  if (b.slice(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b.slice(1, 4).toString('latin1') === 'PNG') return 'image/png';
  if (b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (b.slice(4, 8).toString('latin1') === 'ftyp') return 'video/mp4';
  return null;
}

/** Checks type by content (magic bytes), not just the browser's label. kind: 'doc' (PDF or image) or 'media' (image or MP4 video). */
function checkFile(f, kind = 'doc') {
  if (!f) return 'missing';
  const type = sniff(f.data);
  const ok = kind === 'media' ? ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'] : Object.keys(ALLOWED);
  if (!type || !ok.includes(type)) return kind === 'media' ? 'bad_media' : 'bad_type';
  if (f.data.length > (type === 'video/mp4' ? MAX_VIDEO : MAX_FILE)) return type === 'video/mp4' ? 'video_big' : 'too_big';
  f.mime = type;
  return null;
}

module.exports = { parseMultipart, checkFile, MAX_FILE, MAX_VIDEO };

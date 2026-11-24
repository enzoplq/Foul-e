/* Foulée — xlsx.js
 * Écriture et lecture de fichiers Excel (.xlsx) sans aucune dépendance.
 *  - XLSXLite.write(model)  -> Uint8Array (.xlsx avec styles, couleurs, formules, listes déroulantes)
 *  - XLSXLite.read(buffer)  -> Promise<[{name, rows:[[valeurs]]}]>  (dates -> objets Date UTC)
 *  - XLSXLite.readCSV(text) -> [{name:'CSV', rows}]
 */
(function (root) {
  'use strict';
  const enc = (s) => new TextEncoder().encode(s);
  const xesc = (s) => String(s == null ? '' : s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ---------- ZIP (stockage sans compression) ---------- */
  let CRC = null;
  function crc32(b) {
    if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
    let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function zip(files) {
    const now = new Date();
    const time = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
    const date = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
    const parts = [], central = []; let off = 0;
    for (const f of files) {
      const name = enc(f.name), data = typeof f.data === 'string' ? enc(f.data) : f.data, c = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, time, true); h.setUint16(12, date, true); h.setUint32(14, c, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, c, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), name);
      off += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((a, b) => a + b.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
    const all = [...parts, ...central, new Uint8Array(e.buffer)];
    const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0)); let p = 0;
    for (const a of all) { out.set(a, p); p += a.length; }
    return out;
  }

  /* ---------- Écriture ---------- */
  const colName = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const toSerial = (d) => (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(1899, 11, 30)) / 86400000;
  const BUILTIN_FMT = { '0': 1, '0.00': 2, '#,##0': 3, '#,##0.00': 4, '0%': 9, '0.00%': 10, '@': 49 };

  function write(model) {
    const styleList = [{}], styleKeys = new Map([['{}', 0]]);
    const sid = (s) => { if (!s) return 0; const k = JSON.stringify(s); if (!styleKeys.has(k)) { styleKeys.set(k, styleList.length); styleList.push(s); } return styleKeys.get(k); };
    const sst = [], sstMap = new Map(); let sstCount = 0;
    const ssIndex = (s) => { sstCount++; if (!sstMap.has(s)) { sstMap.set(s, sst.length); sst.push(s); } return sstMap.get(s); };

    const sheetsXml = model.sheets.map((sh, si) => {
      const rows = sh.rows || []; let maxC = 1;
      const rowXml = rows.map((row, ri) => {
        if (!row) return '';
        maxC = Math.max(maxC, row.length);
        const cells = row.map((cell, ci) => {
          if (cell == null || cell === '') return '';
          let v = cell, s = null, f = null;
          if (typeof cell === 'object' && !(cell instanceof Date)) { v = cell.v; s = cell.s; f = cell.f; }
          const ref = colName(ci) + (ri + 1);
          if (v instanceof Date) { s = Object.assign({ numFmt: 'dd/mm/yyyy' }, s || {}); v = toSerial(v); }
          const st = sid(s); const sa = st ? ` s="${st}"` : '';
          if (f) return `<c r="${ref}"${sa}${typeof v === 'string' ? ' t="str"' : ''}><f>${xesc(f)}</f>${v != null && v !== '' ? `<v>${xesc(v)}</v>` : ''}</c>`;
          if (v == null || v === '') return st ? `<c r="${ref}"${sa}/>` : '';
          if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${sa}><v>${v}</v></c>`;
          if (typeof v === 'boolean') return `<c r="${ref}"${sa} t="b"><v>${v ? 1 : 0}</v></c>`;
          return `<c r="${ref}"${sa} t="s"><v>${ssIndex(String(v))}</v></c>`;
        }).join('');
        const h = sh.rowHeights && sh.rowHeights[ri + 1];
        return `<row r="${ri + 1}"${h ? ` ht="${h}" customHeight="1"` : ''}>${cells}</row>`;
      }).join('');
      const fr = sh.freeze;
      let pane = '';
      if (fr && (fr.r || fr.c)) {
        const ap = fr.r && fr.c ? 'bottomRight' : fr.r ? 'bottomLeft' : 'topRight';
        pane = `<pane${fr.c ? ` xSplit="${fr.c}"` : ''}${fr.r ? ` ySplit="${fr.r}"` : ''} topLeftCell="${colName(fr.c || 0)}${(fr.r || 0) + 1}" activePane="${ap}" state="frozen"/><selection pane="${ap}"/>`;
      }
      const cols = (sh.columns || []).map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 12}" customWidth="1"${c.hidden ? ' hidden="1"' : ''}/>`).join('');
      const merges = (sh.merges || []).length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
      const dv = (sh.validations || []).map((v) => v.type === 'list'
        ? `<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${v.sqref}"><formula1>"${xesc(v.list.join(','))}"</formula1></dataValidation>`
        : `<dataValidation type="${v.type}" operator="between" allowBlank="1" showErrorMessage="1" sqref="${v.sqref}"><formula1>${v.min}</formula1><formula2>${v.max}</formula2></dataValidation>`).join('');
      const dvXml = dv ? `<dataValidations count="${sh.validations.length}">${dv}</dataValidations>` : '';
      const lastRef = colName(Math.max(0, maxC - 1)) + Math.max(1, rows.length);
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr>${sh.tabColor ? `<tabColor rgb="FF${sh.tabColor}"/>` : ''}<pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${lastRef}"/><sheetViews><sheetView workbookViewId="0"${si === 0 ? ' tabSelected="1"' : ''}${sh.zoom ? ` zoomScale="${sh.zoom}"` : ''}${sh.hideGrid ? ' showGridLines="0"' : ''}>${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rowXml}</sheetData>${sh.autoFilter ? `<autoFilter ref="${sh.autoFilter}"/>` : ''}${merges}${dvXml}<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="${sh.portrait ? 'portrait' : 'landscape'}" paperSize="9" fitToWidth="1" fitToHeight="0"/></worksheet>`;
    });

    /* styles */
    const fonts = [], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'],
      borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'], numFmts = [], xfs = [];
    const idx = (arr, x) => { let i = arr.indexOf(x); if (i < 0) { arr.push(x); i = arr.length - 1; } return i; };
    for (const s of styleList) {
      const f = s.font || {};
      const fi = idx(fonts, `<font>${f.b ? '<b/>' : ''}${f.i ? '<i/>' : ''}${f.u ? '<u/>' : ''}<sz val="${f.sz || 11}"/><color rgb="FF${f.color || '1F2937'}"/><name val="${f.name || 'Calibri'}"/><family val="2"/></font>`);
      const fl = s.fill ? idx(fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${s.fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
      let bo = 0;
      if (s.border) {
        const c = s.border === true ? 'D1D5DB' : s.border;
        const side = (k) => `<${k} style="thin"><color rgb="FF${c}"/></${k}>`;
        bo = idx(borders, `<border>${side('left')}${side('right')}${side('top')}${side('bottom')}<diagonal/></border>`);
      }
      let nf = 0;
      if (s.numFmt) {
        if (BUILTIN_FMT[s.numFmt] != null) nf = BUILTIN_FMT[s.numFmt];
        else { let k = numFmts.indexOf(s.numFmt); if (k < 0) { numFmts.push(s.numFmt); k = numFmts.length - 1; } nf = 164 + k; }
      }
      const al = s.align || {};
      const alXml = (al.h || al.v || al.wrap || al.indent) ? `<alignment${al.h ? ` horizontal="${al.h}"` : ''}${al.v ? ` vertical="${al.v}"` : ''}${al.wrap ? ' wrapText="1"' : ''}${al.indent ? ` indent="${al.indent}"` : ''}/>` : '';
      xfs.push(`<xf numFmtId="${nf}" fontId="${fi}" fillId="${fl}" borderId="${bo}" xfId="0"${nf ? ' applyNumberFormat="1"' : ''}${fi ? ' applyFont="1"' : ''}${fl ? ' applyFill="1"' : ''}${bo ? ' applyBorder="1"' : ''}${alXml ? ` applyAlignment="1">${alXml}</xf>` : '/>'}`);
    }
    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${numFmts.length ? `<numFmts count="${numFmts.length}">${numFmts.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${xesc(f)}"/>`).join('')}</numFmts>` : ''}<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="${borders.length}">${borders.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

    const sstXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${sstCount}" uniqueCount="${sst.length}">${sst.map((s) => `<si><t xml:space="preserve">${xesc(s)}</t></si>`).join('')}</sst>`;

    const safeName = (n, i) => (String(n || `Feuille${i + 1}`).replace(/[\[\]\*\?\/\\:]/g, '-').slice(0, 31));
    const n = model.sheets.length;
    const wbXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr/><bookViews><workbookView activeTab="0"/></bookViews><sheets>${model.sheets.map((s, i) => `<sheet name="${xesc(safeName(s.name, i))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
    const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${model.sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId${n + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;
    const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${model.sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
    const iso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xesc(model.title || 'Foulée')}</dc:title><dc:creator>${xesc(model.creator || 'Foulée')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified></cp:coreProperties>`;
    const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Foulée</Application></Properties>`;

    return zip([
      { name: '[Content_Types].xml', data: ct },
      { name: '_rels/.rels', data: rels },
      { name: 'docProps/core.xml', data: core },
      { name: 'docProps/app.xml', data: app },
      { name: 'xl/workbook.xml', data: wbXml },
      { name: 'xl/_rels/workbook.xml.rels', data: wbRels },
      { name: 'xl/styles.xml', data: stylesXml },
      { name: 'xl/sharedStrings.xml', data: sstXml },
      ...sheetsXml.map((x, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: x }))
    ]);
  }

  /* ---------- Lecture ---------- */
  async function inflateRaw(data) {
    if (typeof DecompressionStream === 'undefined') throw new Error('INFLATE');
    const ds = new DecompressionStream('deflate-raw');
    const stream = new Blob([data]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  function unzipIndex(u) {
    const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    let e = -1;
    for (let i = u.length - 22; i >= Math.max(0, u.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('Ce fichier n’est pas un classeur Excel (.xlsx) valide');
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
    const entries = {};
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true),
        nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      entries[new TextDecoder().decode(u.subarray(p + 46, p + 46 + nl))] = { method, csize, lo };
      p += 46 + nl + el + cl;
    }
    return async (name) => {
      const key = entries[name] ? name : Object.keys(entries).find((k) => k.toLowerCase() === name.toLowerCase());
      if (!key) return null;
      const en = entries[key];
      const start = en.lo + 30 + dv.getUint16(en.lo + 26, true) + dv.getUint16(en.lo + 28, true);
      const data = u.subarray(start, start + en.csize);
      const out = en.method === 0 ? data : en.method === 8 ? await inflateRaw(data) : null;
      if (!out) throw new Error('Compression non prise en charge');
      return new TextDecoder().decode(out);
    };
  }
  const tags = (d, t) => Array.from(d.getElementsByTagNameNS('*', t));
  const parseXml = (s) => new DOMParser().parseFromString(s, 'application/xml');
  const colIndex = (ref) => { const m = /^([A-Z]+)/.exec(ref || ''); if (!m) return -1; let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
  function isDateFormat(id, custom) {
    if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47) || (id >= 27 && id <= 36) || (id >= 50 && id <= 58)) return true;
    const code = custom[id]; if (!code) return false;
    const c = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
    return /[dmyhs]/i.test(c) && !/^[#0.,%\s]*$/.test(c);
  }
  async function read(buffer) {
    const u = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const get = unzipIndex(u);
    const wbXml = await get('xl/workbook.xml');
    if (!wbXml) throw new Error('Classeur Excel invalide (workbook.xml introuvable)');
    const wb = parseXml(wbXml);
    const relsDoc = parseXml((await get('xl/_rels/workbook.xml.rels')) || '<r/>');
    const relMap = {}; tags(relsDoc, 'Relationship').forEach((r) => { relMap[r.getAttribute('Id')] = r.getAttribute('Target'); });
    const ssXml = await get('xl/sharedStrings.xml');
    const ss = ssXml ? tags(parseXml(ssXml), 'si').map((si) => tags(si, 't').filter((t) => t.parentNode.localName !== 'rPh').map((t) => t.textContent).join('')) : [];
    const stXml = await get('xl/styles.xml');
    const custom = {}, xfFmt = [];
    if (stXml) {
      const st = parseXml(stXml);
      tags(st, 'numFmt').forEach((f) => { custom[+f.getAttribute('numFmtId')] = f.getAttribute('formatCode'); });
      const cx = tags(st, 'cellXfs')[0];
      if (cx) Array.from(cx.childNodes).filter((n) => n.localName === 'xf').forEach((xf) => xfFmt.push(+xf.getAttribute('numFmtId') || 0));
    }
    const out = [];
    for (const sh of tags(wb, 'sheet')) {
      const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let target = relMap[rid]; if (!target) continue;
      target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
      const xml = await get(target); if (!xml) continue;
      const doc = parseXml(xml); const rows = [];
      tags(doc, 'row').forEach((row, k) => {
        const r = (+row.getAttribute('r') || k + 1) - 1; const arr = rows[r] = rows[r] || [];
        tags(row, 'c').forEach((c, j) => {
          const ci = c.getAttribute('r') ? colIndex(c.getAttribute('r')) : j;
          const t = c.getAttribute('t'); const vEl = tags(c, 'v')[0]; const raw = vEl ? vEl.textContent : null;
          let val = null;
          if (t === 's') val = raw != null ? ss[+raw] : null;
          else if (t === 'inlineStr') val = tags(c, 't').map((x) => x.textContent).join('');
          else if (t === 'str') val = raw;
          else if (t === 'b') val = raw === '1';
          else if (t === 'e') val = null;
          else if (raw != null && raw !== '') {
            const num = parseFloat(raw); val = num;
            const sIdx = +c.getAttribute('s') || 0;
            if (isDateFormat(xfFmt[sIdx] || 0, custom) && isFinite(num)) val = new Date(Math.round((num - 25569) * 86400000));
          }
          arr[ci] = val;
        });
      });
      for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
      out.push({ name: sh.getAttribute('name'), rows });
    }
    return out;
  }
  function readCSV(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/)[0] || '';
    const delim = [';', '\t', ','].sort((a, b) => first.split(b).length - first.split(a).length)[0];
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += ch;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return [{ name: 'CSV', rows: rows.map((r) => r.map((v) => { const t = v.trim(); return /^-?\d+([.,]\d+)?$/.test(t) ? parseFloat(t.replace(',', '.')) : t; })) }];
  }

  const api = { write, read, readCSV, colName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.XLSXLite = api;
})(typeof window !== 'undefined' ? window : globalThis);

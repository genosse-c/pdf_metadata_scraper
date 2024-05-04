var PDFScraper = {

  pretty_print: function(binary, type){
    let data;
    switch(type){
      case "meta":
        data = PDFScraper.metadata_objects(binary);
        break;
      case "info":
        data = PDFScraper.info_objects(binary);
      default:
        data = {metadata: PDFScraper.metadata_objects(binary), info: PDFScraper.info_objects(binary)};
    }
    return JSON.stringify(data, null, '  ');
  },

  is_pdf: function(binary) {
    if (binary.startsWith("%PDF-")) {
      return true;
    }

    const head = binary.slice(0, Math.min(1024, binary.length));
    return head.includes("%PDF-");
  },

  pdf_version: function(binary) {
    if (binary.startsWith("%PDF-")) {
      const version = binary.slice(5, 8);
      return { ok: version };
    }

    const head = binary.slice(0, Math.min(1024, binary.length));
    const match = head.match(/%PDF-[0-9]\.[0-9]/);
    if (match) {
      return PDFScraper.pdf_version(match[0]);
    } else {
      return { error: true };
    }
  },

  encrypt_refs: function(binary) {
    const regex = /\/Encrypt\s*[0-9].*?R/g;
    const matches = binary.match(regex);
    const uniqueMatches = [...new Set(matches)];
    return uniqueMatches;
  },

  is_encrypted: function(binary) {
    const refs = PDFScraper.encrypt_refs(binary);
    return refs.length > 0;
  },

  info_refs: function(binary) {
    const regex = /\/Info[\s0-9]*?R/g;
    const matches = binary.match(regex);
    const uniqueMatches = [...new Set(matches)];
    return uniqueMatches;
  },

  metadata_refs: function(binary) {
    const regex = /\/Metadata[\s0-9]*?R/g;
    const matches = binary.match(regex);
    const uniqueMatches = [...new Set(matches)];
    return uniqueMatches;
  },

  info_objects: function(binary) {
    const refs = PDFScraper.info_refs(binary);
    const objects = {};

    if (refs){
      for (const ref of refs) {
        const objId = ref.slice(6, -2);
        const obj = PDFScraper.get_object(binary, objId);
        if (obj){
          const list = obj.flat().filter((item, index, self) => self.indexOf(item) === index);
          objects[ref] = list.map(rawInfoObj => PDFScraper.parse_info_object(rawInfoObj, binary));
        }
      }
    }

    if (Object.keys(objects).length === 0){
      return {'error': 'no info objects found'}
    } else {
      return objects
    }
  },

  metadata_objects: function(binary) {
    const regexStart = /<x:xmpmeta/g;
    const regexEnd = /<\/x:xmpmeta/g;
    const starts = [...binary.matchAll(regexStart)].map(match => match.index);
    const ends = [...binary.matchAll(regexEnd)].map(match => match.index);
    const pairs = [];
    for (const start of starts) {
      for (const end of ends) {
        if (start < end) {
          pairs.push([start, end]);
          break;
        }
      }
    }
    const rawMetadataObjects = pairs.map(pair => binary.slice(pair[0], pair[1] + 12));
    const objects = [];
    console.log(rawMetadataObjects);
    for (const rawMetadata of rawMetadataObjects) {
      const map = PDFScraper.parse_metadata_object(rawMetadata);
      if (map && Object.keys(map).length > 0) {
        objects.push(map);
      }
    }
    return objects;
  },

  raw_info_objects: function(binary) {
    const refs = PDFScraper.info_refs(binary);
    const objects = {};
    for (const ref of refs) {
      const objId = ref.slice(6, -2);
      const obj = PDFScraper.get_object(binary, objId);
      const list = obj.flat().filter((item, index, self) => self.indexOf(item) === index);
      objects[ref] = list;
    }
    return objects;
  },

  raw_metadata_objects: function(binary) {
    const regexStart = /<x:xmpmeta/g;
    const regexEnd = /<\/x:xmpmeta/g;
    const starts = [...binary.matchAll(regexStart)].map(match => match.index);
    const ends = [...binary.matchAll(regexEnd)].map(match => match.index);
    const pairs = [];
    for (const start of starts) {
      for (const end of ends) {
        if (start < end) {
          pairs.push([start, end]);
          break;
        }
      }
    }
    const rawMetadataObjects = pairs.map(pair => binary.slice(pair[0], pair[1] + 12));
    return rawMetadataObjects;
  },

  parse_metadata_object: function(string) {
    if (typeof string === 'string') {
      const xmpMatch = string.match(/<x:xmpmeta.*<\/x:xmpmeta>/gsm);
      if (xmpMatch) {
        const xmp = xmpMatch[0];
        const tags = ["dc", "pdf", "pdfx", "xap", "xapMM", "xmp", "xmpMM"];
        return tags.reduce((acc, tag) => {
          const regex = new RegExp(`<${tag}:(.*?)>(.*?)</${tag}:(.*?)>`, 'gsm');
          const m = Array.from(xmp.matchAll(regex));
          if(m){
            return PDFScraper.reduce_metadata(acc, tag, m);
          } else {
            return false;
          }
        }, {});
      } else {
        return 'error';
      }
    }
  },

  reduce_metadata: function(acc, type, list) {
    return list.reduce((acc, match) => {
      const [_, key, val, keyEnd] = match;
      let value = val
        .replace(/<[a-z]+:[a-z]+>/gi, " ")
        .replace(/<[a-z]+:.+["']>/gi, " ")
        .replace(/<\/[a-z]+:[a-z]+>/gi, " ")
        .replace(/<[a-z]+:.+\/>/gi, " ")
        .trim();

      const decodedValue = PDFScraper.decode_value(value);

      if (decodedValue.ok) {
        acc[`${type},${key}`] = decodedValue.ok;
      }
      return acc;
    }, acc);
  },

  parse_info_object: function(string, pdfBinary = "") {
    const regexString = /\/([a-zA-Z]+)\s*\((.*?[\)]*[^\\])\)/g;
    const regexHex = /\/([^ /]+)\s*<(.*?)>/gs;
    const regexObjects = /\/([a-z]+)\s([0-9]+\s[0-9]+)\s.*?R/ig;

    const strings = [];
    let match;
    while ((match = regexString.exec(string)) !== null) {
      const [, key, val] = match;
      const decodedValue = PDFScraper.decode_value(val);
      if (decodedValue.ok) {
        strings.push([key, decodedValue.ok]);
      }
    }

    const hex = [];
    while ((match = regexHex.exec(string)) !== null) {
      const [, key, val] = match;
      const decodedValue = PDFScraper.decode_value(val, true);
      if (decodedValue.ok) {
        hex.push([key, decodedValue.ok]);
      }
    }

    const objects = [];
    while ((match = regexObjects.exec(string)) !== null) {
      const [, key, objId] = match;
      const obj = PDFScraper.get_object(pdfBinary, objId);
      const valMatch = obj[0].match(/obj.*?\((.*?)\).*?endobj/s);
      if (valMatch) {
        const [, val] = valMatch;
        const decodedValue = PDFScraper.decode_value(val);
        if (decodedValue.ok) {
          objects.push([key, decodedValue.ok]);
        }
      }
    }

    const result = {};
    for (const [key, val] of [...strings, ...hex, ...objects]) {
      result[key] = PDFScraper.fix_non_printable(PDFScraper.fix_octal_utf16(val));
    }
    return result;
  },

  get_object: function(binary, objId) {
    if (typeof binary === 'string' && typeof objId === 'string' && objId.length <= 15) {
      objId = objId.replace(/ /g, "\\s");

      const regex = new RegExp(`[^0-9]${objId}.obj.*?endobj`, 'gs');
      return binary.match(regex);
    }
  },

  decode_value: function(value, hex = false) {
    console.log("value to decode: "+value);
    if (value.startsWith("feff")) {
      let base16EncodedUtf16BigEndian = value.slice(4).replace(/[^0-9a-f]/gi, "");
      try {
        let utf16 = Buffer.from(base16EncodedUtf16BigEndian, 'hex');
        let endianness = PDFScraper.determine_endianness(utf16, 'big');
        utf16 = PDFScraper.utf16_size_fix(utf16);
        let string = Buffer.from(utf16).toString('utf16le');
        return { ok: string };
      } catch (error) {
        return 'error';
      }
    }

    if (value.startsWith("\xFE\xFF\\")) {
      let utf16Octal = value.slice(3);
      try {
        let string = PDFScraper.fix_octal_utf16(utf16Octal);
        return { ok: string };
      } catch (error) {
        return 'error';
      }
    }

    if (value.startsWith("\xFE\xFF")) {
      let utf16 = value.slice(2);
      let endianness = PDFScraper.determine_endianness(utf16, 'big');
      utf16 = PDFScraper.utf16_size_fix(utf16);
      try {
        let string = Buffer.from(utf16).toString('utf16le');
        return { ok: string };
      } catch (error) {
        return 'error';
      }
    }

    if (value.startsWith("\\376\\377")) {
      let rest = value.slice(6);
      try {
        let string = PDFScraper.fix_octal_utf16(rest);
        return { ok: string };
      } catch (error) {
        return 'error';
      }
    }

    if (hex) {
      let cleanedValue = value.toLowerCase().replace(/[^0-9a-f]/gi, "");
      try {
        let decoded = Buffer.from(cleanedValue, 'hex');
        return { ok: decoded };
      } catch (error) {
        return 'error';
      }
    }

    return { ok: value };
  },

  fix_non_printable: function(val) {
    if (!PDFScraper.is_printable(val)) {
      return Buffer.from(val).toString('utf8');
    }
    return val;
  },

  utf16_size_fix: function(binary) {
    if (binary.length % 2 === 1) {
      return Buffer.concat([binary, Buffer.from([0])]);
    }
    return binary;
  },

  fix_octal_utf16: function(binary) {
    return binary.split(/\\[0-3][0-7][0-7]/)
      .map(part => PDFScraper.do_fix_occtal_utf16(part))
      .join('');
  },

  do_fix_occtal_utf16: function(code) {
    if (code.startsWith("\\")) {
      let digits = code.slice(1).split('');
      let num = parseInt(digits[0]) * 64 + parseInt(digits[1]) * 8 + parseInt(digits[2]);
      return String.fromCharCode(num);
    }
    return code;
  },

  determine_endianness: function(binary, initialGuess) {
    let littleZeros = 0, bigZeros = 0;
    for (let i = 0; i < binary.length; i += 2) {
      if (binary[i] === 0) {
        if (initialGuess === 'big') {
          bigZeros++;
        } else {
          littleZeros++;
        }
      }
    }
    return bigZeros >= littleZeros ? 'big' : 'little';
  },

  is_printable: function(val) {
    return /^[\x20-\x7E]*$/.test(val);
  }
}


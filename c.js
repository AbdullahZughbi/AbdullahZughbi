const fs = require('fs');
const path = require('path');
const cpp = require('./cpp.js'); // Must implement saving export.hpp, extract.hpp, and keys.hpp

const args = process.argv.slice(2);
function getArg(name) {
  const arg = args.find(x => x.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : null;
}

const SRC_DIR = getArg('src-dir');
const OUT_CPP = getArg('output-cpp-dir');
const OUT_MOD = getArg('output-mod');

if (!SRC_DIR || !OUT_CPP || !OUT_MOD) {
  console.error('❌ Usage: node c.js --src-dir=SRC --output-cpp-dir=DIR --output-mod=DIR');
  process.exit(1);
}

if (!fs.existsSync(SRC_DIR)) {
  console.error(`❌ Source directory not found: ${SRC_DIR}`);
  process.exit(1);
}

fs.mkdirSync(OUT_CPP, { recursive: true });
fs.mkdirSync(OUT_MOD, { recursive: true });

function walkFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let results = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results = results.concat(walkFiles(full));
    else if (entry.isFile()) results.push(full);
  }
  return results;
}

const TextExtensions = [
  '.js', '.ts', '.tsx', '.d.ts', '.json', '.html',
  '.css', '.cjs', '.mjz', '.md', '.xml', '.ejs',
];

function getRandomKey() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let res = '';
  for (let i = 0; i < 7 + Math.floor(Math.random() * 3); i++) {
    res += chars[Math.floor(Math.random() * chars.length)];
  }
  return res;
}

function encodeText(text) {
  const buf = Buffer.alloc(text.length * 2); // UInt16BE per char
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!keys[ch]) {
      let k;
      do { k = getRandomKey(); } while (bin[k] !== undefined);
      keys[ch] = k;
      bin[k] = binCounter++;
    }
    const key = keys[ch];
    const num = bin[key];
    buf.writeUInt16BE(num, i * 2);
  }
  return buf;
}

// Start packing
const files = walkFiles(SRC_DIR);
console.log(`* Files total: ${files.length}\n`);

const bundleBuffers = [];
const keys = {};
const bin = {};
const filesMeta = [];
let offset = 0;
let binCounter = 0;

files.forEach((file, index) => {
  const relPath = path.relative(SRC_DIR, file).replace(/\\/g, '/');
  console.log(`${index + 1}/${files.length}: Reading file: ${relPath}`);

  const buffer = fs.readFileSync(file);
  const ext = path.extname(relPath).toLowerCase();

  let isBinary = false;
  let data;

  if (TextExtensions.includes(ext)) {
    try {
      const str = buffer.toString('utf8');
      data = encodeText(str);
    } catch (err) {
      console.warn(`⚠️ Failed to encode as text, falling back to binary: ${relPath}`);
      isBinary = true;
      data = buffer;
    }
  } else {
    isBinary = true;
    data = buffer;
  }

  bundleBuffers.push(data);
  filesMeta.push({
    path: relPath,
    offset,
    length: data.length,
    binary: isBinary,
  });

  offset += data.length;
});

// Write binary blob
const bundleBuf = Buffer.concat(bundleBuffers);
fs.writeFileSync(path.join(OUT_MOD, 'bundle.fmod'), bundleBuf);

// Write metadata
fs.writeFileSync(
  path.join(OUT_MOD, 'keys.json'),
  JSON.stringify({ keys, bin, files: filesMeta }, null, 2)
);

// Call C++ generator
cpp({
  out_cpp: OUT_CPP,
  keys: { keys, bin, files: filesMeta },
});

console.log(`\n✅ Done: ${filesMeta.length} files packed into bundle.fmod`);
console.log(`📦 Output written to ${OUT_MOD}/bundle.fmod and keys.json`);

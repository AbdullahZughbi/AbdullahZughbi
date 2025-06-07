const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function getArg(name) {
  const arg = args.find(x => x.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : null;
}

const OUT_DIR = getArg('output-dir');
const MOD_DIR = getArg('mod-dir');

if (!OUT_DIR || !MOD_DIR) {
  console.error('❌ Usage: node extract.js --output-dir=DIR --mod-dir=DIR');
  process.exit(1);
}

const bundlePath = path.join(MOD_DIR, 'bundle.fmod');
const keysPath = path.join(MOD_DIR, 'keys.json');

if (!fs.existsSync(bundlePath) || !fs.existsSync(keysPath)) {
  console.error('❌ Missing bundle.fmod or keys.json in:', MOD_DIR);
  process.exit(1);
}

const bundle = fs.readFileSync(bundlePath);
const { keys, bin, files } = JSON.parse(fs.readFileSync(keysPath, 'utf-8'));

const reverseBin = {};
for (const [k, v] of Object.entries(bin)) {
  reverseBin[v] = k;
}

const reverseKeys = {};
for (const [ch, key] of Object.entries(keys)) {
  reverseKeys[key] = ch;
}

fs.mkdirSync(OUT_DIR, { recursive: true });

function decodeText(buffer) {
  let result = '';
  for (let i = 0; i < buffer.length; i += 2) {
    const num = buffer.readUInt16BE(i);
    const key = reverseBin[num];
    const ch = reverseKeys[key];
    if (ch === undefined) throw new Error(`❌ Unknown char key for index ${num}`);
    result += ch;
  }
  return result;
}

files.forEach(fileMeta => {
  const { path: relPath, offset, length, binary } = fileMeta;
  const data = bundle.slice(offset, offset + length);
  const outPath = path.join(OUT_DIR, relPath);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  if (binary) {
    fs.writeFileSync(outPath, data);
  } else {
    const text = decodeText(data);
    fs.writeFileSync(outPath, text, 'utf-8');
  }

  console.log(`✅ Extracted: ${relPath}`);
});

console.log(`\n🎉 Extraction complete! Output saved to ${OUT_DIR}`);

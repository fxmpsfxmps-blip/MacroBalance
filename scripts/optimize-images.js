const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const foodDirectory = path.join(root, 'assets', 'foods');
const allFiles = [
  ...fs.readdirSync(root)
    .filter(name => /^PLT_[A-Z]+_\d+\.jpg$/i.test(name))
    .map(name => path.join(root, name)),
  ...fs.readdirSync(foodDirectory)
    .filter(name => /\.jpe$/i.test(name))
    .map(name => path.join(foodDirectory, name))
];
const files = allFiles.filter(file => fs.statSync(file).size > 200 * 1024);

const beforeBytes = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
let cursor = 0;

async function optimize(file) {
  const resolved = path.resolve(file);
  if (!resolved.startsWith(root + path.sep)) throw new Error(`Ruta no segura: ${resolved}`);
  const temporary = `${resolved}.optimized.tmp`;
  await sharp(resolved)
    .rotate()
    .resize({
      width: 1280,
      height: 1280,
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({ quality: 80, chromaSubsampling: '4:2:0', mozjpeg: true })
    .toFile(temporary);
  fs.renameSync(temporary, resolved);
}

async function worker() {
  while (cursor < files.length) {
    const file = files[cursor++];
    await optimize(file);
  }
}

(async () => {
  if (!files.length) {
    console.log('Las imágenes ya cumplen el límite de 200 KB; no se reencodearon.');
    return;
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  const afterBytes = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
  const mb = bytes => (bytes / 1024 / 1024).toFixed(1);
  console.log(`${files.length} imágenes: ${mb(beforeBytes)} MB → ${mb(afterBytes)} MB`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

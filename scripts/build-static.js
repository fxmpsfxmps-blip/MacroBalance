const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
const expectedOutput = path.resolve(root, 'dist');

if (path.resolve(output) !== expectedOutput || !output.startsWith(root + path.sep)) {
  throw new Error('La carpeta de salida no es segura.');
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const file of ['index.html', 'plan.html', 'calculadora.js', 'firebase-init.js']) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}

const localVideoSources = new Set([
  '13372516_1080_1920_30fps.mp4',
  '14597490_2160_3840_60fps.mp4',
  '16405602_2160_3840_59fps.mp4',
  '8431888-uhd_2160_4096_25fps.mp4'
]);

for (const directory of ['media', 'assets', 'styles', 'js']) {
  fs.cpSync(path.join(root, directory), path.join(output, directory), {
    recursive: true,
    filter: source => {
      if (directory !== 'media' || fs.statSync(source).isDirectory()) return true;
      const name = path.basename(source);
      return !localVideoSources.has(name);
    }
  });
}

for (const file of fs.readdirSync(root).filter(name => /^PLT_[A-Z]+_\d+\.jpg$/i.test(name))) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}

console.log(`Sitio estático preparado en ${output}`);

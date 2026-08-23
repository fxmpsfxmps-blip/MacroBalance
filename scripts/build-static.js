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

for (const directory of ['media', 'assets', 'styles', 'js']) {
  fs.cpSync(path.join(root, directory), path.join(output, directory), { recursive: true });
}

for (const file of fs.readdirSync(root).filter(name => /^PLT_[A-Z]+_\d+\.jpg$/i.test(name))) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}

console.log(`Sitio estático preparado en ${output}`);

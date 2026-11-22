# Instalación en otra computadora

Necesitas Git, acceso de lectura a GitHub, Node.js y npm. El proyecto declara Node 20 como mínimo y la versión de Sharp del lockfile exige al menos 20.9.0. MB-02 se verificó con Node 24.19.0 y npm 11.17.0 en Windows. Usa esa combinación para reproducir la prueba. Se requiere red para descargar dependencias y, en navegador, para Firebase y fuentes externas.

```sh
git clone https://github.com/fxmpsfxmps-blip/MacroBalance.git
cd MacroBalance
git switch main
git rev-parse HEAD
```

### Main publicado antes de MB-02

La base publicada registrada para esta revisión es `2922a49409c220f8eeeee0efc871c35c416659f9`. Su `check` intenta ejecutar las pruebas antes de generar `dist/`. Con ese SHA, desde un clon nuevo ejecuta cada paso en este orden:

```sh
npm ci
npm run build
npm test
npm start
```

### Rama local MB-02 antes de la integración

En la copia de revisión, selecciona `codex/mb-02-canonical-portability` con sus cambios locales. Si partes de un clon nuevo, guarda el diff de entrega junto al clon y, desde la raíz del clon, recrea la rama sobre la base exacta:

```sh
git switch -c codex/mb-02-canonical-portability 2922a49409c220f8eeeee0efc871c35c416659f9
git apply --check ../MB-02.1-complete.diff
git apply ../MB-02.1-complete.diff
```

Una vez aplicado el diff, instala y verifica:

```sh
npm ci
npm run check
npm start
```

### Main después de una integración autorizada

En un clon nuevo de `main`, verifica el SHA aprobado y confirma que `check` en `package.json` indica `npm run build && npm test`. Ejecuta la misma secuencia de instalación y verificación de MB-02. Consulta [Versiones](VERSIONS.md) para el estado de la integración.

`npm run dev` construye antes de iniciar. `npm start` sirve una compilación existente.

Abre `http://localhost:3000`. Comprueba `/macros`, `/plan`, `/multimedia`, `/api/foods` y un recurso de cada colección local de imágenes. Para cambiar el puerto, define `PORT` antes de arrancar.

Los archivos versionados y las dependencias del lockfile bastan para build, pruebas y arranque local con los valores por defecto. Ejecuta la regresión base sin activar los flags opcionales de shadow o longitudinal. `.env.example` y el [runbook de shadow](docs/shadow-deployment-runbook.md) describen las variables de operación.

Para probar OAuth y persistencia se necesita un proyecto Firebase de prueba con proveedores habilitados, dominios autorizados y las reglas e índices de `firebase.json`. La configuración web incluida puede apuntar al servicio actual. Usa un entorno de prueba antes de iniciar sesión o escribir datos. El [procedimiento de recuperación](RECOVERY.md) explica qué queda fuera de Git.

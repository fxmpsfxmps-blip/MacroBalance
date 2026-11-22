# Recuperación sin secretos

1. Para recuperar el código, clona el GitHub canónico en una carpeta nueva y verifica el SHA con `git rev-parse HEAD`. Si necesitas un commit histórico desde un bundle privado, comprueba su hash, ejecuta `git bundle verify <bundle>` desde un repositorio Git y clónalo en un destino nuevo. Comprueba el checkout con `git fsck`.
2. Para rescatar cambios sin commit, usa la copia privada de archivos y compara contra el SHA base. Aplica los cambios elegidos en una rama aislada. Un bundle conserva referencias y objetos Git. Los archivos sin seguimiento e ignorados dependen de las copias de archivos.
3. Reconstruye `node_modules/` y `dist/` con [Instalación](SETUP.md). Recrea configuración de Firebase y Vercel desde las consolas autorizadas. Los punteros `.git` de worktrees antiguos pueden depender de una ruta absoluta. Recrea esos worktrees desde sus ramas.
4. Recupera medios fuera de Git desde una copia autorizada. Restaura Firestore con un procedimiento separado que identifique entorno, reglas, índices y exportación de datos. Primero verifica en un entorno de prueba.
5. Conserva el respaldo privado cifrado fuera del disco de origen y comprueba sus hashes tras copiarlo. Comparte únicamente el código y documentación revisados. Guarda archivos de entorno, manifiestos e historiales privados en sus ubicaciones protegidas.

Para verificar la aplicación recuperada, ejecuta `npm ci`, `npm run check` y `npm start` y repite las comprobaciones locales.

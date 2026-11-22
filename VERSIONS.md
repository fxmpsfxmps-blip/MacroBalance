# Versiones y ramas

| Referencia | Uso |
| --- | --- |
| `main` | Rama estable de producción. Base de MB-02: `2922a49409c220f8eeeee0efc871c35c416659f9`, también referenciada por `codex/v2-2-runtime-release` al establecer la línea base. |
| `codex/<tarea>` | Cambio aislado por misión. `codex/mb-02-canonical-portability` parte del SHA anterior. |
| `codex/v2.2-food-assets-taxonomy` (`9c51dcc`) | Historial de activos y taxonomía, ancestro de la base. |
| `codex/v2.1-precision-calculator` (`c98d279`) | Historial de Precision V2.1, ancestro de la base. |
| `codex/v2-monitoring-standard-calculator` (`8d2cdd6`) | Rama pendiente de revisión. Los commits `8343c9e` y `8d2cdd6` quedan fuera de la base. |

## Estado de integración de MB-02

| Estado | Contrato de verificación |
| --- | --- |
| `main` publicado en la base de esta revisión | `2922a49409c220f8eeeee0efc871c35c416659f9` conserva pruebas → build. En un clon limpio se ejecuta build y luego test por separado. |
| Rama local de revisión | `codex/mb-02-canonical-portability` parte del mismo SHA. El cambio local de `package.json` invierte el orden. Para reproducirlo desde otra PC, aplica el diff de entrega. |
| Después de una integración autorizada | El SHA aprobado de `main` deberá incluir el nuevo contrato. La secuencia esperada es `npm ci`, `npm run check`, `npm start`. El SHA de integración se conocerá al aprobar y aplicar el cambio. |

La relación de ancestros describe commits. La opción pública de calculadora y otras funciones activas se determinan en el código y en la configuración del entorno.

El legacy versionado se conserva en Git. Los prototipos, copias y experimentos locales se preservan en los respaldos privados de MB-01 y sus bundles según corresponda. Los cambios sin commit se recuperan desde las copias de archivos. Los experimentos se identifican por su procedencia y se revisan por separado antes de una eventual integración. Ver [Recuperación](RECOVERY.md) y [Pendientes](BACKLOG.md).

# Brief para Clinical Red Team — MacroBalance

## Decisión que se pide

Determinar si MacroBalance puede, en el futuro, automatizar alguna política nutricional para diabetes, CKD o diabetes + CKD. La respuesta permitida es **NO / abstener / ruta especialista**. No se busca completar un calculador a cualquier costo.

## Estado de partida

- Standard calcula energía y macros para su dominio general; no es un módulo clínico.
- V3 sólo registra observaciones y derivaciones descriptivas; no recalibra calorías ni macros.
- No existe override ejecutable para diabetes, CKD, diálisis, líquidos, potasio, fósforo o fármacos.
- La combinación diabetes + CKD debe tratarse como contexto clínico propio, no como dos reglas generales superpuestas.

## Hechos que deben preservarse

- Ausencia de datos no equivale a valor normal ni a autorización para una regla.
- Un rango poblacional no se convierte automáticamente en un target clínico individual.
- Medicación, riesgo de hipoglucemia, CKD stage/modalidad, labs y estado nutricional pueden cambiar la seguridad de cualquier macro o fluido.
- Ninguna política futura puede revivir Precision ni alterar Standard sin una invocación clínica versionada.

## Entregables esperados del Red Team

1. Mapa de subpoblaciones, exclusiones y datos mínimos obligatorios.
2. Tabla por regla candidata: fuente primaria, población, outcome, fuerza/limitación de evidencia, expiry/review date y criterio de abstención.
3. Ataque a cada regla con casos de insulina/hipoglucemia, SGLT2 + restricción, CKD de diferente estadio, diálisis, wasting, hiperpotasemia, edema/restricción de líquido y diabetes + CKD.
4. Propuesta de routing antes de cualquier target: educación, request-information, revisión clínica, especialista o abstención.
5. Conclusión explícita sobre qué, si algo, es seguro prototipar sin una decisión clínica adicional.

## No hacer

- No proponer una dieta única para diabetes.
- No crear límite universal de proteína, potasio, fósforo, sodio o líquido para CKD.
- No usar HbA1c o una etiqueta de diagnóstico como sustituto de evaluación clínica.
- No ajustar insulina, fármacos, calorías ni macros desde tendencias V3.
- No presentar educación general como recomendación individual.

## Fuentes prioritarias

ADA Standards of Care vigentes; KDIGO CKD 2024 y diabetes in CKD 2022/actualizaciones; KDOQI Nutrition in CKD; NIDDK; ESPEN para población hospitalaria. Usar revisiones sistemáticas sólo para vacíos concretos y diferenciar claramente guideline, consenso y evidencia observacional.


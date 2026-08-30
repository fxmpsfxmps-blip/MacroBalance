# MacroBalance — auditoría del modelo científico ejecutable

**Estado:** documento de alcance y trazabilidad; no es una guía clínica individual ni cambia ningún parámetro ejecutable.  
**Autoridad descrita:** `MACROBALANCE_STANDARD_PATCH3` / `standard-patch3-protein-r1-2026-08-29`.  
**Fecha:** 2026-08-30.

## Propósito y límites

MacroBalance Standard genera un `NutritionTarget` para adultos dentro de su dominio de uso. Su diseño separa la evidencia fisiológica, el enrutamiento de seguridad, una región factible de macronutrientes y una selección compatible para el menú. No convierte una referencia poblacional en un límite clínico individual, no diagnostica enfermedad y no sustituye la atención de un profesional.

La cadena vigente es: entrada cruda y normalización → alcance/guardrails → actividad y energía → proteína → semántica de grasa y carbohidrato → región conjunta factible → selección compatible para el menú. Una salida puede ser parcial, requerir información o no autorizar menú; una cifra visible no elimina la incertidumbre documentada.

### Contrato de datos faltantes

`MISSING`, `UNKNOWN`, `PARTIAL`, `CONFIRMED_NONE` y `NOT_ASSESSABLE` no son sinónimos. En especial, ausencia de entrenamiento, de ácidos grasos esenciales, de micronutrientes o de una escala subjetiva nunca se transforma silenciosamente en cero ni en “sin riesgo”. La activación de interacciones de entrenamiento exige observación realizada suficientemente completa; planes futuros no cuentan como entrenamiento realizado.

## 1. Energía

### Pregunta que resuelve

Estimar un **intervalo** de gasto energético total (TEE) y un intervalo inicial de energía según objetivo, no una necesidad metabólica exacta ni una “caloría mínima universal”. El intervalo conserva incertidumbre de actividad y de la estrategia de cambio de peso.

### Entradas principales

- Sexo, edad, peso, altura y, cuando existe, composición corporal como dato contextual.
- Ocupación/actividad y pasos con cobertura de observación, sin usar pasos o PAL como sustituto universal de demanda deportiva de carbohidrato.
- Objetivo (pérdida, mantenimiento o ganancia) y estado de entrenamiento realizado.
- Alcance, señales de guardrail y calidad/missingness de los datos.

### Modelo ejecutable actual

El módulo Standard entrega un TEE y energía objetivo como envolventes. El sistema evita imponer un punto fisiológico oculto cuando la evidencia sólo permite un rango. La selección que puede necesitar el menú es explícitamente una política de compatibilidad aguas abajo y vuelve a validar factibilidad; no se presenta como nueva ecuación fisiológica.

Los guardrails A9 distinguen: energía muy baja que Standard no debe generar autónomamente, agresividad relativa, factibilidad de restricciones protegidas y rutas de alcance clínico/deportivo. Un objetivo por debajo del RMR estimado es una señal contextual/revisión, no una prueba universal de invalidez. Los límites de 800, 1200 o 1500 kcal no se declaran “acantilados biológicos” universales.

### Alternativas rechazadas o no congeladas

- Piso universal de 1200/1500 kcal, objetivo igual a RMR y déficit fijo porcentual: no expresan el contexto individual completo.
- Reutilizar PAL/pasos para prescribir carbohidrato: actividad cotidiana y demanda de glucógeno no son la misma variable.
- Aumentar energía de forma silenciosa si las preferencias macro no caben: el solver informa el conflicto o pide retroceso de estrategia.

### Casos extremos y límites

Energía menor de 800 kcal/día no se genera de forma autónoma. El tramo 800–1200 kcal/día sigue siendo política/ruta abierta, no una autorización automática. Embarazo/lactancia, cirugía bariátrica reciente, enfermedad renal, medicación relevante, señales RED-S/alto rendimiento y otros dominios fuera de alcance no obtienen una recomendación clínica implícita.

**Confianza:** moderada para la arquitectura de intervalos y guardrails; los puntos numéricos de algunos modos y la recalibración longitudinal permanecen abiertos.

## 2. Proteína

### Pregunta que resuelve

Definir una restricción protegida y, cuando el contexto lo sustenta, una región preferida sin inventar un punto único ni una superficie clínica por composición corporal.

### Modelo ejecutable actual — Protein Policy R1

La política vigente es `PROTEIN_POLICY_R1_2026_08_29` (`protein-policy-r1-0.1.0`). Conserva un mínimo protegido de **0.83 g/kg** en el caso ordinario y **1.0 g/kg** en pérdida o edad mayor. Para resistencia realizada:

- sin déficit, región preferida `1.4–1.6 g/kg`;
- resistencia realizada + pérdida, región preferida `1.6–2.0 g/kg`;
- los rangos prácticos `1.6–2.0` y `2.0–2.2 g/kg` se mantienen como metadatos, no como puntos seleccionados ni límites protegidos adicionales.

La interacción requiere `SUFFICIENTLY_OBSERVED_REALIZED_TRAINING`; entrenamiento incompleto, desconocido o sólo planeado no la activa. No se añadieron modificadores por severidad del déficit, sexo, porcentaje de grasa, frecuencia, duración, workload, FFM ni ganancia.

### Obesidad y muscularidad

La política usa un ancla de robustez BMI30 y FFM medido sólo como diagnóstico cuando está disponible. No adopta un `referenceWeight` universal ni usa FFM estimado como dosis universal: ambas decisiones evitaron que el modelo convierta una corrección de tamaño corporal en una afirmación fisiológica no validada.

### Límites

No es una política de enfermedad renal, diálisis, embarazo, pediatría o sarcopenia clínica. Tampoco declara un límite superior clínico de proteína. Esos contextos se enrutan, no se resuelven con una multiplicación adicional.

**Confianza:** moderada para el caso Standard y la interacción realizada-resistencia/pérdida; baja/no aplicable para indicaciones clínicas especializadas.

## 3. Grasa

### Pregunta que resuelve

Representar adecuación y referencia poblacional sin convertir el porcentaje de energía ni un gramo por kg en un “mínimo fisiológico total” automático.

### Modelo ejecutable actual

La dirección A6 mantiene `protectedLower = null` para grasa total. El rango AMDR adulto `20–35%` de energía se expone como **referencia poblacional suave**: no es una región fisiológicamente permitida, un mínimo duro, un máximo de seguridad ni un selector automático de 30%.

Los ácidos grasos esenciales se tratan por separado. La evaluación directa de linoleico/ALA exige datos de ingesta y cobertura suficientes; si faltan, el resultado es `NOT_ASSESSABLE`, no “adecuado” ni una conversión automática en gramos de grasa total.

### Alternativas rechazadas

- Piso de gramos absoluto, `g/kg` de peso real o de peso de referencia y midpoint de 30%: no hay base universal congelada para automatizarlos.
- Usar el AMDR como restricción dura: mezclaría una referencia poblacional con la región de factibilidad fisiológica.

### Límite importante

Una región puramente matemática puede permitir grasa total muy baja si sólo mira la ecuación energética. Eso no autoriza a afirmar que cualquier punto matemático sea nutricionalmente recomendado. La exposición de una recomendación alimentaria completa depende de EFA/micronutrientes, cobertura de datos y política de ejecución posterior; no se inventa un piso para ocultar ese vacío.

**Confianza:** alta para la separación semántica (grasa total versus EFA); baja para un target individual automático, que no se afirma.

## 4. Carbohidratos

### Pregunta que resuelve

Separar carbohidrato residual ordinario de contextos en que el rendimiento podría depender de disponibilidad de carbohidrato, sin derivar una dosis deportiva débil a partir de pasos, PAL o peso corporal.

### Modelo ejecutable actual

La dirección vigente es Minimal Standard:

- **Sin entrenamiento/low demand:** `FLEXIBLE_RESIDUAL`; el carbohidrato ocupa la energía restante dentro de la región conjunta.
- **Entrenamiento ordinario o transición:** preferencia contextual L4, sin banda numérica automática; la preferencia low-carb L6 no desplaza una preferencia de entrenamiento aplicable.
- **Demanda de rendimiento alta:** `PERFORMANCE_TARGET_NOT_IDENTIFIED` y ruta a nutrición deportiva/Advanced, no una cuota universal en g/día, %E o g/kg.

La referencia de 130 g/día es poblacional/informativa, no un piso del solver. El AMDR adulto `45–65%E` y las bandas deportivas 3–12 g/kg permanecen como comparadores de contexto, no como reglas Standard automáticas. Las superficies diagnósticas previas 35–55%E y 45–65%E se rechazaron por falsa precisión.

### Entradas con valor y exclusiones

Modalidad, frecuencia realizada, duración, intensidad amplia, sesiones largas y dos sesiones diarias tienen valor descriptivo. PAL, pasos, ocupación, calorías de wearable/máquina, RPE aislado, series/tonelaje y planes futuros no son selectores primarios. A falta de una dosis y un denominador defendibles, el sistema enruta en vez de rellenar números.

### Límites

Resistencia recreativa y endurance ordinario pueden permanecer residual/contextual. Endurance repetido prolongado, two-a-day, preparación de evento y alto rendimiento requieren contexto que Standard no puede dosificar sin un modelo especializado. No se añade gasto de ejercicio a carbohidrato ni se implementa periodización automática.

**Confianza:** alta para no usar proxies y no falsear precisión; intencionalmente no hay confianza suficiente para una dosis Standard de rendimiento.

## Solver, selección y menú

A8 trabaja con jerarquía explícita: dominio/seguridad, contabilidad, restricciones protegidas, rendimiento activo, optimización contextual, referencias poblacionales y preferencia. La identidad energética es `4P + 4C + 9F ≈ E`; las relajaciones se registran. Inviabilidad protegida no es igual a conflicto suave. Puede devolver región factible, múltiples soluciones, parcial, backtrack o abstención.

El menú nunca debe reescribir fisiología. La capa de compatibilidad sólo selecciona dentro de la región autorizada y conserva proveniencia de la selección. La resolución regional es científicamente más fuerte que presentar un punto arbitrario como si fuera único.

## Micronutrientes e hidratación

`micronutrient-shadow.cjs` es observabilidad V2.2, no una política de adecuación. Para fibra, sodio, potasio, calcio y magnesio, `null` conserva desconocimiento; los estados `COMPLETE`, `PARTIAL` y `NOT_ASSESSABLE` no se convierten en RDA/AI/UL ni en porcentajes ficticios.

La hidratación es un objeto hermano versionado `hydration-reference-0.1`, no parte de `NutritionTarget`: para adultos con sexo conocido reporta la AI NASEM de **agua total** (3.7 L/día hombre, 2.7 L/día mujer), que incluye bebidas y agua de alimentos. No es una prescripción de agua simple, diagnóstico de hidratación, estimación de sudor ni ajuste por ejercicio, peso, kcal, pasos o MET. Entrenamiento sólo añade una limitación no numérica.

## Standard → Longitudinal → Professional → Clinical

1. **Standard:** autoridad de cálculo actual, con alcance y rutas explícitas.
2. **Longitudinal V3:** observa peso, medidas, objetivos, adherencia/instrumentos y entrenamiento realizado; deriva cambios, pendientes y completitud descriptivos. No cambia kcal ni macros.
3. **Professional futuro:** requerirá una política versionada y validada que consuma Standard + observaciones. No está implementada.
4. **Clinical:** diabetes, CKD, diálisis, embarazo, medicación, restricciones de fluidos/electrolitos y similares requieren revisión especializada y no tienen overrides ejecutables.

## No-claims explícitos

- No diagnóstico, tratamiento, prescripción clínica ni ajuste de medicación.
- No cuota universal de carbohidrato deportivo, grasa total o agua simple.
- No garantía de adecuación de micronutrientes cuando datos/coverage faltan.
- No equivalencia entre factibilidad matemática y dieta clínicamente apropiada.
- No recalibración automática por tendencia de peso, hambre, rendimiento o adherencia.
- No reactivación del antiguo Precision Calculator; su código residual no es autoridad de V3.

## Fuentes de contexto

- [National Academies — Dietary Reference Intakes for Water](https://www.nationalacademies.org/read/10925/chapter/6)
- [National Academies — resumen de DRI de agua](https://www.nationalacademies.org/news/report-sets-dietary-intake-levels-for-water-salt-and-potassium-to-maintain-health-and-reduce-chronic-disease-risk)
- [ADA Standards of Care 2026 — nutrition and well-being](https://diabetesjournals.org/care/article/49/Supplement_1/S89/163932/5-Facilitating-Positive-Health-Behaviors-and-Well)


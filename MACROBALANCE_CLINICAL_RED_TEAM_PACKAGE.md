# MacroBalance — Clinical Red Team Package

**Estado:** base de investigación y protocolo de falsación. No introduce política clínica ejecutable.  
**Fecha de revisión:** 2026-08-30.  
**Uso previsto:** evaluación independiente antes de cualquier ruta clínica, no como consejo para pacientes.

## Regla de seguridad

MacroBalance Standard no debe inferir diabetes, estadio de CKD, estado de diálisis, restricciones de líquidos, hipercalemia, hiperfosfatemia, nutrición enteral/parenteral, dosis de insulina ni ajuste de fármacos. El Red Team debe tratar cualquier ausencia de estos datos como falta de autoridad para una política específica, no como una invitación a usar defaults.

## Alcance del examen

| Dominio | Pregunta que una futura política tendría que resolver | Estado actual |
| --- | --- | --- |
| Diabetes | ¿Cómo coordina composición, horario, glucosa, medicación y riesgo de hipoglucemia? | `SPECIALIST_REVIEW_REQUIRED`; sin override macro. |
| CKD no dialítica | ¿Cómo conoce estadio, eGFR/albuminuria, estado nutricional y potasio/fósforo/medicación? | `SPECIALIST_REVIEW_REQUIRED`; sin override de proteína/minerales. |
| Diálisis/trasplante/AKI | ¿Qué modalidad, pérdidas, tratamiento, labs y orden médica aplican? | Fuera de Standard. |
| Diabetes + CKD | ¿Cómo evita colisionar seguridad glucémica con proteína, electrolitos y medicación renal? | Fuera de Standard; ruta conjunta obligatoria. |

## Hallazgos de investigación

### Diabetes

La ADA 2026 favorece terapia nutricional individualizada y participación de un dietista con experiencia en diabetes; no respalda una proporción única de macronutrientes para toda persona con diabetes. La composición debe considerar calidad alimentaria, calorías, objetivos metabólicos, preferencias, acceso, alfabetización y tratamiento farmacológico. Por tanto, una plantilla Standard no puede convertirse automáticamente en una “dieta para diabetes”.

El riesgo de hipoglucemia no es un detalle nutricional genérico: insulina, sulfonilureas y meglitinidas crean un contexto que exige educación, monitoreo y coordinación de comidas/medicación. Cambios de carbohidrato, ayuno, pérdida de peso, ejercicio o intake reducido pueden modificar ese riesgo. Una futura capa no puede ajustar carbohidratos sin, como mínimo, tipo y esquema de medicación, historia de hipoglucemia, monitorización y capacidad de respuesta.

**No implementar ahora:** dosis de carbohidrato por comida, insulin-to-carb ratio, timing de insulina, corrección de glucosa, regla de ayuno, "bajo carbohidrato" automático ni modificación calórica en medicación hipoglucemiante.

### CKD y enfermedad renal

CKD no es una condición nutricional uniforme. Estadio, tratamiento renal sustitutivo, estado catabólico, energía, pérdida de masa, potasio/fósforo/bicarbonato, presión/edema, medicación y laboratorios cambian materialmente la decisión. NIDDK enfatiza que proteína, sodio, potasio, fósforo y líquidos pueden requerir ajuste individual; diálisis cambia las pérdidas y la necesidad proteica. Por ello un mínimo o máximo Standard de proteína no puede reutilizarse para CKD.

KDIGO y KDOQI son anclas de revisión, pero cualquier número debe citar versión, población, estadio y condiciones de estabilidad. KDOQI, por ejemplo, diferencia dietas bajas en proteína para subgrupos no diabéticos metabólicamente estables de etapas 3–5 frente a necesidades de otros contextos. Ese contraste es precisamente por qué no puede codificarse un único override “renal”.

**No implementar ahora:** límite automático de proteína, potasio, fósforo, sodio, calcio, líquido, suplemento, binder o regla de "plant-based" para CKD.

### Intersección diabetes + CKD

Es el caso más propenso a contradicciones. La nutrición debe considerar glucemia e hipoglucemia, calidad de carbohidrato, energía, proteína, estado de nutrición, electrolitos, fósforo, volumen y medicamentos. El HbA1c puede requerir interpretación contextual en CKD; no basta para una automatización de macros. KDIGO identifica la monitorización y manejo de diabetes en CKD como campo específico, no como la suma de dos perfiles genéricos.

**Regla para el producto actual:** un indicador de diabetes + CKD debe impedir políticas macro específicas y mostrar ruta clínica/especialista, sin ofrecer una aparente “solución por defecto”.

## Datos mínimos que un modelo futuro debe demostrar que necesita

### Diabetes

- Tipo de diabetes y objetivos clínicos individualizados.
- Medicación completa, dosis/horario relevantes y riesgo de hipoglucemia.
- CGM/BGM disponible, hipoglucemias recientes y capacidad de actuar.
- Patrón de comidas, actividad, acceso a alimentos y preferencia.
- Embarazo, enfermedad aguda, cirugía, trastorno de alimentación u otros dominios que cambian seguridad.

### CKD

- Diagnóstico confirmado, estadio/eGFR y albuminuria cuando corresponda.
- Diálisis/trasplante/AKI, modalidad y calendario.
- Laboratorios y tendencia que el clínico considere pertinentes (incluidos potasio, fósforo, bicarbonato y estado nutricional), no sólo una etiqueta de CKD.
- Edema/volumen, restricciones de fluido prescritas, presión, comorbilidades y medicamentos (incluidos RAAS/SGLT2/binders/diuréticos cuando correspondan).
- Evaluación de malnutrición/protein-energy wasting y dietista renal responsable.

### Intersección

Debe modelarse como un caso propio con ownership clínico coordinado. No se permite resolverlo con la intersección aritmética de dos rangos de macros.

## Red-team matrix: hipótesis que deben ser destruidas

| Candidato peligroso | Perfil que lo falsifica | Daño potencial | Veredicto actual |
| --- | --- | --- | --- |
| “Diabetes = menos carbohidrato” | Insulina basal-bolo con cambio de comida/ejercicio | Hipoglucemia o descoordinación de dosis | Rechazado. |
| “CKD = proteína baja” | Diálisis o riesgo de wasting | Déficit proteico/energético | Rechazado. |
| “Potassium restriction para CKD” | CKD sin hiperpotasemia o con medicamentos/dieta distintos | Restricción alimentaria innecesaria | Rechazado. |
| “Sodium/líquidos a todos” | CKD sin orden de fluido o persona con contexto deportivo | Deshidratación/daño por consejo incorrecto | Rechazado. |
| “Fibra universal resuelve diabetes” | Persona con medicación, GI disease o CKD avanzado | Simplificación clínica falsa | Sólo educación general, sin algoritmo. |
| “GLP-1 permite una ingesta muy baja” | Baja ingesta con riesgo de adecuación o síntomas | Falsa sensación de seguridad | Revisión clínica; sin rescate automático con suplementos. |
| “SGLT2 + keto es preferencia” | SGLT2 con estrategia cetogénica/restricción marcada | Riesgo de evento adverso | Conflicto/ruta explícita, no warning genérico. |

## Arquitectura segura futura

```text
Standard target (sin cambio)
        ↓
Clinical intake / verification de identidad y datos mínimos
        ↓
Versioned clinical policy (aún no implementada)
        ↓
Especialista + monitorización + consentimiento
        ↓
Resultado con provenance, criterios, fecha de guía y ruta de revisión
```

Una política clínica futura requiere: módulo separado, versionado, fuente primaria por regla, criterios de inclusión/exclusión explícitos, tests por etapa/modalidad/medicación, revisión clínica, expiración de guideline y mecanismo de abstención. No podrá reutilizar como fallback el Precision Calculator ni ajustar silenciosamente Standard.

## Preguntas que debe responder un auditor clínico

1. ¿Qué poblaciones concretas cubre cada regla y cuáles excluye?
2. ¿Qué dato o laboratorio convierte una recomendación general en una decisión individual?
3. ¿Qué condiciones obligan a ruta urgente, revisión programada, abstención o educación solamente?
4. ¿Qué evidencia soporta el número, población, outcome y horizonte temporal?
5. ¿Cómo interactúan medicación, horario de comidas, actividad y sick-day rules?
6. ¿Qué salida mantiene la seguridad si faltan datos, están desactualizados o se contradicen?
7. ¿Cómo se prueban daño por falsa tranquilidad, falsos positivos y regresiones con Standard?

## Fuentes de arranque (no son reglas de producto)

- [ADA Standards of Care 2026: nutrition and well-being](https://diabetesjournals.org/care/article/49/Supplement_1/S89/163932/5-Facilitating-Positive-Health-Behaviors-and-Well)
- [ADA Standards of Care 2026: glycemic goals and hypoglycemia](https://diabetesjournals.org/care/article/49/Supplement_1/S132/163927/6-Glycemic-Goals-Hypoglycemia-and-Hyperglycemic)
- [KDIGO 2024 CKD Guideline](https://kdigo.org/guidelines/ckd-evaluation-and-management/)
- [KDIGO 2022 Diabetes Management in CKD](https://kdigo.org/wp-content/uploads/2022/10/KDIGO-2022-Clinical-Practice-Guideline-for-Diabetes-Management-in-CKD.pdf)
- [KDOQI Nutrition in CKD 2019/2020 update](https://www.kidney.org/kdoqi-clinical-practice-guidelines-nutrition-chronic-kidney-disease-2019-update)
- [NIDDK: healthy eating for adults with CKD](https://www.niddk.nih.gov/health-information/kidney-disease/chronic-kidney-disease-ckd/healthy-eating-adults-chronic-kidney-disease)
- [ESPEN guideline: clinical nutrition in hospitalized acute/chronic kidney disease](https://www.espen.org/files/ESPEN-Guidelines/ESPEN-guideline-on-clinical-nutrition-in-hospitalized-patients-with-acute-or-chronic-kidney-disease.pdf)


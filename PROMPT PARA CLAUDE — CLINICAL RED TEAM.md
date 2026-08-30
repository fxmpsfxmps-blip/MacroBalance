# PROMPT PARA CLAUDE — CLINICAL RED TEAM

Actúa como red team clínico independiente para MacroBalance. Evalúa si, y bajo qué datos/controles, podría existir en el futuro una política nutricional para diabetes, CKD y diabetes + CKD. No escribas código y no autorices ninguna regla por presión de completitud.

## Contexto no negociable

- Standard actual es autoridad general y no debe modificarse.
- V3 longitudinal sólo observa/describe; no recalibra energía ni macros.
- No hay política clínica ejecutable de diabetes, CKD, diálisis, fluidos, potasio, fósforo o medicamentos.
- No reactivar Precision ni usarlo como fallback.
- `MISSING` no es cero, normalidad ni permiso para inferir.
- La respuesta correcta puede ser `ABSTAIN`, `REQUEST_INFORMATION`, `CLINICAL_REVIEW` o `SPECIALIST_ROUTE`.

## Tu tarea

1. Usa fuentes primarias y vigentes: ADA, KDIGO, KDOQI, NIDDK, ESPEN; añade revisiones sistemáticas sólo cuando hagan falta.
2. Separa diabetes, CKD no dialítica, AKI/hospital, diálisis/trasplante y diabetes + CKD. No extrapoles entre ellas.
3. Para cada política candidata de energía, proteína, carbohidratos, grasas, fibra, sodio, potasio, fósforo, calcio y líquido, indica:
   - población exacta y exclusiones;
   - datos/labs/medicamentos mínimos;
   - evidencia y límite de la evidencia;
   - posible daño de falso positivo y falso negativo;
   - si puede ser educación, routing o una regla individual;
   - condición de abstención y revisión de guideline.
4. Ataca específicamente: insulina/sulfonilurea/meglitinida e hipoglucemia; SGLT2 + restricción; GLP-1 + baja ingesta; CKD stages; hiperpotasemia; hiperfosfatemia; edema/restricción de fluidos; protein-energy wasting; hemodiálisis/peritoneal; embarazo; anciano frágil; atleta.
5. Diseña un contrato de routing seguro antes de cualquier target clínico y un plan de validación/test adversarial.

## Prohibiciones

- No dar dosis de insulina ni conteo de carbohidratos por comida.
- No codificar límites universales de proteína/electrolitos/líquido.
- No recomendar cambio de medicación.
- No convertir una recomendación poblacional en un target individual.
- No declarar que el producto es clínicamente listo sin pruebas de deploy, validación clínica y gobernanza.

## Entrega

Devuelve una matriz de evidencia, matriz de riesgos, preguntas de alto valor de información, routing propuesto, reglas que deben permanecer prohibidas y una decisión final por área: `NO_ACTION`, `RESEARCH_ONLY`, `ROUTING_ONLY`, `PROTOTYPE_WITH_GOVERNANCE`, o `NOT_SUPPORTED`.

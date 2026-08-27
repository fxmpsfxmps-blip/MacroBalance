# Calculadora Estándar y Calculadora de Precisión

## Estándar preservada

La modalidad Estándar conserva las operaciones de P7:

1. Katch–McArdle cuando existe un porcentaje de grasa corporal válido (3–60%); de lo contrario, Mifflin–St Jeor.
2. BMR multiplicado por el factor general de actividad.
3. Ajustes P7 de sueño y estrés sobre el metabolismo base.
4. Entrenamiento de fuerza separado, MET 6 con factor de descanso 0.65; cardio fijo según objetivo.
5. TEF de 10%.
6. Objetivos: déficit 20%, mantenimiento, volumen 10%, con mínimo de 1500 kcal.
7. Proteína 2 g/kg, grasa 25% de kcal y carbohidrato como energía restante.

No se cambiaron sus factores ni sus resultados. Solo se envuelve su salida en el contrato `NutritionTarget` y se cuantifica la diferencia energética del redondeo.

## Precisión

### Entradas que sí afectan el cálculo

- Peso, altura, edad y sexo: BMR.
- Grasa corporal válida: selecciona Katch–McArdle y calcula masa magra; si falta, se usa Mifflin–St Jeor.
- Actividad o pasos: factor de movimiento cotidiano. Los pasos sustituyen el selector general cuando se informan.
- Tipo, días, minutos e intensidad de entrenamiento: gasto neto por MET.
- Tipo, días y minutos de cardio: gasto neto por MET.
- Sueño y estrés: no se convierten en una penalización metabólica clínica; moderan una velocidad rápida solicitada cuando la recuperación es limitada.
- Velocidad deseada: selecciona el porcentaje de déficit o superávit.

### Energía

```text
BMR = Katch–McArdle si hay composición corporal utilizable
    = Mifflin–St Jeor en caso contrario

movimiento = BMR × factor de movimiento
ejercicio neto = (MET × intensidad - 1 MET) × 3.5 × kg / 200 × min × días / 7
pre-TEF = movimiento + entrenamiento + cardio
TEF = pre-TEF × 0.10
TDEE = pre-TEF + TEF
objetivo = TDEE × (1 + tasa)
```

Se resta 1 MET al ejercicio para no volver a sumar el reposo ya incluido en el BMR multiplicado por actividad. Las tasas son -10/-15/-20% para déficit y +5/+8/+10% para volumen; mantenimiento es 0%. Con sueño menor a 6 h o estrés 4–5, una solicitud rápida se limita a -15% o +8%. Esto es una restricción conservadora del objetivo, no tratamiento médico.

El piso de Precisión es 105% del BMR estimado, una barrera técnica conservadora; no representa prescripción clínica ni sustituye evaluación profesional.

### Macronutrientes

- Proteína: depende de objetivo, entrenamiento y de si la base disponible es masa magra o peso corporal. Los factores utilizados quedan registrados en `macroRules`.
- Grasa: al menos el máximo entre 0.7 g/kg y 20% de energía, con tope técnico de 35%.
- Carbohidrato: energía restante.
- Los tres macros se redondean a gramos y siempre se calcula `P×4 + C×4 + G×9`; `energyCheck.differenceKcal` expone el pequeño residuo de redondeo.

Como control adicional, proteína y grasa tienen topes energéticos antes de asignar carbohidratos, evitando objetivos imposibles o carbohidratos negativos.

### Referencias y limitaciones

- Mifflin MD et al., ecuación predictiva de gasto en reposo: https://pubmed.ncbi.nlm.nih.gov/2305711/
- Ainsworth BE et al., Compendium 2011 para equivalentes MET: https://pubmed.ncbi.nlm.nih.gov/21681120/
- Herrmann SD et al., Adult Compendium 2024: https://pmc.ncbi.nlm.nih.gov/articles/PMC10818145/
- International Society of Sports Nutrition, proteína y ejercicio: https://pmc.ncbi.nlm.nih.gov/articles/PMC2117006/
- Helms et al., proteína durante restricción energética en atletas entrenados: https://pubmed.ncbi.nlm.nih.gov/24092765/
- Posición conjunta sobre grasa dietaria y rendimiento (20–25% de energía): https://pubmed.ncbi.nlm.nih.gov/11128862/

Las ecuaciones estiman poblaciones; no miden directamente el metabolismo individual. Los MET son promedios y el gasto real varía por técnica, condición y dispositivo. V2.1 no incorpora diagnósticos, embarazo, patología, micronutrientes ni reajuste longitudinal.

## Diferencias funcionales

| Aspecto | Estándar | Precisión |
| --- | --- | --- |
| Compatibilidad engine | Directa | Directa |
| BMR | Katch o Mifflin | Katch o Mifflin |
| Movimiento | Selector general | Pasos opcionales o selector |
| Entrenamiento | Fuerza fija, 60 min | Tipo, intensidad, duración y frecuencia |
| Cardio | Minutos por objetivo | Tipo, duración y frecuencia |
| Sueño/estrés | Ajustan base según P7 | Moderan velocidad rápida |
| Velocidad objetivo | Fija | Conservadora/moderada/rápida |
| Trazabilidad | Metadata compatible | Método y diagnósticos completos |

## Decisiones aplazadas

- Objetivos variables por día: la forma está reservada en `weeklyTarget`, sin activación.
- Ajuste con observaciones de peso/rendimiento: V3 o fase longitudinal aprobada.
- Persistencia `draft/saved` de planes: V2.7.

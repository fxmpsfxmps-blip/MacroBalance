# Responsive / Device Lab

## Matriz ejecutada

Se probó la portada, configurador y Dashboard renderizados con el navegador integrado basado en Chromium en estos anchos:

`320, 360, 390, 412, 480, 768, 1024, 1280, 1440 y 1920 px`.

También se probaron orientaciones horizontales de `568×320`, `844×390` y `1024×600`.

Resultado medido en todos los anchos:

- `document.scrollWidth === document.clientWidth`; sin overflow horizontal del documento.
- Header dentro del viewport y navegación móvil desplegable.
- CTA, generar, filtros y botones principales con altura mínima de 44 px (48–53 px en los CTA principales).
- Objetivo de sólo lectura cambia de cuatro a dos columnas y a una columna en 320 px cuando es necesario.
- Búsqueda y acciones del selector apilan sin cortar texto.
- Tiras de alimentos, días, comidas y categorías usan scroll horizontal contenido.
- Fotografías usan `object-fit: cover` y contenedores con `aspect-ratio`; no se deforman.
- Dashboard pasa de dos columnas a una y conserva la foto activa.
- WhatsApp mantiene un área de 48×48 px y respeta safe areas.

## Interacciones verificadas

- Mouse/click en selector, filtros, semanas, días y flechas.
- Activación por teclado con `Espacio` en alimentos; `aria-pressed` se sincroniza en todas las copias visuales.
- Menú móvil con botón, cierre al seleccionar y cierre con `Escape`.
- Comida activa cambia con flechas y mantiene una sola tarjeta marcada.
- Categoría de compras filtra 50 filas a su subconjunto.
- `prefers-reduced-motion` desactiva animaciones.
- En `hover: none`/puntero grueso, el selector deja de depender del hover y se convierte en scroll táctil manual.

## Navegadores

| Entorno | Estado |
| --- | --- |
| Chromium integrado (equivalente de motor Chrome/Edge) | Ejecutado, pasa |
| Chrome/Edge desktop reales | Cubierto por motor y anchos; repetir smoke test en URL Vercel |
| Chrome Android real | Pendiente de dispositivo físico tras obtener URL Vercel |
| Safari iOS real | Pendiente de dispositivo físico tras obtener URL Vercel |

No se declara una prueba física de Safari iOS o Chrome Android que este equipo Windows no puede ejecutar. Se añadieron compatibilidades específicas: fallback `100vh` antes de `100dvh`, `-webkit-backdrop-filter`, safe-area insets, controles táctiles sin hover obligatorio y layout sin alturas rígidas de contenido.

## Checklist para la URL de Vercel

En un iPhone Safari y un Android Chrome:

1. Abrir `/`, reproducir el video y rotar vertical/horizontal.
2. Abrir/cerrar navegación con touch y confirmar que ningún enlace queda fuera.
3. Iniciar sesión con Google y volver a Inicio; el CTA debe decir `CONTINUAR`.
4. Completar calculadora, guardar objetivo y confirmar los cuatro valores no editables.
5. Buscar, excluir y limpiar alimentos mediante touch.
6. Generar: loading negro visible, sin porcentaje, y desaparición al terminar.
7. Recorrer ambas semanas, días, cuatro/cinco comidas y fotos.
8. Abrir compras, cambiar Semana 1/Semana 2/14 días y categorías.
9. Confirmar que el teclado virtual no tapa campos o CTA y que WhatsApp no bloquea la última fila.
10. Revisar consola remota/red: sin 404 ni errores críticos.

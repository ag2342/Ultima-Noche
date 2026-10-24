FPS 3D de supervivencia zombi creado con **HTML5, CSS y Three.js**. Sin imágenes ni sonidos externos: el escenario, los zombis y los efectos se generan por código.

## Cómo ejecutarlo

El juego usa módulos ES e importa Three.js desde un CDN, así que debe abrirse mediante un servidor local (no basta con hacer doble clic en `index.html`).

### Opción rápida en Windows

```powershell
powershell -ExecutionPolicy Bypass -File .\servidor.ps1
```

El servidor abrirá `http://127.0.0.1:8123/` en el navegador.

### Opción con Node.js

```powershell
npx serve .
```

### Opción con Python

```powershell
python -m http.server 8123
```

Después abre `http://localhost:8123/`.

## Controles

| Acción | Tecla |
| --- | --- |
| Moverse | `W` `A` `S` `D` |
| Apuntar | Ratón |
| Disparar | Clic izquierdo (automático) |
| Correr | `Shift` |
| Recargar | `R` |
| Pausa | `Esc` |
| Reiniciar al morir | `R` |

## Mecánicas

- **Vida:** empiezas con **100 puntos**. Cada ataque zombi resta vida y la pantalla se tiñe de rojo. Al llegar a 0 termina la partida.
- **Oleadas automáticas:** cada oleada trae más zombis y algo más rápidos. Entre oleadas hay una pausa breve y un aviso en pantalla.
- **Marcador:** el HUD muestra la oleada actual, los zombis restantes y el total de zombis eliminados.
- **Disparo:** el rifle usa el centro de la pantalla para calcular impactos. Los disparos a la cabeza hacen mucho más daño.
- **Recarga:** cargador de 30 balas, munición de reserva infinita.

## Estructura

```text
index.html      Estructura del juego, HUD y pantallas
style.css       Estética, HUD, paneles y animaciones
main.js         Escena 3D, controles, IA, oleadas, disparos y audio
servidor.ps1    Servidor local opcional para Windows
README.md       Instrucciones
```

## Notas técnicas

- Three.js `0.160.0` se carga desde `unpkg.com`, por lo que la primera carga necesita conexión a internet.
- El audio se sintetiza con la Web Audio API y se activa tras pulsar el botón de inicio.
- Se recomienda Chrome, Edge o Firefox actualizados. El juego requiere teclado y ratón.
#

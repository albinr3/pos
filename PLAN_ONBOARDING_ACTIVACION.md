# Plan de Onboarding Mobile-First: Primera Venta en 5 Minutos

## Resumen

Crear un onboarding guiado, visual, saltable y optimizado para movil. El objetivo principal no es explicar toda la plataforma, sino activar al usuario rapidamente: crear 1 producto real y registrar 1 venta real.

El problema actual es que muchos usuarios terminan el registro y llegan a un dashboard vacio, sin una accion clara. El nuevo onboarding debe convertir ese momento en una mision simple: "haz tu primera venta en 5 minutos".

## Objetivo Principal

Llevar al usuario desde cuenta nueva hasta primera venta real con la menor friccion posible.

Criterios de exito:

- El usuario entiende que el siguiente paso es crear un producto.
- El usuario puede crear un producto desde un formulario express.
- El usuario puede vender ese producto inmediatamente.
- El usuario no queda atrapado en un dashboard vacio.
- El flujo completo funciona bien desde celular.

## Flujo Propuesto

### 1. Registro y configuracion inicial existente

Mantener el flujo actual de `/select-user`:

- Nombre del negocio.
- WhatsApp.
- Logo opcional.
- Usuario ADMIN.
- PIN o contrasena de 4 digitos.

Este flujo ya resuelve la configuracion basica de la cuenta, por lo que no debe sobrecargarse.

### 2. Primer ingreso al dashboard

Si la cuenta no tiene productos o no tiene ventas, el dashboard debe mostrar un bloque principal de onboarding en vez de sentirse vacio.

Mensaje principal sugerido:

> Haz tu primera venta en 5 minutos
>
> Primero crea un producto real de tu negocio. Luego te llevamos directo a venderlo.

Checklist:

- Datos del negocio listos.
- Primer producto creado.
- Primera venta registrada.

CTA principal:

- Crear mi primer producto

CTA secundario:

- Saltar por ahora

### 3. Producto express

Crear un formulario corto para registrar un producto vendible sin mostrar toda la complejidad del modulo de productos.

Campos recomendados:

- Nombre del producto.
- Precio de venta.
- Costo, opcional.
- Existencia inicial.
- Codigo o referencia, opcional.

Defaults internos:

- Tipo: producto basico.
- Unidad: unidad.
- Disponible para venta: si.
- ITBIS: usar configuracion actual o 18% por defecto.
- Stock minimo: 0.
- Si el usuario deja el costo vacio, usar `costo = precio de venta` como costo de referencia. Esto evita mostrar ganancias infladas en reportes y el usuario podra corregir el costo despues desde productos.

CTA:

- Guardar producto y venderlo

### 4. Primera venta

Despues de crear el producto express, redirigir al usuario a ventas con contexto de onboarding.

Comportamiento deseado:

- Al entrar a `/sales?onboardingProductId=PRODUCT_ID`, el sistema debe agregar automaticamente 1 unidad del producto al carrito.
- La adicion automatica debe ocurrir una sola vez por carga para evitar duplicados si el usuario refresca o el componente se re-renderiza.
- El usuario no debe tener que buscar manualmente el producto.
- La pantalla debe enfocarse en completar la venta.

CTA principal:

- Completar venta

### 5. Final del onboarding

Cuando el usuario registra la primera venta, mostrar una pantalla o bloque de cierre.

Texto sugerido:

> Ya hiciste tu primera venta.
>
> Si quieres aprender mas sobre como usar la plataforma en solo 30 minutos de video, dirigete a este enlace: Como usar la plataforma.

El enlace debe apuntar a:

`/como-usar-la-plataforma`

CTAs sugeridos:

- Ver mi dashboard
- Agregar mas productos
- Como usar la plataforma

## Requisitos Mobile-First

El onboarding debe disenarse primero para celular.

Reglas de UX:

- Una sola columna.
- Botones grandes y faciles de tocar.
- Formularios cortos.
- Evitar tablas.
- Evitar modales demasiado altos o dificiles de cerrar.
- CTA principal siempre visible o facil de alcanzar.
- Textos cortos, concretos y orientados a accion.
- No depender de hover.
- Probar en pantallas pequenas antes de desktop.

## Persistencia y Estado

Crear de forma obligatoria una tabla `AccountOnboarding` para guardar el estado de activacion por cuenta.

Campos requeridos:

- `accountId`
- `firstSeenAt`
- `lastSkippedAt`
- `completedAt`
- `firstProductId`
- `firstSaleId`
- `productExpressCreatedAt`
- `firstSaleCreatedAt`
- `createdAt`
- `updatedAt`

La logica principal debe combinar datos reales con ese estado:

- Si no hay productos activos: mostrar paso de producto.
- Si hay productos pero no hay ventas: mostrar paso de primera venta.
- Si ya hay ventas: marcar onboarding como completado.
- Si el usuario salta el onboarding, ocultarlo solo hasta el proximo login y no marcarlo como completado.
- `lastSkippedAt` queda guardado para medicion, pero no debe funcionar como ocultamiento permanente.
- Para ocultar hasta el proximo login, usar un estado de sesion del cliente, por ejemplo `sessionStorage`, y limpiarlo cuando el usuario vuelva a iniciar sesion de subusuario en `/select-user`.

## Cambios de Implementacion

### Dashboard

Agregar un componente de onboarding en el dashboard para cuentas nuevas o sin actividad.

Debe calcular:

- Cantidad de productos activos.
- Cantidad de ventas no canceladas.
- Si el onboarding fue saltado o completado.

### Producto Express

Crear una accion server para crear producto express reutilizando la logica existente de productos siempre que sea posible.

Debe evitar duplicar reglas criticas como:

- Sanitizacion.
- Validacion de precio.
- Secuencia de producto.
- Registro de ajuste inicial de inventario.
- Auditoria.

### Ventas

Permitir que la pantalla de ventas reciba contexto de onboarding, por ejemplo:

`/sales?onboardingProductId=PRODUCT_ID`

Con ese parametro, la pantalla debe buscar el producto, validar que pertenece a la cuenta y agregar automaticamente 1 unidad al carrito.

Reglas:

- Solo agregar el producto si esta activo y disponible para venta.
- No duplicarlo si ya fue agregado por el mismo parametro.
- Si el producto no existe o no esta disponible, mostrar un mensaje claro y dejar la pantalla de ventas normal.
- Despues de agregarlo al carrito, mantener el usuario en ventas para que solo tenga que confirmar la venta.

### Cierre

Despues de crear la primera venta durante onboarding:

- Marcar onboarding como completado.
- Mostrar mensaje final.
- Incluir enlace a `/como-usar-la-plataforma`.

## Medicion

Agregar metricas para entender donde se estan cayendo los usuarios.

La medicion del MVP debe guardarse principalmente en `AccountOnboarding` y completarse con datos existentes de `Account`, `User`, `Product` y `Sale`. No crear una tabla de eventos separada en esta primera version.

Estados importantes y donde guardarlos:

- Cuenta creada: `Account.createdAt`.
- Usuario ADMIN creado: primer `User` owner de la cuenta.
- Onboarding visto: `AccountOnboarding.firstSeenAt`.
- Onboarding saltado: `AccountOnboarding.lastSkippedAt`.
- Producto express creado: `AccountOnboarding.firstProductId` y `AccountOnboarding.productExpressCreatedAt`.
- Primera venta creada: `AccountOnboarding.firstSaleId` y `AccountOnboarding.firstSaleCreatedAt`.
- Onboarding completado: `AccountOnboarding.completedAt`.

En super-admin seria util ver:

- Cuentas sin productos.
- Cuentas con productos pero sin ventas.
- Cuentas con primera venta.
- Tiempo promedio desde registro hasta primer producto.
- Tiempo promedio desde registro hasta primera venta.

## Pruebas

Escenarios a probar:

- Cuenta nueva sin productos ve onboarding en dashboard.
- Cuenta con productos pero sin ventas ve paso de primera venta.
- Cuenta con ventas no ve onboarding inicial.
- Producto express crea producto vendible correctamente.
- Producto express con costo vacio guarda `costCents` usando el precio de venta como default.
- Producto express funciona en movil.
- Despues de crear producto, el usuario llega a ventas con contexto correcto.
- Al entrar a `/sales?onboardingProductId=...`, se agrega automaticamente 1 unidad al carrito.
- Refrescar ventas no debe duplicar el producto en el carrito.
- Primera venta marca onboarding como completado.
- El mensaje final muestra el enlace a `/como-usar-la-plataforma`.
- Saltar por ahora oculta el onboarding solo hasta el proximo login sin completar el flujo.
- Usuarios existentes con productos y ventas no son afectados.

## Supuestos

- La activacion principal sera primera venta real.
- El flujo sera guiado pero saltable.
- El metodo principal para evitar el catalogo vacio sera producto express.
- No se usaran productos demo como ruta principal.
- La importacion por Excel puede seguir existiendo, pero no sera el primer paso recomendado.
- El onboarding debe priorizar velocidad y claridad sobre explicar todas las funciones.

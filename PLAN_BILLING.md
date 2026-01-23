# Plan de Billing (v1)
Fecha: 23 de enero de 2026
Zona horaria: America/Santo_Domingo

## 1) Objetivo
Implementar cobro mensual con 15 dias de prueba, dos monedas (DOP y USD) y dos metodos de pago:
- USD: tarjeta con Lemon Squeezy.
- DOP: transferencia bancaria con comprobante.
Incluye avisos, bloqueo por falta de pago, recibos internos y envio por email.

## 2) Reglas de negocio confirmadas
- Trial: 15 dias, inicia al crear la primera subcuenta admin.
- Si pagan durante el trial: el ciclo mensual inicia cuando termina el trial.
- Fin de trial sin pago: bloqueo total con mensaje para elegir plan y metodo.
- Ciclo mensual: inicia el dia de alta (billing anchor).
- Cambio de DOP a USD (o viceversa): se aplica en la proxima fecha de facturacion.
- DOP 1300 incluye impuestos.
- Transferencia DOP: 3 dias de gracia con avisos.
- Comprobantes: acceso se habilita al subir el primer comprobante; verificacion puede ser posterior.
- Si comprobantes son rechazados luego: bloqueo.
- Notificaciones: email + in-app.
- Recibo: interno (sin NCF), requiere cedula/RNC, nombre legal y direccion.
- Plan unico por ahora.

## 3) Entidades y datos (modelo propuesto)
### BillingSubscription (1:1 con Account)
- status: trialing | active | grace | blocked | canceled
- currency: DOP | USD
- provider: manual | lemon
- trialStartedAt, trialEndsAt
- currentPeriodStartsAt, currentPeriodEndsAt
- graceEndsAt
- pendingCurrency, pendingProvider (para cambios en proximo ciclo)
- manualVerificationStatus: pending | approved | rejected
- manualAccessGrantedAt (cuando sube primer comprobante)
- lemonCustomerId, lemonSubscriptionId

### BillingProfile (1:1 con Account)
- legalName
- taxId (cedula o RNC)
- address
- email
- phone (opcional)

### BillingPayment
- subscriptionId
- amountCents, currency
- provider (manual/lemon)
- status: pending | paid | failed | rejected
- paidAt
- reference (transferencia)
- externalId (invoice/subscription id en Lemon)

### BillingPaymentProof (0..n por pago)
- paymentId
- url
- uploadedAt
- amountCents (monto del comprobante)
- note (opcional)

### BillingReceipt
- receiptNumber (interno)
- paymentId
- issuedAt
- emailSentAt

### BillingNotification (opcional)
- accountId
- type (trial_7, trial_3, due_3, due_1, grace_2, etc)
- channel (email, in_app)
- sentAt

## 4) Estados y transiciones
### Trialing
- inicia al crear primera subcuenta admin.
- si paga durante trial: se agenda inicio del periodo al terminar trial.
- si termina y no hay pago: pasa a blocked.

### Active
- usuario con pago valido (USD via Lemon o DOP con comprobante subido).
- si llega currentPeriodEndsAt sin pago:
  - entra en grace (3 dias).

### Grace
- acceso permitido pero con avisos.
- si no paga y termina graceEndsAt: pasa a blocked.

### Blocked
- acceso total bloqueado excepto pagina de billing.
- desbloquea al registrar pago valido o comprobante inicial (manual).

### Manual verification
- al subir primer comprobante: status puede seguir active, manualVerificationStatus=pending.
- si luego se rechaza: pasar a blocked.

## 5) Flujos principales
### A) Alta + Trial
1. Crear primera subcuenta admin.
2. Crear BillingSubscription con status=trialing.
3. Guardar trialStartedAt y trialEndsAt (= +15 dias).
4. Mostrar banner de dias restantes.

### B) Pago USD (Lemon Squeezy)
1. Usuario elige USD y paga con tarjeta.
2. Lemon envia webhook (invoice_paid / subscription_updated).
3. Crear BillingPayment (paid) + BillingReceipt.
4. Actualizar BillingSubscription:
   - provider=lemon, status=active
   - currentPeriodStartsAt y currentPeriodEndsAt
5. Enviar recibo por email.

### C) Pago DOP (Transferencia)
1. Usuario ve datos bancarios.
2. Sube primer comprobante (UploadThing).
3. Crear BillingPayment (pending) + BillingPaymentProof.
4. Activar acceso inmediato:
   - status=active, manualVerificationStatus=pending,
   - manualAccessGrantedAt=now
5. (Cuando exista panel admin) aprobar o rechazar:
   - si approve: marcar pago como paid + generar recibo.
   - si reject: bloquear.

### D) Cambio de moneda
1. Usuario solicita cambio a otra moneda/metodo.
2. Guardar pendingCurrency/pendingProvider.
3. Aplicar en el siguiente ciclo (currentPeriodEndsAt).

## 6) Billing engine (tarea diaria)
- Corre diario (cron o job).
- Revisa trialEndsAt y currentPeriodEndsAt.
- Genera status:
  - trial vencido sin pago -> blocked.
  - fin de periodo sin pago -> grace + graceEndsAt=+3 dias.
  - fin de gracia sin pago -> blocked.
- Dispara notificaciones segun calendario.

## 7) Notificaciones
### Trial
- 7, 3, 2, 1 dias antes de trialEndsAt.
- Dia 0: aviso de bloqueo si no pago.

### Vencimiento
- 3, 2, 1 dias antes de currentPeriodEndsAt.
- Dia 0: inicia gracia.

### Gracia
- 2, 1 dias antes de graceEndsAt.
- Dia 0: bloqueo.

Canales:
- Email (Resend).
- In-app (banner o toast persistente).

## 8) UI requerida
- Pagina /billing
  - estado actual, dias restantes, moneda y plan.
  - boton pagar USD (Lemon).
  - seccion transferencia DOP con datos bancarios.
  - subir comprobantes (UploadThing).
  - historial de pagos y recibos.
- Banner global con conteo de dias (trial o gracia).
- Pagina de bloqueo con CTA a /billing.

## 9) Recibos
- Recibo interno (sin NCF) por cada pago confirmado.
- Datos en recibo: legalName, taxId, address, monto, moneda, fecha.
- Envio automatico por email (Resend).

## 10) Seguridad y control
- Verificar firmas de webhooks Lemon.
- Validar archivos de comprobantes (tamano/tipo).
- Auditoria de cambios de estado.
- Evitar exponer datos bancarios sensibles.

## 11) Configuracion requerida (pendiente de completar)
### Resend
- RESEND_API_KEY
- EMAIL_FROM (ej: facturacion@tu-dominio.com)

### Lemon Squeezy
- LEMON_STORE_ID
- LEMON_VARIANT_ID_USD
- LEMON_WEBHOOK_SECRET

### Transferencias
- Banco, tipo de cuenta, numero, nombre, referencia.

### UploadThing
- Endpoint para comprobantes (nuevo) + limites de tamano.

## 12) Fases sugeridas (sin implementar aun)
1. Migracion Prisma + modelos de billing.
2. Servicio de billing (calculo de estado y fechas).
3. UI /billing + bloqueo en middleware/layout.
4. UploadThing para comprobantes.
5. Webhooks Lemon.
6. Emails con Resend.
7. Cron diario para notificaciones.

## 13) Pruebas minimas
- Trial -> bloquea en dia 16.
- Pago en trial -> ciclo inicia al final del trial.
- Vencimiento -> gracia 3 dias -> bloqueo.
- Manual: subir primer comprobante -> acceso inmediato.
- Rechazo manual -> bloqueo.
- Cambio de moneda -> aplica en siguiente ciclo.

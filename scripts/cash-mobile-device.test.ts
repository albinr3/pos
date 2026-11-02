import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { cashDeviceHashFromRequest, cashHash } from '../src/lib/cash-context'

test('la web conserva su cookie de dispositivo', () => {
  const request = new NextRequest('https://movopos.com/api/cash-shifts', { headers: { cookie: 'movopos-cash-device=web-token' } })
  assert.equal(cashDeviceHashFromRequest(request), cashHash('web-token'))
})

test('el móvil usa el encabezado solo con ambas credenciales', () => {
  const authenticated = new NextRequest('https://movopos.com/api/cash-shifts', { headers: {
    cookie: 'movopos-cash-device=web-token', 'x-cash-device-token': 'mobile-token',
    'x-subuser-token': 'subuser', 'x-clerk-authorization': 'Bearer clerk',
  } })
  assert.equal(cashDeviceHashFromRequest(authenticated), cashHash('mobile-token'))
  const missingSubuser = new NextRequest('https://movopos.com/api/cash-shifts', { headers: {
    'x-cash-device-token': 'mobile-token', 'x-clerk-authorization': 'Bearer clerk',
  } })
  assert.equal(cashDeviceHashFromRequest(missingSubuser), '')
})

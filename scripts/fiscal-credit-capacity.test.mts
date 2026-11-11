import test from "node:test"
import assert from "node:assert/strict"
// El proyecto transpila estos módulos como CommonJS; la importación dinámica conserva sus exports en Node.
const { creditCapacity, validateCreditUses, CreditCapacityError } = await import("../src/lib/fiscal/core/credit-capacity")

const original = [
  { position: 1, quantity: "3.00", grossCents: 30000 },
  { position: 2, quantity: "1.00", grossCents: 11800 },
]
const use = (originalLine: number, quantity: string, physicalQuantity: string, amountCents: number) => ({ originalLine, quantity, physicalQuantity, amountCents })

test("una reducción financiera consume importe, pero no unidades físicas", () => {
  const previous = [use(1, "1.00", "0.00", 3000)]
  assert.deepEqual(creditCapacity(original, previous)[0], { originalLine: 1, availableQuantity: "3.00", availableCents: 27000 })
  assert.throws(() => validateCreditUses(original, previous, [use(1, "1.00", "1.00", 10000)], "3"), CreditCapacityError)
  assert.deepEqual(validateCreditUses(original, previous, [use(1, "1.00", "1.00", 9000)], "3")[0], { originalLine: 1, availableQuantity: "2.00", availableCents: 18000 })
})

test("las devoluciones sucesivas no exceden cantidad ni importe reservado", () => {
  const previous = [use(1, "1.00", "1.00", 10000), use(1, "1.00", "1.00", 10000)]
  assert.throws(() => validateCreditUses(original, previous, [use(1, "2.00", "2.00", 10000)], "3"), CreditCapacityError)
  assert.throws(() => validateCreditUses(original, previous, [use(1, "1.00", "1.00", 10001)], "3"), CreditCapacityError)
  assert.equal(validateCreditUses(original, previous, [use(1, "1.00", "1.00", 10000)], "3")[0].availableCents, 0)
})

test("la anulación total compara el remanente fiscal de todas las líneas", () => {
  const previous = [use(1, "1.00", "1.00", 10000)]
  assert.throws(() => validateCreditUses(original, previous, [use(1, "2.00", "2.00", 20000)], "1"), /remanente|restante/)
  const result = validateCreditUses(original, previous, [use(1, "2.00", "2.00", 20000), use(2, "1.00", "1.00", 11800)], "1")
  assert.ok(result.every(line => line.availableCents === 0))
})

test("la última devolución física absorbe el centavo acumulado sin superar el saldo", () => {
  const lines = [{ position: 1, quantity: "3.00", grossCents: 13 }]
  const previous = [use(1, "1", "1", 4), use(1, "1", "1", 4)]
  assert.equal(validateCreditUses(lines, previous, [use(1, "1", "1", 5)], "1")[0].availableCents, 0)
  assert.throws(() => validateCreditUses(lines, previous, [use(1, "1", "1", 6)], "1"), CreditCapacityError)
  assert.throws(() => validateCreditUses(lines, [], [use(1, "1", "1", 5)], "3"), CreditCapacityError)
})

test("corrección de texto no mueve importes ni productos", () => {
  assert.doesNotThrow(() => validateCreditUses(original, [], [use(1, "1.00", "0.00", 0)], "2"))
  assert.throws(() => validateCreditUses(original, [], [use(1, "1.00", "1.00", 0)], "2"), CreditCapacityError)
  assert.throws(() => validateCreditUses(original, [], [use(1, "1.00", "0.00", 1)], "2"), CreditCapacityError)
})

test("rechaza duplicados, decimales excesivos y reservas inconsistentes", () => {
  assert.throws(() => validateCreditUses(original, [], [use(1, "1", "0", 1), use(1, "1", "0", 1)], "3"), CreditCapacityError)
  assert.throws(() => validateCreditUses(original, [], [use(1, "1.001", "0", 1)], "3"), CreditCapacityError)
  assert.throws(() => creditCapacity(original, [use(4, "1", "0", 1)]), CreditCapacityError)
  assert.throws(() => creditCapacity(original, [use(1, "3", "3", 30001)]), CreditCapacityError)
})

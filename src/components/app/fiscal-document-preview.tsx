type DocumentPreview = {
  type: string; issueDate: string; currency: { operation: string }; warnings: string[]
  lines: Array<{ description: string; quantity: string; base: string; tax: string; gross: string }>
  totals: { gross: string; tax: string; taxNotCreditable: string; creditEligible: string; withheld: string; withheldByKind: { ISR: string; ITBIS: string }; net: string }
}
export function FiscalDocumentPreview({ document }: { document: DocumentPreview }) {
  return <section aria-label="Previsualización fiscal">
    <h3>{document.type} · {document.issueDate}</h3>
    {document.warnings.map(warning => <p key={warning}>{warning}</p>)}
    <table><thead><tr><th>Concepto</th><th>Cantidad</th><th>Base</th><th>Impuesto</th><th>Total</th></tr></thead>
      <tbody>{document.lines.map((line, i) => <tr key={i}><td>{line.description}</td><td>{line.quantity}</td><td>{line.base}</td><td>{line.tax}</td><td>{line.gross}</td></tr>)}</tbody></table>
    <p>Moneda: {document.currency.operation} · Total: {document.totals.gross} · Impuesto: {document.totals.tax} · Retenciones: {document.totals.withheld} · Neto: {document.totals.net}</p>
    <p>Retención ISR: {document.totals.withheldByKind.ISR} · Retención ITBIS: {document.totals.withheldByKind.ITBIS}</p>
    {document.totals.taxNotCreditable !== "0.00" && <p>ITBIS no reembolsable: {document.totals.taxNotCreditable} · Importe elegible: {document.totals.creditEligible}</p>}
  </section>
}
export function FiscalFieldErrors({ errors }: { errors: Array<{ field: string; message: string }> }) {
  if (!errors.length) return null
  return <ul role="alert">{errors.map((error, i) => <li key={`${error.field}-${i}`}>{error.field}: {error.message}</li>)}</ul>
}

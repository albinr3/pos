declare module 'jspdf-autotable' {
  import { jsPDF } from 'jspdf'

  interface AutoTableOptions {
    startY?: number
    head?: any[][]
    body?: any[][]
    theme?: 'striped' | 'grid' | 'plain'
    styles?: any
    headStyles?: any
    columnStyles?: any
    didParseCell?: (data: any) => void
    [key: string]: any
  }

  function autoTable(doc: jsPDF, options: AutoTableOptions): void

  export default autoTable
}

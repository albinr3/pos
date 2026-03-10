export type RecipeApplyScope = "ONE" | "ALL"

export type RecipeAdjustmentLike = {
  ingredientId: string
  adjustmentType: "SIN" | "EXTRA"
}

type RecipeCartLine<TAdjustment extends RecipeAdjustmentLike = RecipeAdjustmentLike> = {
  lineId: string
  productId: string
  qty: number
  recipeAdjustments: TAdjustment[]
}

export function sortRecipeAdjustments<TAdjustment extends RecipeAdjustmentLike>(recipeAdjustments: TAdjustment[]) {
  return [...recipeAdjustments].sort((a, b) => {
    const left = `${a.ingredientId}:${a.adjustmentType}`
    const right = `${b.ingredientId}:${b.adjustmentType}`
    return left.localeCompare(right)
  })
}

export function applyRecipeAdjustmentsWithScope<
  TAdjustment extends RecipeAdjustmentLike,
  TLine extends RecipeCartLine<TAdjustment>
>(params: {
  lines: TLine[]
  lineId: string
  recipeAdjustments: TAdjustment[]
  scope: RecipeApplyScope
  buildLineId: (productId: string, recipeAdjustments: TAdjustment[]) => string
  splitQty?: number
}) {
  const { lines, lineId, scope, buildLineId } = params
  const normalizedAdjustments = sortRecipeAdjustments(params.recipeAdjustments)
  const targetIndex = lines.findIndex((line) => line.lineId === lineId)
  if (targetIndex < 0) return lines

  const targetLine = lines[targetIndex]
  const updatedLineId = buildLineId(targetLine.productId, normalizedAdjustments)
  const splitQty = Math.max(0, Math.min(params.splitQty ?? 1, targetLine.qty))
  const shouldSplitOneUnit = scope === "ONE" && splitQty > 0 && targetLine.qty > splitQty

  if (!shouldSplitOneUnit) {
    const updatedLine: TLine = {
      ...targetLine,
      lineId: updatedLineId,
      recipeAdjustments: normalizedAdjustments,
    }

    if (updatedLineId === lineId) {
      return lines.map((line) => (line.lineId === lineId ? updatedLine : line))
    }

    const duplicateLine = lines.find((line) => line.lineId === updatedLineId && line.lineId !== lineId)
    if (duplicateLine) {
      return lines.flatMap((line) => {
        if (line.lineId === lineId) return []
        if (line.lineId === updatedLineId) {
          return [{ ...line, qty: line.qty + targetLine.qty } as TLine]
        }
        return [line]
      })
    }

    return lines.map((line) => (line.lineId === lineId ? updatedLine : line))
  }

  if (updatedLineId === lineId) return lines

  const movedLine: TLine = {
    ...targetLine,
    lineId: updatedLineId,
    qty: splitQty,
    recipeAdjustments: normalizedAdjustments,
  }
  const nextLines = [...lines]
  const remainingQty = targetLine.qty - splitQty

  if (remainingQty > 0) {
    nextLines[targetIndex] = { ...targetLine, qty: remainingQty }
  } else {
    nextLines.splice(targetIndex, 1)
  }

  const duplicateIndex = nextLines.findIndex((line) => line.lineId === updatedLineId)
  if (duplicateIndex >= 0) {
    nextLines[duplicateIndex] = {
      ...nextLines[duplicateIndex],
      qty: nextLines[duplicateIndex].qty + splitQty,
    }
    return nextLines
  }

  const insertIndex = Math.min(targetIndex + 1, nextLines.length)
  nextLines.splice(insertIndex, 0, movedLine)
  return nextLines
}

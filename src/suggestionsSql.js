// Dos juegos de resultados, en un viaje: OFs consultadas e historial de sus artículos.
// TOP 21 permite quitar la propia OF y conservar hasta 20 precedentes.
// RealEndDate no acredita el cierre: en RPS también está rellenada en OFs detenidas.
export function suggestionsSql(parameters) {
  return `
    SELECT m.IDManufacturingOrder AS id, m.CodManufacturingOrder AS ofCode,
      m.IDArticle AS articleId, a.CodArticle AS article, m.Quantity AS units
    FROM dbo.CPRManufacturingOrder m
    LEFT JOIN dbo.STKArticle a ON a.IDArticle = m.IDArticle
    WHERE m.CodCompany = @company AND m.CodManufacturingOrder IN (${parameters.join(',')});

    WITH targets AS (
      SELECT DISTINCT m.IDArticle AS articleId FROM dbo.CPRManufacturingOrder m
      WHERE m.CodCompany = @company AND m.CodManufacturingOrder IN (${parameters.join(',')})
    )
    SELECT articles.articleId, h.CodManufacturingOrder AS ofCode, h.Quantity AS units,
      a.CodArticle AS code, a.Description AS description, SUM(i.Quantity) AS quantity
    FROM targets articles
    CROSS APPLY (
      SELECT TOP (@historyLimit) m.IDManufacturingOrder, m.CodManufacturingOrder, m.Quantity, m.PlannedStartDate
      FROM dbo.CPRManufacturingOrder m
      WHERE m.CodCompany = @company AND m.IDArticle = articles.articleId AND m.Quantity > 0
        AND m.PlannedStartDate >= DATEADD(year, -@years, GETDATE())
        AND m.PlannedStartDate <= GETDATE()
        AND (EXISTS (
          SELECT 1 FROM dbo.CPRManufacturingOrderSituation situation
          WHERE situation.IDManufacturingOrderSituation = m.IDMOSituation AND situation.SituationType = 4
        ) OR EXISTS (
          SELECT 1 FROM dbo.CPRImputationMaterialMO consumed WHERE consumed.IDManufacturingOrder = m.IDManufacturingOrder
        ))
      ORDER BY m.PlannedStartDate DESC, m.CodManufacturingOrder DESC
    ) h
    LEFT JOIN dbo.CPRImputationMaterialMO i ON i.IDManufacturingOrder = h.IDManufacturingOrder
    LEFT JOIN dbo.STKArticle a ON a.IDArticle = i.IDArticle
    GROUP BY articles.articleId, h.CodManufacturingOrder, h.Quantity, h.PlannedStartDate, a.CodArticle, a.Description
    ORDER BY articles.articleId, h.PlannedStartDate DESC, h.CodManufacturingOrder DESC;
  `;
}

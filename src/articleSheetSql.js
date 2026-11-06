// Lotes de solo lectura para SQL Server 2014. Q1–Q13 contrastadas en el informe de la ficha.
export const openingSql = `
SELECT a.IDArticle,a.IDUnitQuantityWarehouse, a.CodArticle,a.Description,g.CodArticle GenericCode,g.Description GenericDescription,f.Description Family,sf.Description Subfamily,u.CodMeasureUnit StockUnit,u.Description StockUnitDescription,up.CodMeasureUnit PurchaseQuantityUnit,upp.CodMeasureUnit PurchasePriceUnit,a.SeriesControl,a.LocationWarehouseControl,a.InactiveDate,a.TechnicalDescription,a.Notes,a.NetWeight,a.GrossWeight,a.CodArticlePrevious,a.HSCode,c.NormaUNE,c.SeccionDeProduccion,c.FichaSeguridad,c.UnoIgualNoImputable,d.BlockedPurchase,d.BlockedManufacturing,d.BlockedSales,d.BlockedMaintenance
 FROM STKArticle a LEFT JOIN STKArticle g ON g.IDArticle=a.IDArticleGeneric AND g.CodCompany=a.CodCompany
 LEFT JOIN GENProductFamily f ON f.IDProductFamily=a.IDProductFamily AND f.CodCompany=a.CodCompany
 LEFT JOIN GENProductSubFamily sf ON sf.IDProductSubFamily=a.IDProductSubFamily AND sf.CodCompany=a.CodCompany
 LEFT JOIN GENMeasureUnit u ON u.IDMeasureUnit=a.IDUnitQuantityWarehouse AND u.CodCompany=a.CodCompany
 LEFT JOIN GENMeasureUnit up ON up.IDMeasureUnit=a.IDUnitQuantityPurchase AND up.CodCompany=a.CodCompany
 LEFT JOIN GENMeasureUnit upp ON upp.IDMeasureUnit=a.IDUnitPricePurchase AND upp.CodCompany=a.CodCompany
 LEFT JOIN _STKArticle_Custom c ON c.IDArticle=a.IDArticle
 LEFT JOIN STKArticleDetail d ON d.IDArticle=a.IDArticle AND d.CodCompany=a.CodCompany AND d.Type=1
 WHERE a.CodCompany=@company AND a.IDArticle=@idArticle;
 SELECT v.Slot,at.CodAttribute,at.Description AttributeName,av.CodAttributeValue,av.Description AttributeValue,av.Comment,av.Enabled
 FROM STKArticle a CROSS APPLY (VALUES (1,a.IDAttributeValue1),(2,a.IDAttributeValue2),(3,a.IDAttributeValue3)) v(Slot,ValueID)
 JOIN STKAttributeValue av ON av.IDAttributeValue=v.ValueID AND av.CodCompany=a.CodCompany
 JOIN STKAttribute at ON at.IDAttribute=av.IDAttribute AND at.CodCompany=av.CodCompany
 WHERE a.CodCompany=@company AND a.IDArticle=@idArticle ORDER BY v.Slot;
;

    SELECT
      a.IDArticle AS idArticle,
      a.CodArticle AS code,
      a.Description AS description,
      w.CodWarehouse AS warehouseCode,
      w.Description AS warehouse,
      lw.CodLocationWarehouse AS locationCode,
      lw.Description AS location,
      s.Series AS series,
      s.Stock AS quantity,
      s.LastEntryDate AS lastEntryDate,
      s.LastMovementDate AS lastMovementDate
    FROM dbo.STKStock s
    JOIN dbo.STKArticle a
      ON a.IDArticle = s.IDArticle
      AND a.CodCompany = s.CodCompany
    JOIN dbo.GENWarehouse w
      ON w.IDWarehouse = s.IDWarehouse
      AND w.CodCompany = s.CodCompany
    LEFT JOIN dbo.STKLocationWarehouse lw
      ON lw.IDLocationWarehouse = s.IDLocationWarehouse
      AND lw.CodCompany = s.CodCompany
    WHERE s.CodCompany = @company
      AND s.IDArticle = @idArticle
      AND s.Stock <> 0
      AND w.ClosedDate IS NULL
      AND (w.InactiveDate IS NULL OR w.InactiveDate > GETDATE())
    ORDER BY
      w.Description,
      lw.CodLocationWarehouse,
      s.Series,
      s.LastMovementDate DESC;
  
;
SELECT d.Type,d.StockMin,d.PointOrder,d.PurchaseLot,d.DeliveryDays,d.PurchasePrice,d.PurchaseDate,d.AveragePrice,d.IDSupplier,s.CodSupplier,s.Description Supplier,d.GrammagePLNR,d.TextNoticePurchase,d.TextNoticeSales
 FROM STKArticleDetail d LEFT JOIN PURSupplier s ON s.IDSupplier=d.IDSupplier AND s.CodCompany=d.CodCompany WHERE d.CodCompany=@company AND d.IDArticle=@idArticle AND d.Type=1;
 SELECT sa.IDSupplierArticle,s.CodSupplier,s.Description Supplier,sa.ReferenceSupplier,sa.DescriptionSupplier,sa.[Default],sa.Blocked,sa.Ean13,sa.TechnicalDescription,sd.DeliveryDays SupplierDeliveryDays,sa.IDCurrency
 FROM PURSupplierArticle sa JOIN PURSupplier s ON s.IDSupplier=sa.IDSupplier AND s.CodCompany=sa.CodCompany LEFT JOIN PURSupplierDetail sd ON sd.IDSupplier=s.IDSupplier AND sd.CodCompany=s.CodCompany
 WHERE sa.CodCompany=@company AND sa.IDArticle=@idArticle ORDER BY sa.[Default] DESC,s.CodSupplier;
 SELECT sa.IDSupplier,dl.QuantityFrom,dl.IDUnitQuantity,dl.DeliveryDays FROM PURSupplierArticle sa JOIN PURSupplierArticleDelivery dl ON dl.IDSupplierArticle=sa.IDSupplierArticle AND dl.CodCompany=sa.CodCompany WHERE sa.CodCompany=@company AND sa.IDArticle=@idArticle;
;
SELECT o.CodOrder,o.OrderDate,o.Status,o.SituationType,o.Historic,os.Description OrderSituation,s.Description Supplier,l.NumLine,l.Quantity,l.ReceivedQuantity,l.Quantity-l.ReceivedQuantity PendingQuantity,l.IDUnitQuantity,l.ConversionFactorQuantity,l.ReceptionDate ExpectedDate,l.ReceptionDemandDate RequestedDate,l.ReferenceSupplier,l.PendingReceive,l.Received
 FROM PUROrderLine l JOIN PUROrder o ON o.IDOrder=l.IDOrder AND o.CodCompany=l.CodCompany
 LEFT JOIN PUROrderSituation os ON os.IDOrderSituation=o.IDOrderSituation AND os.CodCompany=o.CodCompany
 LEFT JOIN PURSupplier s ON s.IDSupplier=o.IDSupplier AND s.CodCompany=o.CodCompany
 WHERE l.CodCompany=@company AND l.IDArticle=@idArticle AND o.Historic=0 AND l.PendingReceive=1 AND l.Received=0 AND l.Quantity>l.ReceivedQuantity AND o.SituationType=0 AND (os.SituationType=0 OR os.IDOrderSituation IS NULL)
 ORDER BY l.ReceptionDate,o.CodOrder,l.NumLine;
;
SELECT CASE WHEN ed.EntityID=a.IDArticle THEN 'articulo' ELSE 'generico' END Origin,ed.IDEntityDocument,ed.Description,ed.Path,ed.IDDocument,d.CodDocument,d.Description DocumentDescription,d.Path DocumentPath,d.DocFileName,d.Version,d.RevisionNumber,d.Deleted
 FROM STKArticle a JOIN GENEntityDocument ed ON ed.EntityID IN (a.IDArticle,a.IDArticleGeneric) AND ed.CodCompany=a.CodCompany AND ed.EntityType='Article'
 LEFT JOIN GENDocument d ON d.IDDocument=ed.IDDocument AND d.CodCompany=ed.CodCompany WHERE a.CodCompany=@company AND a.IDArticle=@idArticle ORDER BY Origin,ed.[Order];
 SELECT CASE WHEN a.Image IS NULL THEN 0 ELSE DATALENGTH(a.Image) END ImageBytes,CASE WHEN g.Image IS NULL THEN 0 ELSE DATALENGTH(g.Image) END GenericImageBytes FROM STKArticle a LEFT JOIN STKArticle g ON g.IDArticle=a.IDArticleGeneric AND g.CodCompany=a.CodCompany WHERE a.CodCompany=@company AND a.IDArticle=@idArticle;
;
SELECT m.CodManufacturingOrder,ms.Description Situation,r.ItemType,r.Quantity ReservedQuantity,s.Series,w.CodWarehouse,mm.IDMOMaterial
 FROM STKStockReserve r JOIN STKStock s ON s.IDStock=r.IDStock AND s.CodCompany=r.CodCompany
 JOIN GENWarehouse w ON w.IDWarehouse=s.IDWarehouse AND w.CodCompany=s.CodCompany
 JOIN CPRMOMaterial mm ON mm.IDMOMaterial=r.IDItem AND mm.CodCompany=r.CodCompany AND mm.IDArticle=s.IDArticle
 JOIN CPRMOTask t ON t.IDMOTask=mm.IDMOTask AND t.CodCompany=mm.CodCompany
 JOIN CPRManufacturingOrder m ON m.IDManufacturingOrder=t.IDManufacturingOrder AND m.CodCompany=t.CodCompany
 JOIN CPRManufacturingOrderSituation ms ON ms.IDManufacturingOrderSituation=m.IDMOSituation AND ms.CodCompany=m.CodCompany
 WHERE s.CodCompany=@company AND s.IDArticle=@idArticle AND r.ItemType=5 AND r.Quantity>0 AND ms.SituationType IN (1,2) AND m.Historic=0 AND (m.RealEndDate IS NULL OR m.RealEndDate<'19010101') AND t.Canceled=0 AND mm.Completed=0 AND w.ClosedDate IS NULL AND (w.InactiveDate IS NULL OR w.InactiveDate>GETDATE()) ORDER BY m.CodManufacturingOrder,s.Series;
;
SELECT TOP 1 h.CodDeliveryNote,h.DeliveryNoteDate,s.Description Supplier,h.IDCurrency,a.IDUnitPricePurchase IDUnitPrice,l.ConversionFactorPrice PriceConversion,l.Quantity,l.MovementQuantity,l.Price DocumentPrice,l.MovementPrice StockMovementPrice,l.ConversionFactorPrice,l.ReferenceSupplier,l.Discount1,l.Discount2,l.Discount3,l.Discount4,l.Discount5
 FROM PURDeliveryNoteLine l JOIN STKArticle a ON a.IDArticle=l.IDArticle AND a.CodCompany=l.CodCompany JOIN PURDeliveryNote h ON h.IDDeliveryNote=l.IDDeliveryNote AND h.CodCompany=l.CodCompany
 LEFT JOIN PURSupplier s ON s.IDSupplier=h.IDSupplier AND s.CodCompany=h.CodCompany
 WHERE l.CodCompany=@company AND l.IDArticle=@idArticle AND l.MovementQuantity>0 AND h.DeliveryNoteDate<=GETDATE() ORDER BY h.DeliveryNoteDate DESC,l.IDDeliveryNoteLine DESC;
;
SELECT s.Description Supplier,p.DateFrom,p.DateTo,p.QuantityFrom,p.IDUnitQuantity,sa.IDCurrency,p.Price,p.IDUnitPrice,p.Discount1,p.Discount2,p.Discount3,p.Discount4,p.Discount5,p.PurchaseLot,p.MinimumLot,p.ReferenceSupplier FROM PURSupplierArticle sa JOIN PURSupplier s ON s.IDSupplier=sa.IDSupplier AND s.CodCompany=sa.CodCompany JOIN PURSupplierArticlePrice p ON p.IDSupplierArticle=sa.IDSupplierArticle AND p.CodCompany=sa.CodCompany WHERE sa.CodCompany=@company AND sa.IDArticle=@idArticle ORDER BY p.DateFrom DESC,p.QuantityFrom;
;
SELECT IDMeasureUnit,CodMeasureUnit,Description FROM GENMeasureUnit WHERE CodCompany=@company;
SELECT IDCurrency,CodISO,CodCurrency,Symbol FROM GENCurrency WHERE CodCompany=@company;
SELECT IDCurrency FROM GENCompany WHERE CodCompany=@company;
`;

export const usageSql = `
SELECT COUNT(*) Imputations,COUNT(DISTINCT i.IDManufacturingOrder) ManufacturingOrders,COALESCE(SUM(i.Quantity),0) NetQuantity,COALESCE(SUM(CASE WHEN i.Quantity>0 THEN i.Quantity ELSE 0 END),0) PositiveQuantity,COALESCE(SUM(CASE WHEN i.Quantity<0 THEN i.Quantity ELSE 0 END),0) NegativeQuantity,MIN(i.ImputationDate) FirstDate,MAX(i.ImputationDate) LastDate,SUM(CASE WHEN i.IsRejectedQuantity=1 THEN i.Quantity ELSE 0 END) RejectedQuantity
 FROM CPRImputationMaterialMO i WHERE i.CodCompany=@company AND i.IDArticle=@idArticle AND i.ImputationDate>=DATEADD(month,-12,GETDATE()) AND i.ImputationDate<=GETDATE();
 WITH Consumption AS (SELECT i.IDManufacturingOrder,i.IDOrderLine FROM CPRImputationMaterialMO i WHERE i.CodCompany=@company AND i.IDArticle=@idArticle AND i.ImputationDate>=DATEADD(month,-12,GETDATE()) AND i.ImputationDate<=GETDATE()), OrderIDs AS (
 SELECT ol.IDOrder FROM Consumption i JOIN FACOrderLineSL ol ON ol.IDManufacturingOrder=i.IDManufacturingOrder AND ol.CodCompany=@company
 UNION SELECT ol.IDOrder FROM Consumption i JOIN FACOrderLineSL ol ON ol.IDOrderLine=i.IDOrderLine AND ol.CodCompany=@company)
 SELECT COUNT(*) LinkedSalesOrders FROM OrderIDs;
;
SELECT TOP 5 m.CodManufacturingOrder,m.Description,m.InternalCode,ms.Description Situation,MAX(i.ImputationDate) LastUse,SUM(i.Quantity) NetQuantity,
 (SELECT TOP 1 o.CodOrder FROM FACOrderLineSL ol JOIN FACOrderSL o ON o.IDOrder=ol.IDOrder AND o.CodCompany=ol.CodCompany WHERE ol.CodCompany=m.CodCompany AND ol.IDManufacturingOrder=m.IDManufacturingOrder ORDER BY o.OrderDate DESC) LinkedOrder
 FROM CPRImputationMaterialMO i JOIN CPRManufacturingOrder m ON m.IDManufacturingOrder=i.IDManufacturingOrder AND m.CodCompany=i.CodCompany LEFT JOIN CPRManufacturingOrderSituation ms ON ms.IDManufacturingOrderSituation=m.IDMOSituation AND ms.CodCompany=m.CodCompany
 WHERE i.CodCompany=@company AND i.IDArticle=@idArticle AND i.ImputationDate<=GETDATE() GROUP BY m.IDManufacturingOrder,m.CodCompany,m.CodManufacturingOrder,m.Description,m.InternalCode,ms.Description ORDER BY MAX(i.ImputationDate) DESC,m.CodManufacturingOrder DESC;
;
WITH Needs AS (
 SELECT m.CodManufacturingOrder,m.IDManufacturingOrder,m.PlannedStartDate,m.RealEndDate,ms.Description Situation,ms.SituationType,mm.IDMOMaterial,mm.Quantity,mm.QuantityImputed,mm.FixedQuantity,mm.Status,mm.MaterialType,mm.ManualConsumption,CASE WHEN mm.Quantity>COALESCE(mm.QuantityImputed,0) THEN mm.Quantity-COALESCE(mm.QuantityImputed,0) ELSE 0 END PendingQuantity
 FROM CPRMOMaterial mm JOIN CPRMOTask t ON t.IDMOTask=mm.IDMOTask AND t.CodCompany=mm.CodCompany JOIN CPRManufacturingOrder m ON m.IDManufacturingOrder=t.IDManufacturingOrder AND m.CodCompany=t.CodCompany JOIN CPRManufacturingOrderSituation ms ON ms.IDManufacturingOrderSituation=m.IDMOSituation AND ms.CodCompany=m.CodCompany
 WHERE mm.CodCompany=@company AND mm.IDArticle=@idArticle AND m.Historic=0 AND ms.SituationType IN (1,2) AND (m.RealEndDate IS NULL OR m.RealEndDate<'19010101') AND t.Canceled=0 AND mm.Completed=0 AND mm.Alternative=0)
 SELECT Situation,SituationType,COUNT(*) MaterialLines,COUNT(DISTINCT IDManufacturingOrder) ManufacturingOrders,SUM(Quantity) PlannedQuantity,SUM(QuantityImputed) ImputedQuantity,SUM(PendingQuantity) PendingQuantity,MIN(PlannedStartDate) OldestPlannedStart FROM Needs GROUP BY Situation,SituationType;
 SELECT TOP 5 m.CodManufacturingOrder,ms.Description Situation,mm.Quantity,mm.QuantityImputed,mm.Quantity-COALESCE(mm.QuantityImputed,0) PendingQuantity,mm.FixedQuantity,mm.Status,mm.ManualConsumption,m.PlannedStartDate
 FROM CPRMOMaterial mm JOIN CPRMOTask t ON t.IDMOTask=mm.IDMOTask AND t.CodCompany=mm.CodCompany JOIN CPRManufacturingOrder m ON m.IDManufacturingOrder=t.IDManufacturingOrder AND m.CodCompany=t.CodCompany JOIN CPRManufacturingOrderSituation ms ON ms.IDManufacturingOrderSituation=m.IDMOSituation AND ms.CodCompany=m.CodCompany
 WHERE mm.CodCompany=@company AND mm.IDArticle=@idArticle AND m.Historic=0 AND ms.SituationType IN (1,2) AND (m.RealEndDate IS NULL OR m.RealEndDate<'19010101') AND t.Canceled=0 AND mm.Completed=0 AND mm.Alternative=0 AND mm.Quantity>COALESCE(mm.QuantityImputed,0) ORDER BY m.PlannedStartDate,m.CodManufacturingOrder;
;
SELECT n.CodNonConformity,n.DoneDate,n.ClosedDate,ns.Description Status,n.TotalQuantity,n.RejectedQuantity,n.Severity,n.Repetitive,n.CodManufacturingOrder,n.CodOrder,s.Description Supplier
 FROM APQNonConformity n LEFT JOIN APQNCStatus ns ON ns.IDNCStatus=n.IDNCStatus AND ns.CodCompany=n.CodCompany LEFT JOIN PURSupplier s ON s.IDSupplier=n.IDSupplier AND s.CodCompany=n.CodCompany
 WHERE n.CodCompany=@company AND n.IDArticle=@idArticle ORDER BY n.DoneDate DESC,n.CodNonConformity DESC;
;
SELECT u.CodMeasureUnit Unit FROM STKArticle a LEFT JOIN GENMeasureUnit u ON u.IDMeasureUnit=a.IDUnitQuantityWarehouse AND u.CodCompany=a.CodCompany WHERE a.CodCompany=@company AND a.IDArticle=@idArticle;
`;

export const variantsSql = `
WITH Variants AS (
 SELECT b.IDArticle,b.CodArticle,b.Description,b.InactiveDate,u.CodMeasureUnit Unit,
 av1.Description Attribute1,av2.Description Attribute2,av3.Description Attribute3,
 d.BlockedPurchase,d.BlockedManufacturing,d.BlockedSales,d.BlockedMaintenance,
 COALESCE(st.Stock,0) Stock
 FROM STKArticle a JOIN STKArticle b ON b.IDArticleGeneric=a.IDArticleGeneric AND b.CodCompany=a.CodCompany
 LEFT JOIN GENMeasureUnit u ON u.IDMeasureUnit=b.IDUnitQuantityWarehouse AND u.CodCompany=b.CodCompany
 LEFT JOIN STKArticleDetail d ON d.IDArticle=b.IDArticle AND d.CodCompany=b.CodCompany AND d.Type=1
 LEFT JOIN STKAttributeValue av1 ON av1.IDAttributeValue=b.IDAttributeValue1 AND av1.CodCompany=b.CodCompany
 LEFT JOIN STKAttributeValue av2 ON av2.IDAttributeValue=b.IDAttributeValue2 AND av2.CodCompany=b.CodCompany
 LEFT JOIN STKAttributeValue av3 ON av3.IDAttributeValue=b.IDAttributeValue3 AND av3.CodCompany=b.CodCompany
 OUTER APPLY (SELECT SUM(s.Stock) Stock FROM STKStock s JOIN GENWarehouse w ON w.IDWarehouse=s.IDWarehouse AND w.CodCompany=s.CodCompany WHERE s.CodCompany=b.CodCompany AND s.IDArticle=b.IDArticle AND w.ClosedDate IS NULL AND (w.InactiveDate IS NULL OR w.InactiveDate>GETDATE())) st
 WHERE a.CodCompany=@company AND a.IDArticle=@idArticle
 AND (@filter='' OR CONCAT(b.CodArticle,' ',b.Description,' ',av1.Description,' ',av2.Description,' ',av3.Description) COLLATE Latin1_General_CI_AI LIKE @like ESCAPE '\\')
)
 SELECT *,COUNT(*) OVER() Total FROM Variants ORDER BY CASE WHEN IDArticle=@idArticle THEN 0 ELSE 1 END,CASE WHEN Stock>0 THEN 0 ELSE 1 END,CodArticle OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
`;
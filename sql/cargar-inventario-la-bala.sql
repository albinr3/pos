-- Carga de inventario para labalaminimarket@gmail.com desde INVENTARIO LA BALA.xlsx
-- Generado el 2026-10-21. Ejecuta el archivo completo en una sola sesion SQL.
-- Seguridad: se revierte todo si la cuenta no es unica o si falta costo, precio o existencia.
-- Los productos existentes (mismo nombre, ignorando mayusculas y espacios externos) no se modifican ni duplican.

BEGIN;

CREATE TEMP TABLE import_products (
  source_row integer NOT NULL,
  name text NOT NULL,
  cost_cents integer,
  price_cents integer,
  stock numeric(10,3),
  supplier_name text
) ON COMMIT DROP;

INSERT INTO import_products (source_row, name, cost_cents, price_cents, stock, supplier_name)
SELECT
  source_row,
  name,
  CASE WHEN cost IS NULL THEN NULL ELSE round(cost * 100)::integer END,
  CASE WHEN price IS NULL THEN NULL ELSE round(price * 100)::integer END,
  stock,
  supplier_name
FROM jsonb_to_recordset('[{"source_row":2,"name":"Cheetos Crunchy","cost":10.51,"price":15,"stock":50,"supplier_name":"FRITOLAY"},{"source_row":3,"name":"Doritos Nacho","cost":21.02,"price":30,"stock":30,"supplier_name":"FRITOLAY"},{"source_row":4,"name":"Confle Dollys","cost":10,"price":25,"stock":62,"supplier_name":"DOLLYS"},{"source_row":5,"name":"Volcan de Guayaba Dollys","cost":13,"price":25,"stock":25,"supplier_name":"DOLLYS"},{"source_row":6,"name":"Bizcocho de Piña Dollys","cost":13.33,"price":25,"stock":43,"supplier_name":"DOLLYS"},{"source_row":7,"name":"Bizcocho de Maiz","cost":16.66,"price":25,"stock":26,"supplier_name":"DOLLYS"},{"source_row":8,"name":"Sopa Issima","cost":37.31,"price":50,"stock":30,"supplier_name":"YUMMIES"},{"source_row":9,"name":"Libra de azucar","cost":31.95,"price":50,"stock":20,"supplier_name":"CESAR IGLESIA"},{"source_row":10,"name":"Harina de Maiz Dorama","cost":21.92,"price":30,"stock":25,"supplier_name":"CESAR IGLESIA"},{"source_row":11,"name":"Habichuelas Rica","cost":54,"price":70,"stock":8,"supplier_name":"RICA"},{"source_row":12,"name":"Spaguetti Fiorella","cost":33.52,"price":65,"stock":14,"supplier_name":"CESAR IGLESIA"},{"source_row":13,"name":"Coditos Fiorella","cost":33.52,"price":65,"stock":23,"supplier_name":"CESAR IGLESIA"},{"source_row":15,"name":"Arroz Campos 1lb","cost":63.04,"price":70,"stock":63,"supplier_name":"CND"},{"source_row":16,"name":"Aniz Dulce","cost":8.33,"price":10,"stock":16,"supplier_name":null},{"source_row":17,"name":"Canelilla","cost":8.33,"price":10,"stock":13,"supplier_name":null},{"source_row":18,"name":"Oregano en polvo","cost":8.33,"price":10,"stock":5,"supplier_name":null},{"source_row":19,"name":"Oregano entero","cost":8.33,"price":10,"stock":26,"supplier_name":null},{"source_row":20,"name":"Canela entera","cost":8.33,"price":10,"stock":1,"supplier_name":null},{"source_row":21,"name":"Nuez moscada entera","cost":8.33,"price":10,"stock":13,"supplier_name":null},{"source_row":22,"name":"Pimienta entera","cost":8.33,"price":10,"stock":6,"supplier_name":null},{"source_row":23,"name":"Huevos","cost":6.66,"price":10,"stock":192,"supplier_name":null},{"source_row":24,"name":"Mantequilla sobre","cost":9.35,"price":15,"stock":34,"supplier_name":null},{"source_row":25,"name":"Platanos","cost":20,"price":30,"stock":100,"supplier_name":null},{"source_row":26,"name":"Zambos crema y especias","cost":20.83,"price":25,"stock":10,"supplier_name":null},{"source_row":27,"name":"Zambos Madurito","cost":20.83,"price":25,"stock":9,"supplier_name":null},{"source_row":29,"name":"Taqueritos Chile Toreado","cost":16.66,"price":20,"stock":9,"supplier_name":null},{"source_row":32,"name":"Cappy Tornitos","cost":8.33,"price":10,"stock":22,"supplier_name":null},{"source_row":34,"name":"Platanitos Yummies OG","cost":20.83,"price":25,"stock":9,"supplier_name":null},{"source_row":35,"name":"Zambo Yukita","cost":20.83,"price":25,"stock":2,"supplier_name":null},{"source_row":37,"name":"Ajo en pasta sobre","cost":10,"price":15,"stock":17,"supplier_name":null},{"source_row":38,"name":"Pasta de tomate victorina sobre","cost":12.7,"price":20,"stock":28,"supplier_name":null},{"source_row":39,"name":"Sopa Maggie sobre","cost":20,"price":30,"stock":17,"supplier_name":null},{"source_row":40,"name":"Vinagre Econo","cost":10,"price":15,"stock":5,"supplier_name":"ALMACENES SAMUEL ABREU"},{"source_row":41,"name":"Doña gallina tomate","cost":8.33,"price":10,"stock":7,"supplier_name":null},{"source_row":42,"name":"Vainilla Econo","cost":10,"price":15,"stock":22,"supplier_name":"ALMACENES SAMUEL ABREU"},{"source_row":43,"name":"Salsa China","cost":50,"price":85,"stock":5,"supplier_name":null},{"source_row":44,"name":"Salsa Inglesa","cost":50,"price":85,"stock":5,"supplier_name":null},{"source_row":45,"name":"Paco Fish Tomate Gd","cost":105.62,"price":140,"stock":15,"supplier_name":null},{"source_row":46,"name":"Aceitunas","cost":50,"price":80,"stock":3,"supplier_name":null},{"source_row":47,"name":"Salsa de tomate Victorina lata peq","cost":42,"price":60,"stock":28,"supplier_name":null},{"source_row":48,"name":"Aceite el gallo 4oz","cost":18.26,"price":25,"stock":84,"supplier_name":null},{"source_row":49,"name":"Sazon ranchero sobre","cost":10,"price":15,"stock":7,"supplier_name":null},{"source_row":50,"name":"Sazon goya con azafran sobre","cost":9,"price":15,"stock":135,"supplier_name":null},{"source_row":51,"name":"Sazon completo Maggie sobre","cost":9,"price":15,"stock":123,"supplier_name":null},{"source_row":52,"name":"Cloro Macier 1/2 galon","cost":60,"price":80,"stock":4,"supplier_name":null},{"source_row":53,"name":"Lavaplatos Macier Pq","cost":12,"price":25,"stock":147,"supplier_name":null},{"source_row":54,"name":"Bola Azul","cost":23.53,"price":35,"stock":12,"supplier_name":null},{"source_row":55,"name":"Brillante 100gr","cost":17.04,"price":30,"stock":63,"supplier_name":null},{"source_row":56,"name":"Brillante 200gr","cost":32.21,"price":50,"stock":34,"supplier_name":null},{"source_row":57,"name":"Brillante suavizante 135ml","cost":19.46,"price":30,"stock":65,"supplier_name":null},{"source_row":58,"name":"Cloro Macier 170ml","cost":10.25,"price":20,"stock":70,"supplier_name":"MACIER"},{"source_row":59,"name":"Cloro Macier 16oz","cost":25,"price":50,"stock":18,"supplier_name":"MACIER"},{"source_row":61,"name":"Zixx Jabon","cost":30.8,"price":50,"stock":8,"supplier_name":"YUMMIES"},{"source_row":62,"name":"Jabon de cuaba Hispano Barra","cost":21.25,"price":60,"stock":6,"supplier_name":"CESAR IGLESIA"},{"source_row":63,"name":"Jabon de cuaba Candado Barra","cost":26.84,"price":45,"stock":50,"supplier_name":"CESAR IGLESIA"},{"source_row":65,"name":"Esponja con brillo","cost":9.5,"price":15,"stock":79,"supplier_name":null},{"source_row":66,"name":"Brillo Verde","cost":5,"price":15,"stock":161,"supplier_name":null},{"source_row":67,"name":"Brillo Fino","cost":6.75,"price":15,"stock":20,"supplier_name":null},{"source_row":68,"name":"Jabon de cuaba liquido Macier 450ml","cost":40,"price":70,"stock":10,"supplier_name":null},{"source_row":69,"name":"Suavizante Macier 250ml","cost":40,"price":65,"stock":19,"supplier_name":null},{"source_row":70,"name":"Fosforos Relampago","cost":4.1,"price":10,"stock":155,"supplier_name":"CAFÉ SANTO DOMINGO"},{"source_row":71,"name":"Paquete de cigarillo  LM 10","cost":76.59,"price":100,"stock":20,"supplier_name":"PHILIP MORRIS"},{"source_row":72,"name":"Unidad de cigarrillo LM","cost":7.66,"price":15,"stock":200,"supplier_name":"PHILIP MORRIS"},{"source_row":73,"name":"Rexona V8","cost":36.88,"price":60,"stock":25,"supplier_name":"CESAR IGLESIA"},{"source_row":74,"name":"Rexona Powder","cost":36.88,"price":60,"stock":20,"supplier_name":"CESAR IGLESIA"},{"source_row":75,"name":"Afeitadora Gillette","cost":33.59,"price":60,"stock":45,"supplier_name":"CND"},{"source_row":76,"name":"Sedal Acondicionador sobre","cost":10.12,"price":15,"stock":321,"supplier_name":null},{"source_row":80,"name":"Shampoo Soely","cost":7,"price":15,"stock":20,"supplier_name":null},{"source_row":81,"name":"Acondicionador Macier","cost":7,"price":15,"stock":6,"supplier_name":null},{"source_row":82,"name":"Cepillos Colgate","cost":82.5,"price":110,"stock":5,"supplier_name":"ALMACENES SAMUEL ABREU"},{"source_row":83,"name":"Jabon Kinder","cost":32.53,"price":55,"stock":19,"supplier_name":"CESAR IGLESIA"},{"source_row":84,"name":"Servilletas Bingo","cost":12.02,"price":30,"stock":19,"supplier_name":"CESAR IGLESIA"},{"source_row":85,"name":"Papel Higienico Velvet","cost":25.075,"price":40,"stock":18,"supplier_name":"CND"},{"source_row":86,"name":"Toallas humedas","cost":35,"price":50,"stock":1,"supplier_name":null},{"source_row":87,"name":"Bombillos","cost":20,"price":50,"stock":16,"supplier_name":"ALMACENES SAMUEL ABREU"},{"source_row":88,"name":"PaliChips","cost":11.16,"price":15,"stock":39,"supplier_name":"CND"},{"source_row":89,"name":"Alka Seltzer Boost","cost":32,"price":45,"stock":39,"supplier_name":"ALMACENES SAMUEL ABREU"},{"source_row":90,"name":"Alka Seltzer Clasic","cost":22.5,"price":35,"stock":57,"supplier_name":"ALMACENES SAMUEL ABREU"},{"source_row":91,"name":"Diclofenac","cost":5,"price":20,"stock":36,"supplier_name":"PEDRO PASTILLAS"},{"source_row":92,"name":"Cataclofen","cost":10,"price":25,"stock":115,"supplier_name":"PEDRO PASTILLAS"},{"source_row":93,"name":"Biclomplex","cost":5,"price":20,"stock":47,"supplier_name":"PEDRO PASTILLAS"},{"source_row":94,"name":"Ampicilina","cost":5,"price":20,"stock":39,"supplier_name":"PEDRO PASTILLAS"},{"source_row":95,"name":"Omeprazol","cost":6,"price":20,"stock":20,"supplier_name":"PEDRO PASTILLAS"},{"source_row":96,"name":"Diclomax","cost":5,"price":20,"stock":20,"supplier_name":"PEDRO PASTILLAS"},{"source_row":97,"name":"Acetaminofen","cost":10,"price":25,"stock":19,"supplier_name":"PEDRO PASTILLAS"},{"source_row":98,"name":"Loperamida","cost":10,"price":25,"stock":20,"supplier_name":"PEDRO PASTILLAS"},{"source_row":99,"name":"Amoxicilina","cost":10,"price":25,"stock":9,"supplier_name":"PEDRO PASTILLAS"},{"source_row":100,"name":"Ibuprofeno","cost":10,"price":25,"stock":10,"supplier_name":"PEDRO PASTILLAS"},{"source_row":101,"name":"Aceite el gallo 8oz","cost":41.76,"price":65,"stock":11,"supplier_name":"CESAR IGLESIA"},{"source_row":102,"name":"Salami entero","cost":470,"price":611,"stock":0,"supplier_name":"INDUVECA"},{"source_row":103,"name":"Libra de salami 1lb","cost":297,"price":375,"stock":0,"supplier_name":"INDUVECA"},{"source_row":104,"name":"Salami 65g","cost":42.58,"price":50,"stock":0,"supplier_name":"INDUVECA"},{"source_row":105,"name":"Salami 130g","cost":85.15,"price":100,"stock":0,"supplier_name":"INDUVECA"},{"source_row":106,"name":"Coquitos Dollys","cost":12.5,"price":20,"stock":11,"supplier_name":"DOLLYS"},{"source_row":107,"name":"Sparkies Bubbaloo","cost":18.52,"price":30,"stock":18,"supplier_name":"DISTRIBUIDORA CORRIPIO"},{"source_row":108,"name":"Grissly Corazon Gummies","cost":3,"price":5,"stock":38,"supplier_name":"SURTIDORA LA POPULAR"},{"source_row":109,"name":"Fresitas Gummies","cost":9.83,"price":15,"stock":38,"supplier_name":"SURTIDORA LA POPULAR"},{"source_row":110,"name":"Galletas Dino","cost":13.74,"price":20,"stock":73,"supplier_name":"CND"},{"source_row":111,"name":"Galletas Club Max OG","cost":8.1,"price":10,"stock":63,"supplier_name":"CND"},{"source_row":112,"name":"Ojos Gummies","cost":9.83,"price":15,"stock":30,"supplier_name":"SURTIDORA LA POPULAR"},{"source_row":113,"name":"Halls","cost":1.37,"price":2.5,"stock":1521,"supplier_name":"DISTRIBUIDORA CORRIPIO"},{"source_row":114,"name":"Gomitas Trullu","cost":30.34,"price":50,"stock":42,"supplier_name":"DISTRIBUIDORA CORRIPIO"},{"source_row":115,"name":"YaniChip","cost":5.83,"price":10,"stock":17,"supplier_name":"CND"},{"source_row":116,"name":"Clorets","cost":2.72,"price":5,"stock":130,"supplier_name":"DISTRIBUIDORA CORRIPIO"},{"source_row":117,"name":"Bubbaloo","cost":3.57,"price":5,"stock":84,"supplier_name":"DISTRIBUIDORA CORRIPIO"},{"source_row":118,"name":"Chocolates Best","cost":8,"price":20,"stock":50,"supplier_name":"CESAR IGLESIA"},{"source_row":119,"name":"Tipitin Beso","cost":6.66,"price":10,"stock":24,"supplier_name":"SURTIDORA LA POPULAR"},{"source_row":120,"name":"Ritz Queso","cost":15.32,"price":25,"stock":32,"supplier_name":"DISTRIBUIDORA CORRIPIO"},{"source_row":121,"name":"Oreo Pq","cost":15.26,"price":30,"stock":95,"supplier_name":"DISTRIBUIDORA CORRIPIO"},{"source_row":122,"name":"Oreo Mediana","cost":24.7,"price":45,"stock":15,"supplier_name":"DISTRIBUIDORA CORRIPIO"},{"source_row":123,"name":"Oreo Tubo","cost":48.53,"price":70,"stock":10,"supplier_name":"DISTRIBUIDORA CORRIPIO"},{"source_row":124,"name":"Parmalat Avena 330ml","cost":44,"price":60,"stock":18,"supplier_name":"INDUVECA"},{"source_row":125,"name":"Choco Rica 200ML","cost":21.99,"price":35,"stock":53,"supplier_name":"RICA"},{"source_row":126,"name":"Parmalat Choco 200ml","cost":21.61,"price":35,"stock":11,"supplier_name":"INDUVECA"},{"source_row":127,"name":"ListaMilk 250ml","cost":22.91,"price":35,"stock":40,"supplier_name":"RICA"},{"source_row":128,"name":"Malta Rica Lata 350ml","cost":32.81,"price":45,"stock":24,"supplier_name":"RICA"},{"source_row":129,"name":"Jugo Santal 330ml","cost":31.66,"price":13,"stock":65,"supplier_name":"INDUVECA"},{"source_row":130,"name":"ListaMilk LT","cost":77.25,"price":110,"stock":11,"supplier_name":"INDUVECA"},{"source_row":131,"name":"Jugo Rica FruitPunch Litro","cost":61.82,"price":125,"stock":11,"supplier_name":"RICA"},{"source_row":132,"name":"Frutop 300ml","cost":11.3,"price":20,"stock":1,"supplier_name":"ISM"},{"source_row":133,"name":"Fruto Duplix Pq","cost":20,"price":30,"stock":3,"supplier_name":"ISM"},{"source_row":134,"name":"Frutop Duplix Gd","cost":64.08,"price":100,"stock":1,"supplier_name":"ISM"},{"source_row":135,"name":"Sprite 400ml","cost":17.23,"price":30,"stock":3,"supplier_name":"BEPENSA DOMINICANA"},{"source_row":136,"name":"Rica Jugo gasado","cost":42.53,"price":65,"stock":4,"supplier_name":"RICA"},{"source_row":137,"name":"Kola Real Uva 200ml","cost":9.75,"price":15,"stock":11,"supplier_name":"ISM"},{"source_row":138,"name":"Kola Real Merengue 200ml","cost":9.75,"price":15,"stock":16,"supplier_name":"ISM"},{"source_row":139,"name":"Kola Real Merengue 296ml","cost":13.82,"price":20,"stock":5,"supplier_name":"ISM"},{"source_row":140,"name":"Kola Real Cola","cost":13.82,"price":20,"stock":43,"supplier_name":"ISM"},{"source_row":141,"name":"Cool Heaven Saborizada","cost":15.09,"price":30,"stock":6,"supplier_name":"ISM"},{"source_row":142,"name":"Generade","cost":28.69,"price":50,"stock":6,"supplier_name":"ISM"},{"source_row":143,"name":"EnerUp","cost":24.26,"price":50,"stock":25,"supplier_name":"ISM"},{"source_row":144,"name":"Cool Heaven Agua","cost":9.3,"price":20,"stock":49,"supplier_name":"ISM"},{"source_row":145,"name":"Presidente Light Med","cost":143.32,"price":200,"stock":67,"supplier_name":"CND"},{"source_row":146,"name":"Presidente Normal Pq","cost":96.74,"price":160,"stock":30,"supplier_name":"CND"},{"source_row":147,"name":"Presidente Light Pq","cost":96.75,"price":160,"stock":8,"supplier_name":"CND"},{"source_row":148,"name":"King Pride Kanell","cost":100.97,"price":180,"stock":45,"supplier_name":"VINICOLA"},{"source_row":149,"name":"Vino La Fuerza 175ml","cost":137.81,"price":350,"stock":5,"supplier_name":"VINICOLA"},{"source_row":150,"name":"Vino la Fuerza 350ml","cost":269.26,"price":350,"stock":11,"supplier_name":"VINICOLA"},{"source_row":151,"name":"FireBall 50ml","cost":100,"price":150,"stock":10,"supplier_name":"CND"},{"source_row":152,"name":"Botellones de agua","cost":60,"price":70,"stock":11,"supplier_name":"AGUA VICTORIA"},{"source_row":153,"name":"Chocolate Mr.Milk","cost":28.07,"price":45,"stock":22,"supplier_name":"CORTEZ HERMANOS"},{"source_row":154,"name":"Crachy Fun Size","cost":8.89,"price":20,"stock":38,"supplier_name":"CORTEZ HERMANOS"},{"source_row":155,"name":"Chocolate Crachy","cost":28.07,"price":45,"stock":24,"supplier_name":"CORTEZ HERMANOS"},{"source_row":156,"name":"Chocolate Rocky","cost":28.07,"price":45,"stock":22,"supplier_name":"CORTEZ HERMANOS"},{"source_row":157,"name":"Rocky Fun Size","cost":8.89,"price":20,"stock":40,"supplier_name":"CORTEZ HERMANOS"},{"source_row":158,"name":"Chocolate MasMas","cost":28.07,"price":45,"stock":22,"supplier_name":"CORTEZ HERMANOS"},{"source_row":159,"name":"MasMas Fun Size","cost":8.89,"price":20,"stock":36,"supplier_name":"CORTEZ HERMANOS"},{"source_row":160,"name":"Chocolate Embajador","cost":8.17,"price":10,"stock":120,"supplier_name":"CORTEZ HERMANOS"}]'::jsonb)
  AS source_row_data(
    source_row integer,
    name text,
    cost numeric,
    price numeric,
    stock numeric,
    supplier_name text
  );

CREATE TEMP TABLE import_target (account_id text PRIMARY KEY) ON COMMIT DROP;

INSERT INTO import_target (account_id)
SELECT id
FROM "Account"
WHERE lower(COALESCE("ownerEmail", '')) = lower('labalaminimarket@gmail.com');

DO $$
DECLARE
  account_matches integer;
  invalid_rows integer;
BEGIN
  SELECT count(*) INTO account_matches FROM import_target;
  IF account_matches <> 1 THEN
    RAISE EXCEPTION 'Se esperaba una sola cuenta para labalaminimarket@gmail.com; se encontraron %.', account_matches;
  END IF;

  SELECT count(*) INTO invalid_rows
  FROM import_products
  WHERE cost_cents IS NULL OR price_cents IS NULL OR stock IS NULL;

  IF invalid_rows <> 0 THEN
    RAISE EXCEPTION 'La hoja tiene % filas con costo, precio o existencia vacios. Completa los valores NULL en los datos de origen y vuelve a ejecutar.', invalid_rows;
  END IF;
END $$;

-- Preventivo: Prisma rellena @updatedAt desde el cliente; este SQL directo debe asignarlo explícitamente.
-- Crea solamente los proveedores que no existan ya en la cuenta.
WITH suppliers_to_create AS (
  SELECT DISTINCT btrim(supplier_name) AS name
  FROM import_products
  WHERE NULLIF(btrim(COALESCE(supplier_name, '')), '') IS NOT NULL
)
INSERT INTO "Supplier" ("id", "accountId", "name", "updatedAt")
SELECT
  'sql_' || md5(random()::text || clock_timestamp()::text),
  target.account_id,
  supplier.name,
  CURRENT_TIMESTAMP
FROM suppliers_to_create supplier
CROSS JOIN import_target target
WHERE NOT EXISTS (
  SELECT 1
  FROM "Supplier" existing
  WHERE existing."accountId" = target.account_id
    AND lower(btrim(existing."name")) = lower(supplier.name)
);

-- Mantiene el consecutivo interno de productos consistente con los productos existentes.
INSERT INTO "ProductSequence" ("id", "accountId", "lastNumber", "updatedAt")
SELECT
  'sql_' || md5(random()::text || clock_timestamp()::text),
  target.account_id,
  COALESCE((
    SELECT max(product."productId")
    FROM "Product" product
    WHERE product."accountId" = target.account_id
  ), 0),
  CURRENT_TIMESTAMP
FROM import_target target
ON CONFLICT ("accountId") DO UPDATE
SET
  "lastNumber" = GREATEST("ProductSequence"."lastNumber", EXCLUDED."lastNumber"),
  "updatedAt" = CURRENT_TIMESTAMP;

WITH target_user AS (
  SELECT
    target.account_id,
    (
      SELECT app_user.id
      FROM "User" app_user
      WHERE app_user."accountId" = target.account_id
        AND app_user."isOwner" = true
        AND app_user."isActive" = true
      ORDER BY app_user."createdAt" ASC
      LIMIT 1
    ) AS user_id
  FROM import_target target
),
locked_sequence AS (
  SELECT sequence.id, sequence."accountId", sequence."lastNumber"
  FROM "ProductSequence" sequence
  JOIN target_user target ON target.account_id = sequence."accountId"
  FOR UPDATE
),
new_rows AS (
  SELECT
    import_row.*,
    row_number() OVER (ORDER BY import_row.source_row)::integer AS sequence_offset
  FROM import_products import_row
  CROSS JOIN target_user target
  WHERE NOT EXISTS (
    SELECT 1
    FROM "Product" existing_product
    WHERE existing_product."accountId" = target.account_id
      AND lower(btrim(existing_product."name")) = lower(btrim(import_row.name))
  )
),
inserted_products AS (
  INSERT INTO "Product" (
    "id", "accountId", "productId", "name", "supplierId",
    "priceCents", "costCents", "stock", "productKind", "unit",
    "isActive", "isAvailableForSale", "isOnboardingDemo", "imageUrls", "updatedAt"
  )
  SELECT
    'sql_' || md5(random()::text || clock_timestamp()::text),
    sequence."accountId",
    sequence."lastNumber" + import_row.sequence_offset,
    import_row.name,
    supplier.id,
    import_row.price_cents,
    import_row.cost_cents,
    import_row.stock,
    'BASIC'::"ProductKind",
    'UNIDAD'::"UnitType",
    true,
    true,
    false,
    ARRAY[]::text[],
    CURRENT_TIMESTAMP
  FROM new_rows import_row
  CROSS JOIN locked_sequence sequence
  LEFT JOIN LATERAL (
    SELECT existing_supplier.id
    FROM "Supplier" existing_supplier
    WHERE existing_supplier."accountId" = sequence."accountId"
      AND import_row.supplier_name IS NOT NULL
      AND lower(btrim(existing_supplier."name")) = lower(btrim(import_row.supplier_name))
    ORDER BY existing_supplier."createdAt" ASC, existing_supplier.id ASC
    LIMIT 1
  ) supplier ON true
  RETURNING id, "accountId", stock
),
initial_stock_movements AS (
  INSERT INTO "InventoryAdjustment" (
    "id", "accountId", "productId", "userId", "qtyDelta", "reason"
  )
  SELECT
    'sql_' || md5(random()::text || clock_timestamp()::text),
    product."accountId",
    product.id,
    target.user_id,
    product.stock,
    'Stock inicial'
  FROM inserted_products product
  JOIN target_user target ON target.account_id = product."accountId"
  RETURNING "productId"
),
updated_sequence AS (
  UPDATE "ProductSequence" sequence
  SET
    "lastNumber" = locked."lastNumber" + (SELECT count(*) FROM inserted_products),
    "updatedAt" = CURRENT_TIMESTAMP
  FROM locked_sequence locked
  WHERE sequence.id = locked.id
  RETURNING sequence."lastNumber"
)
SELECT
  (SELECT count(*) FROM import_products) AS source_rows,
  (SELECT count(*) FROM inserted_products) AS products_created,
  (SELECT count(*) FROM import_products) - (SELECT count(*) FROM inserted_products) AS products_skipped_as_existing,
  (SELECT count(*) FROM initial_stock_movements) AS initial_stock_movements,
  (SELECT "lastNumber" FROM updated_sequence) AS final_product_sequence;

COMMIT;

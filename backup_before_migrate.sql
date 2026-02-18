--
-- PostgreSQL database dump
--

\restrict HcnFaalaScIxFmaUnUWdJyPdiLyumOMXr4VkKyGU9yIPaQr6nkcdvbLbNYsmG2P

-- Dumped from database version 18.1
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: postgres
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO postgres;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: postgres
--

COMMENT ON SCHEMA public IS '';


--
-- Name: AROpenStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."AROpenStatus" AS ENUM (
    'PENDIENTE',
    'PARCIAL',
    'PAGADA'
);


ALTER TYPE public."AROpenStatus" OWNER TO postgres;

--
-- Name: AuditAction; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."AuditAction" AS ENUM (
    'LOGIN_SUCCESS',
    'LOGIN_FAILED',
    'LOGOUT',
    'SALE_CREATED',
    'SALE_CANCELLED',
    'SALE_EDITED',
    'PAYMENT_CREATED',
    'PAYMENT_CANCELLED',
    'PRICE_OVERRIDE',
    'PRODUCT_CREATED',
    'PRODUCT_EDITED',
    'PRODUCT_DELETED',
    'STOCK_ADJUSTED',
    'PERMISSION_CHANGED',
    'SETTINGS_CHANGED',
    'USER_CREATED',
    'USER_DELETED',
    'UNAUTHORIZED_ACCESS',
    'USER_UPDATED',
    'USER_DEACTIVATED',
    'CATEGORY_CREATED',
    'CATEGORY_EDITED',
    'CATEGORY_DELETED',
    'CUSTOMER_CREATED',
    'CUSTOMER_EDITED',
    'CUSTOMER_DELETED',
    'SUPPLIER_CREATED',
    'SUPPLIER_EDITED',
    'SUPPLIER_DELETED',
    'PURCHASE_CREATED',
    'PURCHASE_EDITED',
    'PURCHASE_CANCELLED',
    'RETURN_CREATED',
    'RETURN_CANCELLED',
    'QUOTE_CREATED',
    'QUOTE_EDITED',
    'QUOTE_DELETED',
    'OPERATING_EXPENSE_CREATED',
    'OPERATING_EXPENSE_EDITED',
    'OPERATING_EXPENSE_DELETED',
    'BACKUP_CREATED',
    'BACKUP_DELETED',
    'BACKUP_RESTORED',
    'BACKUP_DOWNLOADED',
    'BILLING_SUBSCRIPTION_CREATED',
    'BILLING_SUBSCRIPTION_UPDATED',
    'BILLING_PAYMENT_CREATED',
    'BILLING_PAYMENT_APPROVED',
    'BILLING_PAYMENT_REJECTED',
    'BILLING_PROOF_UPLOADED',
    'BILLING_STATUS_CHANGED',
    'BILLING_CURRENCY_CHANGED',
    'PASSWORD_RESET_REQUESTED',
    'PASSWORD_RESET_COMPLETED'
);


ALTER TYPE public."AuditAction" OWNER TO postgres;

--
-- Name: BillingCurrency; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."BillingCurrency" AS ENUM (
    'DOP',
    'USD'
);


ALTER TYPE public."BillingCurrency" OWNER TO postgres;

--
-- Name: BillingPaymentStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."BillingPaymentStatus" AS ENUM (
    'PENDING',
    'PAID',
    'FAILED',
    'REJECTED'
);


ALTER TYPE public."BillingPaymentStatus" OWNER TO postgres;

--
-- Name: BillingProvider; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."BillingProvider" AS ENUM (
    'MANUAL',
    'LEMON'
);


ALTER TYPE public."BillingProvider" OWNER TO postgres;

--
-- Name: BillingStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."BillingStatus" AS ENUM (
    'TRIALING',
    'ACTIVE',
    'GRACE',
    'BLOCKED',
    'CANCELED'
);


ALTER TYPE public."BillingStatus" OWNER TO postgres;

--
-- Name: ErrorSeverity; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."ErrorSeverity" AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL'
);


ALTER TYPE public."ErrorSeverity" OWNER TO postgres;

--
-- Name: ManualVerificationStatus; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."ManualVerificationStatus" AS ENUM (
    'NONE',
    'PENDING',
    'APPROVED',
    'REJECTED'
);


ALTER TYPE public."ManualVerificationStatus" OWNER TO postgres;

--
-- Name: PaymentMethod; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."PaymentMethod" AS ENUM (
    'EFECTIVO',
    'TRANSFERENCIA',
    'TARJETA',
    'OTRO',
    'DIVIDIR_PAGO'
);


ALTER TYPE public."PaymentMethod" OWNER TO postgres;

--
-- Name: SaleType; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."SaleType" AS ENUM (
    'CONTADO',
    'CREDITO'
);


ALTER TYPE public."SaleType" OWNER TO postgres;

--
-- Name: SuperAdminRole; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."SuperAdminRole" AS ENUM (
    'OWNER',
    'ADMIN',
    'FINANCE',
    'SUPPORT'
);


ALTER TYPE public."SuperAdminRole" OWNER TO postgres;

--
-- Name: UnitType; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."UnitType" AS ENUM (
    'UNIDAD',
    'KG',
    'LIBRA',
    'GRAMO',
    'LITRO',
    'ML',
    'GALON',
    'METRO',
    'CM',
    'PIE'
);


ALTER TYPE public."UnitType" OWNER TO postgres;

--
-- Name: UserRole; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public."UserRole" AS ENUM (
    'ADMIN',
    'CAJERO',
    'ALMACEN'
);


ALTER TYPE public."UserRole" OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Account; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Account" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    name text NOT NULL,
    "clerkUserId" text NOT NULL
);


ALTER TABLE public."Account" OWNER TO postgres;

--
-- Name: AccountReceivable; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."AccountReceivable" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "saleId" text NOT NULL,
    "customerId" text NOT NULL,
    "totalCents" integer NOT NULL,
    "balanceCents" integer NOT NULL,
    status public."AROpenStatus" DEFAULT 'PENDIENTE'::public."AROpenStatus" NOT NULL,
    "dueDate" timestamp(3) without time zone
);


ALTER TABLE public."AccountReceivable" OWNER TO postgres;

--
-- Name: AuditLog; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."AuditLog" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "accountId" text NOT NULL,
    "userId" text,
    "userEmail" text,
    "userUsername" text,
    action public."AuditAction" NOT NULL,
    "resourceType" text,
    "resourceId" text,
    details jsonb,
    "ipAddress" text,
    "userAgent" text,
    "oldValue" jsonb,
    "newValue" jsonb
);


ALTER TABLE public."AuditLog" OWNER TO postgres;

--
-- Name: BankAccount; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."BankAccount" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "bankName" text NOT NULL,
    "accountType" text NOT NULL,
    "accountNumber" text NOT NULL,
    "accountName" text NOT NULL,
    currency text DEFAULT 'DOP'::text NOT NULL,
    "bankLogo" text,
    instructions text,
    "isActive" boolean DEFAULT true NOT NULL,
    "displayOrder" integer DEFAULT 0 NOT NULL
);


ALTER TABLE public."BankAccount" OWNER TO postgres;

--
-- Name: BillingNotification; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."BillingNotification" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "accountId" text NOT NULL,
    type text NOT NULL,
    channel text NOT NULL,
    "sentAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    metadata jsonb
);


ALTER TABLE public."BillingNotification" OWNER TO postgres;

--
-- Name: BillingPayment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."BillingPayment" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "subscriptionId" text NOT NULL,
    "amountCents" integer NOT NULL,
    currency public."BillingCurrency" NOT NULL,
    provider public."BillingProvider" NOT NULL,
    status public."BillingPaymentStatus" DEFAULT 'PENDING'::public."BillingPaymentStatus" NOT NULL,
    "paidAt" timestamp(3) without time zone,
    reference text,
    "externalId" text,
    "periodStartsAt" timestamp(3) without time zone,
    "periodEndsAt" timestamp(3) without time zone,
    "bankAccountId" text,
    "rejectionReason" text
);


ALTER TABLE public."BillingPayment" OWNER TO postgres;

--
-- Name: BillingPaymentProof; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."BillingPaymentProof" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "paymentId" text NOT NULL,
    url text NOT NULL,
    "uploadedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "amountCents" integer,
    note text
);


ALTER TABLE public."BillingPaymentProof" OWNER TO postgres;

--
-- Name: BillingPlan; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."BillingPlan" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    name text NOT NULL,
    description text,
    "priceUsdCents" integer NOT NULL,
    "priceDopCents" integer NOT NULL,
    "lemonVariantId" text,
    "isDefault" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL
);


ALTER TABLE public."BillingPlan" OWNER TO postgres;

--
-- Name: BillingProfile; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."BillingProfile" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "accountId" text NOT NULL,
    "legalName" text NOT NULL,
    "taxId" text NOT NULL,
    address text NOT NULL,
    email text NOT NULL,
    phone text
);


ALTER TABLE public."BillingProfile" OWNER TO postgres;

--
-- Name: BillingReceipt; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."BillingReceipt" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "paymentId" text NOT NULL,
    "receiptNumber" text NOT NULL,
    "issuedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "emailSentAt" timestamp(3) without time zone,
    "legalName" text NOT NULL,
    "taxId" text NOT NULL,
    address text NOT NULL
);


ALTER TABLE public."BillingReceipt" OWNER TO postgres;

--
-- Name: BillingSubscription; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."BillingSubscription" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "accountId" text NOT NULL,
    status public."BillingStatus" DEFAULT 'TRIALING'::public."BillingStatus" NOT NULL,
    currency public."BillingCurrency" DEFAULT 'DOP'::public."BillingCurrency" NOT NULL,
    provider public."BillingProvider" DEFAULT 'MANUAL'::public."BillingProvider" NOT NULL,
    "trialStartedAt" timestamp(3) without time zone,
    "trialEndsAt" timestamp(3) without time zone,
    "currentPeriodStartsAt" timestamp(3) without time zone,
    "currentPeriodEndsAt" timestamp(3) without time zone,
    "graceEndsAt" timestamp(3) without time zone,
    "pendingCurrency" public."BillingCurrency",
    "pendingProvider" public."BillingProvider",
    "manualVerificationStatus" public."ManualVerificationStatus" DEFAULT 'NONE'::public."ManualVerificationStatus" NOT NULL,
    "manualAccessGrantedAt" timestamp(3) without time zone,
    "lemonCustomerId" text,
    "lemonSubscriptionId" text,
    "priceUsdCents" integer DEFAULT 2000 NOT NULL,
    "priceDopCents" integer DEFAULT 130000 NOT NULL,
    "billingPlanId" text
);


ALTER TABLE public."BillingSubscription" OWNER TO postgres;

--
-- Name: Category; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Category" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    name text NOT NULL,
    description text,
    "isActive" boolean DEFAULT true NOT NULL,
    "accountId" text NOT NULL,
    "categoryId" integer NOT NULL
);


ALTER TABLE public."Category" OWNER TO postgres;

--
-- Name: CategorySequence; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."CategorySequence" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "accountId" text NOT NULL,
    "lastNumber" integer DEFAULT 0 NOT NULL
);


ALTER TABLE public."CategorySequence" OWNER TO postgres;

--
-- Name: CompanySettings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."CompanySettings" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    address text NOT NULL,
    "logoUrl" text,
    "allowNegativeStock" boolean DEFAULT false NOT NULL,
    "itbisRateBp" integer DEFAULT 1800 NOT NULL,
    "barcodeLabelSize" text DEFAULT '4x2'::text NOT NULL,
    "shippingLabelSize" text DEFAULT '4x6'::text NOT NULL,
    "accountId" text NOT NULL,
    "defaultViewMode" text DEFAULT 'list'::text NOT NULL,
    "showItbisOnReceipts" boolean DEFAULT true NOT NULL,
    "defaultProfitMarginBp" integer DEFAULT 3000 NOT NULL
);


ALTER TABLE public."CompanySettings" OWNER TO postgres;

--
-- Name: Customer; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Customer" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    name text NOT NULL,
    phone text,
    address text,
    cedula text,
    province text,
    "isGeneric" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "accountId" text NOT NULL,
    "creditDays" integer DEFAULT 0 NOT NULL,
    "creditEnabled" boolean DEFAULT false NOT NULL
);


ALTER TABLE public."Customer" OWNER TO postgres;

--
-- Name: ErrorLog; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."ErrorLog" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    message text NOT NULL,
    stack text,
    code text,
    severity public."ErrorSeverity" DEFAULT 'MEDIUM'::public."ErrorSeverity" NOT NULL,
    "accountId" text,
    "userId" text,
    endpoint text,
    method text,
    "requestBody" jsonb,
    "queryParams" jsonb,
    "ipAddress" text,
    "userAgent" text,
    metadata jsonb,
    resolved boolean DEFAULT false NOT NULL,
    "resolvedAt" timestamp(3) without time zone,
    "resolvedBy" text,
    resolution text
);


ALTER TABLE public."ErrorLog" OWNER TO postgres;

--
-- Name: InventoryAdjustment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."InventoryAdjustment" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "accountId" text NOT NULL,
    "productId" text NOT NULL,
    "userId" text,
    "qtyDelta" numeric(10,3) NOT NULL,
    reason text,
    note text,
    "batchId" text
);


ALTER TABLE public."InventoryAdjustment" OWNER TO postgres;

--
-- Name: InvoiceSequence; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."InvoiceSequence" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    series text DEFAULT 'A'::text NOT NULL,
    "lastNumber" integer DEFAULT 0 NOT NULL,
    "accountId" text NOT NULL
);


ALTER TABLE public."InvoiceSequence" OWNER TO postgres;

--
-- Name: OperatingExpense; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."OperatingExpense" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    description text NOT NULL,
    "amountCents" integer NOT NULL,
    "expenseDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    category text,
    "userId" text NOT NULL,
    notes text,
    "accountId" text NOT NULL
);


ALTER TABLE public."OperatingExpense" OWNER TO postgres;

--
-- Name: Payment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Payment" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "arId" text NOT NULL,
    "userId" text NOT NULL,
    "paidAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "amountCents" integer NOT NULL,
    method public."PaymentMethod" DEFAULT 'EFECTIVO'::public."PaymentMethod" NOT NULL,
    note text,
    "cancelledAt" timestamp(3) without time zone,
    "cancelledBy" text,
    "receiptNumber" integer NOT NULL,
    "receiptCode" text NOT NULL
);


ALTER TABLE public."Payment" OWNER TO postgres;

--
-- Name: PaymentSequence; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."PaymentSequence" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "accountId" text NOT NULL,
    "lastNumber" integer DEFAULT 0 NOT NULL
);


ALTER TABLE public."PaymentSequence" OWNER TO postgres;

--
-- Name: Product; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Product" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    name text NOT NULL,
    sku text,
    reference text,
    "supplierId" text,
    "categoryId" text,
    "priceCents" integer NOT NULL,
    "costCents" integer NOT NULL,
    "itbisRateBp" integer DEFAULT 1800 NOT NULL,
    "purchaseUnit" public."UnitType" DEFAULT 'UNIDAD'::public."UnitType" NOT NULL,
    "saleUnit" public."UnitType" DEFAULT 'UNIDAD'::public."UnitType" NOT NULL,
    stock numeric(10,3) DEFAULT 0 NOT NULL,
    "minStock" numeric(10,3) DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "imageUrls" text[] DEFAULT ARRAY[]::text[],
    "accountId" text NOT NULL,
    "productId" integer NOT NULL
);


ALTER TABLE public."Product" OWNER TO postgres;

--
-- Name: ProductSequence; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."ProductSequence" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "accountId" text NOT NULL,
    "lastNumber" integer DEFAULT 0 NOT NULL
);


ALTER TABLE public."ProductSequence" OWNER TO postgres;

--
-- Name: Purchase; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Purchase" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "purchasedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "supplierName" text,
    "userId" text NOT NULL,
    "totalCents" integer NOT NULL,
    notes text,
    "cancelledAt" timestamp(3) without time zone,
    "cancelledBy" text,
    "accountId" text NOT NULL
);


ALTER TABLE public."Purchase" OWNER TO postgres;

--
-- Name: PurchaseItem; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."PurchaseItem" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "purchaseId" text NOT NULL,
    "productId" text NOT NULL,
    qty numeric(10,3) NOT NULL,
    "unitCostCents" integer NOT NULL,
    "discountPercentBp" integer DEFAULT 0 NOT NULL,
    "netCostCents" integer DEFAULT 0 NOT NULL,
    "lineTotalCents" integer NOT NULL,
    "salePriceCents" integer,
    "saleMarginBp" integer,
    "purchaseIncludesItbis" boolean,
    "appliedItbisRateBp" integer
);


ALTER TABLE public."PurchaseItem" OWNER TO postgres;

--
-- Name: Quote; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Quote" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "quoteNumber" integer NOT NULL,
    "quoteCode" text NOT NULL,
    "quotedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "validUntil" timestamp(3) without time zone,
    "customerId" text,
    "userId" text NOT NULL,
    "subtotalCents" integer NOT NULL,
    "itbisCents" integer NOT NULL,
    "shippingCents" integer DEFAULT 0 NOT NULL,
    "totalCents" integer NOT NULL,
    notes text,
    "accountId" text NOT NULL
);


ALTER TABLE public."Quote" OWNER TO postgres;

--
-- Name: QuoteItem; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."QuoteItem" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "quoteId" text NOT NULL,
    "productId" text NOT NULL,
    qty numeric(10,3) NOT NULL,
    "unitPriceCents" integer NOT NULL,
    "wasPriceOverridden" boolean DEFAULT false NOT NULL,
    "lineTotalCents" integer NOT NULL
);


ALTER TABLE public."QuoteItem" OWNER TO postgres;

--
-- Name: QuoteSequence; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."QuoteSequence" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "lastNumber" integer DEFAULT 0 NOT NULL,
    "accountId" text NOT NULL
);


ALTER TABLE public."QuoteSequence" OWNER TO postgres;

--
-- Name: Return; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Return" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "returnNumber" integer NOT NULL,
    "returnCode" text NOT NULL,
    "returnedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "saleId" text NOT NULL,
    "userId" text NOT NULL,
    "subtotalCents" integer NOT NULL,
    "itbisCents" integer NOT NULL,
    "totalCents" integer NOT NULL,
    notes text,
    "cancelledAt" timestamp(3) without time zone,
    "cancelledBy" text,
    "accountId" text NOT NULL
);


ALTER TABLE public."Return" OWNER TO postgres;

--
-- Name: ReturnItem; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."ReturnItem" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "returnId" text NOT NULL,
    "saleItemId" text NOT NULL,
    "productId" text NOT NULL,
    qty numeric(10,3) NOT NULL,
    "unitPriceCents" integer NOT NULL,
    "lineTotalCents" integer NOT NULL
);


ALTER TABLE public."ReturnItem" OWNER TO postgres;

--
-- Name: ReturnSequence; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."ReturnSequence" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "lastNumber" integer DEFAULT 0 NOT NULL,
    "accountId" text NOT NULL
);


ALTER TABLE public."ReturnSequence" OWNER TO postgres;

--
-- Name: Sale; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Sale" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "invoiceSeries" text DEFAULT 'A'::text NOT NULL,
    "invoiceNumber" integer NOT NULL,
    "invoiceCode" text NOT NULL,
    "soldAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    type public."SaleType" NOT NULL,
    "paymentMethod" public."PaymentMethod",
    "customerId" text,
    "userId" text NOT NULL,
    "subtotalCents" integer NOT NULL,
    "itbisCents" integer NOT NULL,
    "shippingCents" integer DEFAULT 0 NOT NULL,
    "totalCents" integer NOT NULL,
    notes text,
    "cancelledAt" timestamp(3) without time zone,
    "cancelledBy" text,
    "accountId" text NOT NULL
);


ALTER TABLE public."Sale" OWNER TO postgres;

--
-- Name: SaleItem; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."SaleItem" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "saleId" text NOT NULL,
    "productId" text NOT NULL,
    qty numeric(10,3) NOT NULL,
    "unitPriceCents" integer NOT NULL,
    "wasPriceOverridden" boolean DEFAULT false NOT NULL,
    "lineTotalCents" integer NOT NULL
);


ALTER TABLE public."SaleItem" OWNER TO postgres;

--
-- Name: SalePayment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."SalePayment" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "saleId" text NOT NULL,
    method public."PaymentMethod" NOT NULL,
    "amountCents" integer NOT NULL
);


ALTER TABLE public."SalePayment" OWNER TO postgres;

--
-- Name: SubUserLoginToken; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."SubUserLoginToken" (
    id text NOT NULL,
    "accountId" text NOT NULL,
    "userId" text NOT NULL,
    "codeHash" text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "usedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."SubUserLoginToken" OWNER TO postgres;

--
-- Name: SuperAdmin; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."SuperAdmin" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    "passwordHash" text NOT NULL,
    role public."SuperAdminRole" DEFAULT 'SUPPORT'::public."SuperAdminRole" NOT NULL,
    "lastLoginAt" timestamp(3) without time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    "canManageAccounts" boolean DEFAULT false NOT NULL,
    "canApprovePayments" boolean DEFAULT false NOT NULL,
    "canModifyPricing" boolean DEFAULT false NOT NULL,
    "canSendEmails" boolean DEFAULT false NOT NULL,
    "canDeleteAccounts" boolean DEFAULT false NOT NULL,
    "canViewFinancials" boolean DEFAULT true NOT NULL
);


ALTER TABLE public."SuperAdmin" OWNER TO postgres;

--
-- Name: SuperAdminAuditLog; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."SuperAdminAuditLog" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "superAdminId" text NOT NULL,
    action text NOT NULL,
    "targetAccountId" text,
    "targetPaymentId" text,
    metadata jsonb,
    "ipAddress" text
);


ALTER TABLE public."SuperAdminAuditLog" OWNER TO postgres;

--
-- Name: Supplier; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Supplier" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    name text NOT NULL,
    "contactName" text,
    phone text,
    email text,
    address text,
    notes text,
    "discountPercentBp" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "accountId" text NOT NULL,
    "chargesItbis" boolean DEFAULT false NOT NULL
);


ALTER TABLE public."Supplier" OWNER TO postgres;

--
-- Name: User; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."User" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    name text NOT NULL,
    username text NOT NULL,
    "passwordHash" text NOT NULL,
    email text,
    role public."UserRole" DEFAULT 'CAJERO'::public."UserRole" NOT NULL,
    "whatsappNumber" text,
    "whatsappVerifiedAt" timestamp(3) without time zone,
    "canOverridePrice" boolean DEFAULT false NOT NULL,
    "canCancelSales" boolean DEFAULT false NOT NULL,
    "canCancelReturns" boolean DEFAULT false NOT NULL,
    "canCancelPayments" boolean DEFAULT false NOT NULL,
    "canEditSales" boolean DEFAULT false NOT NULL,
    "canEditProducts" boolean DEFAULT false NOT NULL,
    "canChangeSaleType" boolean DEFAULT false NOT NULL,
    "canSellWithoutStock" boolean DEFAULT false NOT NULL,
    "canManageBackups" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "accountId" text NOT NULL,
    "isOwner" boolean DEFAULT false NOT NULL,
    "canViewProductCosts" boolean DEFAULT false NOT NULL,
    "canViewProfitReport" boolean DEFAULT false NOT NULL
);


ALTER TABLE public."User" OWNER TO postgres;

--
-- Name: WhatsappOtp; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."WhatsappOtp" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "phoneNumber" text NOT NULL,
    code text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "consumedAt" timestamp(3) without time zone,
    purpose text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    "ipAddress" text,
    "userAgent" text,
    "userId" text
);


ALTER TABLE public."WhatsappOtp" OWNER TO postgres;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO postgres;

--
-- Data for Name: Account; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Account" (id, "createdAt", "updatedAt", name, "clerkUserId") FROM stdin;
cmkroaow00002p10vj3ikznpg	2026-01-24 02:10:53.184	2026-01-24 02:10:58.748	Albin Rdz	user_38ZieTajGXmaRWbRvSfV2J5rLYX
cmkt7jx7i0007nx5pyqp0tpk5	2026-01-25 03:57:42.75	2026-01-25 03:58:03.774	Tejadaaaaaa	user_38XjXabhiZgYeGZPQydLVEpLi40
\.


--
-- Data for Name: AccountReceivable; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."AccountReceivable" (id, "createdAt", "updatedAt", "saleId", "customerId", "totalCents", "balanceCents", status, "dueDate") FROM stdin;
cmkuh3hl2000izmsku9rnpadb	2026-01-26 01:12:38.342	2026-01-26 01:13:51.355	cmkuh3hk8000czmskrb5o7ego	cmkuh2rat0001zmsk04xichum	5000	4600	PARCIAL	2026-02-25 01:12:38.341
cmkv5iqil000i7bpgw0hmgjp2	2026-01-26 12:36:20.541	2026-01-26 12:47:39.838	cmkv5iqi6000c7bpgzsegcy28	cmkv5ih1y00057bpgpk5uw58s	16500	6500	PARCIAL	2026-03-17 12:36:20.54
\.


--
-- Data for Name: AuditLog; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."AuditLog" (id, "createdAt", "accountId", "userId", "userEmail", "userUsername", action, "resourceType", "resourceId", details, "ipAddress", "userAgent", "oldValue", "newValue") FROM stdin;
cmkroat7b000kp10vvtpcnhoe	2026-01-24 02:10:58.775	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	USER_CREATED	User	cmkroat6y000gp10vjsczprp9	{"name": "ADMIN", "role": "ADMIN", "email": "albinmrodriguez@gmail.com", "source": "first_user", "isOwner": true, "username": "admin"}	\N	\N	\N	\N
cmkroat7h000mp10v7hedta8x	2026-01-24 02:10:58.781	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	SETTINGS_CHANGED	CompanySettings	\N	{"name": "Albin Rdz", "logoUrl": null}	\N	\N	\N	\N
cmkroatbf000op10v6i3ku4nw	2026-01-24 02:10:58.923	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	LOGIN_SUCCESS	User	cmkroat6y000gp10vjsczprp9	{"username": "admin"}	\N	\N	\N	\N
cmkrp04tg000wp10vy6isin1n	2026-01-24 02:30:40.229	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	PRODUCT_CREATED	Product	cmkrp04sw000up10vt83o45yg	{"sku": null, "name": "gafa", "reference": null}	\N	\N	\N	\N
cmkrpjt9m000312m2b4hkoymp	2026-01-24 02:45:58.378	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	PRODUCT_CREATED	Product	cmkrpjt94000112m2e0tko2kj	{"sku": null, "name": "gafa2", "reference": null}	\N	\N	\N	\N
cmkrpp3eb00039bcycp47a1zl	2026-01-24 02:50:04.787	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	PRODUCT_CREATED	Product	cmkrpp3du00019bcy2nzhtrqo	{"sku": null, "name": "gafa3", "reference": null}	\N	\N	\N	\N
cmkrpt4bw0003chv6zicc8fm3	2026-01-24 02:53:12.621	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	PRODUCT_CREATED	Product	cmkrpt4bk0001chv63zxr8b4e	{"sku": null, "name": "gafa4", "reference": null}	\N	\N	\N	\N
cmkrpv8x70001llirju5lucoq	2026-01-24 02:54:51.883	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	LOGOUT	User	cmkroat6y000gp10vjsczprp9	\N	\N	\N	\N	\N
cmkrpwz340003llirv38h75vn	2026-01-24 02:56:12.449	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	LOGIN_SUCCESS	User	cmkroat6y000gp10vjsczprp9	{"username": "admin"}	\N	\N	\N	\N
cmkrq0rpo0003l5leym5hn2k2	2026-01-24 02:59:09.516	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	PRODUCT_CREATED	Product	cmkrq0rp50001l5lemidtkmfy	{"sku": null, "name": "gafa5", "reference": null}	\N	\N	\N	\N
cmkrq46o20003y6vizgf55g5y	2026-01-24 03:01:48.866	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	PRODUCT_CREATED	Product	cmkrq46nk0001y6vi69sogdwx	{"sku": null, "name": "gafa56", "reference": null}	\N	\N	\N	\N
cmkrq6piw0003nvgb1pdyqqnz	2026-01-24 03:03:46.616	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	PRODUCT_CREATED	Product	cmkrq6pif0001nvgb3smxdays	{"sku": null, "name": "gafafafa", "reference": null}	\N	\N	\N	\N
cmkrqbe3e0003hrxnvv8k1ql9	2026-01-24 03:07:25.082	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	PRODUCT_CREATED	Product	cmkrqbe330001hrxnn2ciq82n	{"sku": null, "name": "afdfafs", "reference": null}	\N	\N	\N	\N
cmkrqf3aw000310h2iig07col	2026-01-24 03:10:17.72	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	PRODUCT_CREATED	Product	cmkrqf39t000110h2e0mlei2o	{"sku": null, "name": "dsddsf", "reference": null}	\N	\N	\N	\N
cmkrqjadv0003j8bdvu4tltte	2026-01-24 03:13:33.523	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	PRODUCT_CREATED	Product	cmkrqjadj0001j8bdpy4g9o1k	{"sku": null, "name": "sdsdsd", "reference": null}	\N	\N	\N	\N
cmkrqnvd50003bspk8roqybiy	2026-01-24 03:17:07.337	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	PRODUCT_CREATED	Product	cmkrqnvcl0001bspko925xn56	{"sku": null, "name": "gsdsads", "reference": null}	\N	\N	\N	\N
cmkrqx28a0003cb3j876i29ev	2026-01-24 03:24:16.139	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	PRODUCT_CREATED	Product	cmkrqx2800001cb3jwopg9cs2	{"sku": null, "name": "dsdsd", "reference": null}	\N	\N	\N	\N
cmkrr3v4m0003fqrf678xhfcw	2026-01-24 03:29:33.526	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	PRODUCT_CREATED	Product	cmkrr3v460001fqrfrlu3u32u	{"sku": null, "name": "sddsdsd", "reference": null}	\N	\N	\N	\N
cmkrr4olq0003soy5rjwg3duc	2026-01-24 03:30:11.726	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	PRODUCT_CREATED	Product	cmkrr4olb0001soy5gsvvpbdz	{"sku": null, "name": "gads", "reference": null}	\N	\N	\N	\N
cmkrrk059000311656pgg3jw5	2026-01-24 03:42:06.526	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	PRODUCT_CREATED	Product	cmkrrk04r000111654g65lj99	{"sku": null, "name": "fdsfdf", "reference": null}	\N	\N	\N	\N
cmkrrkezs000711658ld5ys5a	2026-01-24 03:42:25.769	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	PRODUCT_CREATED	Product	cmkrrkezm00051165m0cohmux	{"sku": null, "name": "dsfdsfd", "reference": null}	\N	\N	\N	\N
cmkrrmp9v000f116560qh6xfe	2026-01-24 03:44:12.403	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	PRODUCT_CREATED	Product	cmkrrmp9f000d11656dapndhx	{"sku": null, "name": "aldsds", "reference": null}	\N	\N	\N	\N
cmkt5xto70001f6jnwz12lhni	2026-01-25 03:12:32.117	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	LOGIN_SUCCESS	User	cmkroat6y000gp10vjsczprp9	{"username": "admin"}	\N	\N	\N	\N
cmkt6ja6g000813ay5o2u6jui	2026-01-25 03:29:13.289	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	PAYMENT_CREATED	BillingPayment	cmkt6ja67000613ay2b7buloa	{"bankName": "andfsdfsd", "currency": "DOP", "amountCents": 130000, "bankAccountId": "cmkt6j5ov000213ayi5b46l5c"}	\N	\N	\N	\N
cmkt6jinj000c13ayayypvs79	2026-01-25 03:29:24.271	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	SETTINGS_CHANGED	BillingPaymentProof	\N	{"action": "proof_uploaded", "paymentId": "cmkt6ja67000613ay2b7buloa", "isFirstProof": true}	\N	\N	\N	\N
cmkt6jins000e13ayicxnh5ws	2026-01-25 03:29:24.281	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	SETTINGS_CHANGED	BillingSubscription	\N	{"reason": "first_proof_uploaded", "newStatus": "ACTIVE"}	\N	\N	\N	\N
cmkt7kdft000pnx5pfx2uzkm9	2026-01-25 03:58:03.786	cmkt7jx7i0007nx5pyqp0tpk5	cmkt7kdfm000lnx5p33zsqrre	albinmrodriguez2@gmail.com	admin	USER_CREATED	User	cmkt7kdfm000lnx5p33zsqrre	{"name": "ADMIN", "role": "ADMIN", "email": "albinmrodriguez2@gmail.com", "source": "first_user", "isOwner": true, "username": "admin"}	\N	\N	\N	\N
cmkt7kdfy000rnx5p08wjg6b8	2026-01-25 03:58:03.791	cmkt7jx7i0007nx5pyqp0tpk5	cmkt7kdfm000lnx5p33zsqrre	albinmrodriguez2@gmail.com	admin	SETTINGS_CHANGED	CompanySettings	\N	{"name": "Tejadaaaaaa", "logoUrl": null}	\N	\N	\N	\N
cmkt7kdj2000tnx5phcr843w9	2026-01-25 03:58:03.902	cmkt7jx7i0007nx5pyqp0tpk5	cmkt7kdfm000lnx5p33zsqrre	albinmrodriguez2@gmail.com	admin	LOGIN_SUCCESS	User	cmkt7kdfm000lnx5p33zsqrre	{"username": "admin"}	\N	\N	\N	\N
cmkuh2rb30003zmsk3d8thamf	2026-01-26 01:12:04.287	cmkt7jx7i0007nx5pyqp0tpk5	cmkt7kdfm000lnx5p33zsqrre	albinmrodriguez2@gmail.com	admin	CUSTOMER_CREATED	Customer	cmkuh2rat0001zmsk04xichum	{"name": "Albin", "phone": null, "cedula": null, "address": null, "province": null}	\N	\N	\N	\N
cmkuh38wm0007zmskfsr285kv	2026-01-26 01:12:27.094	cmkt7jx7i0007nx5pyqp0tpk5	cmkt7kdfm000lnx5p33zsqrre	albinmrodriguez2@gmail.com	admin	PRODUCT_CREATED	Product	cmkuh38w90005zmsk8q6lxd42	{"sku": null, "name": "gafa", "reference": null}	\N	\N	\N	\N
cmkuh3hkv000gzmskzaylarnk	2026-01-26 01:12:38.335	cmkt7jx7i0007nx5pyqp0tpk5	cmkt7kdfm000lnx5p33zsqrre	albinmrodriguez2@gmail.com	admin	SALE_CREATED	Sale	cmkuh3hk8000czmskrb5o7ego	{"type": "CREDITO", "totalCents": 5000, "invoiceCode": "A-00001"}	\N	\N	\N	\N
cmkuh51xf000nzmskqcrnlqu3	2026-01-26 01:13:51.364	cmkt7jx7i0007nx5pyqp0tpk5	cmkt7kdfm000lnx5p33zsqrre	albinmrodriguez2@gmail.com	admin	PAYMENT_CREATED	Payment	cmkuh51x4000lzmsknwk8h59w	{"arId": "cmkuh3hl2000izmsku9rnpadb", "method": "EFECTIVO", "amountCents": 400}	\N	\N	\N	\N
cmkv4vv3n000510klfv0s9mo5	2026-01-26 12:18:33.395	cmkt7jx7i0007nx5pyqp0tpk5	cmkt7kdfm000lnx5p33zsqrre	albinmrodriguez2@gmail.com	admin	PRODUCT_CREATED	Product	cmkv4vv3h000310kl8h4ha2k0	{"sku": null, "name": "Alfombra", "productId": 2, "reference": null}	\N	\N	\N	\N
cmkv4w21f000710kluui855ri	2026-01-26 12:18:42.387	cmkt7jx7i0007nx5pyqp0tpk5	cmkt7kdfm000lnx5p33zsqrre	albinmrodriguez2@gmail.com	admin	LOGOUT	User	cmkt7kdfm000lnx5p33zsqrre	\N	\N	\N	\N	\N
cmkv4wdo4000910klubqelsdd	2026-01-26 12:18:57.46	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	LOGIN_SUCCESS	User	cmkroat6y000gp10vjsczprp9	{"username": "admin"}	\N	\N	\N	\N
cmkv4wr5b000f10kl9qvgwm1c	2026-01-26 12:19:14.927	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	PRODUCT_CREATED	Product	cmkv4wr53000d10klyj43at88	{"sku": null, "name": "gafa18", "productId": 18, "reference": null}	\N	\N	\N	\N
cmkv4wvo5000h10kl908od5q5	2026-01-26 12:19:20.789	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	LOGOUT	User	cmkroat6y000gp10vjsczprp9	\N	\N	\N	\N	\N
cmkv4wyjp000j10klflokr6qr	2026-01-26 12:19:24.518	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	LOGIN_SUCCESS	User	cmkroat6y000gp10vjsczprp9	{"username": "admin"}	\N	\N	\N	\N
cmkv4x86w000n10klvnapwt2b	2026-01-26 12:19:37.016	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	USER_CREATED	User	cmkv4x86n000l10kl7vvl8vh3	{"name": "fgdfg", "role": "CAJERO", "email": null, "username": "ffff", "permissions": {"canEditSales": false, "canCancelSales": false, "canEditProducts": false, "canCancelReturns": false, "canManageBackups": false, "canOverridePrice": false, "canCancelPayments": false, "canChangeSaleType": false, "canSellWithoutStock": false, "canViewProductCosts": false, "canViewProfitReport": false}}	\N	\N	\N	\N
cmkv4xc9k000p10klc0o9c6f2	2026-01-26 12:19:42.296	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	PERMISSION_CHANGED	User	cmkv4x86n000l10kl7vvl8vh3	{"value": true, "setAll": true}	\N	\N	\N	\N
cmkv4xf8h000r10klz567q39k	2026-01-26 12:19:46.145	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	LOGOUT	User	cmkroat6y000gp10vjsczprp9	\N	\N	\N	\N	\N
cmkv4xic7000t10kl6ein3tq6	2026-01-26 12:19:50.167	cmkroaow00002p10vj3ikznpg	cmkv4x86n000l10kl7vvl8vh3	\N	ffff	LOGIN_SUCCESS	User	cmkv4x86n000l10kl7vvl8vh3	{"username": "ffff"}	\N	\N	\N	\N
cmkv4xpy8000z10kl2hqcscjv	2026-01-26 12:20:00.033	cmkroaow00002p10vj3ikznpg	cmkv4x86n000l10kl7vvl8vh3	\N	ffff	PRODUCT_CREATED	Product	cmkv4xpy3000x10klnc4n0g1m	{"sku": null, "name": "gafa19", "productId": 19, "reference": null}	\N	\N	\N	\N
cmkv5h4z600017bpgvenbbbfe	2026-01-26 12:35:05.97	cmkroaow00002p10vj3ikznpg	cmkv4x86n000l10kl7vvl8vh3	\N	ffff	LOGOUT	User	cmkv4x86n000l10kl7vvl8vh3	\N	\N	\N	\N	\N
cmkv5h9ew00037bpgfyapn22f	2026-01-26 12:35:11.72	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	LOGIN_SUCCESS	User	cmkroat6y000gp10vjsczprp9	{"username": "admin"}	\N	\N	\N	\N
cmkv5ih2600077bpgr34ff30c	2026-01-26 12:36:08.287	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	CUSTOMER_CREATED	Customer	cmkv5ih1y00057bpgpk5uw58s	{"name": "Albin", "phone": null, "cedula": null, "address": null, "province": null}	\N	\N	\N	\N
cmkv5iqif000g7bpg0m8wr0x5	2026-01-26 12:36:20.536	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	SALE_CREATED	Sale	cmkv5iqi6000c7bpgzsegcy28	{"type": "CREDITO", "totalCents": 16500, "invoiceCode": "A-00001"}	\N	\N	\N	\N
cmkv5j1tn000p7bpgeksxqv61	2026-01-26 12:36:35.195	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	PAYMENT_CREATED	Payment	cmkv5j1tf000n7bpgsbtc1tjd	{"arId": "cmkv5iqil000i7bpgw0hmgjp2", "method": "EFECTIVO", "amountCents": 10000, "receiptCode": "R-000001"}	\N	\N	\N	\N
cmkv5jbpu000w7bpgka2gr505	2026-01-26 12:36:48.019	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	PAYMENT_CREATED	Payment	cmkv5jbpn000u7bpglp4jk98w	{"arId": "cmkv5iqil000i7bpgw0hmgjp2", "method": "EFECTIVO", "amountCents": 6500, "receiptCode": "R-000002"}	\N	\N	\N	\N
cmkv5xao50002bbcbdxmlv54m	2026-01-26 12:47:39.845	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	PAYMENT_CANCELLED	Payment	cmkv5jbpn000u7bpglp4jk98w	{"arId": "cmkv5iqil000i7bpgw0hmgjp2", "method": "EFECTIVO", "amountCents": 6500}	\N	\N	\N	\N
cml1s8rbx0003cz9huzio73xx	2026-01-31 03:59:03.262	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	SUPPLIER_CREATED	Supplier	cml1s8rbl0001cz9hu689cqrr	{"name": "Distribuidora ABC", "email": null, "phone": null, "address": null, "contactName": null, "chargesItbis": false, "discountPercentBp": 0}	\N	\N	\N	\N
cml1s9df40005cz9hfb3ujbc8	2026-01-31 03:59:31.888	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	SUPPLIER_EDITED	Supplier	cml1s8rbl0001cz9hu689cqrr	{"name": "Distribuidora ABC", "email": null, "phone": null, "address": null, "contactName": null, "chargesItbis": true, "discountPercentBp": 0}	\N	\N	\N	\N
cml1sl2x70003iqs82c92vz0b	2026-01-31 04:08:38.155	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	SETTINGS_CHANGED	CompanySettings	\N	{"showItbisOnReceipts": false}	\N	\N	\N	\N
cml1so71i000ciqs8afs3r89c	2026-01-31 04:11:03.463	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	SALE_CREATED	Sale	cml1so7100008iqs8h2q8wv2y	{"type": "CONTADO", "totalCents": 3300, "invoiceCode": "A-00002"}	\N	\N	\N	\N
cml1sonbi000liqs8lxbrcici	2026-01-31 04:11:24.558	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	SALE_CREATED	Sale	cml1sonb5000hiqs87crqit4g	{"type": "CONTADO", "totalCents": 13300, "invoiceCode": "A-00003"}	\N	\N	\N	\N
cml1ssja8000viqs8356jahiw	2026-01-31 04:14:25.952	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	SALE_CREATED	Sale	cml1ssj9r000qiqs82f4ysufy	{"type": "CONTADO", "totalCents": 46600, "invoiceCode": "A-00004"}	\N	\N	\N	\N
cmlr931380001ytzf0nlzxvq6	2026-02-17 23:44:43.841	cmkroaow00002p10vj3ikznpg	cmkroat6y000gp10vjsczprp9	albinmrodriguez@gmail.com	admin	LOGIN_SUCCESS	User	cmkroat6y000gp10vjsczprp9	{"username": "admin"}	\N	\N	\N	\N
\.


--
-- Data for Name: BankAccount; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."BankAccount" (id, "createdAt", "updatedAt", "bankName", "accountType", "accountNumber", "accountName", currency, "bankLogo", instructions, "isActive", "displayOrder") FROM stdin;
cmkt6j5ov000213ayi5b46l5c	2026-01-25 03:29:07.472	2026-01-25 03:29:07.472	andfsdfsd	Cuenta de Ahorros	3432435435	fdsfsdfsdf	DOP	\N	\N	t	1
\.


--
-- Data for Name: BillingNotification; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."BillingNotification" (id, "createdAt", "accountId", type, channel, "sentAt", metadata) FROM stdin;
\.


--
-- Data for Name: BillingPayment; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."BillingPayment" (id, "createdAt", "updatedAt", "subscriptionId", "amountCents", currency, provider, status, "paidAt", reference, "externalId", "periodStartsAt", "periodEndsAt", "bankAccountId", "rejectionReason") FROM stdin;
cmkt6ja67000613ay2b7buloa	2026-01-25 03:29:13.279	2026-01-25 03:29:34.178	cmkroat75000ip10vve020w8y	130000	DOP	MANUAL	PAID	2026-01-25 03:29:34.176	\N	\N	2026-01-25 03:29:34.176	2026-02-24 03:29:34.176	cmkt6j5ov000213ayi5b46l5c	\N
\.


--
-- Data for Name: BillingPaymentProof; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."BillingPaymentProof" (id, "createdAt", "paymentId", url, "uploadedAt", "amountCents", note) FROM stdin;
cmkt6jimy000a13ay034qo1fa	2026-01-25 03:29:24.25	cmkt6ja67000613ay2b7buloa	https://utfs.io/f/2To5s4wXSvesdILnhg2UO1Vi4sl0WRtPJxfAvTXF3bnEMCyo	2026-01-25 03:29:24.25	\N	\N
\.


--
-- Data for Name: BillingPlan; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."BillingPlan" (id, "createdAt", "updatedAt", name, description, "priceUsdCents", "priceDopCents", "lemonVariantId", "isDefault", "isActive") FROM stdin;
cmkt7i8g60000nx5pjk12ezvv	2026-01-25 03:56:24.006	2026-01-25 03:56:24.006	Plan Promocional	\N	1000	65000	1248912	f	t
default_plan_001	2026-01-25 03:50:56.142	2026-01-25 03:56:48.195	Plan Estándar	Plan mensual estándar con acceso completo a todas las funcionalidades	2000	130000	1249019	t	t
\.


--
-- Data for Name: BillingProfile; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."BillingProfile" (id, "createdAt", "updatedAt", "accountId", "legalName", "taxId", address, email, phone) FROM stdin;
\.


--
-- Data for Name: BillingReceipt; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."BillingReceipt" (id, "createdAt", "paymentId", "receiptNumber", "issuedAt", "emailSentAt", "legalName", "taxId", address) FROM stdin;
\.


--
-- Data for Name: BillingSubscription; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."BillingSubscription" (id, "createdAt", "updatedAt", "accountId", status, currency, provider, "trialStartedAt", "trialEndsAt", "currentPeriodStartsAt", "currentPeriodEndsAt", "graceEndsAt", "pendingCurrency", "pendingProvider", "manualVerificationStatus", "manualAccessGrantedAt", "lemonCustomerId", "lemonSubscriptionId", "priceUsdCents", "priceDopCents", "billingPlanId") FROM stdin;
cmkroat75000ip10vve020w8y	2026-01-24 02:10:58.769	2026-01-25 03:57:11.706	cmkroaow00002p10vj3ikznpg	ACTIVE	DOP	MANUAL	2026-01-08 02:29:57.02	2026-01-23 02:29:57.02	2026-01-25 03:29:34.176	2026-02-24 03:29:34.176	\N	\N	\N	APPROVED	2026-01-25 03:29:24.261	\N	\N	2000	130000	default_plan_001
cmkt7kdfp000nnx5p53joonhh	2026-01-25 03:58:03.782	2026-01-25 03:58:33.083	cmkt7jx7i0007nx5pyqp0tpk5	TRIALING	DOP	MANUAL	2026-01-25 03:58:03.778	2026-02-09 03:58:03.778	\N	\N	\N	\N	\N	NONE	\N	\N	\N	1000	65000	cmkt7i8g60000nx5pjk12ezvv
\.


--
-- Data for Name: Category; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Category" (id, "createdAt", "updatedAt", name, description, "isActive", "accountId", "categoryId") FROM stdin;
\.


--
-- Data for Name: CategorySequence; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."CategorySequence" (id, "createdAt", "updatedAt", "accountId", "lastNumber") FROM stdin;
438f80cf7f1fcae419faeb3e042a07dd	2026-02-17 23:50:09.072	2026-02-17 23:50:09.072	cmkt7jx7i0007nx5pyqp0tpk5	0
94adfdf59f9ca6e2aceb8b471ae81150	2026-02-17 23:50:09.072	2026-02-17 23:50:09.072	cmkroaow00002p10vj3ikznpg	0
\.


--
-- Data for Name: CompanySettings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."CompanySettings" (id, "createdAt", "updatedAt", name, phone, address, "logoUrl", "allowNegativeStock", "itbisRateBp", "barcodeLabelSize", "shippingLabelSize", "accountId", "defaultViewMode", "showItbisOnReceipts", "defaultProfitMarginBp") FROM stdin;
cmkt7jx7u0009nx5pnmap56z0	2026-01-25 03:57:42.762	2026-01-25 03:58:03.776	Tejadaaaaaa			\N	f	1800	4x2	4x6	cmkt7jx7i0007nx5pyqp0tpk5	list	t	3000
cmkroaow50004p10vz80ls0yh	2026-01-24 02:10:53.189	2026-01-31 04:08:38.121	Albin Rdz			\N	f	1800	4x2	4x6	cmkroaow00002p10vj3ikznpg	list	f	3000
\.


--
-- Data for Name: Customer; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Customer" (id, "createdAt", "updatedAt", name, phone, address, cedula, province, "isGeneric", "isActive", "accountId", "creditDays", "creditEnabled") FROM stdin;
cmkroaowj000cp10vk3wm2t1s	2026-01-24 02:10:53.203	2026-01-24 02:10:53.203	Cliente general	\N	\N	\N	\N	t	t	cmkroaow00002p10vj3ikznpg	0	f
cmkt7jx8a000hnx5powh78rme	2026-01-25 03:57:42.779	2026-01-25 03:57:42.779	Cliente general	\N	\N	\N	\N	t	t	cmkt7jx7i0007nx5pyqp0tpk5	0	f
cmkuh2rat0001zmsk04xichum	2026-01-26 01:12:04.275	2026-01-26 01:12:04.275	Albin	\N	\N	\N	\N	f	t	cmkt7jx7i0007nx5pyqp0tpk5	30	t
cmkv5ih1y00057bpgpk5uw58s	2026-01-26 12:36:08.278	2026-01-26 12:36:08.278	Albin	\N	\N	\N	\N	f	t	cmkroaow00002p10vj3ikznpg	50	t
\.


--
-- Data for Name: ErrorLog; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."ErrorLog" (id, "createdAt", message, stack, code, severity, "accountId", "userId", endpoint, method, "requestBody", "queryParams", "ipAddress", "userAgent", metadata, resolved, "resolvedAt", "resolvedBy", resolution) FROM stdin;
cmkv551z1000012ppz9urgca6	2026-01-26 12:25:42.205	\nInvalid `prisma.$queryRaw()` invocation:\n\n\nRaw query failed. Code: `42703`. Message: `no existe la columna «nonexistent_column»`	PrismaClientKnownRequestError: \nInvalid `prisma.$queryRaw()` invocation:\n\n\nRaw query failed. Code: `42703`. Message: `no existe la columna «nonexistent_column»`\n    at $n.handleRequestError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:7315)\n    at $n.handleAndLogRequestError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6623)\n    at $n.request (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6307)\n    at async l (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:130:9633)\n    at async Proxy.<anonymous> (C:\\Users\\Albin Rodriguez\\Documents\\pos\\src\\lib\\db.ts:129:20)\n    at async testPrismaErrorLogging (C:\\Users\\Albin Rodriguez\\Documents\\pos\\tmp_rovodev_test_prisma_error_logging.ts:19:5)	DB_QUERY_ERROR	CRITICAL	\N	\N	prisma.$queryRaw	\N	\N	\N	\N	\N	{"hasArgs": true, "operation": "prisma.$queryRaw", "prismaError": true}	f	\N	\N	\N
cmkv551zx000112pp5eb7oikj	2026-01-26 12:25:42.205	No Account found	NotFoundError: No Account found\n    at C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:31:5146\n    at async C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:31:5086\n    at async Proxy.<anonymous> (C:\\Users\\Albin Rodriguez\\Documents\\pos\\src\\lib\\db.ts:87:20)\n    at async testPrismaErrorLogging (C:\\Users\\Albin Rodriguez\\Documents\\pos\\tmp_rovodev_test_prisma_error_logging.ts:55:20)	DB_QUERY_ERROR	HIGH	\N	\N	account.findUniqueOrThrow	\N	\N	\N	\N	\N	{"model": "account", "hasArgs": true, "operation": "account.findUniqueOrThrow", "prismaError": true}	f	\N	\N	\N
cmkv551zz000212pp5npg3qom	2026-01-26 12:25:42.205	\nInvalid `prisma.account.create()` invocation in\nC:\\Users\\Albin Rodriguez\\Documents\\pos\\tmp_rovodev_test_prisma_error_logging.ts:31:26\n\n  28 try {\n  29   // Intentar crear dos cuentas con el mismo ID (esto viola unique constraint)\n  30   const testId = "test-duplicate-" + Date.now()\n→ 31   await prisma.account.create({\n         data: {\n           id: "test-duplicate-1769430342185",\n           name: "Test Account 1",\n           clerkOrgId: "test-org-1769430342186",\n       +   clerkUserId: String\n         }\n       })\n\nArgument `clerkUserId` is missing.	PrismaClientValidationError: \nInvalid `prisma.account.create()` invocation in\nC:\\Users\\Albin Rodriguez\\Documents\\pos\\tmp_rovodev_test_prisma_error_logging.ts:31:26\n\n  28 try {\n  29   // Intentar crear dos cuentas con el mismo ID (esto viola unique constraint)\n  30   const testId = "test-duplicate-" + Date.now()\n→ 31   await prisma.account.create({\n         data: {\n           id: "test-duplicate-1769430342185",\n           name: "Test Account 1",\n           clerkOrgId: "test-org-1769430342186",\n       +   clerkUserId: String\n         }\n       })\n\nArgument `clerkUserId` is missing.\n    at wn (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:29:1363)\n    at $n.handleRequestError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6958)\n    at $n.handleAndLogRequestError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6623)\n    at $n.request (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6307)\n    at async l (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:130:9633)\n    at async Proxy.<anonymous> (C:\\Users\\Albin Rodriguez\\Documents\\pos\\src\\lib\\db.ts:87:20)\n    at async testPrismaErrorLogging (C:\\Users\\Albin Rodriguez\\Documents\\pos\\tmp_rovodev_test_prisma_error_logging.ts:31:5)	DB_QUERY_ERROR	CRITICAL	\N	\N	account.create	\N	\N	\N	\N	\N	{"model": "account", "hasArgs": true, "operation": "account.create", "prismaError": true}	f	\N	\N	\N
cmkv5656s00007j6usiyub2pe	2026-01-26 12:26:33.028	\nInvalid `prisma.$queryRaw()` invocation:\n\n\nRaw query failed. Code: `42703`. Message: `no existe la columna «nonexistent_column»`	PrismaClientKnownRequestError: \nInvalid `prisma.$queryRaw()` invocation:\n\n\nRaw query failed. Code: `42703`. Message: `no existe la columna «nonexistent_column»`\n    at $n.handleRequestError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:7315)\n    at $n.handleAndLogRequestError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6623)\n    at $n.request (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6307)\n    at async l (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:130:9633)\n    at async Proxy.<anonymous> (C:\\Users\\Albin Rodriguez\\Documents\\pos\\src\\lib\\db.ts:129:20)\n    at async testPrismaErrorLogging (C:\\Users\\Albin Rodriguez\\Documents\\pos\\tmp_rovodev_test_prisma_error_logging.ts:18:5)	DB_QUERY_ERROR	CRITICAL	\N	\N	prisma.$queryRaw	\N	\N	\N	\N	\N	{"hasArgs": true, "operation": "prisma.$queryRaw", "prismaError": true}	f	\N	\N	\N
cmkv5657p00017j6ujqlzt8pu	2026-01-26 12:26:33.028	\nInvalid `prisma.$queryRaw()` invocation:\n\n\nRaw query failed. Code: `42P01`. Message: `no existe la relación «NonExistentTable»`	PrismaClientKnownRequestError: \nInvalid `prisma.$queryRaw()` invocation:\n\n\nRaw query failed. Code: `42P01`. Message: `no existe la relación «NonExistentTable»`\n    at $n.handleRequestError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:7315)\n    at $n.handleAndLogRequestError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6623)\n    at $n.request (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6307)\n    at async l (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:130:9633)\n    at async Proxy.<anonymous> (C:\\Users\\Albin Rodriguez\\Documents\\pos\\src\\lib\\db.ts:129:20)\n    at async testPrismaErrorLogging (C:\\Users\\Albin Rodriguez\\Documents\\pos\\tmp_rovodev_test_prisma_error_logging.ts:28:5)	DB_QUERY_ERROR	CRITICAL	\N	\N	prisma.$queryRaw	\N	\N	\N	\N	\N	{"hasArgs": true, "operation": "prisma.$queryRaw", "prismaError": true}	f	\N	\N	\N
cmkv5657r00027j6uezcek741	2026-01-26 12:26:33.031	No Account found	NotFoundError: No Account found\n    at C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:31:5146\n    at async C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:31:5086\n    at async Proxy.<anonymous> (C:\\Users\\Albin Rodriguez\\Documents\\pos\\src\\lib\\db.ts:87:20)\n    at async testPrismaErrorLogging (C:\\Users\\Albin Rodriguez\\Documents\\pos\\tmp_rovodev_test_prisma_error_logging.ts:38:5)	DB_QUERY_ERROR	HIGH	\N	\N	account.findUniqueOrThrow	\N	\N	\N	\N	\N	{"model": "account", "hasArgs": true, "operation": "account.findUniqueOrThrow", "prismaError": true}	f	\N	\N	\N
cmlr9330g0002ytzf6ecrc29u	2026-02-17 23:44:46.336	\nInvalid `prisma.companySettings.findFirst()` invocation in\nC:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\[root-of-the-server]__fe08465e._.js:2027:54\n\n  2024         status: 401\n  2025     });\n  2026 }\n→ 2027 const company = await prisma.companySettings.findFirst(\nThe column `existe` does not exist in the current database.	PrismaClientKnownRequestError: \nInvalid `prisma.companySettings.findFirst()` invocation in\nC:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\[root-of-the-server]__fe08465e._.js:2027:54\n\n  2024         status: 401\n  2025     });\n  2026 }\n→ 2027 const company = await prisma.companySettings.findFirst(\nThe column `existe` does not exist in the current database.\n    at $n.handleRequestError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:7315)\n    at $n.handleAndLogRequestError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6623)\n    at $n.request (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6307)\n    at async l (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:130:9633)\n    at async Proxy.<anonymous> (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\[root-of-the-server]__7e5ba96f._.js:999:32)\n    at async GET (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\[root-of-the-server]__fe08465e._.js:2027:25)\n    at async AppRouteRouteModule.do (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-route-turbo.runtime.dev.js:5:37866)\n    at async AppRouteRouteModule.handle (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-route-turbo.runtime.dev.js:5:45156)\n    at async responseGenerator (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\3d533_next_5b419a3c._.js:16653:38)\n    at async AppRouteRouteModule.handleResponse (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-route-turbo.runtime.dev.js:1:187713)\n    at async handleResponse (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\3d533_next_5b419a3c._.js:16716:32)\n    at async Module.handler (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\3d533_next_5b419a3c._.js:16769:13)\n    at async DevServer.renderToResponseWithComponentsImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1422:9)\n    at async DevServer.renderPageComponent (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1474:24)\n    at async DevServer.renderToResponseImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1524:32)\n    at async DevServer.pipeImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1018:25)\n    at async NextNodeServer.handleCatchallRenderRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\next-server.js:395:17)\n    at async DevServer.handleRequestImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:909:17)\n    at async C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\dev\\next-dev-server.js:387:20\n    at async Span.traceAsyncFn (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\trace\\trace.js:157:20)\n    at async DevServer.handleRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\dev\\next-dev-server.js:383:24)\n    at async invokeRender (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:248:21)\n    at async handleRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:447:24)\n    at async requestHandlerImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:496:13)\n    at async Server.requestListener (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\start-server.js:226:13)	DB_QUERY_ERROR	CRITICAL	\N	\N	companySettings.findFirst	\N	\N	\N	\N	\N	{"model": "companySettings", "hasArgs": true, "operation": "companySettings.findFirst", "prismaError": true}	f	\N	\N	\N
cmlr9333k0003ytzfoc5d8ubq	2026-02-17 23:44:46.449	\nInvalid `prisma.companySettings.findFirst()` invocation in\nC:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\[root-of-the-server]__fe08465e._.js:2027:54\n\n  2024         status: 401\n  2025     });\n  2026 }\n→ 2027 const company = await prisma.companySettings.findFirst(\nThe column `existe` does not exist in the current database.	PrismaClientKnownRequestError: \nInvalid `prisma.companySettings.findFirst()` invocation in\nC:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\[root-of-the-server]__fe08465e._.js:2027:54\n\n  2024         status: 401\n  2025     });\n  2026 }\n→ 2027 const company = await prisma.companySettings.findFirst(\nThe column `existe` does not exist in the current database.\n    at $n.handleRequestError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:7315)\n    at $n.handleAndLogRequestError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6623)\n    at $n.request (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6307)\n    at async l (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:130:9633)\n    at async Proxy.<anonymous> (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\[root-of-the-server]__7e5ba96f._.js:999:32)\n    at async GET (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\[root-of-the-server]__fe08465e._.js:2027:25)\n    at async AppRouteRouteModule.do (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-route-turbo.runtime.dev.js:5:37866)\n    at async AppRouteRouteModule.handle (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-route-turbo.runtime.dev.js:5:45156)\n    at async responseGenerator (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\3d533_next_5b419a3c._.js:16653:38)\n    at async AppRouteRouteModule.handleResponse (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-route-turbo.runtime.dev.js:1:187713)\n    at async handleResponse (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\3d533_next_5b419a3c._.js:16716:32)\n    at async Module.handler (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\3d533_next_5b419a3c._.js:16769:13)\n    at async DevServer.renderToResponseWithComponentsImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1422:9)\n    at async DevServer.renderPageComponent (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1474:24)\n    at async DevServer.renderToResponseImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1524:32)\n    at async DevServer.pipeImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1018:25)\n    at async NextNodeServer.handleCatchallRenderRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\next-server.js:395:17)\n    at async DevServer.handleRequestImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:909:17)\n    at async C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\dev\\next-dev-server.js:387:20\n    at async Span.traceAsyncFn (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\trace\\trace.js:157:20)\n    at async DevServer.handleRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\dev\\next-dev-server.js:383:24)\n    at async invokeRender (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:248:21)\n    at async handleRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:447:24)\n    at async requestHandlerImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:496:13)\n    at async Server.requestListener (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\start-server.js:226:13)	DB_QUERY_ERROR	CRITICAL	\N	\N	companySettings.findFirst	\N	\N	\N	\N	\N	{"model": "companySettings", "hasArgs": true, "operation": "companySettings.findFirst", "prismaError": true}	f	\N	\N	\N
cmlr9335b0004ytzfdlc9mrim	2026-02-17 23:44:46.512	\nInvalid `prisma.companySettings.findFirst()` invocation in\nC:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\[root-of-the-server]__fe08465e._.js:2027:54\n\n  2024         status: 401\n  2025     });\n  2026 }\n→ 2027 const company = await prisma.companySettings.findFirst(\nThe column `existe` does not exist in the current database.	PrismaClientKnownRequestError: \nInvalid `prisma.companySettings.findFirst()` invocation in\nC:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\[root-of-the-server]__fe08465e._.js:2027:54\n\n  2024         status: 401\n  2025     });\n  2026 }\n→ 2027 const company = await prisma.companySettings.findFirst(\nThe column `existe` does not exist in the current database.\n    at $n.handleRequestError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:7315)\n    at $n.handleAndLogRequestError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6623)\n    at $n.request (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6307)\n    at async l (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:130:9633)\n    at async Proxy.<anonymous> (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\[root-of-the-server]__7e5ba96f._.js:999:32)\n    at async GET (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\[root-of-the-server]__fe08465e._.js:2027:25)\n    at async AppRouteRouteModule.do (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-route-turbo.runtime.dev.js:5:37866)\n    at async AppRouteRouteModule.handle (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-route-turbo.runtime.dev.js:5:45156)\n    at async responseGenerator (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\3d533_next_5b419a3c._.js:16653:38)\n    at async AppRouteRouteModule.handleResponse (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-route-turbo.runtime.dev.js:1:187713)\n    at async handleResponse (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\3d533_next_5b419a3c._.js:16716:32)\n    at async Module.handler (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\3d533_next_5b419a3c._.js:16769:13)\n    at async DevServer.renderToResponseWithComponentsImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1422:9)\n    at async DevServer.renderPageComponent (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1474:24)\n    at async DevServer.renderToResponseImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1524:32)\n    at async DevServer.pipeImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1018:25)\n    at async NextNodeServer.handleCatchallRenderRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\next-server.js:395:17)\n    at async DevServer.handleRequestImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:909:17)\n    at async C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\dev\\next-dev-server.js:387:20\n    at async Span.traceAsyncFn (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\trace\\trace.js:157:20)\n    at async DevServer.handleRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\dev\\next-dev-server.js:383:24)\n    at async invokeRender (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:248:21)\n    at async handleRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:447:24)\n    at async requestHandlerImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:496:13)\n    at async Server.requestListener (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\start-server.js:226:13)	DB_QUERY_ERROR	CRITICAL	\N	\N	companySettings.findFirst	\N	\N	\N	\N	\N	{"model": "companySettings", "hasArgs": true, "operation": "companySettings.findFirst", "prismaError": true}	f	\N	\N	\N
cmlr9336o0005ytzfeo1eb6hz	2026-02-17 23:44:46.56	\nInvalid `prisma.companySettings.findFirst()` invocation in\nC:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\[root-of-the-server]__fe08465e._.js:2027:54\n\n  2024         status: 401\n  2025     });\n  2026 }\n→ 2027 const company = await prisma.companySettings.findFirst(\nThe column `existe` does not exist in the current database.	PrismaClientKnownRequestError: \nInvalid `prisma.companySettings.findFirst()` invocation in\nC:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\[root-of-the-server]__fe08465e._.js:2027:54\n\n  2024         status: 401\n  2025     });\n  2026 }\n→ 2027 const company = await prisma.companySettings.findFirst(\nThe column `existe` does not exist in the current database.\n    at $n.handleRequestError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:7315)\n    at $n.handleAndLogRequestError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6623)\n    at $n.request (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6307)\n    at async l (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:130:9633)\n    at async Proxy.<anonymous> (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\[root-of-the-server]__7e5ba96f._.js:999:32)\n    at async GET (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\[root-of-the-server]__fe08465e._.js:2027:25)\n    at async AppRouteRouteModule.do (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-route-turbo.runtime.dev.js:5:37866)\n    at async AppRouteRouteModule.handle (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-route-turbo.runtime.dev.js:5:45156)\n    at async responseGenerator (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\3d533_next_5b419a3c._.js:16653:38)\n    at async AppRouteRouteModule.handleResponse (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-route-turbo.runtime.dev.js:1:187713)\n    at async handleResponse (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\3d533_next_5b419a3c._.js:16716:32)\n    at async Module.handler (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\3d533_next_5b419a3c._.js:16769:13)\n    at async DevServer.renderToResponseWithComponentsImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1422:9)\n    at async DevServer.renderPageComponent (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1474:24)\n    at async DevServer.renderToResponseImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1524:32)\n    at async DevServer.pipeImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1018:25)\n    at async NextNodeServer.handleCatchallRenderRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\next-server.js:395:17)\n    at async DevServer.handleRequestImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:909:17)\n    at async C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\dev\\next-dev-server.js:387:20\n    at async Span.traceAsyncFn (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\trace\\trace.js:157:20)\n    at async DevServer.handleRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\dev\\next-dev-server.js:383:24)\n    at async invokeRender (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:248:21)\n    at async handleRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:447:24)\n    at async requestHandlerImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:496:13)\n    at async Server.requestListener (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\start-server.js:226:13)	DB_QUERY_ERROR	CRITICAL	\N	\N	companySettings.findFirst	\N	\N	\N	\N	\N	{"model": "companySettings", "hasArgs": true, "operation": "companySettings.findFirst", "prismaError": true}	f	\N	\N	\N
cmlr933g30006ytzf5fo6cbv3	2026-02-17 23:44:46.899	Resend API error: {"statusCode":429,"name":"rate_limit_exceeded","message":"Too many requests. You can only make 2 requests per second. See rate limit response headers for more information. Or contact support to increase rate limit."}	Error: Resend API error: {"statusCode":429,"name":"rate_limit_exceeded","message":"Too many requests. You can only make 2 requests per second. See rate limit response headers for more information. Or contact support to increase rate limit."}\n    at sendResendEmail (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\[root-of-the-server]__0bd10c52._.js:2045:182)\n    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)\n    at async logError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\[root-of-the-server]__0bd10c52._.js:1105:17)\n    at async logPrismaError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\[root-of-the-server]__0bd10c52._.js:891:9)	EXTERNAL_EMAIL_ERROR	MEDIUM	\N	\N	resend.com/emails	POST	\N	\N	\N	\N	{"to": "soporte@movopos.com", "subject": "🚨 [CRITICAL] Error en MOVOPos: DB_QUERY_ERROR", "statusCode": 429}	f	\N	\N	\N
cmlr933nw0007ytzfqukfocds	2026-02-17 23:44:47.18	Resend API error: {"statusCode":429,"name":"rate_limit_exceeded","message":"Too many requests. You can only make 2 requests per second. See rate limit response headers for more information. Or contact support to increase rate limit."}	Error: Resend API error: {"statusCode":429,"name":"rate_limit_exceeded","message":"Too many requests. You can only make 2 requests per second. See rate limit response headers for more information. Or contact support to increase rate limit."}\n    at sendResendEmail (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\[root-of-the-server]__0bd10c52._.js:2045:182)\n    at process.processTicksAndRejections (node:internal/process/task_queues:105:5)\n    at async logError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\[root-of-the-server]__0bd10c52._.js:1105:17)\n    at async logPrismaError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\[root-of-the-server]__0bd10c52._.js:891:9)	EXTERNAL_EMAIL_ERROR	MEDIUM	\N	\N	resend.com/emails	POST	\N	\N	\N	\N	{"to": "soporte@movopos.com", "subject": "🚨 [CRITICAL] Error en MOVOPos: DB_QUERY_ERROR", "statusCode": 429}	f	\N	\N	\N
cmlr93cs30008ytzfioo7tir8	2026-02-17 23:44:58.996	\nInvalid `__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].category.findMany()` invocation in\nC:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\Documents_pos_src_9c426889._.js:3421:164\n\n  3418 async function getAllCategories() {\n  3419     const user = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getCurrentUser"])();\n  3420     if (!user) throw new Error("No autenticado");\n→ 3421     return __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].category.findMany(\nThe column `existe` does not exist in the current database.	PrismaClientKnownRequestError: \nInvalid `__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].category.findMany()` invocation in\nC:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\Documents_pos_src_9c426889._.js:3421:164\n\n  3418 async function getAllCategories() {\n  3419     const user = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getCurrentUser"])();\n  3420     if (!user) throw new Error("No autenticado");\n→ 3421     return __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].category.findMany(\nThe column `existe` does not exist in the current database.\n    at $n.handleRequestError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:7315)\n    at $n.handleAndLogRequestError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6623)\n    at $n.request (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6307)\n    at async l (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:130:9633)\n    at async Proxy.<anonymous> (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\[root-of-the-server]__0bd10c52._.js:939:32)\n    at async executeActionAndPrepareForRender (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:36:3803)\n    at async C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:36:1109\n    at async handleAction (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:34:23598)\n    at async renderToHTMLOrFlightImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:41:42106)\n    at async doRender (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\3d533_next_dist_0b7b93c2._.js:2868:28)\n    at async AppPageRouteModule.handleResponse (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:43:64241)\n    at async handleResponse (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\3d533_next_dist_0b7b93c2._.js:3074:32)\n    at async Module.handler (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\3d533_next_dist_0b7b93c2._.js:3445:20)\n    at async DevServer.renderToResponseWithComponentsImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1422:9)\n    at async DevServer.renderPageComponent (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1474:24)\n    at async DevServer.renderToResponseImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1524:32)\n    at async DevServer.pipeImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1018:25)\n    at async NextNodeServer.handleCatchallRenderRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\next-server.js:395:17)\n    at async DevServer.handleRequestImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:909:17)\n    at async C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\dev\\next-dev-server.js:387:20\n    at async Span.traceAsyncFn (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\trace\\trace.js:157:20)\n    at async DevServer.handleRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\dev\\next-dev-server.js:383:24)\n    at async invokeRender (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:248:21)\n    at async handleRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:447:24)\n    at async requestHandlerImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:496:13)\n    at async Server.requestListener (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\start-server.js:226:13)	DB_QUERY_ERROR	CRITICAL	\N	\N	category.findMany	\N	\N	\N	\N	\N	{"model": "category", "hasArgs": true, "operation": "category.findMany", "prismaError": true}	f	\N	\N	\N
cmlr93dau0009ytzfkhefblkr	2026-02-17 23:44:59.671	\nInvalid `__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].companySettings.findFirst()` invocation in\nC:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\Documents_pos_src_9c426889._.js:3605:180\n\n  3602 async function getSettings() {\n  3603     const user = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getCurrentUser"])();\n  3604     if (!user) throw new Error("No autenticado");\n→ 3605     const s = await __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].companySettings.findFirst(\nThe column `existe` does not exist in the current database.	PrismaClientKnownRequestError: \nInvalid `__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].companySettings.findFirst()` invocation in\nC:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\Documents_pos_src_9c426889._.js:3605:180\n\n  3602 async function getSettings() {\n  3603     const user = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getCurrentUser"])();\n  3604     if (!user) throw new Error("No autenticado");\n→ 3605     const s = await __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].companySettings.findFirst(\nThe column `existe` does not exist in the current database.\n    at $n.handleRequestError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:7315)\n    at $n.handleAndLogRequestError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6623)\n    at $n.request (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6307)\n    at async l (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:130:9633)\n    at async Proxy.<anonymous> (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\[root-of-the-server]__0bd10c52._.js:939:32)\n    at async getSettings (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\Documents_pos_src_9c426889._.js:3605:15)\n    at async executeActionAndPrepareForRender (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:36:3803)\n    at async C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:36:1109\n    at async handleAction (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:34:23598)\n    at async renderToHTMLOrFlightImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:41:42106)\n    at async doRender (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\3d533_next_dist_0b7b93c2._.js:2868:28)\n    at async AppPageRouteModule.handleResponse (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:43:64241)\n    at async handleResponse (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\3d533_next_dist_0b7b93c2._.js:3074:32)\n    at async Module.handler (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\3d533_next_dist_0b7b93c2._.js:3445:20)\n    at async DevServer.renderToResponseWithComponentsImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1422:9)\n    at async DevServer.renderPageComponent (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1474:24)\n    at async DevServer.renderToResponseImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1524:32)\n    at async DevServer.pipeImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1018:25)\n    at async NextNodeServer.handleCatchallRenderRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\next-server.js:395:17)\n    at async DevServer.handleRequestImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:909:17)\n    at async C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\dev\\next-dev-server.js:387:20\n    at async Span.traceAsyncFn (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\trace\\trace.js:157:20)\n    at async DevServer.handleRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\dev\\next-dev-server.js:383:24)\n    at async invokeRender (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:248:21)\n    at async handleRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:447:24)\n    at async requestHandlerImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:496:13)\n    at async Server.requestListener (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\start-server.js:226:13)	DB_QUERY_ERROR	CRITICAL	\N	\N	companySettings.findFirst	\N	\N	\N	\N	\N	{"model": "companySettings", "hasArgs": true, "operation": "companySettings.findFirst", "prismaError": true}	f	\N	\N	\N
cmlr93e73000aytzfxkbtud4r	2026-02-17 23:45:00.831	\nInvalid `__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].category.findMany()` invocation in\nC:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\Documents_pos_src_9c426889._.js:3421:164\n\n  3418 async function getAllCategories() {\n  3419     const user = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getCurrentUser"])();\n  3420     if (!user) throw new Error("No autenticado");\n→ 3421     return __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].category.findMany(\nThe column `existe` does not exist in the current database.	PrismaClientKnownRequestError: \nInvalid `__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].category.findMany()` invocation in\nC:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\Documents_pos_src_9c426889._.js:3421:164\n\n  3418 async function getAllCategories() {\n  3419     const user = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getCurrentUser"])();\n  3420     if (!user) throw new Error("No autenticado");\n→ 3421     return __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].category.findMany(\nThe column `existe` does not exist in the current database.\n    at $n.handleRequestError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:7315)\n    at $n.handleAndLogRequestError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6623)\n    at $n.request (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6307)\n    at async l (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:130:9633)\n    at async Proxy.<anonymous> (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\[root-of-the-server]__0bd10c52._.js:939:32)\n    at async executeActionAndPrepareForRender (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:36:3803)\n    at async C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:36:1109\n    at async handleAction (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:34:23598)\n    at async renderToHTMLOrFlightImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:41:42106)\n    at async doRender (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\3d533_next_dist_0b7b93c2._.js:2868:28)\n    at async AppPageRouteModule.handleResponse (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:43:64241)\n    at async handleResponse (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\3d533_next_dist_0b7b93c2._.js:3074:32)\n    at async Module.handler (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\3d533_next_dist_0b7b93c2._.js:3445:20)\n    at async DevServer.renderToResponseWithComponentsImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1422:9)\n    at async DevServer.renderPageComponent (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1474:24)\n    at async DevServer.renderToResponseImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1524:32)\n    at async DevServer.pipeImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1018:25)\n    at async NextNodeServer.handleCatchallRenderRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\next-server.js:395:17)\n    at async DevServer.handleRequestImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:909:17)\n    at async C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\dev\\next-dev-server.js:387:20\n    at async Span.traceAsyncFn (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\trace\\trace.js:157:20)\n    at async DevServer.handleRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\dev\\next-dev-server.js:383:24)\n    at async invokeRender (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:248:21)\n    at async handleRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:447:24)\n    at async requestHandlerImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:496:13)\n    at async Server.requestListener (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\start-server.js:226:13)	DB_QUERY_ERROR	CRITICAL	\N	\N	category.findMany	\N	\N	\N	\N	\N	{"model": "category", "hasArgs": true, "operation": "category.findMany", "prismaError": true}	f	\N	\N	\N
cmlr93eh3000bytzflxmfa3j4	2026-02-17 23:45:01.191	\nInvalid `__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].companySettings.findFirst()` invocation in\nC:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\Documents_pos_src_9c426889._.js:3605:180\n\n  3602 async function getSettings() {\n  3603     const user = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getCurrentUser"])();\n  3604     if (!user) throw new Error("No autenticado");\n→ 3605     const s = await __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].companySettings.findFirst(\nThe column `existe` does not exist in the current database.	PrismaClientKnownRequestError: \nInvalid `__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].companySettings.findFirst()` invocation in\nC:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\Documents_pos_src_9c426889._.js:3605:180\n\n  3602 async function getSettings() {\n  3603     const user = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getCurrentUser"])();\n  3604     if (!user) throw new Error("No autenticado");\n→ 3605     const s = await __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].companySettings.findFirst(\nThe column `existe` does not exist in the current database.\n    at $n.handleRequestError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:7315)\n    at $n.handleAndLogRequestError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6623)\n    at $n.request (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6307)\n    at async l (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:130:9633)\n    at async Proxy.<anonymous> (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\[root-of-the-server]__0bd10c52._.js:939:32)\n    at async getSettings (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\Documents_pos_src_9c426889._.js:3605:15)\n    at async executeActionAndPrepareForRender (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:36:3803)\n    at async C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:36:1109\n    at async handleAction (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:34:23598)\n    at async renderToHTMLOrFlightImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:41:42106)\n    at async doRender (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\3d533_next_dist_0b7b93c2._.js:2868:28)\n    at async AppPageRouteModule.handleResponse (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:43:64241)\n    at async handleResponse (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\3d533_next_dist_0b7b93c2._.js:3074:32)\n    at async Module.handler (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\3d533_next_dist_0b7b93c2._.js:3445:20)\n    at async DevServer.renderToResponseWithComponentsImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1422:9)\n    at async DevServer.renderPageComponent (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1474:24)\n    at async DevServer.renderToResponseImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1524:32)\n    at async DevServer.pipeImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1018:25)\n    at async NextNodeServer.handleCatchallRenderRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\next-server.js:395:17)\n    at async DevServer.handleRequestImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:909:17)\n    at async C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\dev\\next-dev-server.js:387:20\n    at async Span.traceAsyncFn (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\trace\\trace.js:157:20)\n    at async DevServer.handleRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\dev\\next-dev-server.js:383:24)\n    at async invokeRender (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:248:21)\n    at async handleRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:447:24)\n    at async requestHandlerImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:496:13)\n    at async Server.requestListener (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\start-server.js:226:13)	DB_QUERY_ERROR	CRITICAL	\N	\N	companySettings.findFirst	\N	\N	\N	\N	\N	{"model": "companySettings", "hasArgs": true, "operation": "companySettings.findFirst", "prismaError": true}	f	\N	\N	\N
cmlr93jmd000cytzf5r8pu4vr	2026-02-17 23:45:07.862	\nInvalid `__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].companySettings.findFirst()` invocation in\nC:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\Documents_pos_src_9c426889._.js:3605:180\n\n  3602 async function getSettings() {\n  3603     const user = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getCurrentUser"])();\n  3604     if (!user) throw new Error("No autenticado");\n→ 3605     const s = await __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].companySettings.findFirst(\nThe column `existe` does not exist in the current database.	PrismaClientKnownRequestError: \nInvalid `__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].companySettings.findFirst()` invocation in\nC:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\Documents_pos_src_9c426889._.js:3605:180\n\n  3602 async function getSettings() {\n  3603     const user = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getCurrentUser"])();\n  3604     if (!user) throw new Error("No autenticado");\n→ 3605     const s = await __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].companySettings.findFirst(\nThe column `existe` does not exist in the current database.\n    at $n.handleRequestError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:7315)\n    at $n.handleAndLogRequestError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6623)\n    at $n.request (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6307)\n    at async l (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:130:9633)\n    at async Proxy.<anonymous> (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\[root-of-the-server]__0bd10c52._.js:939:32)\n    at async getSettings (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\Documents_pos_src_9c426889._.js:3605:15)\n    at async executeActionAndPrepareForRender (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:36:3803)\n    at async C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:36:1109\n    at async handleAction (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:34:23598)\n    at async renderToHTMLOrFlightImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:41:42106)\n    at async doRender (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\3d533_next_dist_d04d9081._.js:2868:28)\n    at async AppPageRouteModule.handleResponse (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:43:64241)\n    at async handleResponse (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\3d533_next_dist_d04d9081._.js:3074:32)\n    at async Module.handler (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\3d533_next_dist_d04d9081._.js:3445:20)\n    at async DevServer.renderToResponseWithComponentsImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1422:9)\n    at async DevServer.renderPageComponent (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1474:24)\n    at async DevServer.renderToResponseImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1524:32)\n    at async DevServer.pipeImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1018:25)\n    at async NextNodeServer.handleCatchallRenderRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\next-server.js:395:17)\n    at async DevServer.handleRequestImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:909:17)\n    at async C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\dev\\next-dev-server.js:387:20\n    at async Span.traceAsyncFn (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\trace\\trace.js:157:20)\n    at async DevServer.handleRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\dev\\next-dev-server.js:383:24)\n    at async invokeRender (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:248:21)\n    at async handleRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:447:24)\n    at async requestHandlerImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:496:13)\n    at async Server.requestListener (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\start-server.js:226:13)	DB_QUERY_ERROR	CRITICAL	\N	\N	companySettings.findFirst	\N	\N	\N	\N	\N	{"model": "companySettings", "hasArgs": true, "operation": "companySettings.findFirst", "prismaError": true}	f	\N	\N	\N
cmlr93jza000dytzfmisuk7bq	2026-02-17 23:45:08.327	\nInvalid `__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].companySettings.findFirst()` invocation in\nC:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\Documents_pos_src_9c426889._.js:3605:180\n\n  3602 async function getSettings() {\n  3603     const user = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getCurrentUser"])();\n  3604     if (!user) throw new Error("No autenticado");\n→ 3605     const s = await __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].companySettings.findFirst(\nThe column `existe` does not exist in the current database.	PrismaClientKnownRequestError: \nInvalid `__TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].companySettings.findFirst()` invocation in\nC:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\Documents_pos_src_9c426889._.js:3605:180\n\n  3602 async function getSettings() {\n  3603     const user = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$auth$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["getCurrentUser"])();\n  3604     if (!user) throw new Error("No autenticado");\n→ 3605     const s = await __TURBOPACK__imported__module__$5b$project$5d2f$Documents$2f$pos$2f$src$2f$lib$2f$db$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["prisma"].companySettings.findFirst(\nThe column `existe` does not exist in the current database.\n    at $n.handleRequestError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:7315)\n    at $n.handleAndLogRequestError (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6623)\n    at $n.request (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:121:6307)\n    at async l (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\@prisma\\client\\runtime\\library.js:130:9633)\n    at async Proxy.<anonymous> (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\[root-of-the-server]__0bd10c52._.js:939:32)\n    at async getSettings (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\Documents_pos_src_9c426889._.js:3605:15)\n    at async executeActionAndPrepareForRender (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:36:3803)\n    at async C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:36:1109\n    at async handleAction (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:34:23598)\n    at async renderToHTMLOrFlightImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:41:42106)\n    at async doRender (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\3d533_next_dist_d04d9081._.js:2868:28)\n    at async AppPageRouteModule.handleResponse (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\compiled\\next-server\\app-page-turbo.runtime.dev.js:43:64241)\n    at async handleResponse (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\3d533_next_dist_d04d9081._.js:3074:32)\n    at async Module.handler (C:\\Users\\Albin Rodriguez\\Documents\\pos\\.next\\dev\\server\\chunks\\ssr\\3d533_next_dist_d04d9081._.js:3445:20)\n    at async DevServer.renderToResponseWithComponentsImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1422:9)\n    at async DevServer.renderPageComponent (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1474:24)\n    at async DevServer.renderToResponseImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1524:32)\n    at async DevServer.pipeImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:1018:25)\n    at async NextNodeServer.handleCatchallRenderRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\next-server.js:395:17)\n    at async DevServer.handleRequestImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\base-server.js:909:17)\n    at async C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\dev\\next-dev-server.js:387:20\n    at async Span.traceAsyncFn (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\trace\\trace.js:157:20)\n    at async DevServer.handleRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\dev\\next-dev-server.js:383:24)\n    at async invokeRender (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:248:21)\n    at async handleRequest (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:447:24)\n    at async requestHandlerImpl (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\router-server.js:496:13)\n    at async Server.requestListener (C:\\Users\\Albin Rodriguez\\Documents\\pos\\node_modules\\next\\dist\\server\\lib\\start-server.js:226:13)	DB_QUERY_ERROR	CRITICAL	\N	\N	companySettings.findFirst	\N	\N	\N	\N	\N	{"model": "companySettings", "hasArgs": true, "operation": "companySettings.findFirst", "prismaError": true}	f	\N	\N	\N
\.


--
-- Data for Name: InventoryAdjustment; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."InventoryAdjustment" (id, "createdAt", "accountId", "productId", "userId", "qtyDelta", reason, note, "batchId") FROM stdin;
\.


--
-- Data for Name: InvoiceSequence; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."InvoiceSequence" (id, "createdAt", "updatedAt", series, "lastNumber", "accountId") FROM stdin;
cmkt7jx7x000bnx5pvgbqrqu9	2026-01-25 03:57:42.765	2026-01-26 01:12:38.301	A	1	cmkt7jx7i0007nx5pyqp0tpk5
cmkroaow90006p10vh6cxmyd0	2026-01-24 02:10:53.193	2026-01-31 04:14:25.907	A	4	cmkroaow00002p10vj3ikznpg
\.


--
-- Data for Name: OperatingExpense; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."OperatingExpense" (id, "createdAt", "updatedAt", description, "amountCents", "expenseDate", category, "userId", notes, "accountId") FROM stdin;
\.


--
-- Data for Name: Payment; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Payment" (id, "createdAt", "arId", "userId", "paidAt", "amountCents", method, note, "cancelledAt", "cancelledBy", "receiptNumber", "receiptCode") FROM stdin;
cmkuh51x4000lzmsknwk8h59w	2026-01-26 01:13:51.352	cmkuh3hl2000izmsku9rnpadb	cmkt7kdfm000lnx5p33zsqrre	2026-01-26 01:13:51.352	400	EFECTIVO	\N	\N	\N	1	R-000001
cmkv5j1tf000n7bpgsbtc1tjd	2026-01-26 12:36:35.188	cmkv5iqil000i7bpgw0hmgjp2	cmkroat6y000gp10vjsczprp9	2026-01-26 12:36:35.188	10000	EFECTIVO	\N	\N	\N	1	R-000001
cmkv5jbpn000u7bpglp4jk98w	2026-01-26 12:36:48.012	cmkv5iqil000i7bpgw0hmgjp2	cmkroat6y000gp10vjsczprp9	2026-01-26 12:36:48.012	6500	EFECTIVO	\N	2026-01-26 12:47:39.84	cmkroat6y000gp10vjsczprp9	2	R-000002
\.


--
-- Data for Name: PaymentSequence; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."PaymentSequence" (id, "createdAt", "updatedAt", "accountId", "lastNumber") FROM stdin;
5478f225-6be6-4012-989b-bb0322ffbaed	2026-01-26 12:30:55.4	2026-01-26 12:30:55.4	cmkt7jx7i0007nx5pyqp0tpk5	1
cmkv5j1ta000l7bpgktay6jps	2026-01-26 12:36:35.182	2026-01-26 12:36:48.009	cmkroaow00002p10vj3ikznpg	2
\.


--
-- Data for Name: Product; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Product" (id, "createdAt", "updatedAt", name, sku, reference, "supplierId", "categoryId", "priceCents", "costCents", "itbisRateBp", "purchaseUnit", "saleUnit", stock, "minStock", "isActive", "imageUrls", "accountId", "productId") FROM stdin;
cmkrp04sw000up10vt83o45yg	2026-01-24 02:30:40.203	2026-01-24 02:30:40.203	gafa	\N	\N	\N	\N	10000	5000	1800	UNIDAD	UNIDAD	50.000	0.000	t	{}	cmkroaow00002p10vj3ikznpg	1
cmkrpjt94000112m2e0tko2kj	2026-01-24 02:45:58.36	2026-01-24 02:45:58.36	gafa2	\N	\N	\N	\N	6000	3000	1800	UNIDAD	UNIDAD	50.000	0.000	t	{}	cmkroaow00002p10vj3ikznpg	2
cmkrpt4bk0001chv63zxr8b4e	2026-01-24 02:53:12.609	2026-01-24 02:53:12.609	gafa4	\N	\N	\N	\N	6000	3000	1800	UNIDAD	UNIDAD	66.000	0.000	t	{}	cmkroaow00002p10vj3ikznpg	4
cmkrq0rp50001l5lemidtkmfy	2026-01-24 02:59:09.497	2026-01-24 02:59:09.497	gafa5	\N	\N	\N	\N	5000	1000	1800	UNIDAD	UNIDAD	50.000	0.000	t	{}	cmkroaow00002p10vj3ikznpg	5
cmkrq46nk0001y6vi69sogdwx	2026-01-24 03:01:48.848	2026-01-24 03:01:48.848	gafa56	\N	\N	\N	\N	44500	4400	1800	UNIDAD	UNIDAD	0.000	0.000	t	{}	cmkroaow00002p10vj3ikznpg	6
cmkrq6pif0001nvgb3smxdays	2026-01-24 03:03:46.6	2026-01-24 03:03:46.6	gafafafa	\N	\N	\N	\N	6000	300	1800	UNIDAD	UNIDAD	0.000	0.000	t	{}	cmkroaow00002p10vj3ikznpg	7
cmkrqbe330001hrxnn2ciq82n	2026-01-24 03:07:25.071	2026-01-24 03:07:25.071	afdfafs	\N	\N	\N	\N	5000	400	1800	UNIDAD	UNIDAD	0.000	0.000	t	{}	cmkroaow00002p10vj3ikznpg	8
cmkrqf39t000110h2e0mlei2o	2026-01-24 03:10:17.681	2026-01-24 03:10:17.681	dsddsf	\N	\N	\N	\N	400	200	1800	UNIDAD	UNIDAD	0.000	0.000	t	{}	cmkroaow00002p10vj3ikznpg	9
cmkrqjadj0001j8bdpy4g9o1k	2026-01-24 03:13:33.511	2026-01-24 03:13:33.511	sdsdsd	\N	\N	\N	\N	4300	200	1800	UNIDAD	UNIDAD	0.000	0.000	t	{}	cmkroaow00002p10vj3ikznpg	10
cmkrqnvcl0001bspko925xn56	2026-01-24 03:17:07.317	2026-01-24 03:17:07.317	gsdsads	\N	\N	\N	\N	5000	400	1800	UNIDAD	UNIDAD	0.000	0.000	t	{}	cmkroaow00002p10vj3ikznpg	11
cmkrqx2800001cb3jwopg9cs2	2026-01-24 03:24:16.128	2026-01-24 03:24:16.128	dsdsd	\N	\N	\N	\N	5500	500	1800	UNIDAD	UNIDAD	0.000	0.000	t	{}	cmkroaow00002p10vj3ikznpg	12
cmkrr3v460001fqrfrlu3u32u	2026-01-24 03:29:33.51	2026-01-24 03:29:33.51	sddsdsd	\N	\N	\N	\N	500	200	1800	UNIDAD	UNIDAD	0.000	0.000	t	{}	cmkroaow00002p10vj3ikznpg	13
cmkrpp3du00019bcy2nzhtrqo	2026-01-24 02:50:04.77	2026-01-31 04:14:25.967	gafa3	\N	\N	\N	\N	5000	2500	1800	UNIDAD	UNIDAD	38.000	0.000	t	{}	cmkroaow00002p10vj3ikznpg	3
cmkrrk04r000111654g65lj99	2026-01-24 03:42:06.507	2026-01-24 03:42:06.507	fdsfdf	\N	\N	\N	\N	55500	500	1800	UNIDAD	UNIDAD	0.000	0.000	t	{}	cmkroaow00002p10vj3ikznpg	15
cmkrrkezm00051165m0cohmux	2026-01-24 03:42:25.762	2026-01-24 03:42:25.762	dsfdsfd	\N	\N	\N	\N	4500	400	1800	UNIDAD	UNIDAD	0.000	0.000	t	{}	cmkroaow00002p10vj3ikznpg	16
cmkrrmp9f000d11656dapndhx	2026-01-24 03:44:12.387	2026-01-24 03:44:12.387	aldsds	\N	\N	\N	\N	343400	300	1800	UNIDAD	UNIDAD	0.000	0.000	t	{}	cmkroaow00002p10vj3ikznpg	17
cmkuh38w90005zmsk8q6lxd42	2026-01-26 01:12:27.081	2026-01-26 01:12:38.337	gafa	\N	\N	\N	\N	5000	500	1800	UNIDAD	UNIDAD	-1.000	0.000	t	{}	cmkt7jx7i0007nx5pyqp0tpk5	1
cmkv4vv3h000310kl8h4ha2k0	2026-01-26 12:18:33.389	2026-01-26 12:18:33.389	Alfombra	\N	\N	\N	\N	500	300	1800	UNIDAD	UNIDAD	0.000	0.000	t	{}	cmkt7jx7i0007nx5pyqp0tpk5	2
cmkv4wr53000d10klyj43at88	2026-01-26 12:19:14.919	2026-01-26 12:19:14.919	gafa18	\N	\N	\N	\N	200	100	1800	UNIDAD	UNIDAD	0.000	0.000	t	{}	cmkroaow00002p10vj3ikznpg	18
cmkv4xpy3000x10klnc4n0g1m	2026-01-26 12:20:00.028	2026-01-26 12:20:00.028	gafa19	\N	\N	\N	\N	400	200	1800	UNIDAD	UNIDAD	0.000	0.000	t	{}	cmkroaow00002p10vj3ikznpg	19
cmkrr4olb0001soy5gsvvpbdz	2026-01-24 03:30:11.711	2026-01-31 04:14:25.961	gads	\N	\N	\N	\N	3300	300	1800	UNIDAD	UNIDAD	-9.000	0.000	t	{}	cmkroaow00002p10vj3ikznpg	14
\.


--
-- Data for Name: ProductSequence; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."ProductSequence" (id, "createdAt", "updatedAt", "accountId", "lastNumber") FROM stdin;
357ce9f6-b4d8-4a81-ade5-f2a4b483595d	2026-01-26 12:14:24.515	2026-01-26 12:18:33.384	cmkt7jx7i0007nx5pyqp0tpk5	2
862b3b12-3c34-4b18-b650-d5c3fb8633ab	2026-01-26 12:14:24.515	2026-01-26 12:20:00.021	cmkroaow00002p10vj3ikznpg	19
\.


--
-- Data for Name: Purchase; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Purchase" (id, "createdAt", "updatedAt", "purchasedAt", "supplierName", "userId", "totalCents", notes, "cancelledAt", "cancelledBy", "accountId") FROM stdin;
\.


--
-- Data for Name: PurchaseItem; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."PurchaseItem" (id, "createdAt", "purchaseId", "productId", qty, "unitCostCents", "discountPercentBp", "netCostCents", "lineTotalCents", "salePriceCents", "saleMarginBp", "purchaseIncludesItbis", "appliedItbisRateBp") FROM stdin;
\.


--
-- Data for Name: Quote; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Quote" (id, "createdAt", "updatedAt", "quoteNumber", "quoteCode", "quotedAt", "validUntil", "customerId", "userId", "subtotalCents", "itbisCents", "shippingCents", "totalCents", notes, "accountId") FROM stdin;
\.


--
-- Data for Name: QuoteItem; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."QuoteItem" (id, "createdAt", "quoteId", "productId", qty, "unitPriceCents", "wasPriceOverridden", "lineTotalCents") FROM stdin;
\.


--
-- Data for Name: QuoteSequence; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."QuoteSequence" (id, "createdAt", "updatedAt", "lastNumber", "accountId") FROM stdin;
cmkroaowg000ap10vwlo6xxmx	2026-01-24 02:10:53.2	2026-01-24 02:10:53.2	0	cmkroaow00002p10vj3ikznpg
cmkt7jx86000fnx5p99bjk1oy	2026-01-25 03:57:42.774	2026-01-25 03:57:42.774	0	cmkt7jx7i0007nx5pyqp0tpk5
\.


--
-- Data for Name: Return; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Return" (id, "createdAt", "updatedAt", "returnNumber", "returnCode", "returnedAt", "saleId", "userId", "subtotalCents", "itbisCents", "totalCents", notes, "cancelledAt", "cancelledBy", "accountId") FROM stdin;
\.


--
-- Data for Name: ReturnItem; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."ReturnItem" (id, "createdAt", "returnId", "saleItemId", "productId", qty, "unitPriceCents", "lineTotalCents") FROM stdin;
\.


--
-- Data for Name: ReturnSequence; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."ReturnSequence" (id, "createdAt", "updatedAt", "lastNumber", "accountId") FROM stdin;
cmkroaowc0008p10v1ezik5zp	2026-01-24 02:10:53.197	2026-01-24 02:10:53.197	0	cmkroaow00002p10vj3ikznpg
cmkt7jx81000dnx5pvjcp8rng	2026-01-25 03:57:42.77	2026-01-25 03:57:42.77	0	cmkt7jx7i0007nx5pyqp0tpk5
\.


--
-- Data for Name: Sale; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Sale" (id, "createdAt", "updatedAt", "invoiceSeries", "invoiceNumber", "invoiceCode", "soldAt", type, "paymentMethod", "customerId", "userId", "subtotalCents", "itbisCents", "shippingCents", "totalCents", notes, "cancelledAt", "cancelledBy", "accountId") FROM stdin;
cmkuh3hk8000czmskrb5o7ego	2026-01-26 01:12:38.313	2026-01-26 01:12:38.313	A	1	A-00001	2026-01-26 01:12:38.313	CREDITO	\N	cmkuh2rat0001zmsk04xichum	cmkt7kdfm000lnx5p33zsqrre	4237	763	0	5000	\N	\N	\N	cmkt7jx7i0007nx5pyqp0tpk5
cmkv5iqi6000c7bpgzsegcy28	2026-01-26 12:36:20.526	2026-01-26 12:36:20.526	A	1	A-00001	2026-01-26 12:36:20.526	CREDITO	\N	cmkv5ih1y00057bpgpk5uw58s	cmkroat6y000gp10vjsczprp9	13983	2517	0	16500	\N	\N	\N	cmkroaow00002p10vj3ikznpg
cml1so7100008iqs8h2q8wv2y	2026-01-31 04:11:03.445	2026-01-31 04:11:03.445	A	2	A-00002	2026-01-31 04:11:03.445	CONTADO	EFECTIVO	cmkroaowj000cp10vk3wm2t1s	cmkroat6y000gp10vjsczprp9	2797	503	0	3300	\N	\N	\N	cmkroaow00002p10vj3ikznpg
cml1sonb5000hiqs87crqit4g	2026-01-31 04:11:24.546	2026-01-31 04:11:24.546	A	3	A-00003	2026-01-31 04:11:24.546	CONTADO	EFECTIVO	cmkroaowj000cp10vk3wm2t1s	cmkroat6y000gp10vjsczprp9	2797	503	10000	13300	\N	\N	\N	cmkroaow00002p10vj3ikznpg
cml1ssj9r000qiqs82f4ysufy	2026-01-31 04:14:25.935	2026-01-31 04:14:25.935	A	4	A-00004	2026-01-31 04:14:25.935	CONTADO	EFECTIVO	cmkroaowj000cp10vk3wm2t1s	cmkroat6y000gp10vjsczprp9	31017	5583	10000	46600	\N	\N	\N	cmkroaow00002p10vj3ikznpg
\.


--
-- Data for Name: SaleItem; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."SaleItem" (id, "createdAt", "saleId", "productId", qty, "unitPriceCents", "wasPriceOverridden", "lineTotalCents") FROM stdin;
cmkuh3hk8000ezmskhwvd76uk	2026-01-26 01:12:38.313	cmkuh3hk8000czmskrb5o7ego	cmkuh38w90005zmsk8q6lxd42	1.000	5000	f	5000
cmkv5iqi6000e7bpgqkvjjotw	2026-01-26 12:36:20.526	cmkv5iqi6000c7bpgzsegcy28	cmkrr4olb0001soy5gsvvpbdz	5.000	3300	f	16500
cml1so710000aiqs8n2p7b75i	2026-01-31 04:11:03.445	cml1so7100008iqs8h2q8wv2y	cmkrr4olb0001soy5gsvvpbdz	1.000	3300	f	3300
cml1sonb6000jiqs8si2l2hut	2026-01-31 04:11:24.546	cml1sonb5000hiqs87crqit4g	cmkrr4olb0001soy5gsvvpbdz	1.000	3300	f	3300
cml1ssj9s000siqs82lvb53lo	2026-01-31 04:14:25.935	cml1ssj9r000qiqs82f4ysufy	cmkrr4olb0001soy5gsvvpbdz	2.000	3300	f	6600
cml1ssj9s000tiqs8fpqk3iai	2026-01-31 04:14:25.935	cml1ssj9r000qiqs82f4ysufy	cmkrpp3du00019bcy2nzhtrqo	6.000	5000	f	30000
\.


--
-- Data for Name: SalePayment; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."SalePayment" (id, "createdAt", "saleId", method, "amountCents") FROM stdin;
\.


--
-- Data for Name: SubUserLoginToken; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."SubUserLoginToken" (id, "accountId", "userId", "codeHash", "expiresAt", "usedAt", "createdAt") FROM stdin;
\.


--
-- Data for Name: SuperAdmin; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."SuperAdmin" (id, "createdAt", "updatedAt", email, name, "passwordHash", role, "lastLoginAt", "isActive", "canManageAccounts", "canApprovePayments", "canModifyPricing", "canSendEmails", "canDeleteAccounts", "canViewFinancials") FROM stdin;
cmkro566c000aflt7m8bdxw5o	2026-01-24 02:06:35.652	2026-01-25 03:48:08.474	albinmrodriguez@gmail.com	Albin Rodriguez	$2b$10$F27jhPC0KBaEiCSGgLbUJu..SGlktbdJ1zliSB34G2LERit/o1q4S	OWNER	2026-01-25 03:48:08.469	t	t	t	t	t	t	t
\.


--
-- Data for Name: SuperAdminAuditLog; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."SuperAdminAuditLog" (id, "createdAt", "superAdminId", action, "targetAccountId", "targetPaymentId", metadata, "ipAddress") FROM stdin;
cmkro63nv0001hvsco0zdmu4e	2026-01-24 02:07:19.051	cmkro566c000aflt7m8bdxw5o	login_success	\N	\N	\N	\N
cmkro9z450001p10v2iqben78	2026-01-24 02:10:19.781	cmkro566c000aflt7m8bdxw5o	deleted_account	default_account	\N	{"accountName": "Mi Negocio"}	\N
cmkrovsrx000qp10vofrg1wip	2026-01-24 02:27:17.997	cmkro566c000aflt7m8bdxw5o	login_success	\N	\N	\N	\N
cmkroz7hm000sp10vqruog50p	2026-01-24 02:29:57.034	cmkro566c000aflt7m8bdxw5o	simulated_trial_expiry	cmkroaow00002p10vj3ikznpg	\N	{"trialEndsAt": "2026-01-23T02:29:57.020Z", "trialStartedAt": "2026-01-08T02:29:57.020Z"}	\N
cmkrrlus500091165g5kcs3oq	2026-01-24 03:43:32.885	cmkro566c000aflt7m8bdxw5o	login_success	\N	\N	\N	\N
cmkrrmb49000b11650dmvd1g5	2026-01-24 03:43:54.057	cmkro566c000aflt7m8bdxw5o	ran_billing_engine	\N	\N	{"processed": 1, "graceExpired": 0, "trialExpired": 1, "periodExpired": 0, "pendingChangesApplied": 0}	\N
cmkt5yh5n0003f6jny0o2ue6d	2026-01-25 03:13:02.555	cmkro566c000aflt7m8bdxw5o	login_success	\N	\N	\N	\N
cmkt5yr580005f6jnrvmsv4a9	2026-01-25 03:13:15.501	cmkro566c000aflt7m8bdxw5o	changed_subscription_status	cmkroaow00002p10vj3ikznpg	\N	{"newStatus": "ACTIVE", "oldStatus": "BLOCKED"}	\N
cmkt6isv2000113ayxhtwi2sj	2026-01-25 03:28:50.845	cmkro566c000aflt7m8bdxw5o	changed_subscription_status	cmkroaow00002p10vj3ikznpg	\N	{"newStatus": "TRIALING", "oldStatus": "ACTIVE"}	\N
cmkt6j5oz000413ay98vwfwml	2026-01-25 03:29:07.475	cmkro566c000aflt7m8bdxw5o	created_bank_account	\N	\N	{"bankId": "cmkt6j5ov000213ayi5b46l5c", "bankName": "andfsdfsd"}	\N
cmkt6jqb4000g13ay6cgizrtr	2026-01-25 03:29:34.192	cmkro566c000aflt7m8bdxw5o	approved_payment	cmkroaow00002p10vj3ikznpg	cmkt6ja67000613ay2b7buloa	{"currency": "DOP", "amountCents": 130000}	\N
cmkt77m3h0001xorqqa9frf9t	2026-01-25 03:48:08.477	cmkro566c000aflt7m8bdxw5o	login_success	\N	\N	\N	\N
cmkt7i8gb0002nx5pppg76fdr	2026-01-25 03:56:24.012	cmkro566c000aflt7m8bdxw5o	created_billing_plan	\N	\N	{"planId": "cmkt7i8g60000nx5pjk12ezvv", "planName": "Plan Promocional", "priceDopCents": 65000, "priceUsdCents": 1000}	\N
cmkt7ir460004nx5pvyr18wwd	2026-01-25 03:56:48.199	cmkro566c000aflt7m8bdxw5o	updated_billing_plan	\N	\N	{"planId": "default_plan_001", "changes": {"id": "default_plan_001", "name": "Plan Estándar", "isActive": true, "isDefault": true, "description": "Plan mensual estándar con acceso completo a todas las funcionalidades", "priceDopCents": 130000, "priceUsdCents": 2000, "lemonVariantId": "1249019"}, "planName": "Plan Estándar"}	\N
cmkt7j99i0006nx5pivje4ivh	2026-01-25 03:57:11.718	cmkro566c000aflt7m8bdxw5o	assigned_billing_plan	cmkroaow00002p10vj3ikznpg	\N	{"newPlan": "Plan Estándar", "oldPlan": "Sin plan", "newPriceDopCents": 130000, "newPriceUsdCents": 2000}	\N
cmkt7l01q000vnx5pir3n5urn	2026-01-25 03:58:33.087	cmkro566c000aflt7m8bdxw5o	assigned_billing_plan	cmkt7jx7i0007nx5pyqp0tpk5	\N	{"newPlan": "Plan Promocional", "oldPlan": "Plan Estándar", "newPriceDopCents": 65000, "newPriceUsdCents": 1000}	\N
\.


--
-- Data for Name: Supplier; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Supplier" (id, "createdAt", "updatedAt", name, "contactName", phone, email, address, notes, "discountPercentBp", "isActive", "accountId", "chargesItbis") FROM stdin;
cml1s8rbl0001cz9hu689cqrr	2026-01-31 03:59:03.249	2026-01-31 03:59:31.868	Distribuidora ABC	\N	\N	\N	\N	\N	0	t	cmkroaow00002p10vj3ikznpg	t
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."User" (id, "createdAt", "updatedAt", name, username, "passwordHash", email, role, "whatsappNumber", "whatsappVerifiedAt", "canOverridePrice", "canCancelSales", "canCancelReturns", "canCancelPayments", "canEditSales", "canEditProducts", "canChangeSaleType", "canSellWithoutStock", "canManageBackups", "isActive", "accountId", "isOwner", "canViewProductCosts", "canViewProfitReport") FROM stdin;
cmkroat6y000gp10vjsczprp9	2026-01-24 02:10:58.762	2026-01-24 02:10:58.762	ADMIN	admin	$2b$10$yOL7V1H9eSvQ35cizf2FFuzeaqX8VD7l1oV9Ic.9YRdXudfaxP6WS	albinmrodriguez@gmail.com	ADMIN	\N	\N	t	t	t	t	t	t	t	t	t	t	cmkroaow00002p10vj3ikznpg	t	t	t
cmkt7kdfm000lnx5p33zsqrre	2026-01-25 03:58:03.778	2026-01-25 03:58:03.778	ADMIN	admin	$2b$10$h1Emy9fxCwdEPrrDKQtLVuMS2NXzx8UaZ8cFyH2uYkTi9O7r78AQu	albinmrodriguez2@gmail.com	ADMIN	\N	\N	t	t	t	t	t	t	t	t	t	t	cmkt7jx7i0007nx5pyqp0tpk5	t	t	t
cmkv4x86n000l10kl7vvl8vh3	2026-01-26 12:19:37.007	2026-01-26 12:19:42.289	fgdfg	ffff	$2b$10$oHXMZimtoFXXTR/YFddcx.gdOoSvlaxAIQWECS2czDchZIAu6j5Dq	\N	CAJERO	\N	\N	t	t	t	t	t	t	t	t	t	t	cmkroaow00002p10vj3ikznpg	f	t	t
\.


--
-- Data for Name: WhatsappOtp; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."WhatsappOtp" (id, "createdAt", "phoneNumber", code, "expiresAt", "consumedAt", purpose, attempts, "ipAddress", "userAgent", "userId") FROM stdin;
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
3b2924e9-2d23-443a-b7a4-0eedda41dbd9	09e8112f3fd7f372277700a3b34bc89a2e04febba6b9067ee22778270318c7dc	2026-01-24 02:06:34.146312+00	20260120151405_init	\N	\N	2026-01-24 02:06:34.029754+00	1
f713de88-3177-4d21-89a5-4f74f3a42cbc	ea98963fd0a9ea30a18c9cd95d61601a78618ec913e8714a6e582336f9859077	2026-01-24 02:06:34.308013+00	20260123175001_nhh	\N	\N	2026-01-24 02:06:34.3069+00	1
fd3ac865-20c4-4d40-8471-351ac35ee840	1792686407d0f4aa912e7dc76736d311e7e073d00ba1324ad8e4a472ec76e832	2026-01-24 02:06:34.227088+00	20260120200000_add_multi_tenancy	\N	\N	2026-01-24 02:06:34.146746+00	1
434288b2-3c6d-48ba-833a-221aa5a36eef	1cfb1784816dea3f9bc294738bb722fcbd38b7f673145095f50602176e986ecc	2026-01-24 02:06:34.239163+00	20260121164941_add_user_view_product_costs	\N	\N	2026-01-24 02:06:34.227795+00	1
af0cba6a-3d74-4d0f-ab69-e7a61782ba7f	731140458a2942ee236498ba079a338f8abb8bb01841eea8424334d4e24fbe56	2026-01-26 00:57:53.658588+00	20260126005742_add_customer_credit_fields	\N	\N	2026-01-26 00:57:53.653291+00	1
ab267203-c8f7-471c-8582-e74c500a827a	2391bfbd851d0008d0885237e1912e4d32ffe6b400215ec7fde9a7e045e38834	2026-01-24 02:06:34.249097+00	20260122134014_audit_log	\N	\N	2026-01-24 02:06:34.23982+00	1
24d3fce0-7945-4eac-bad6-5c705df03d1c	e9db5e7a52819fdb63cdbe2701cf234b47c8b87ddb0a49b69513ea395660fa65	2026-01-24 02:06:34.309725+00	20260123175554_	\N	\N	2026-01-24 02:06:34.308576+00	1
ea0167ed-74d9-49ed-8abc-42117799642c	9a3ff974d62b0c8e886a58dd0ffd1eb079c0049f873caa9a841eb879992ae67c	2026-01-24 02:06:34.252232+00	20260123120000_expand_audit_actions	\N	\N	2026-01-24 02:06:34.249837+00	1
17873e2b-6da9-4d74-811b-0dc266fcd79e	e219484247d04f30984827403052923abec8c3dc5d836349d54613c5e3f16d34	2026-01-24 02:06:34.254025+00	20260123131908_nueva	\N	\N	2026-01-24 02:06:34.252618+00	1
5c97429e-f6d9-49fd-b94e-5368cf615c75	67cbc6c5435915abc27d51e8d925e07d281c73eb214cb4e0b1f871f0f9f6849a	2026-01-25 02:11:55.986144+00	20260124125821_add_subuser_login_tokens	\N	\N	2026-01-25 02:11:55.923689+00	1
faf4d127-083c-411a-a822-afa90be81db0	931ac0069638f827cdd5e749d0d15b5174ce66c57adaaa821f052b9d1606bd16	2026-01-24 02:06:34.292975+00	20260123150000_add_indexes_decimal_precision	\N	\N	2026-01-24 02:06:34.254447+00	1
41415575-24ef-4b3a-a273-05e99e1271cf	3d020b6ebc9fa94d039faf8ec70bcbacf001918715e7c913b21b995abdf45643	2026-01-24 02:06:34.319714+00	20260123180000_product_sku_partial_unique	\N	\N	2026-01-24 02:06:34.310099+00	1
08f19a33-10ed-4eb1-adff-5c0b7f580d54	ea98963fd0a9ea30a18c9cd95d61601a78618ec913e8714a6e582336f9859077	2026-01-24 02:06:34.29622+00	20260123152350_update_billing_usd_price	\N	\N	2026-01-24 02:06:34.293415+00	1
b6122ca8-86aa-4ab6-89c8-6513eec0f277	117e2709469567fb4376b9bfcb3ce04e8a6c1a090bcb5f9d3bd0a487621cfec2	2026-01-24 02:06:34.298385+00	20260123153000_add_audit_log_old_new	\N	\N	2026-01-24 02:06:34.296581+00	1
4a6a3ca7-c1cf-444b-b336-acd0d0e4ae63	fbb433915058c4d198958131073c254162df5a0a98578ad1405a995d3129e037	2026-01-24 02:06:34.300909+00	20260123154939_add_billing_payment_rejection_reason_again	\N	\N	2026-01-24 02:06:34.29894+00	1
c42ade52-6280-4f3a-9261-df2c20ccd3c9	e9db5e7a52819fdb63cdbe2701cf234b47c8b87ddb0a49b69513ea395660fa65	2026-01-24 02:06:34.321153+00	20260123180106_hh	\N	\N	2026-01-24 02:06:34.320114+00	1
220feea2-da40-4e2d-bb9c-6a7878de7412	ea98963fd0a9ea30a18c9cd95d61601a78618ec913e8714a6e582336f9859077	2026-01-24 02:06:34.303066+00	20260123174503_nova	\N	\N	2026-01-24 02:06:34.301654+00	1
e9c43417-fa5f-4693-9dd0-c83d663291dd	ea98963fd0a9ea30a18c9cd95d61601a78618ec913e8714a6e582336f9859077	2026-01-24 02:06:34.304702+00	20260123174706_	\N	\N	2026-01-24 02:06:34.303495+00	1
5565a7ab-283d-4958-a2d3-4882b49a58cb	ea98963fd0a9ea30a18c9cd95d61601a78618ec913e8714a6e582336f9859077	2026-01-24 02:06:34.306509+00	20260123174902_nove	\N	\N	2026-01-24 02:06:34.305136+00	1
4b8cf70c-3884-4199-a38b-8d384cb44c4a	24a9794401836a5c7ca3aa671924c0d86a7d9987d950dba24f5c6cf43bc1aa65	2026-01-24 02:06:34.322704+00	20260123183000_add_billing_payment_rejection_reason	\N	\N	2026-01-24 02:06:34.321706+00	1
0413aee3-3c7b-46cb-94ca-8ac3957d1dcf	98c143ef16ffa5cadbd9b7625e92022c8bf81c2dc8c20f84ebbbb0878c7ef766	2026-01-25 02:11:56.008258+00	20260124130701_add_subuser_login_tokens	\N	\N	2026-01-25 02:11:56.002915+00	1
f07db4be-9327-42f1-98b6-e27847126159	7fd132fbc502702ad15151e45e7d987329b7c650f4f72c53e154226970184655	2026-01-24 02:06:34.360798+00	20260123200000_add_billing_models	\N	\N	2026-01-24 02:06:34.323082+00	1
2a09c590-7188-4cba-81a9-4acbcb9903ed	0e6b75812868650300d43d6b0255522987ffcfa1d6d054fbe17639a5bc639ed1	2026-01-24 02:06:34.370321+00	20260123210000_add_bank_accounts	\N	\N	2026-01-24 02:06:34.361342+00	1
c18d67a6-057f-4d6e-ba07-22189bc73070	31390c795d42b6a6077aa1236200c5bf852c69c05a547d3cc8ade0f527cc5fbb	2026-01-24 02:06:34.384466+00	20260123220000_add_super_admin	\N	\N	2026-01-24 02:06:34.370911+00	1
884c8f1f-d894-472a-ae8b-7ad2674722f1	3cea19f897d3f31a4e5901eeadd48d0e9cba82687142608b7349fb24ea2c7ef8	2026-01-25 02:11:56.06357+00	20260124143504_dd	\N	\N	2026-01-25 02:11:56.023812+00	1
dc49a522-1fb6-4b3b-9055-8f780766d1f6	6d94ed59474a42ec3cd4e37170edb7b177ffd69a912e9e5efb662e4156ac6288	2026-01-24 02:09:19.159377+00	20260124020919_add_billing_payment_rejection_reason_fix	\N	\N	2026-01-24 02:09:19.152147+00	1
6bb859f3-4903-4e9d-a63f-67edfb9fcf3c	329aa7258cb4885af6706c099cdd5d527b370ec31bdd6ba55c2e50c992af1b95	2026-01-26 01:02:29.12683+00	20260126010229_add_ar_due_date	\N	\N	2026-01-26 01:02:29.117798+00	1
c9390dd5-d2c8-42e0-be46-ac5976b88733	de5b94d6390d5d9a7d87ecfffa6f4f5e920f81662171739c10d8c29da24c83be	2026-01-25 03:26:59.987938+00	20260124230000_add_error_log	\N	\N	2026-01-25 03:26:59.954139+00	1
21d5b632-e7b0-46ba-94ac-d8358b258f60	d77ba635bbcc5bc1bedc28f3ef814774e5abfbd4b759c244d5115442e5488b02	2026-01-25 03:50:56.164641+00	20260125000000_add_billing_plans	\N	\N	2026-01-25 03:50:56.140683+00	1
9c66aae5-8c20-43da-9418-b299c0f48b73	f83b26640285b6ffe90b5b644dc95ffd02ad1d175c72fa9572aa05261968d209	2026-01-28 22:52:59.312923+00	20260128193551_add_view_mode_to_settings	\N	\N	2026-01-28 22:52:59.289726+00	1
6b8c7a98-d4ce-40cc-a15f-7289b0ff0279	cc928897faf55a09fe097fc07998900e77f53a98a76fe275f526bd2e4126d6bf	2026-01-26 12:14:24.550187+00	20260126121332_add_product_sequence	\N	\N	2026-01-26 12:14:24.514024+00	1
aee18cc3-2af1-4387-8f80-e50226d2c9c1	a1f900d2250dfd397f2cf849a027a0a6497d6cc6d19866f721e2a29ad8b7c2a3	2026-01-26 12:30:55.417553+00	20260126123006_add_payment_sequence	\N	\N	2026-01-26 12:30:55.398426+00	1
9625d2b1-586b-4a3e-8670-a62ac5191246	667caf8ccac14b55131feda1381535acc09cfb3063abb98cd7779bcca3c2b8f9	2026-02-17 23:45:44.776528+00	20260129103516_enable_rls_public_tables	\N	\N	2026-02-17 23:45:44.67449+00	1
3ead5789-50f9-42ec-963c-86d3c80759c7	15f4fe045b0ef2831773797b4e91036f90e1a98d877b42f37c3fd332ee14e11e	\N	20260129160000_add_inventory_adjustments	A migration failed to apply. New migrations cannot be applied before the error is recovered from. Read more about how to resolve migration issues in a production database: https://pris.ly/d/migrate-resolve\n\nMigration name: 20260129160000_add_inventory_adjustments\n\nDatabase error code: 42P07\n\nDatabase error:\nERROR: la relación «InventoryAdjustment» ya existe\n\nDbError { severity: "ERROR", parsed_severity: Some(Error), code: SqlState(E42P07), message: "la relación «InventoryAdjustment» ya existe", detail: None, hint: None, position: None, where_: None, schema: None, table: None, column: None, datatype: None, constraint: None, file: Some("heap.c"), line: Some(1179), routine: Some("heap_create_with_catalog") }\n\n   0: sql_schema_connector::apply_migration::apply_script\n           with migration_name="20260129160000_add_inventory_adjustments"\n             at schema-engine\\connectors\\sql-schema-connector\\src\\apply_migration.rs:106\n   1: schema_core::commands::apply_migrations::Applying migration\n           with migration_name="20260129160000_add_inventory_adjustments"\n             at schema-engine\\core\\src\\commands\\apply_migrations.rs:91\n   2: schema_core::state::ApplyMigrations\n             at schema-engine\\core\\src\\state.rs:226	2026-02-17 23:47:25.651823+00	2026-02-17 23:45:44.777608+00	0
6e459a6c-c819-4356-92a2-a985f4cc3a69	15f4fe045b0ef2831773797b4e91036f90e1a98d877b42f37c3fd332ee14e11e	2026-02-17 23:47:25.6556+00	20260129160000_add_inventory_adjustments		\N	2026-02-17 23:47:25.6556+00	0
2bc59c70-2942-41a7-8eec-48f3f7c19b12	d72e160df31bfd9e5f16128e3c5d1b8ea0c5f01a541391a346d41dc58adf43ff	2026-02-17 23:50:01.950851+00	20260131115559_add_show_itbis_on_receipts		\N	2026-02-17 23:50:01.950851+00	0
35e63b56-9ea5-450d-91cb-6d8199db6470	fce9c73d35a3ee62106bd0eea2f4980ed28ca78b090ac1f5ac65b0b82ea371a9	2026-02-17 23:50:09.068664+00	20260210121000_enable_rls_prisma_migrations	\N	\N	2026-02-17 23:50:09.03897+00	1
a080347f-4ae3-41d4-9c73-644f6569125b	ec396aca7603eef5d0ffb3df009cd63791c10b9469772735303aec7fda1af9e5	2026-02-17 23:50:09.196382+00	20260217131000_add_category_sequence	\N	\N	2026-02-17 23:50:09.069866+00	1
1deb3039-4dd3-4da4-906e-c50c691e04e3	7dc9b83327157c5407cb02cd86cd7544050adf5df0935d53b2d5cb3f9d9ab82b	2026-02-17 23:50:09.202653+00	20260217143000_add_purchase_sale_pricing	\N	\N	2026-02-17 23:50:09.197995+00	1
\.


--
-- Name: AccountReceivable AccountReceivable_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AccountReceivable"
    ADD CONSTRAINT "AccountReceivable_pkey" PRIMARY KEY (id);


--
-- Name: Account Account_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Account"
    ADD CONSTRAINT "Account_pkey" PRIMARY KEY (id);


--
-- Name: AuditLog AuditLog_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY (id);


--
-- Name: BankAccount BankAccount_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."BankAccount"
    ADD CONSTRAINT "BankAccount_pkey" PRIMARY KEY (id);


--
-- Name: BillingNotification BillingNotification_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."BillingNotification"
    ADD CONSTRAINT "BillingNotification_pkey" PRIMARY KEY (id);


--
-- Name: BillingPaymentProof BillingPaymentProof_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."BillingPaymentProof"
    ADD CONSTRAINT "BillingPaymentProof_pkey" PRIMARY KEY (id);


--
-- Name: BillingPayment BillingPayment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."BillingPayment"
    ADD CONSTRAINT "BillingPayment_pkey" PRIMARY KEY (id);


--
-- Name: BillingPlan BillingPlan_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."BillingPlan"
    ADD CONSTRAINT "BillingPlan_pkey" PRIMARY KEY (id);


--
-- Name: BillingProfile BillingProfile_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."BillingProfile"
    ADD CONSTRAINT "BillingProfile_pkey" PRIMARY KEY (id);


--
-- Name: BillingReceipt BillingReceipt_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."BillingReceipt"
    ADD CONSTRAINT "BillingReceipt_pkey" PRIMARY KEY (id);


--
-- Name: BillingSubscription BillingSubscription_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."BillingSubscription"
    ADD CONSTRAINT "BillingSubscription_pkey" PRIMARY KEY (id);


--
-- Name: CategorySequence CategorySequence_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."CategorySequence"
    ADD CONSTRAINT "CategorySequence_pkey" PRIMARY KEY (id);


--
-- Name: Category Category_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Category"
    ADD CONSTRAINT "Category_pkey" PRIMARY KEY (id);


--
-- Name: CompanySettings CompanySettings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."CompanySettings"
    ADD CONSTRAINT "CompanySettings_pkey" PRIMARY KEY (id);


--
-- Name: Customer Customer_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Customer"
    ADD CONSTRAINT "Customer_pkey" PRIMARY KEY (id);


--
-- Name: ErrorLog ErrorLog_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ErrorLog"
    ADD CONSTRAINT "ErrorLog_pkey" PRIMARY KEY (id);


--
-- Name: InventoryAdjustment InventoryAdjustment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InventoryAdjustment"
    ADD CONSTRAINT "InventoryAdjustment_pkey" PRIMARY KEY (id);


--
-- Name: InvoiceSequence InvoiceSequence_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InvoiceSequence"
    ADD CONSTRAINT "InvoiceSequence_pkey" PRIMARY KEY (id);


--
-- Name: OperatingExpense OperatingExpense_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OperatingExpense"
    ADD CONSTRAINT "OperatingExpense_pkey" PRIMARY KEY (id);


--
-- Name: PaymentSequence PaymentSequence_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PaymentSequence"
    ADD CONSTRAINT "PaymentSequence_pkey" PRIMARY KEY (id);


--
-- Name: Payment Payment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_pkey" PRIMARY KEY (id);


--
-- Name: ProductSequence ProductSequence_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ProductSequence"
    ADD CONSTRAINT "ProductSequence_pkey" PRIMARY KEY (id);


--
-- Name: Product Product_accountId_productId_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_accountId_productId_key" UNIQUE ("accountId", "productId");


--
-- Name: Product Product_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_pkey" PRIMARY KEY (id);


--
-- Name: PurchaseItem PurchaseItem_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PurchaseItem"
    ADD CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY (id);


--
-- Name: Purchase Purchase_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Purchase"
    ADD CONSTRAINT "Purchase_pkey" PRIMARY KEY (id);


--
-- Name: QuoteItem QuoteItem_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."QuoteItem"
    ADD CONSTRAINT "QuoteItem_pkey" PRIMARY KEY (id);


--
-- Name: QuoteSequence QuoteSequence_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."QuoteSequence"
    ADD CONSTRAINT "QuoteSequence_pkey" PRIMARY KEY (id);


--
-- Name: Quote Quote_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Quote"
    ADD CONSTRAINT "Quote_pkey" PRIMARY KEY (id);


--
-- Name: ReturnItem ReturnItem_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ReturnItem"
    ADD CONSTRAINT "ReturnItem_pkey" PRIMARY KEY (id);


--
-- Name: ReturnSequence ReturnSequence_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ReturnSequence"
    ADD CONSTRAINT "ReturnSequence_pkey" PRIMARY KEY (id);


--
-- Name: Return Return_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Return"
    ADD CONSTRAINT "Return_pkey" PRIMARY KEY (id);


--
-- Name: SaleItem SaleItem_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SaleItem"
    ADD CONSTRAINT "SaleItem_pkey" PRIMARY KEY (id);


--
-- Name: SalePayment SalePayment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SalePayment"
    ADD CONSTRAINT "SalePayment_pkey" PRIMARY KEY (id);


--
-- Name: Sale Sale_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Sale"
    ADD CONSTRAINT "Sale_pkey" PRIMARY KEY (id);


--
-- Name: SubUserLoginToken SubUserLoginToken_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SubUserLoginToken"
    ADD CONSTRAINT "SubUserLoginToken_pkey" PRIMARY KEY (id);


--
-- Name: SuperAdminAuditLog SuperAdminAuditLog_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SuperAdminAuditLog"
    ADD CONSTRAINT "SuperAdminAuditLog_pkey" PRIMARY KEY (id);


--
-- Name: SuperAdmin SuperAdmin_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SuperAdmin"
    ADD CONSTRAINT "SuperAdmin_pkey" PRIMARY KEY (id);


--
-- Name: Supplier Supplier_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Supplier"
    ADD CONSTRAINT "Supplier_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: WhatsappOtp WhatsappOtp_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."WhatsappOtp"
    ADD CONSTRAINT "WhatsappOtp_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: AccountReceivable_customerId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "AccountReceivable_customerId_idx" ON public."AccountReceivable" USING btree ("customerId");


--
-- Name: AccountReceivable_dueDate_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "AccountReceivable_dueDate_idx" ON public."AccountReceivable" USING btree ("dueDate");


--
-- Name: AccountReceivable_saleId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "AccountReceivable_saleId_key" ON public."AccountReceivable" USING btree ("saleId");


--
-- Name: AccountReceivable_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "AccountReceivable_status_idx" ON public."AccountReceivable" USING btree (status);


--
-- Name: Account_clerkUserId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Account_clerkUserId_idx" ON public."Account" USING btree ("clerkUserId");


--
-- Name: Account_clerkUserId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Account_clerkUserId_key" ON public."Account" USING btree ("clerkUserId");


--
-- Name: AuditLog_accountId_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "AuditLog_accountId_createdAt_idx" ON public."AuditLog" USING btree ("accountId", "createdAt");


--
-- Name: AuditLog_action_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "AuditLog_action_createdAt_idx" ON public."AuditLog" USING btree (action, "createdAt");


--
-- Name: AuditLog_userId_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "AuditLog_userId_createdAt_idx" ON public."AuditLog" USING btree ("userId", "createdAt");


--
-- Name: BankAccount_isActive_displayOrder_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "BankAccount_isActive_displayOrder_idx" ON public."BankAccount" USING btree ("isActive", "displayOrder");


--
-- Name: BillingNotification_accountId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "BillingNotification_accountId_idx" ON public."BillingNotification" USING btree ("accountId");


--
-- Name: BillingNotification_accountId_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "BillingNotification_accountId_type_idx" ON public."BillingNotification" USING btree ("accountId", type);


--
-- Name: BillingNotification_sentAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "BillingNotification_sentAt_idx" ON public."BillingNotification" USING btree ("sentAt");


--
-- Name: BillingPaymentProof_paymentId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "BillingPaymentProof_paymentId_idx" ON public."BillingPaymentProof" USING btree ("paymentId");


--
-- Name: BillingPayment_bankAccountId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "BillingPayment_bankAccountId_idx" ON public."BillingPayment" USING btree ("bankAccountId");


--
-- Name: BillingPayment_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "BillingPayment_createdAt_idx" ON public."BillingPayment" USING btree ("createdAt");


--
-- Name: BillingPayment_externalId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "BillingPayment_externalId_idx" ON public."BillingPayment" USING btree ("externalId");


--
-- Name: BillingPayment_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "BillingPayment_status_idx" ON public."BillingPayment" USING btree (status);


--
-- Name: BillingPayment_subscriptionId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "BillingPayment_subscriptionId_idx" ON public."BillingPayment" USING btree ("subscriptionId");


--
-- Name: BillingPlan_isActive_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "BillingPlan_isActive_idx" ON public."BillingPlan" USING btree ("isActive");


--
-- Name: BillingPlan_isDefault_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "BillingPlan_isDefault_idx" ON public."BillingPlan" USING btree ("isDefault");


--
-- Name: BillingProfile_accountId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "BillingProfile_accountId_idx" ON public."BillingProfile" USING btree ("accountId");


--
-- Name: BillingProfile_accountId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "BillingProfile_accountId_key" ON public."BillingProfile" USING btree ("accountId");


--
-- Name: BillingReceipt_paymentId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "BillingReceipt_paymentId_idx" ON public."BillingReceipt" USING btree ("paymentId");


--
-- Name: BillingReceipt_receiptNumber_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "BillingReceipt_receiptNumber_idx" ON public."BillingReceipt" USING btree ("receiptNumber");


--
-- Name: BillingReceipt_receiptNumber_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "BillingReceipt_receiptNumber_key" ON public."BillingReceipt" USING btree ("receiptNumber");


--
-- Name: BillingSubscription_accountId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "BillingSubscription_accountId_idx" ON public."BillingSubscription" USING btree ("accountId");


--
-- Name: BillingSubscription_accountId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "BillingSubscription_accountId_key" ON public."BillingSubscription" USING btree ("accountId");


--
-- Name: BillingSubscription_billingPlanId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "BillingSubscription_billingPlanId_idx" ON public."BillingSubscription" USING btree ("billingPlanId");


--
-- Name: BillingSubscription_currentPeriodEndsAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "BillingSubscription_currentPeriodEndsAt_idx" ON public."BillingSubscription" USING btree ("currentPeriodEndsAt");


--
-- Name: BillingSubscription_graceEndsAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "BillingSubscription_graceEndsAt_idx" ON public."BillingSubscription" USING btree ("graceEndsAt");


--
-- Name: BillingSubscription_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "BillingSubscription_status_idx" ON public."BillingSubscription" USING btree (status);


--
-- Name: BillingSubscription_trialEndsAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "BillingSubscription_trialEndsAt_idx" ON public."BillingSubscription" USING btree ("trialEndsAt");


--
-- Name: CategorySequence_accountId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "CategorySequence_accountId_idx" ON public."CategorySequence" USING btree ("accountId");


--
-- Name: CategorySequence_accountId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "CategorySequence_accountId_key" ON public."CategorySequence" USING btree ("accountId");


--
-- Name: Category_accountId_categoryId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Category_accountId_categoryId_idx" ON public."Category" USING btree ("accountId", "categoryId");


--
-- Name: Category_accountId_categoryId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Category_accountId_categoryId_key" ON public."Category" USING btree ("accountId", "categoryId");


--
-- Name: Category_accountId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Category_accountId_idx" ON public."Category" USING btree ("accountId");


--
-- Name: Category_accountId_isActive_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Category_accountId_isActive_idx" ON public."Category" USING btree ("accountId", "isActive");


--
-- Name: Category_accountId_name_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Category_accountId_name_key" ON public."Category" USING btree ("accountId", name);


--
-- Name: CompanySettings_accountId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "CompanySettings_accountId_idx" ON public."CompanySettings" USING btree ("accountId");


--
-- Name: CompanySettings_accountId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "CompanySettings_accountId_key" ON public."CompanySettings" USING btree ("accountId");


--
-- Name: Customer_accountId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Customer_accountId_idx" ON public."Customer" USING btree ("accountId");


--
-- Name: Customer_accountId_isGeneric_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Customer_accountId_isGeneric_idx" ON public."Customer" USING btree ("accountId", "isGeneric");


--
-- Name: Customer_accountId_name_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Customer_accountId_name_idx" ON public."Customer" USING btree ("accountId", name);


--
-- Name: ErrorLog_accountId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ErrorLog_accountId_idx" ON public."ErrorLog" USING btree ("accountId");


--
-- Name: ErrorLog_code_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ErrorLog_code_idx" ON public."ErrorLog" USING btree (code);


--
-- Name: ErrorLog_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ErrorLog_createdAt_idx" ON public."ErrorLog" USING btree ("createdAt");


--
-- Name: ErrorLog_endpoint_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ErrorLog_endpoint_idx" ON public."ErrorLog" USING btree (endpoint);


--
-- Name: ErrorLog_resolved_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ErrorLog_resolved_idx" ON public."ErrorLog" USING btree (resolved);


--
-- Name: ErrorLog_severity_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ErrorLog_severity_idx" ON public."ErrorLog" USING btree (severity);


--
-- Name: InventoryAdjustment_accountId_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "InventoryAdjustment_accountId_createdAt_idx" ON public."InventoryAdjustment" USING btree ("accountId", "createdAt");


--
-- Name: InventoryAdjustment_batchId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "InventoryAdjustment_batchId_idx" ON public."InventoryAdjustment" USING btree ("batchId");


--
-- Name: InventoryAdjustment_productId_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "InventoryAdjustment_productId_createdAt_idx" ON public."InventoryAdjustment" USING btree ("productId", "createdAt");


--
-- Name: InvoiceSequence_accountId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "InvoiceSequence_accountId_idx" ON public."InvoiceSequence" USING btree ("accountId");


--
-- Name: InvoiceSequence_accountId_series_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "InvoiceSequence_accountId_series_key" ON public."InvoiceSequence" USING btree ("accountId", series);


--
-- Name: OperatingExpense_accountId_expenseDate_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "OperatingExpense_accountId_expenseDate_idx" ON public."OperatingExpense" USING btree ("accountId", "expenseDate");


--
-- Name: OperatingExpense_accountId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "OperatingExpense_accountId_idx" ON public."OperatingExpense" USING btree ("accountId");


--
-- Name: PaymentSequence_accountId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "PaymentSequence_accountId_idx" ON public."PaymentSequence" USING btree ("accountId");


--
-- Name: PaymentSequence_accountId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "PaymentSequence_accountId_key" ON public."PaymentSequence" USING btree ("accountId");


--
-- Name: Payment_cancelledAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Payment_cancelledAt_idx" ON public."Payment" USING btree ("cancelledAt");


--
-- Name: Payment_paidAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Payment_paidAt_idx" ON public."Payment" USING btree ("paidAt");


--
-- Name: Payment_receiptCode_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Payment_receiptCode_idx" ON public."Payment" USING btree ("receiptCode");


--
-- Name: ProductSequence_accountId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ProductSequence_accountId_idx" ON public."ProductSequence" USING btree ("accountId");


--
-- Name: ProductSequence_accountId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "ProductSequence_accountId_key" ON public."ProductSequence" USING btree ("accountId");


--
-- Name: Product_accountId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Product_accountId_idx" ON public."Product" USING btree ("accountId");


--
-- Name: Product_accountId_name_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Product_accountId_name_idx" ON public."Product" USING btree ("accountId", name);


--
-- Name: Product_accountId_reference_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Product_accountId_reference_idx" ON public."Product" USING btree ("accountId", reference);


--
-- Name: Product_accountId_sku_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Product_accountId_sku_idx" ON public."Product" USING btree ("accountId", sku);


--
-- Name: Product_accountId_sku_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Product_accountId_sku_key" ON public."Product" USING btree ("accountId", sku) WHERE (sku IS NOT NULL);


--
-- Name: Product_accountId_stock_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Product_accountId_stock_idx" ON public."Product" USING btree ("accountId", stock);


--
-- Name: Product_categoryId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Product_categoryId_idx" ON public."Product" USING btree ("categoryId");


--
-- Name: Product_supplierId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Product_supplierId_idx" ON public."Product" USING btree ("supplierId");


--
-- Name: Purchase_accountId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Purchase_accountId_idx" ON public."Purchase" USING btree ("accountId");


--
-- Name: Purchase_accountId_purchasedAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Purchase_accountId_purchasedAt_idx" ON public."Purchase" USING btree ("accountId", "purchasedAt");


--
-- Name: Purchase_cancelledAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Purchase_cancelledAt_idx" ON public."Purchase" USING btree ("cancelledAt");


--
-- Name: QuoteSequence_accountId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "QuoteSequence_accountId_idx" ON public."QuoteSequence" USING btree ("accountId");


--
-- Name: QuoteSequence_accountId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "QuoteSequence_accountId_key" ON public."QuoteSequence" USING btree ("accountId");


--
-- Name: Quote_accountId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Quote_accountId_idx" ON public."Quote" USING btree ("accountId");


--
-- Name: Quote_accountId_quoteCode_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Quote_accountId_quoteCode_key" ON public."Quote" USING btree ("accountId", "quoteCode");


--
-- Name: Quote_accountId_quoteNumber_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Quote_accountId_quoteNumber_key" ON public."Quote" USING btree ("accountId", "quoteNumber");


--
-- Name: Quote_accountId_quotedAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Quote_accountId_quotedAt_idx" ON public."Quote" USING btree ("accountId", "quotedAt");


--
-- Name: Quote_customerId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Quote_customerId_idx" ON public."Quote" USING btree ("customerId");


--
-- Name: Quote_validUntil_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Quote_validUntil_idx" ON public."Quote" USING btree ("validUntil");


--
-- Name: ReturnSequence_accountId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ReturnSequence_accountId_idx" ON public."ReturnSequence" USING btree ("accountId");


--
-- Name: ReturnSequence_accountId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "ReturnSequence_accountId_key" ON public."ReturnSequence" USING btree ("accountId");


--
-- Name: Return_accountId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Return_accountId_idx" ON public."Return" USING btree ("accountId");


--
-- Name: Return_accountId_returnCode_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Return_accountId_returnCode_key" ON public."Return" USING btree ("accountId", "returnCode");


--
-- Name: Return_accountId_returnNumber_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Return_accountId_returnNumber_key" ON public."Return" USING btree ("accountId", "returnNumber");


--
-- Name: Return_accountId_returnedAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Return_accountId_returnedAt_idx" ON public."Return" USING btree ("accountId", "returnedAt");


--
-- Name: Return_cancelledAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Return_cancelledAt_idx" ON public."Return" USING btree ("cancelledAt");


--
-- Name: Return_saleId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Return_saleId_idx" ON public."Return" USING btree ("saleId");


--
-- Name: SalePayment_saleId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "SalePayment_saleId_idx" ON public."SalePayment" USING btree ("saleId");


--
-- Name: Sale_accountId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Sale_accountId_idx" ON public."Sale" USING btree ("accountId");


--
-- Name: Sale_accountId_invoiceCode_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Sale_accountId_invoiceCode_key" ON public."Sale" USING btree ("accountId", "invoiceCode");


--
-- Name: Sale_accountId_soldAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Sale_accountId_soldAt_idx" ON public."Sale" USING btree ("accountId", "soldAt");


--
-- Name: Sale_cancelledAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Sale_cancelledAt_idx" ON public."Sale" USING btree ("cancelledAt");


--
-- Name: Sale_customerId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Sale_customerId_idx" ON public."Sale" USING btree ("customerId");


--
-- Name: Sale_invoiceCode_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Sale_invoiceCode_idx" ON public."Sale" USING btree ("invoiceCode");


--
-- Name: SubUserLoginToken_accountId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "SubUserLoginToken_accountId_idx" ON public."SubUserLoginToken" USING btree ("accountId");


--
-- Name: SubUserLoginToken_expiresAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "SubUserLoginToken_expiresAt_idx" ON public."SubUserLoginToken" USING btree ("expiresAt");


--
-- Name: SubUserLoginToken_userId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "SubUserLoginToken_userId_idx" ON public."SubUserLoginToken" USING btree ("userId");


--
-- Name: SuperAdminAuditLog_action_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "SuperAdminAuditLog_action_idx" ON public."SuperAdminAuditLog" USING btree (action);


--
-- Name: SuperAdminAuditLog_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "SuperAdminAuditLog_createdAt_idx" ON public."SuperAdminAuditLog" USING btree ("createdAt");


--
-- Name: SuperAdminAuditLog_superAdminId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "SuperAdminAuditLog_superAdminId_idx" ON public."SuperAdminAuditLog" USING btree ("superAdminId");


--
-- Name: SuperAdmin_email_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "SuperAdmin_email_idx" ON public."SuperAdmin" USING btree (email);


--
-- Name: SuperAdmin_email_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "SuperAdmin_email_key" ON public."SuperAdmin" USING btree (email);


--
-- Name: SuperAdmin_isActive_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "SuperAdmin_isActive_idx" ON public."SuperAdmin" USING btree ("isActive");


--
-- Name: Supplier_accountId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Supplier_accountId_idx" ON public."Supplier" USING btree ("accountId");


--
-- Name: Supplier_accountId_name_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Supplier_accountId_name_idx" ON public."Supplier" USING btree ("accountId", name);


--
-- Name: User_accountId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "User_accountId_idx" ON public."User" USING btree ("accountId");


--
-- Name: User_accountId_username_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "User_accountId_username_key" ON public."User" USING btree ("accountId", username);


--
-- Name: User_email_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "User_email_idx" ON public."User" USING btree (email);


--
-- Name: User_whatsappNumber_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "User_whatsappNumber_idx" ON public."User" USING btree ("whatsappNumber");


--
-- Name: WhatsappOtp_expiresAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "WhatsappOtp_expiresAt_idx" ON public."WhatsappOtp" USING btree ("expiresAt");


--
-- Name: WhatsappOtp_phoneNumber_createdAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "WhatsappOtp_phoneNumber_createdAt_idx" ON public."WhatsappOtp" USING btree ("phoneNumber", "createdAt");


--
-- Name: WhatsappOtp_phoneNumber_expiresAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "WhatsappOtp_phoneNumber_expiresAt_idx" ON public."WhatsappOtp" USING btree ("phoneNumber", "expiresAt");


--
-- Name: AccountReceivable AccountReceivable_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AccountReceivable"
    ADD CONSTRAINT "AccountReceivable_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: AccountReceivable AccountReceivable_saleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AccountReceivable"
    ADD CONSTRAINT "AccountReceivable_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES public."Sale"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AuditLog AuditLog_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AuditLog AuditLog_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: BillingNotification BillingNotification_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."BillingNotification"
    ADD CONSTRAINT "BillingNotification_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: BillingPaymentProof BillingPaymentProof_paymentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."BillingPaymentProof"
    ADD CONSTRAINT "BillingPaymentProof_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES public."BillingPayment"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: BillingPayment BillingPayment_bankAccountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."BillingPayment"
    ADD CONSTRAINT "BillingPayment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES public."BankAccount"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: BillingPayment BillingPayment_subscriptionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."BillingPayment"
    ADD CONSTRAINT "BillingPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES public."BillingSubscription"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: BillingProfile BillingProfile_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."BillingProfile"
    ADD CONSTRAINT "BillingProfile_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: BillingReceipt BillingReceipt_paymentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."BillingReceipt"
    ADD CONSTRAINT "BillingReceipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES public."BillingPayment"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: BillingSubscription BillingSubscription_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."BillingSubscription"
    ADD CONSTRAINT "BillingSubscription_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: BillingSubscription BillingSubscription_billingPlanId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."BillingSubscription"
    ADD CONSTRAINT "BillingSubscription_billingPlanId_fkey" FOREIGN KEY ("billingPlanId") REFERENCES public."BillingPlan"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CategorySequence CategorySequence_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."CategorySequence"
    ADD CONSTRAINT "CategorySequence_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Category Category_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Category"
    ADD CONSTRAINT "Category_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CompanySettings CompanySettings_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."CompanySettings"
    ADD CONSTRAINT "CompanySettings_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Customer Customer_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Customer"
    ADD CONSTRAINT "Customer_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: InventoryAdjustment InventoryAdjustment_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InventoryAdjustment"
    ADD CONSTRAINT "InventoryAdjustment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: InventoryAdjustment InventoryAdjustment_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InventoryAdjustment"
    ADD CONSTRAINT "InventoryAdjustment_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: InventoryAdjustment InventoryAdjustment_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InventoryAdjustment"
    ADD CONSTRAINT "InventoryAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: InvoiceSequence InvoiceSequence_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InvoiceSequence"
    ADD CONSTRAINT "InvoiceSequence_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: OperatingExpense OperatingExpense_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OperatingExpense"
    ADD CONSTRAINT "OperatingExpense_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: OperatingExpense OperatingExpense_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."OperatingExpense"
    ADD CONSTRAINT "OperatingExpense_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: PaymentSequence PaymentSequence_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PaymentSequence"
    ADD CONSTRAINT "PaymentSequence_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Payment Payment_arId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_arId_fkey" FOREIGN KEY ("arId") REFERENCES public."AccountReceivable"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Payment Payment_cancelledBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_cancelledBy_fkey" FOREIGN KEY ("cancelledBy") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Payment Payment_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ProductSequence ProductSequence_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ProductSequence"
    ADD CONSTRAINT "ProductSequence_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Product Product_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Product Product_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public."Category"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Product Product_supplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES public."Supplier"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: PurchaseItem PurchaseItem_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PurchaseItem"
    ADD CONSTRAINT "PurchaseItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PurchaseItem PurchaseItem_purchaseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PurchaseItem"
    ADD CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES public."Purchase"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Purchase Purchase_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Purchase"
    ADD CONSTRAINT "Purchase_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Purchase Purchase_cancelledBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Purchase"
    ADD CONSTRAINT "Purchase_cancelledBy_fkey" FOREIGN KEY ("cancelledBy") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Purchase Purchase_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Purchase"
    ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: QuoteItem QuoteItem_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."QuoteItem"
    ADD CONSTRAINT "QuoteItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: QuoteItem QuoteItem_quoteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."QuoteItem"
    ADD CONSTRAINT "QuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES public."Quote"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: QuoteSequence QuoteSequence_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."QuoteSequence"
    ADD CONSTRAINT "QuoteSequence_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Quote Quote_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Quote"
    ADD CONSTRAINT "Quote_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Quote Quote_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Quote"
    ADD CONSTRAINT "Quote_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Quote Quote_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Quote"
    ADD CONSTRAINT "Quote_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ReturnItem ReturnItem_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ReturnItem"
    ADD CONSTRAINT "ReturnItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ReturnItem ReturnItem_returnId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ReturnItem"
    ADD CONSTRAINT "ReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES public."Return"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ReturnItem ReturnItem_saleItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ReturnItem"
    ADD CONSTRAINT "ReturnItem_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES public."SaleItem"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ReturnSequence ReturnSequence_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ReturnSequence"
    ADD CONSTRAINT "ReturnSequence_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Return Return_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Return"
    ADD CONSTRAINT "Return_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Return Return_cancelledBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Return"
    ADD CONSTRAINT "Return_cancelledBy_fkey" FOREIGN KEY ("cancelledBy") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Return Return_saleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Return"
    ADD CONSTRAINT "Return_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES public."Sale"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Return Return_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Return"
    ADD CONSTRAINT "Return_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SaleItem SaleItem_productId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SaleItem"
    ADD CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SaleItem SaleItem_saleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SaleItem"
    ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES public."Sale"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SalePayment SalePayment_saleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SalePayment"
    ADD CONSTRAINT "SalePayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES public."Sale"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Sale Sale_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Sale"
    ADD CONSTRAINT "Sale_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Sale Sale_cancelledBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Sale"
    ADD CONSTRAINT "Sale_cancelledBy_fkey" FOREIGN KEY ("cancelledBy") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Sale Sale_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Sale"
    ADD CONSTRAINT "Sale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public."Customer"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Sale Sale_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Sale"
    ADD CONSTRAINT "Sale_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: SubUserLoginToken SubUserLoginToken_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SubUserLoginToken"
    ADD CONSTRAINT "SubUserLoginToken_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SubUserLoginToken SubUserLoginToken_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SubUserLoginToken"
    ADD CONSTRAINT "SubUserLoginToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: SuperAdminAuditLog SuperAdminAuditLog_superAdminId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SuperAdminAuditLog"
    ADD CONSTRAINT "SuperAdminAuditLog_superAdminId_fkey" FOREIGN KEY ("superAdminId") REFERENCES public."SuperAdmin"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Supplier Supplier_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Supplier"
    ADD CONSTRAINT "Supplier_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: User User_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public."Account"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: WhatsappOtp WhatsappOtp_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."WhatsappOtp"
    ADD CONSTRAINT "WhatsappOtp_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Account; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."Account" ENABLE ROW LEVEL SECURITY;

--
-- Name: AccountReceivable; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."AccountReceivable" ENABLE ROW LEVEL SECURITY;

--
-- Name: AuditLog; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."AuditLog" ENABLE ROW LEVEL SECURITY;

--
-- Name: BankAccount; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."BankAccount" ENABLE ROW LEVEL SECURITY;

--
-- Name: BillingNotification; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."BillingNotification" ENABLE ROW LEVEL SECURITY;

--
-- Name: BillingPayment; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."BillingPayment" ENABLE ROW LEVEL SECURITY;

--
-- Name: BillingPaymentProof; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."BillingPaymentProof" ENABLE ROW LEVEL SECURITY;

--
-- Name: BillingPlan; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."BillingPlan" ENABLE ROW LEVEL SECURITY;

--
-- Name: BillingProfile; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."BillingProfile" ENABLE ROW LEVEL SECURITY;

--
-- Name: BillingReceipt; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."BillingReceipt" ENABLE ROW LEVEL SECURITY;

--
-- Name: BillingSubscription; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."BillingSubscription" ENABLE ROW LEVEL SECURITY;

--
-- Name: Category; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."Category" ENABLE ROW LEVEL SECURITY;

--
-- Name: CompanySettings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."CompanySettings" ENABLE ROW LEVEL SECURITY;

--
-- Name: Customer; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."Customer" ENABLE ROW LEVEL SECURITY;

--
-- Name: ErrorLog; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."ErrorLog" ENABLE ROW LEVEL SECURITY;

--
-- Name: InventoryAdjustment; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."InventoryAdjustment" ENABLE ROW LEVEL SECURITY;

--
-- Name: InvoiceSequence; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."InvoiceSequence" ENABLE ROW LEVEL SECURITY;

--
-- Name: OperatingExpense; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."OperatingExpense" ENABLE ROW LEVEL SECURITY;

--
-- Name: Payment; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."Payment" ENABLE ROW LEVEL SECURITY;

--
-- Name: PaymentSequence; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."PaymentSequence" ENABLE ROW LEVEL SECURITY;

--
-- Name: Account Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."Account" TO postgres USING (true) WITH CHECK (true);


--
-- Name: AccountReceivable Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."AccountReceivable" TO postgres USING (true) WITH CHECK (true);


--
-- Name: AuditLog Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."AuditLog" TO postgres USING (true) WITH CHECK (true);


--
-- Name: BankAccount Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."BankAccount" TO postgres USING (true) WITH CHECK (true);


--
-- Name: BillingNotification Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."BillingNotification" TO postgres USING (true) WITH CHECK (true);


--
-- Name: BillingPayment Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."BillingPayment" TO postgres USING (true) WITH CHECK (true);


--
-- Name: BillingPaymentProof Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."BillingPaymentProof" TO postgres USING (true) WITH CHECK (true);


--
-- Name: BillingPlan Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."BillingPlan" TO postgres USING (true) WITH CHECK (true);


--
-- Name: BillingProfile Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."BillingProfile" TO postgres USING (true) WITH CHECK (true);


--
-- Name: BillingReceipt Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."BillingReceipt" TO postgres USING (true) WITH CHECK (true);


--
-- Name: BillingSubscription Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."BillingSubscription" TO postgres USING (true) WITH CHECK (true);


--
-- Name: Category Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."Category" TO postgres USING (true) WITH CHECK (true);


--
-- Name: CompanySettings Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."CompanySettings" TO postgres USING (true) WITH CHECK (true);


--
-- Name: Customer Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."Customer" TO postgres USING (true) WITH CHECK (true);


--
-- Name: ErrorLog Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."ErrorLog" TO postgres USING (true) WITH CHECK (true);


--
-- Name: InventoryAdjustment Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."InventoryAdjustment" TO postgres USING (true) WITH CHECK (true);


--
-- Name: InvoiceSequence Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."InvoiceSequence" TO postgres USING (true) WITH CHECK (true);


--
-- Name: OperatingExpense Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."OperatingExpense" TO postgres USING (true) WITH CHECK (true);


--
-- Name: Payment Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."Payment" TO postgres USING (true) WITH CHECK (true);


--
-- Name: PaymentSequence Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."PaymentSequence" TO postgres USING (true) WITH CHECK (true);


--
-- Name: Product Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."Product" TO postgres USING (true) WITH CHECK (true);


--
-- Name: ProductSequence Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."ProductSequence" TO postgres USING (true) WITH CHECK (true);


--
-- Name: Purchase Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."Purchase" TO postgres USING (true) WITH CHECK (true);


--
-- Name: PurchaseItem Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."PurchaseItem" TO postgres USING (true) WITH CHECK (true);


--
-- Name: Quote Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."Quote" TO postgres USING (true) WITH CHECK (true);


--
-- Name: QuoteItem Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."QuoteItem" TO postgres USING (true) WITH CHECK (true);


--
-- Name: QuoteSequence Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."QuoteSequence" TO postgres USING (true) WITH CHECK (true);


--
-- Name: Return Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."Return" TO postgres USING (true) WITH CHECK (true);


--
-- Name: ReturnItem Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."ReturnItem" TO postgres USING (true) WITH CHECK (true);


--
-- Name: ReturnSequence Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."ReturnSequence" TO postgres USING (true) WITH CHECK (true);


--
-- Name: Sale Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."Sale" TO postgres USING (true) WITH CHECK (true);


--
-- Name: SaleItem Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."SaleItem" TO postgres USING (true) WITH CHECK (true);


--
-- Name: SalePayment Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."SalePayment" TO postgres USING (true) WITH CHECK (true);


--
-- Name: SubUserLoginToken Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."SubUserLoginToken" TO postgres USING (true) WITH CHECK (true);


--
-- Name: SuperAdmin Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."SuperAdmin" TO postgres USING (true) WITH CHECK (true);


--
-- Name: SuperAdminAuditLog Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."SuperAdminAuditLog" TO postgres USING (true) WITH CHECK (true);


--
-- Name: Supplier Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."Supplier" TO postgres USING (true) WITH CHECK (true);


--
-- Name: User Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."User" TO postgres USING (true) WITH CHECK (true);


--
-- Name: WhatsappOtp Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public."WhatsappOtp" TO postgres USING (true) WITH CHECK (true);


--
-- Name: _prisma_migrations Postgres full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Postgres full access" ON public._prisma_migrations TO postgres USING (true) WITH CHECK (true);


--
-- Name: Product; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."Product" ENABLE ROW LEVEL SECURITY;

--
-- Name: ProductSequence; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."ProductSequence" ENABLE ROW LEVEL SECURITY;

--
-- Name: Purchase; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."Purchase" ENABLE ROW LEVEL SECURITY;

--
-- Name: PurchaseItem; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."PurchaseItem" ENABLE ROW LEVEL SECURITY;

--
-- Name: Quote; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."Quote" ENABLE ROW LEVEL SECURITY;

--
-- Name: QuoteItem; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."QuoteItem" ENABLE ROW LEVEL SECURITY;

--
-- Name: QuoteSequence; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."QuoteSequence" ENABLE ROW LEVEL SECURITY;

--
-- Name: Return; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."Return" ENABLE ROW LEVEL SECURITY;

--
-- Name: ReturnItem; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."ReturnItem" ENABLE ROW LEVEL SECURITY;

--
-- Name: ReturnSequence; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."ReturnSequence" ENABLE ROW LEVEL SECURITY;

--
-- Name: Sale; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."Sale" ENABLE ROW LEVEL SECURITY;

--
-- Name: SaleItem; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."SaleItem" ENABLE ROW LEVEL SECURITY;

--
-- Name: SalePayment; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."SalePayment" ENABLE ROW LEVEL SECURITY;

--
-- Name: SubUserLoginToken; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."SubUserLoginToken" ENABLE ROW LEVEL SECURITY;

--
-- Name: SuperAdmin; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."SuperAdmin" ENABLE ROW LEVEL SECURITY;

--
-- Name: SuperAdminAuditLog; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."SuperAdminAuditLog" ENABLE ROW LEVEL SECURITY;

--
-- Name: Supplier; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."Supplier" ENABLE ROW LEVEL SECURITY;

--
-- Name: User; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;

--
-- Name: WhatsappOtp; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public."WhatsappOtp" ENABLE ROW LEVEL SECURITY;

--
-- Name: _prisma_migrations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: postgres
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;


--
-- PostgreSQL database dump complete
--

\unrestrict HcnFaalaScIxFmaUnUWdJyPdiLyumOMXr4VkKyGU9yIPaQr6nkcdvbLbNYsmG2P


--
-- PostgreSQL database dump
--

\restrict xVv82aKcHzuqsk84RoNdOmFQoBm3l3UcFjc1OeIULu2BnqrBaC4Ky3q3SEN49XM

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

ALTER TABLE IF EXISTS ONLY public."WhatsappOtp" DROP CONSTRAINT IF EXISTS "WhatsappOtp_userId_fkey";
ALTER TABLE IF EXISTS ONLY public."User" DROP CONSTRAINT IF EXISTS "User_accountId_fkey";
ALTER TABLE IF EXISTS ONLY public."Supplier" DROP CONSTRAINT IF EXISTS "Supplier_accountId_fkey";
ALTER TABLE IF EXISTS ONLY public."Sale" DROP CONSTRAINT IF EXISTS "Sale_userId_fkey";
ALTER TABLE IF EXISTS ONLY public."Sale" DROP CONSTRAINT IF EXISTS "Sale_customerId_fkey";
ALTER TABLE IF EXISTS ONLY public."Sale" DROP CONSTRAINT IF EXISTS "Sale_cancelledBy_fkey";
ALTER TABLE IF EXISTS ONLY public."Sale" DROP CONSTRAINT IF EXISTS "Sale_accountId_fkey";
ALTER TABLE IF EXISTS ONLY public."SalePayment" DROP CONSTRAINT IF EXISTS "SalePayment_saleId_fkey";
ALTER TABLE IF EXISTS ONLY public."SaleItem" DROP CONSTRAINT IF EXISTS "SaleItem_saleId_fkey";
ALTER TABLE IF EXISTS ONLY public."SaleItem" DROP CONSTRAINT IF EXISTS "SaleItem_productId_fkey";
ALTER TABLE IF EXISTS ONLY public."Return" DROP CONSTRAINT IF EXISTS "Return_userId_fkey";
ALTER TABLE IF EXISTS ONLY public."Return" DROP CONSTRAINT IF EXISTS "Return_saleId_fkey";
ALTER TABLE IF EXISTS ONLY public."Return" DROP CONSTRAINT IF EXISTS "Return_cancelledBy_fkey";
ALTER TABLE IF EXISTS ONLY public."Return" DROP CONSTRAINT IF EXISTS "Return_accountId_fkey";
ALTER TABLE IF EXISTS ONLY public."ReturnSequence" DROP CONSTRAINT IF EXISTS "ReturnSequence_accountId_fkey";
ALTER TABLE IF EXISTS ONLY public."ReturnItem" DROP CONSTRAINT IF EXISTS "ReturnItem_saleItemId_fkey";
ALTER TABLE IF EXISTS ONLY public."ReturnItem" DROP CONSTRAINT IF EXISTS "ReturnItem_returnId_fkey";
ALTER TABLE IF EXISTS ONLY public."ReturnItem" DROP CONSTRAINT IF EXISTS "ReturnItem_productId_fkey";
ALTER TABLE IF EXISTS ONLY public."Quote" DROP CONSTRAINT IF EXISTS "Quote_userId_fkey";
ALTER TABLE IF EXISTS ONLY public."Quote" DROP CONSTRAINT IF EXISTS "Quote_customerId_fkey";
ALTER TABLE IF EXISTS ONLY public."Quote" DROP CONSTRAINT IF EXISTS "Quote_accountId_fkey";
ALTER TABLE IF EXISTS ONLY public."QuoteSequence" DROP CONSTRAINT IF EXISTS "QuoteSequence_accountId_fkey";
ALTER TABLE IF EXISTS ONLY public."QuoteItem" DROP CONSTRAINT IF EXISTS "QuoteItem_quoteId_fkey";
ALTER TABLE IF EXISTS ONLY public."QuoteItem" DROP CONSTRAINT IF EXISTS "QuoteItem_productId_fkey";
ALTER TABLE IF EXISTS ONLY public."Purchase" DROP CONSTRAINT IF EXISTS "Purchase_userId_fkey";
ALTER TABLE IF EXISTS ONLY public."Purchase" DROP CONSTRAINT IF EXISTS "Purchase_cancelledBy_fkey";
ALTER TABLE IF EXISTS ONLY public."Purchase" DROP CONSTRAINT IF EXISTS "Purchase_accountId_fkey";
ALTER TABLE IF EXISTS ONLY public."PurchaseItem" DROP CONSTRAINT IF EXISTS "PurchaseItem_purchaseId_fkey";
ALTER TABLE IF EXISTS ONLY public."PurchaseItem" DROP CONSTRAINT IF EXISTS "PurchaseItem_productId_fkey";
ALTER TABLE IF EXISTS ONLY public."Product" DROP CONSTRAINT IF EXISTS "Product_supplierId_fkey";
ALTER TABLE IF EXISTS ONLY public."Product" DROP CONSTRAINT IF EXISTS "Product_categoryId_fkey";
ALTER TABLE IF EXISTS ONLY public."Product" DROP CONSTRAINT IF EXISTS "Product_accountId_fkey";
ALTER TABLE IF EXISTS ONLY public."Payment" DROP CONSTRAINT IF EXISTS "Payment_userId_fkey";
ALTER TABLE IF EXISTS ONLY public."Payment" DROP CONSTRAINT IF EXISTS "Payment_cancelledBy_fkey";
ALTER TABLE IF EXISTS ONLY public."Payment" DROP CONSTRAINT IF EXISTS "Payment_arId_fkey";
ALTER TABLE IF EXISTS ONLY public."OperatingExpense" DROP CONSTRAINT IF EXISTS "OperatingExpense_userId_fkey";
ALTER TABLE IF EXISTS ONLY public."OperatingExpense" DROP CONSTRAINT IF EXISTS "OperatingExpense_accountId_fkey";
ALTER TABLE IF EXISTS ONLY public."InvoiceSequence" DROP CONSTRAINT IF EXISTS "InvoiceSequence_accountId_fkey";
ALTER TABLE IF EXISTS ONLY public."Customer" DROP CONSTRAINT IF EXISTS "Customer_accountId_fkey";
ALTER TABLE IF EXISTS ONLY public."CompanySettings" DROP CONSTRAINT IF EXISTS "CompanySettings_accountId_fkey";
ALTER TABLE IF EXISTS ONLY public."Category" DROP CONSTRAINT IF EXISTS "Category_accountId_fkey";
ALTER TABLE IF EXISTS ONLY public."AccountReceivable" DROP CONSTRAINT IF EXISTS "AccountReceivable_saleId_fkey";
ALTER TABLE IF EXISTS ONLY public."AccountReceivable" DROP CONSTRAINT IF EXISTS "AccountReceivable_customerId_fkey";
DROP INDEX IF EXISTS public."WhatsappOtp_phoneNumber_expiresAt_idx";
DROP INDEX IF EXISTS public."WhatsappOtp_phoneNumber_createdAt_idx";
DROP INDEX IF EXISTS public."WhatsappOtp_expiresAt_idx";
DROP INDEX IF EXISTS public."User_whatsappNumber_idx";
DROP INDEX IF EXISTS public."User_email_idx";
DROP INDEX IF EXISTS public."User_accountId_username_key";
DROP INDEX IF EXISTS public."User_accountId_idx";
DROP INDEX IF EXISTS public."Supplier_accountId_name_idx";
DROP INDEX IF EXISTS public."Supplier_accountId_idx";
DROP INDEX IF EXISTS public."Sale_customerId_idx";
DROP INDEX IF EXISTS public."Sale_cancelledAt_idx";
DROP INDEX IF EXISTS public."Sale_accountId_soldAt_idx";
DROP INDEX IF EXISTS public."Sale_accountId_invoiceCode_key";
DROP INDEX IF EXISTS public."Sale_accountId_idx";
DROP INDEX IF EXISTS public."SalePayment_saleId_idx";
DROP INDEX IF EXISTS public."Return_saleId_idx";
DROP INDEX IF EXISTS public."Return_cancelledAt_idx";
DROP INDEX IF EXISTS public."Return_accountId_returnedAt_idx";
DROP INDEX IF EXISTS public."Return_accountId_returnNumber_key";
DROP INDEX IF EXISTS public."Return_accountId_returnCode_key";
DROP INDEX IF EXISTS public."Return_accountId_idx";
DROP INDEX IF EXISTS public."ReturnSequence_accountId_key";
DROP INDEX IF EXISTS public."ReturnSequence_accountId_idx";
DROP INDEX IF EXISTS public."Quote_validUntil_idx";
DROP INDEX IF EXISTS public."Quote_customerId_idx";
DROP INDEX IF EXISTS public."Quote_accountId_quotedAt_idx";
DROP INDEX IF EXISTS public."Quote_accountId_quoteNumber_key";
DROP INDEX IF EXISTS public."Quote_accountId_quoteCode_key";
DROP INDEX IF EXISTS public."Quote_accountId_idx";
DROP INDEX IF EXISTS public."QuoteSequence_accountId_key";
DROP INDEX IF EXISTS public."QuoteSequence_accountId_idx";
DROP INDEX IF EXISTS public."Purchase_cancelledAt_idx";
DROP INDEX IF EXISTS public."Purchase_accountId_purchasedAt_idx";
DROP INDEX IF EXISTS public."Purchase_accountId_idx";
DROP INDEX IF EXISTS public."Product_supplierId_idx";
DROP INDEX IF EXISTS public."Product_categoryId_idx";
DROP INDEX IF EXISTS public."Product_accountId_sku_key";
DROP INDEX IF EXISTS public."Product_accountId_reference_idx";
DROP INDEX IF EXISTS public."Product_accountId_productId_key";
DROP INDEX IF EXISTS public."Product_accountId_name_idx";
DROP INDEX IF EXISTS public."Product_accountId_idx";
DROP INDEX IF EXISTS public."Payment_paidAt_idx";
DROP INDEX IF EXISTS public."Payment_cancelledAt_idx";
DROP INDEX IF EXISTS public."OperatingExpense_accountId_idx";
DROP INDEX IF EXISTS public."OperatingExpense_accountId_expenseDate_idx";
DROP INDEX IF EXISTS public."InvoiceSequence_accountId_series_key";
DROP INDEX IF EXISTS public."InvoiceSequence_accountId_idx";
DROP INDEX IF EXISTS public."Customer_accountId_name_idx";
DROP INDEX IF EXISTS public."Customer_accountId_isGeneric_idx";
DROP INDEX IF EXISTS public."Customer_accountId_idx";
DROP INDEX IF EXISTS public."CompanySettings_accountId_key";
DROP INDEX IF EXISTS public."CompanySettings_accountId_idx";
DROP INDEX IF EXISTS public."Category_accountId_name_key";
DROP INDEX IF EXISTS public."Category_accountId_isActive_idx";
DROP INDEX IF EXISTS public."Category_accountId_idx";
DROP INDEX IF EXISTS public."Account_clerkUserId_key";
DROP INDEX IF EXISTS public."Account_clerkUserId_idx";
DROP INDEX IF EXISTS public."AccountReceivable_status_idx";
DROP INDEX IF EXISTS public."AccountReceivable_saleId_key";
DROP INDEX IF EXISTS public."AccountReceivable_customerId_idx";
ALTER TABLE IF EXISTS ONLY public."WhatsappOtp" DROP CONSTRAINT IF EXISTS "WhatsappOtp_pkey";
ALTER TABLE IF EXISTS ONLY public."User" DROP CONSTRAINT IF EXISTS "User_pkey";
ALTER TABLE IF EXISTS ONLY public."Supplier" DROP CONSTRAINT IF EXISTS "Supplier_pkey";
ALTER TABLE IF EXISTS ONLY public."Sale" DROP CONSTRAINT IF EXISTS "Sale_pkey";
ALTER TABLE IF EXISTS ONLY public."SalePayment" DROP CONSTRAINT IF EXISTS "SalePayment_pkey";
ALTER TABLE IF EXISTS ONLY public."SaleItem" DROP CONSTRAINT IF EXISTS "SaleItem_pkey";
ALTER TABLE IF EXISTS ONLY public."Return" DROP CONSTRAINT IF EXISTS "Return_pkey";
ALTER TABLE IF EXISTS ONLY public."ReturnSequence" DROP CONSTRAINT IF EXISTS "ReturnSequence_pkey";
ALTER TABLE IF EXISTS ONLY public."ReturnItem" DROP CONSTRAINT IF EXISTS "ReturnItem_pkey";
ALTER TABLE IF EXISTS ONLY public."Quote" DROP CONSTRAINT IF EXISTS "Quote_pkey";
ALTER TABLE IF EXISTS ONLY public."QuoteSequence" DROP CONSTRAINT IF EXISTS "QuoteSequence_pkey";
ALTER TABLE IF EXISTS ONLY public."QuoteItem" DROP CONSTRAINT IF EXISTS "QuoteItem_pkey";
ALTER TABLE IF EXISTS ONLY public."Purchase" DROP CONSTRAINT IF EXISTS "Purchase_pkey";
ALTER TABLE IF EXISTS ONLY public."PurchaseItem" DROP CONSTRAINT IF EXISTS "PurchaseItem_pkey";
ALTER TABLE IF EXISTS ONLY public."Product" DROP CONSTRAINT IF EXISTS "Product_pkey";
ALTER TABLE IF EXISTS ONLY public."Payment" DROP CONSTRAINT IF EXISTS "Payment_pkey";
ALTER TABLE IF EXISTS ONLY public."OperatingExpense" DROP CONSTRAINT IF EXISTS "OperatingExpense_pkey";
ALTER TABLE IF EXISTS ONLY public."InvoiceSequence" DROP CONSTRAINT IF EXISTS "InvoiceSequence_pkey";
ALTER TABLE IF EXISTS ONLY public."Customer" DROP CONSTRAINT IF EXISTS "Customer_pkey";
ALTER TABLE IF EXISTS ONLY public."CompanySettings" DROP CONSTRAINT IF EXISTS "CompanySettings_pkey";
ALTER TABLE IF EXISTS ONLY public."Category" DROP CONSTRAINT IF EXISTS "Category_pkey";
ALTER TABLE IF EXISTS ONLY public."Account" DROP CONSTRAINT IF EXISTS "Account_pkey";
ALTER TABLE IF EXISTS ONLY public."AccountReceivable" DROP CONSTRAINT IF EXISTS "AccountReceivable_pkey";
ALTER TABLE IF EXISTS public."Product" ALTER COLUMN "productId" DROP DEFAULT;
DROP TABLE IF EXISTS public."WhatsappOtp";
DROP TABLE IF EXISTS public."User";
DROP TABLE IF EXISTS public."Supplier";
DROP TABLE IF EXISTS public."SalePayment";
DROP TABLE IF EXISTS public."SaleItem";
DROP TABLE IF EXISTS public."Sale";
DROP TABLE IF EXISTS public."ReturnSequence";
DROP TABLE IF EXISTS public."ReturnItem";
DROP TABLE IF EXISTS public."Return";
DROP TABLE IF EXISTS public."QuoteSequence";
DROP TABLE IF EXISTS public."QuoteItem";
DROP TABLE IF EXISTS public."Quote";
DROP TABLE IF EXISTS public."PurchaseItem";
DROP TABLE IF EXISTS public."Purchase";
DROP SEQUENCE IF EXISTS public."Product_productId_seq";
DROP TABLE IF EXISTS public."Product";
DROP TABLE IF EXISTS public."Payment";
DROP TABLE IF EXISTS public."OperatingExpense";
DROP TABLE IF EXISTS public."InvoiceSequence";
DROP TABLE IF EXISTS public."Customer";
DROP TABLE IF EXISTS public."CompanySettings";
DROP TABLE IF EXISTS public."Category";
DROP TABLE IF EXISTS public."AccountReceivable";
DROP TABLE IF EXISTS public."Account";
DROP TYPE IF EXISTS public."UserRole";
DROP TYPE IF EXISTS public."UnitType";
DROP TYPE IF EXISTS public."SaleType";
DROP TYPE IF EXISTS public."PaymentMethod";
DROP TYPE IF EXISTS public."AROpenStatus";
-- *not* dropping schema, since initdb creates it
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
    status public."AROpenStatus" DEFAULT 'PENDIENTE'::public."AROpenStatus" NOT NULL
);


ALTER TABLE public."AccountReceivable" OWNER TO postgres;

--
-- Name: Category; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Category" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "accountId" text NOT NULL,
    name text NOT NULL,
    description text,
    "isActive" boolean DEFAULT true NOT NULL
);


ALTER TABLE public."Category" OWNER TO postgres;

--
-- Name: CompanySettings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."CompanySettings" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "accountId" text NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    address text NOT NULL,
    "logoUrl" text,
    "allowNegativeStock" boolean DEFAULT false NOT NULL,
    "itbisRateBp" integer DEFAULT 1800 NOT NULL,
    "barcodeLabelSize" text DEFAULT '4x2'::text NOT NULL,
    "shippingLabelSize" text DEFAULT '4x6'::text NOT NULL
);


ALTER TABLE public."CompanySettings" OWNER TO postgres;

--
-- Name: Customer; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Customer" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "accountId" text NOT NULL,
    name text NOT NULL,
    phone text,
    address text,
    cedula text,
    province text,
    "isGeneric" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL
);


ALTER TABLE public."Customer" OWNER TO postgres;

--
-- Name: InvoiceSequence; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."InvoiceSequence" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "accountId" text NOT NULL,
    series text DEFAULT 'A'::text NOT NULL,
    "lastNumber" integer DEFAULT 0 NOT NULL
);


ALTER TABLE public."InvoiceSequence" OWNER TO postgres;

--
-- Name: OperatingExpense; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."OperatingExpense" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "accountId" text NOT NULL,
    description text NOT NULL,
    "amountCents" integer NOT NULL,
    "expenseDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    category text,
    "userId" text NOT NULL,
    notes text
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
    "cancelledBy" text
);


ALTER TABLE public."Payment" OWNER TO postgres;

--
-- Name: Product; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Product" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "accountId" text NOT NULL,
    "productId" integer NOT NULL,
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
    stock numeric(65,30) DEFAULT 0 NOT NULL,
    "minStock" numeric(65,30) DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "imageUrls" text[] DEFAULT ARRAY[]::text[]
);


ALTER TABLE public."Product" OWNER TO postgres;

--
-- Name: Product_productId_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public."Product_productId_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public."Product_productId_seq" OWNER TO postgres;

--
-- Name: Product_productId_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public."Product_productId_seq" OWNED BY public."Product"."productId";


--
-- Name: Purchase; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Purchase" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "accountId" text NOT NULL,
    "purchasedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "supplierName" text,
    "userId" text NOT NULL,
    "totalCents" integer NOT NULL,
    notes text,
    "cancelledAt" timestamp(3) without time zone,
    "cancelledBy" text
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
    qty numeric(65,30) NOT NULL,
    "unitCostCents" integer NOT NULL,
    "discountPercentBp" integer DEFAULT 0 NOT NULL,
    "netCostCents" integer DEFAULT 0 NOT NULL,
    "lineTotalCents" integer NOT NULL
);


ALTER TABLE public."PurchaseItem" OWNER TO postgres;

--
-- Name: Quote; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Quote" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "accountId" text NOT NULL,
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
    notes text
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
    qty numeric(65,30) NOT NULL,
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
    "accountId" text NOT NULL,
    "lastNumber" integer DEFAULT 0 NOT NULL
);


ALTER TABLE public."QuoteSequence" OWNER TO postgres;

--
-- Name: Return; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Return" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "accountId" text NOT NULL,
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
    "cancelledBy" text
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
    qty numeric(65,30) NOT NULL,
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
    "accountId" text NOT NULL,
    "lastNumber" integer DEFAULT 0 NOT NULL
);


ALTER TABLE public."ReturnSequence" OWNER TO postgres;

--
-- Name: Sale; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Sale" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "accountId" text NOT NULL,
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
    "cancelledBy" text
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
    qty numeric(65,30) NOT NULL,
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
-- Name: Supplier; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Supplier" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "accountId" text NOT NULL,
    name text NOT NULL,
    "contactName" text,
    phone text,
    email text,
    address text,
    notes text,
    "discountPercentBp" integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL
);


ALTER TABLE public."Supplier" OWNER TO postgres;

--
-- Name: User; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."User" (
    id text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "accountId" text NOT NULL,
    name text NOT NULL,
    username text NOT NULL,
    "passwordHash" text NOT NULL,
    email text,
    role public."UserRole" DEFAULT 'CAJERO'::public."UserRole" NOT NULL,
    "isOwner" boolean DEFAULT false NOT NULL,
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
-- Name: Product productId; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Product" ALTER COLUMN "productId" SET DEFAULT nextval('public."Product_productId_seq"'::regclass);


--
-- Data for Name: Account; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Account" (id, "createdAt", "updatedAt", name, "clerkUserId") FROM stdin;
cmkn8e84300001146ggy79rfc	2026-01-20 23:34:39.508	2026-01-20 23:34:39.508	Albin Rdz	user_38Xhy7UHdmDlEoOTYbvQXfsGgBB
cmkn8h1x8000e1146l6gfzvxe	2026-01-20 23:36:51.452	2026-01-20 23:36:51.452	Albin Rodriguez	user_38XiEm7A9B6f28UGXBX8a9IKvJf
cmkn8ut97000u1146hjie6e48	2026-01-20 23:47:33.403	2026-01-20 23:47:33.403	Albin Rodriguez	user_38XjXabhiZgYeGZPQydLVEpLi40
cmkn97jgw00271146o5najvwu	2026-01-20 23:57:27.249	2026-01-20 23:57:27.249	Albin Rdz	user_38XkkIHBWQsvWAwyoLg2sD20sxA
cmkncpb430000gcupya7vevqk	2026-01-21 01:35:15.066	2026-01-21 01:35:15.066	Albin Manuel Rodriguez Abreu	user_38XwdbJJymNyD5zPHPdHo67u3sF
\.


--
-- Data for Name: AccountReceivable; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."AccountReceivable" (id, "createdAt", "updatedAt", "saleId", "customerId", "totalCents", "balanceCents", status) FROM stdin;
cmkn94oir00231146fa69u0as	2026-01-20 23:55:13.828	2026-01-20 23:55:26.196	cmkn94oi2001z1146tc9a91d6	cmkn94cqg001u11465ztbvhha	10000	5000	PARCIAL
cmkn9i036000fjy3s40rtsrwz	2026-01-21 00:05:35.346	2026-01-21 00:08:30.987	cmkn9i02u000bjy3sn19np7qk	cmkn9ff2q002p1146hz3pix3k	1200	0	PAGADA
\.


--
-- Data for Name: Category; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Category" (id, "createdAt", "updatedAt", "accountId", name, description, "isActive") FROM stdin;
\.


--
-- Data for Name: CompanySettings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."CompanySettings" (id, "createdAt", "updatedAt", "accountId", name, phone, address, "logoUrl", "allowNegativeStock", "itbisRateBp", "barcodeLabelSize", "shippingLabelSize") FROM stdin;
cmkn8e8e60005114660hxd2ch	2026-01-20 23:34:39.87	2026-01-20 23:34:39.87	cmkn8e84300001146ggy79rfc	Albin Rdz			\N	f	1800	4x2	4x6
cmkn8h223000l1146dnu5j77n	2026-01-20 23:36:51.627	2026-01-20 23:36:51.627	cmkn8h1x8000e1146l6gfzvxe	Albin Rodriguez			\N	f	1800	4x2	4x6
cmkn8ut9c000x1146ssxjz6dw	2026-01-20 23:47:33.408	2026-01-20 23:47:33.408	cmkn8ut97000u1146hjie6e48	Albin Rodriguez			\N	f	1800	4x2	4x6
cmkn97jh800291146xmwz2q6o	2026-01-20 23:57:27.26	2026-01-21 00:59:41.532	cmkn97jgw00271146o5najvwu	Tejada auto adornos			\N	f	1800	4x2	4x6
cmkncpb4f0002gcupopnmjslg	2026-01-21 01:35:15.087	2026-01-21 01:35:15.087	cmkncpb430000gcupya7vevqk	Albin Manuel Rodriguez Abreu			\N	f	1800	4x2	4x6
\.


--
-- Data for Name: Customer; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Customer" (id, "createdAt", "updatedAt", "accountId", name, phone, address, cedula, province, "isGeneric", "isActive") FROM stdin;
cmkn8e8fs000d1146izviismu	2026-01-20 23:34:39.929	2026-01-20 23:34:39.929	cmkn8e84300001146ggy79rfc	Cliente general	\N	\N	\N	\N	t	t
cmkn8h21y000j1146jzoenth8	2026-01-20 23:36:51.622	2026-01-20 23:36:51.622	cmkn8h1x8000e1146l6gfzvxe	Cliente general	\N	\N	\N	\N	t	t
cmkn8ut9r001311461ezjr2vc	2026-01-20 23:47:33.423	2026-01-20 23:47:33.423	cmkn8ut97000u1146hjie6e48	Cliente general	\N	\N	\N	\N	t	t
cmkn94cqg001u11465ztbvhha	2026-01-20 23:54:58.553	2026-01-20 23:54:58.553	cmkn8ut97000u1146hjie6e48	Jose	\N	\N	\N	\N	f	t
cmkn97jib002h1146igipjsw6	2026-01-20 23:57:27.299	2026-01-20 23:57:27.299	cmkn97jgw00271146o5najvwu	Cliente general	\N	\N	\N	\N	t	t
cmkn9ff2q002p1146hz3pix3k	2026-01-21 00:03:34.802	2026-01-21 00:03:34.802	cmkn97jgw00271146o5najvwu	Amanda	\N	\N	\N	\N	f	t
cmkncpb57000agcupikvmgu17	2026-01-21 01:35:15.115	2026-01-21 01:35:15.115	cmkncpb430000gcupya7vevqk	Cliente general	\N	\N	\N	\N	t	t
\.


--
-- Data for Name: InvoiceSequence; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."InvoiceSequence" (id, "createdAt", "updatedAt", "accountId", series, "lastNumber") FROM stdin;
cmkn8e8eh000711468dcz37bg	2026-01-20 23:34:39.882	2026-01-20 23:34:39.882	cmkn8e84300001146ggy79rfc	A	0
cmkn8h22a000n11464saxo2ki	2026-01-20 23:36:51.634	2026-01-20 23:36:51.634	cmkn8h1x8000e1146l6gfzvxe	A	0
cmkn8ut9j000z1146gmo6vt75	2026-01-20 23:47:33.415	2026-01-20 23:55:13.798	cmkn8ut97000u1146hjie6e48	A	2
cmkn97jhc002b1146fyay9ncp	2026-01-20 23:57:27.264	2026-01-21 00:22:30.251	cmkn97jgw00271146o5najvwu	A	3
cmkncpb4l0004gcupnj5o3rqd	2026-01-21 01:35:15.093	2026-01-21 01:35:15.093	cmkncpb430000gcupya7vevqk	A	0
\.


--
-- Data for Name: OperatingExpense; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."OperatingExpense" (id, "createdAt", "updatedAt", "accountId", description, "amountCents", "expenseDate", category, "userId", notes) FROM stdin;
\.


--
-- Data for Name: Payment; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Payment" (id, "createdAt", "arId", "userId", "paidAt", "amountCents", method, note, "cancelledAt", "cancelledBy") FROM stdin;
cmkn94y2900261146yf4yhw9z	2026-01-20 23:55:26.193	cmkn94oir00231146fa69u0as	cmkn8v27n00191146507icp5o	2026-01-20 23:55:26.193	5000	EFECTIVO	\N	\N	\N
cmkn9lrm0000ijy3stesmgd54	2026-01-21 00:08:30.984	cmkn9i036000fjy3s40rtsrwz	cmkn97qt3002l1146z82s2xhl	2026-01-21 00:08:30.984	1200	EFECTIVO	\N	\N	\N
\.


--
-- Data for Name: Product; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Product" (id, "createdAt", "updatedAt", "accountId", "productId", name, sku, reference, "supplierId", "categoryId", "priceCents", "costCents", "itbisRateBp", "purchaseUnit", "saleUnit", stock, "minStock", "isActive", "imageUrls") FROM stdin;
cmkn8vsqa001b1146ywl47bs1	2026-01-20 23:48:19.374	2026-01-20 23:55:13.824	cmkn8ut97000u1146hjie6e48	1	Alfombra	\N	\N	\N	\N	10000	5000	1800	UNIDAD	UNIDAD	3.000000000000000000000000000000	0.000000000000000000000000000000	t	{}
cmkn9ekeb002n1146l8n76c3r	2026-01-21 00:02:55.043	2026-01-21 00:58:42.881	cmkn97jgw00271146o5najvwu	2	goma	\N	\N	\N	\N	1600	300	1800	UNIDAD	UNIDAD	4.000000000000000000000000000000	0.000000000000000000000000000000	t	{}
\.


--
-- Data for Name: Purchase; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Purchase" (id, "createdAt", "updatedAt", "accountId", "purchasedAt", "supplierName", "userId", "totalCents", notes, "cancelledAt", "cancelledBy") FROM stdin;
\.


--
-- Data for Name: PurchaseItem; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."PurchaseItem" (id, "createdAt", "purchaseId", "productId", qty, "unitCostCents", "discountPercentBp", "netCostCents", "lineTotalCents") FROM stdin;
\.


--
-- Data for Name: Quote; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Quote" (id, "createdAt", "updatedAt", "accountId", "quoteNumber", "quoteCode", "quotedAt", "validUntil", "customerId", "userId", "subtotalCents", "itbisCents", "shippingCents", "totalCents", notes) FROM stdin;
\.


--
-- Data for Name: QuoteItem; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."QuoteItem" (id, "createdAt", "quoteId", "productId", qty, "unitPriceCents", "wasPriceOverridden", "lineTotalCents") FROM stdin;
\.


--
-- Data for Name: QuoteSequence; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."QuoteSequence" (id, "createdAt", "updatedAt", "accountId", "lastNumber") FROM stdin;
cmkn8e8fh000b1146znbv9wqy	2026-01-20 23:34:39.917	2026-01-20 23:34:39.917	cmkn8e84300001146ggy79rfc	0
cmkn8h22y000r1146x31f2el1	2026-01-20 23:36:51.659	2026-01-20 23:36:51.659	cmkn8h1x8000e1146l6gfzvxe	0
cmkn8ut9s00151146kmdv8zfe	2026-01-20 23:47:33.424	2026-01-20 23:47:33.424	cmkn8ut97000u1146hjie6e48	0
cmkn97jht002f1146k4k3tlum	2026-01-20 23:57:27.282	2026-01-20 23:57:27.282	cmkn97jgw00271146o5najvwu	0
cmkncpb500008gcupt1bbwfwh	2026-01-21 01:35:15.108	2026-01-21 01:35:15.108	cmkncpb430000gcupya7vevqk	0
\.


--
-- Data for Name: Return; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Return" (id, "createdAt", "updatedAt", "accountId", "returnNumber", "returnCode", "returnedAt", "saleId", "userId", "subtotalCents", "itbisCents", "totalCents", notes, "cancelledAt", "cancelledBy") FROM stdin;
\.


--
-- Data for Name: ReturnItem; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."ReturnItem" (id, "createdAt", "returnId", "saleItemId", "productId", qty, "unitPriceCents", "lineTotalCents") FROM stdin;
\.


--
-- Data for Name: ReturnSequence; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."ReturnSequence" (id, "createdAt", "updatedAt", "accountId", "lastNumber") FROM stdin;
cmkn8e8fb00091146rqhischv	2026-01-20 23:34:39.911	2026-01-20 23:34:39.911	cmkn8e84300001146ggy79rfc	0
cmkn8h22r000p1146mhm4ddaq	2026-01-20 23:36:51.652	2026-01-20 23:36:51.652	cmkn8h1x8000e1146l6gfzvxe	0
cmkn8ut9n00111146ke82jsgw	2026-01-20 23:47:33.419	2026-01-20 23:47:33.419	cmkn8ut97000u1146hjie6e48	0
cmkn97jhl002d1146ze7pwouh	2026-01-20 23:57:27.273	2026-01-20 23:57:27.273	cmkn97jgw00271146o5najvwu	0
cmkncpb4t0006gcup8t4hsjsp	2026-01-21 01:35:15.101	2026-01-21 01:35:15.101	cmkncpb430000gcupya7vevqk	0
\.


--
-- Data for Name: Sale; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Sale" (id, "createdAt", "updatedAt", "accountId", "invoiceSeries", "invoiceNumber", "invoiceCode", "soldAt", type, "paymentMethod", "customerId", "userId", "subtotalCents", "itbisCents", "shippingCents", "totalCents", notes, "cancelledAt", "cancelledBy") FROM stdin;
cmkn92lc6001q1146c7do0bfe	2026-01-20 23:53:36.39	2026-01-20 23:53:36.39	cmkn8ut97000u1146hjie6e48	A	1	A-00001	2026-01-20 23:53:36.39	CONTADO	EFECTIVO	cmkn8ut9r001311461ezjr2vc	cmkn8v27n00191146507icp5o	16949	3051	0	20000	\N	\N	\N
cmkn94oi2001z1146tc9a91d6	2026-01-20 23:55:13.802	2026-01-20 23:55:13.802	cmkn8ut97000u1146hjie6e48	A	2	A-00002	2026-01-20 23:55:13.802	CREDITO	\N	cmkn94cqg001u11465ztbvhha	cmkn8v27n00191146507icp5o	8475	1525	0	10000	\N	\N	\N
cmkn9hsgy0004jy3s9u46i46w	2026-01-21 00:05:25.475	2026-01-21 00:05:25.475	cmkn97jgw00271146o5najvwu	A	1	A-00001	2026-01-21 00:05:25.475	CONTADO	EFECTIVO	cmkn97jib002h1146igipjsw6	cmkn97qt3002l1146z82s2xhl	508	92	0	600	\N	\N	\N
cmkn9i02u000bjy3sn19np7qk	2026-01-21 00:05:35.334	2026-01-21 00:05:35.334	cmkn97jgw00271146o5najvwu	A	2	A-00002	2026-01-21 00:05:35.334	CREDITO	\N	cmkn9ff2q002p1146hz3pix3k	cmkn97qt3002l1146z82s2xhl	1017	183	0	1200	\N	\N	\N
cmkna3r76000njy3sm453jeqc	2026-01-21 00:22:30.258	2026-01-21 00:58:42.878	cmkn97jgw00271146o5najvwu	A	3	A-00003	2026-01-21 00:22:30.258	CONTADO	TRANSFERENCIA	cmkn97jib002h1146igipjsw6	cmkn97qt3002l1146z82s2xhl	1525	275	10000	1800	\N	\N	\N
\.


--
-- Data for Name: SaleItem; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."SaleItem" (id, "createdAt", "saleId", "productId", qty, "unitPriceCents", "wasPriceOverridden", "lineTotalCents") FROM stdin;
cmkn92lc6001s1146u0uyagw2	2026-01-20 23:53:36.39	cmkn92lc6001q1146c7do0bfe	cmkn8vsqa001b1146ywl47bs1	2.000000000000000000000000000000	10000	f	20000
cmkn94oi200211146ec63edug	2026-01-20 23:55:13.802	cmkn94oi2001z1146tc9a91d6	cmkn8vsqa001b1146ywl47bs1	1.000000000000000000000000000000	10000	f	10000
cmkn9hsgy0006jy3sfzkyav6j	2026-01-21 00:05:25.475	cmkn9hsgy0004jy3s9u46i46w	cmkn9ekeb002n1146l8n76c3r	1.000000000000000000000000000000	600	f	600
cmkn9i02u000djy3s5s53klja	2026-01-21 00:05:35.334	cmkn9i02u000bjy3sn19np7qk	cmkn9ekeb002n1146l8n76c3r	2.000000000000000000000000000000	600	f	1200
cmknbeblq000ujy3shplaqw9q	2026-01-21 00:58:42.878	cmkna3r76000njy3sm453jeqc	cmkn9ekeb002n1146l8n76c3r	3.000000000000000000000000000000	600	f	1800
\.


--
-- Data for Name: SalePayment; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."SalePayment" (id, "createdAt", "saleId", method, "amountCents") FROM stdin;
\.


--
-- Data for Name: Supplier; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Supplier" (id, "createdAt", "updatedAt", "accountId", name, "contactName", phone, email, address, notes, "discountPercentBp", "isActive") FROM stdin;
\.


--
-- Data for Name: User; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."User" (id, "createdAt", "updatedAt", "accountId", name, username, "passwordHash", email, role, "isOwner", "whatsappNumber", "whatsappVerifiedAt", "canOverridePrice", "canCancelSales", "canCancelReturns", "canCancelPayments", "canEditSales", "canEditProducts", "canChangeSaleType", "canSellWithoutStock", "canManageBackups", "isActive", "canViewProductCosts", "canViewProfitReport") FROM stdin;
cmkn8e8du00031146zsdz47n9	2026-01-20 23:34:39.858	2026-01-20 23:34:39.858	cmkn8e84300001146ggy79rfc	Albin Rdz	albinmrodriguez	$2b$10$hfo8xNFp1uI92nLbmlk9s.c9fvKrgeTPzKpzHW3IYcsp9vsV9dGpG	albinmrodriguez@gmail.com	ADMIN	t	\N	\N	t	t	t	t	t	t	t	t	t	t	f	f
cmkn8h21v000h1146oop3u0rh	2026-01-20 23:36:51.619	2026-01-20 23:36:51.619	cmkn8h1x8000e1146l6gfzvxe	Albin Rodriguez	albinmrodriguez2	$2b$10$op6PAH2nLO8yF9DEkkQnPuRDIMi4FmyZXP18JYtsHmlPg2wKYEt0e	albinmrodriguez2@gmail.com	ADMIN	t	\N	\N	t	t	t	t	t	t	t	t	t	t	f	f
cmkn8v27n00191146507icp5o	2026-01-20 23:47:45.012	2026-01-20 23:47:45.012	cmkn8ut97000u1146hjie6e48	Albin Rodriguez	albinmrodriguez2	$2b$10$1/iJCS2DDjZHW/c8NEFXXOtWRTj8fMDfg6h2ZyQxDqsHa8aG7SfZ.	albinmrodriguez2@gmail.com	ADMIN	t	\N	\N	t	t	t	t	t	t	t	t	t	t	f	f
cmkna4m4m000rjy3skg8rx02g	2026-01-21 00:23:10.343	2026-01-21 01:09:18.136	cmkn97jgw00271146o5najvwu	JUNIOR	junior123	$2b$10$HWHZolgdVe.8oYer0kL1oeSKNl0hj2Iu.HaRJ0euVJ.72DpnpnFhS	\N	CAJERO	f	\N	\N	f	f	f	f	f	t	t	t	f	t	f	f
cmkn97qt3002l1146z82s2xhl	2026-01-20 23:57:36.76	2026-01-21 01:10:05.21	cmkn97jgw00271146o5najvwu	Albin Rdz	albinmrodriguez	$2b$10$b5jS2o8CSyZrrFcViWXDmueihPJSBmvZipIRV6OV8UmFSHYpMjkwq	albinmrodriguez@gmail.com	ADMIN	t	\N	\N	t	t	t	t	t	t	t	t	t	t	f	f
cmkncpxt8000cgcupyyolophe	2026-01-21 01:35:44.492	2026-01-21 01:35:44.492	cmkncpb430000gcupya7vevqk	Albin Manuel Rodriguez Abreu	jicafoy597	$2b$10$FWA2gFPksj5wNV5aEN6jDunya2eRcBoCElIXBPpntSjlFNrlNIaa.	jicafoy597@oremal.com	ADMIN	t	\N	\N	t	t	t	t	t	t	t	t	t	t	f	f
\.


--
-- Data for Name: WhatsappOtp; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."WhatsappOtp" (id, "createdAt", "phoneNumber", code, "expiresAt", "consumedAt", purpose, attempts, "ipAddress", "userAgent", "userId") FROM stdin;
cmknepqg00000se7amez9yxrq	2026-01-21 02:31:34.176	+18499254434	436441	2026-01-21 02:41:34.151	\N	login	0	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	\N
cmkneqk3c00002b64x4gifdgq	2026-01-21 02:32:12.6	+18499254434	868637	2026-01-21 02:42:12.592	\N	login	0	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0	\N
\.


--
-- Name: Product_productId_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public."Product_productId_seq"', 2, true);


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
-- Name: Payment Payment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_pkey" PRIMARY KEY (id);


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
-- Name: AccountReceivable_customerId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "AccountReceivable_customerId_idx" ON public."AccountReceivable" USING btree ("customerId");


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
-- Name: Payment_cancelledAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Payment_cancelledAt_idx" ON public."Payment" USING btree ("cancelledAt");


--
-- Name: Payment_paidAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Payment_paidAt_idx" ON public."Payment" USING btree ("paidAt");


--
-- Name: Product_accountId_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Product_accountId_idx" ON public."Product" USING btree ("accountId");


--
-- Name: Product_accountId_name_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Product_accountId_name_idx" ON public."Product" USING btree ("accountId", name);


--
-- Name: Product_accountId_productId_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Product_accountId_productId_key" ON public."Product" USING btree ("accountId", "productId");


--
-- Name: Product_accountId_reference_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "Product_accountId_reference_idx" ON public."Product" USING btree ("accountId", reference);


--
-- Name: Product_accountId_sku_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Product_accountId_sku_key" ON public."Product" USING btree ("accountId", sku);


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
    ADD CONSTRAINT "PurchaseItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


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
    ADD CONSTRAINT "QuoteItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


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
    ADD CONSTRAINT "ReturnItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


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
    ADD CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


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
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: postgres
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;


--
-- PostgreSQL database dump complete
--

\unrestrict xVv82aKcHzuqsk84RoNdOmFQoBm3l3UcFjc1OeIULu2BnqrBaC4Ky3q3SEN49XM


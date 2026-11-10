import { NextRequest, NextResponse } from "next/server"
import { getCurrentUserFromRequest } from "../../_helpers/auth"
import { FiscalDocumentError } from "@/lib/fiscal/core/document"
import { FiscalSequenceError } from "@/lib/fiscal/core/sequences"
export async function actor(request:NextRequest) { const user=await getCurrentUserFromRequest(request); if(!user)throw new FiscalDocumentError("UNAUTHENTICATED","No autenticado",401);return user }
export async function body(request:NextRequest) { try{return await request.json()}catch{throw new FiscalDocumentError("INVALID_INPUT","JSON inválido",400)} }
export function ok(value:unknown,status=200){return NextResponse.json(value,{status,headers:{"Cache-Control":"private, no-store"}})}
export function errorResponse(error:unknown){const correlationId=crypto.randomUUID(),known=error instanceof FiscalDocumentError || error instanceof FiscalSequenceError;if(!known)console.error("Error fiscal",correlationId,error);return NextResponse.json({error:{code:known?error.code:"INTERNAL_ERROR",message:known?error.message:"No se pudo procesar la solicitud",fields:known?(error instanceof FiscalDocumentError?error.issues:error.fields.map(field=>({field,message:error.message}))):[],retryable:!known,correlationId}},{status:known?error.status:500,headers:{"Cache-Control":"private, no-store"}})}

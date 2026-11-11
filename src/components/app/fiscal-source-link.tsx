"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
// Con el módulo apagado no añadir enlaces fiscales a los listados ordinarios.
export function useFiscalSourceAccess(){const [allowed,setAllowed]=useState(false);useEffect(()=>{let current=true;fetch("/api/fiscal/capabilities",{cache:"no-store"}).then(r=>r.ok?r.json():null).then(data=>{if(current)setAllowed(data?.policy?.enabled===true&&data?.permissions?.view===true)}).catch(()=>{});return()=>{current=false}},[]);return allowed}
export function FiscalSourceLink({allowed,kind,id}:{allowed:boolean;kind:string;id:string}){return allowed?<><Link className="ml-2 text-xs underline" href={`/fiscal/documents?source=${encodeURIComponent(kind)}&sourceId=${encodeURIComponent(id)}`}>Fiscal</Link>{["PURCHASE","PAYABLE","EXPENSE"].includes(kind)&&<Link className="ml-2 text-xs underline" href={`/fiscal/received-documents?sourceKind=${encodeURIComponent(kind)}&sourceId=${encodeURIComponent(id)}`}>Comprobante recibido</Link>}</>:null}

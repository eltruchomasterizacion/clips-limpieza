// Sin licencias: todo el mundo tiene el plan Gratis completo.
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    configurado: true,
    activa: true,
    plan: "Gratis",
    planId: "gratis",
    maestro: false,
    expira: null,
    ilimitado: true,
    maxCalidad: "4K",
  });
}

export async function POST() {
  return NextResponse.json({
    ok: true,
    plan: "gratis",
    mensaje: "No necesitas licencia: el editor es gratis.",
  });
}

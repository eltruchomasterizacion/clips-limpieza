// Sin límites de uso: el plan Gratis es ilimitado.
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ configurado: true, tipo: "ilimitado", usados: 0, planId: "gratis" });
}

export async function POST() {
  return NextResponse.json({ ok: true, tipo: "ilimitado", usados: 0 });
}

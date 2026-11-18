// Sin códigos de acceso: el editor es gratis para todos.
// Esta ruta se mantiene para no romper el panel de admin viejo.
import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    ok: true,
    gratis: true,
    plan: "gratis",
    mensaje: "El editor es gratis y sin código de acceso.",
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, gratis: true, plan: "gratis" });
}

// Clips Limpieza es GRATIS y sin código de acceso.
// Este middleware ya no pide sesión ni código: deja pasar todas las rutas.
// Se mantiene el archivo para no romper la configuración de Next.js.
import { NextResponse } from "next/server";

export function proxy() {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

"use client";
// La página de acceso ya no existe: el editor es gratis y sin código.
// Esta ruta solo redirige al editor para no romper enlaces viejos.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AccesoPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/editor");
  }, [router]);
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090708] p-6 text-center text-white">
      <p className="text-sm text-[#a89ca1]">
        El editor ahora es gratis y sin código… llevándote al editor.
      </p>
    </main>
  );
}

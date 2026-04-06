import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[#020204] text-zinc-100 p-6">
      <div className="max-w-md w-full text-center space-y-4">
        <h1 className="text-2xl font-semibold">Página no encontrada</h1>
        <p className="text-sm text-zinc-400">
          La página que buscas no existe o fue movida.
        </p>
        <div>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}

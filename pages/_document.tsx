import { Head, Html, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="es" translate="no" className="dark notranslate">
      <Head />
      <body className="bg-[#020204] text-zinc-100 antialiased overscroll-none">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

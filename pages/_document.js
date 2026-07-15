import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Tracewire" />
        <meta name="theme-color" content="#1B2A41" />
            <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />

      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

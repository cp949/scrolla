import "./globals.css";
import "@cp949/scrolla-react/styles.css";

export const metadata = {
  title: "Scrolla Playground",
  description: "Interactive examples for @cp949/scrolla-react.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>
        {children}
      </body>
    </html>
  );
}

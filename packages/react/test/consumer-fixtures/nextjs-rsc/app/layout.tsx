import "@cp949/scrolla-react/styles.css";

export const metadata = {
  title: "React Server Component consumer fixture",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

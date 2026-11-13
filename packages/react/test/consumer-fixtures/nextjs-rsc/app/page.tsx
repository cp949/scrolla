// 이 파일은 의도적으로 'use client'를 선언하지 않는 Server Component다.
// @cp949/scrolla-react가 자기 공개 entry에 'use client'를 내장하고 있어야만
// 이 Server Component가 별도 client wrapper 없이 <Scrolla>를 직접 렌더링할 수 있다
// build가 성공하면 RSC client boundary 계약이 packed tarball에서도 유지됨을
// 증명한다.
import { Scrolla } from "@cp949/scrolla-react";

export default function Home() {
  return (
    <main>
      <h1>React Server Component consumer fixture</h1>
      <Scrolla
        axis="vertical"
        direction="auto"
        autoHide
        style={{ height: 200, width: 300 }}
      >
        <div style={{ height: 800 }}>content</div>
      </Scrolla>
    </main>
  );
}

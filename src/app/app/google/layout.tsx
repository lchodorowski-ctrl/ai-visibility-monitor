import { GoogleSubNav } from "./GoogleSubNav";

export default function GoogleLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GoogleSubNav />
      {children}
    </>
  );
}

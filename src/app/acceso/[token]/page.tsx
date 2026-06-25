import { AccesoClient } from "./AccesoClient";

export function generateStaticParams() {
  return [{ token: "_" }];
}

export default function AccesoPage({
  params,
}: {
  params: { token: string };
}) {
  return <AccesoClient fallbackToken={params.token} />;
}

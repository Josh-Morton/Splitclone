import Link from "next/link";
import { Card, Logo, Screen } from "@/components/ui";

export default function NotFound() {
  return (
    <Screen padding={26} center>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 22 }}>
        <Logo size={52} />
      </div>
      <Card style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Page not found</h1>
        <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 14 }}>
          This link is invalid or the page has moved.
        </p>
        <Link href="/" style={{ color: "var(--primary)", fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
          Back to Tally
        </Link>
      </Card>
    </Screen>
  );
}

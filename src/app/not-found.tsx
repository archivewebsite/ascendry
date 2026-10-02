import Link from "next/link";
import { Card, CardBody, uiStyles } from "@/components/ui";
export default function NotFound() { return <Card><CardBody><h1>Signal not found</h1><p className="mutedText">That Ascendry route does not exist.</p><Link className={uiStyles.button} href="/">Return to dashboard</Link></CardBody></Card>; }

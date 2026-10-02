"use client";
import { useEffect } from "react";
import { Button, Card, CardBody, ErrorMessage } from "@/components/ui";
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) { useEffect(() => { /* deliberately avoid logging potentially sensitive response bodies */ }, [error]); return <Card><CardBody><h1>Workspace fault</h1><ErrorMessage>{error.message || "The current view could not be rendered."}</ErrorMessage><p><Button onClick={reset}>Try again</Button></p></CardBody></Card>; }

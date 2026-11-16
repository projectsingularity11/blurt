// The one-time authenticated bulk importer is deliberately closed after verification.
// Future imports require a new, explicitly configured administrative deployment.
Deno.serve(() => new Response("Content import is closed", { status: 410 }));

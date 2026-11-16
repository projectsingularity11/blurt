import { Header } from "@/components/ui";
import { Link } from "next-view-transitions";
import sources from "@/content/sources.json";
export default async function PhotoCredits({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const query = await searchParams;
  const pages = Math.ceil(sources.length / 50);
  const page = Math.max(
    1,
    Math.min(pages, Math.floor(Number(query.page) || 1)),
  );
  const rows = sources.slice((page - 1) * 50, page * 50);
  return (
    <>
      <Header label="Image credits" />
      <main className="solo-panel credits">
        <h1>Every picture has a source</h1>
        <p>
          {sources.length.toLocaleString()} individually credited images · page{" "}
          {page} of {pages}
        </p>
        <ul>
          {rows.map((p) => (
            <li key={p.id}>
              <a href={p.sourceFileUrl} target="_blank" rel="noreferrer">
                {p.answer}
              </a>
              <br />
              {p.author}
              <br />
              <a href={p.licenseUrl} target="_blank" rel="noreferrer">
                {p.license}
              </a>{" "}
              · resized and pixelated for BLURT
            </li>
          ))}
        </ul>
        <nav className="credit-pages" aria-label="Image credit pages">
          {page > 1 ? (
            <Link
              className="button secondary"
              href={`/credits/photos?page=${page - 1}`}
            >
              Previous
            </Link>
          ) : null}
          {page < pages ? (
            <Link
              className="button secondary"
              href={`/credits/photos?page=${page + 1}`}
            >
              Next
            </Link>
          ) : null}
          <Link href="/credits">All credits</Link>
        </nav>
      </main>
    </>
  );
}

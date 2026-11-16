import { Link } from "next-view-transitions";
import { ArrowUpRight, LogIn } from "lucide-react";
import {
  IconCamera,
  IconUsers,
  IconLeaf,
  IconZap,
} from "@/vendor/frutiger-js/icons";
import catalog from "@/content/catalog-summary.json";
import { Controls, Help, Wordmark } from "@/components/ui";
export default function Home() {
  return (
    <main className="title-screen">
      <Controls />
      <section className="aero-home">
        <div className="home-identity">
          <img
            className="hero-bloom"
            src="/brand/bloom.webp"
            alt="BLURT’s pink glass flower with a blue lens"
          />
          <div>
            <Wordmark />
            <p>Trust your eyes and blurt it out</p>
          </div>
        </div>
        <p className="stack-count">
          <strong>{catalog.stack.toLocaleString()}</strong> fresh pictures in
          the stack
        </p>
        <nav className="mode-grid" aria-label="Game modes">
          <Link className="mode-card daily-card" href="/daily">
            <span className="mode-icon">
              <IconCamera size={40} />
            </span>
            <span className="mode-tag">ONE A DAY</span>
            <h1>Daily Bloom</h1>
            <p>Find the picture in five reveals</p>
            <span className="mode-cta">
              Take a look <ArrowUpRight size={20} />
            </span>
            <span className="card-orb" />
          </Link>
          <Link className="mode-card party-card" href="/party/create">
            <span className="mode-icon">
              <IconUsers size={40} />
            </span>
            <span className="mode-tag">2–8 PLAYERS</span>
            <h2>Petal Party</h2>
            <p>Beat your friends to the reveal</p>
            <span className="mode-cta">
              Gather your people <ArrowUpRight size={20} />
            </span>
          </Link>
          <Link className="mode-card compact-card" href="/play/free">
            <IconLeaf size={38} />
            <div>
              <h2>Free Bloom</h2>
              <p>Keep guessing at your own pace</p>
            </div>
            <ArrowUpRight size={20} />
          </Link>
          <Link
            className="mode-card compact-card flash-card"
            href="/play/flash"
          >
            <IconZap size={38} />
            <div>
              <h2>Flash Bloom</h2>
              <p>Build your streak in 90 seconds</p>
            </div>
            <ArrowUpRight size={20} />
          </Link>
        </nav>
        <div className="home-bottom">
          <Link className="join-link" href="/party/join">
            <LogIn size={17} /> Join with a party code{" "}
            <ArrowUpRight size={17} />
          </Link>
          <Help />
        </div>
      </section>
      <footer className="aero-footer">
        <span>Let your curiosity run wild</span>
        <Link href="/credits">Sources & credits ↗</Link>
      </footer>
    </main>
  );
}

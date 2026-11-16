import { Header } from "@/components/ui";
import { Link } from "next-view-transitions";
export default function Credits() {
  return (
    <>
      <Header label="Sources & credits" />
      <main className="solo-panel credits">
        <h1>Good things have roots</h1>
        <ul>
          <li>
            Clear soap bubbles and sky layers adapt{" "}
            <a href="https://github.com/Visnalize/makeaero">MakeAero</a> under
            the MIT License
          </li>
          <li>
            Glossy control domes, illustrated icons and the droplet cursor adapt{" "}
            <a href="https://github.com/biagio-scaglia/frutiger-js">
              Frutiger.js
            </a>{" "}
            under the MIT License
          </li>
          <li>
            Soft feedback uses the{" "}
            <a href="https://github.com/JustPinero/pingthings/tree/main/packs/serene-tones">
              professional Serene Tones pack
            </a>{" "}
            by rubberduck under CC0, played with{" "}
            <a href="https://github.com/goldfire/howler.js">Howler</a>
          </li>
          <li>
            Page transitions use{" "}
            <a href="https://github.com/shuding/next-view-transitions">
              next-view-transitions
            </a>{" "}
            under the MIT License
          </li>
          <li>
            DynaPuff and Nunito are self-hosted through{" "}
            <a href="https://github.com/fontsource/fontsource">Fontsource</a>{" "}
            under the SIL Open Font License
          </li>
          <li>
            The glass-flower emblem is BLURT’s existing original generated
            artwork
          </li>
          <li>
            The picture collection includes individually licensed Wikimedia
            Commons images and the original Unsplash collection —{" "}
            <Link href="/credits/photos">browse image credits</Link>
          </li>
        </ul>
      </main>
    </>
  );
}

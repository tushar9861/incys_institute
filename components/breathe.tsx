"use client";
import { useEffect, useRef, useState } from "react";
import { Pause, Play, Wind } from "lucide-react";
export function Breathe() {
  const node = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [phase, setPhase] = useState("A moment for yourself");
  useEffect(() => {
    if (!node.current) return;
    let disposed = false;
    let animation: import("lottie-web").AnimationItem | undefined;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let visible = true;
    const update = () => {
      if (
        playing &&
        visible &&
        !media.matches &&
        document.visibilityState === "visible"
      )
        animation?.play();
      else animation?.pause();
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    observer.observe(node.current);
    import("lottie-web").then(({ default: lottie }) => {
      if (disposed || !node.current) return;
      animation = lottie.loadAnimation({
        container: node.current,
        renderer: "svg",
        loop: true,
        autoplay: false,
        path: "/animations/breathe.json",
      });
      animation.addEventListener("DOMLoaded", update);
    });
    media.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      disposed = true;
      observer.disconnect();
      animation?.destroy();
      media.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [playing]);
  useEffect(() => {
    if (!playing) {
      setPhase("A moment for yourself");
      return;
    }
    setPhase("Breathe in gently");
    let inhale = true;
    const timer = setInterval(() => {
      inhale = !inhale;
      setPhase(inhale ? "Breathe in gently" : "Breathe out slowly");
    }, 4000);
    return () => clearInterval(timer);
  }, [playing]);
  return (
    <section
      className={`breathe-card ${playing ? "playing" : ""}`}
      aria-label="Breathing break"
    >
      <div className="breathe-orb" ref={node} aria-hidden="true" />
      <div className="breathe-copy">
        <span className="micro-label">
          <Wind size={14} /> TAKE A BREATHER
        </span>
        <h3>{phase}</h3>
        <p>Follow your comfortable rhythm.</p>
      </div>
      <button
        className="play-button"
        aria-label={
          playing ? "Pause breathing exercise" : "Start breathing exercise"
        }
        onClick={() => setPlaying(!playing)}
      >
        {playing ? <Pause size={20} /> : <Play size={20} />}
      </button>
    </section>
  );
}

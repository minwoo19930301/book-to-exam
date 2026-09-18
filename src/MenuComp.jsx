import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

const ITEMS = ["뷰어", "객관식 문제", "주관식 문제"];

export default function MenuComp() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const title = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: "#fff", padding: "28px 24px", fontFamily: "Inter, sans-serif", color: "#18181b" }}>
      <div style={{ opacity: title, fontSize: 16, fontWeight: 600, marginBottom: 18 }}>
        시험지
      </div>
      {ITEMS.map((label, i) => {
        const start = 10 + i * 12;
        const t = spring({ frame: frame - start, fps, config: { damping: 16, mass: 0.7, stiffness: 140 } });
        const y = interpolate(t, [0, 1], [18, 0]);
        return (
          <div
            key={label}
            style={{
              opacity: t,
              transform: `translateY(${y}px)`,
              borderTop: i === 0 ? "none" : "1px solid #e4e4e7",
              padding: "14px 0",
              fontSize: 20,
              letterSpacing: "-0.03em",
            }}
          >
            {label}
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

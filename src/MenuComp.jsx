import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

export default function FingerHint() {
  const frame = useCurrentFrame();
  const y = interpolate(Math.sin(frame / 6), [-1, 1], [0, 8]);

  return (
    <AbsoluteFill style={{ background: "transparent", justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 6 }}>
      <div style={{ transform: `translateY(${-y}px)`, fontSize: 26, lineHeight: 1 }}>👆</div>
      <div style={{ fontSize: 13, color: "#78716c", letterSpacing: "-0.02em" }}>여기를 클릭하면</div>
    </AbsoluteFill>
  );
}

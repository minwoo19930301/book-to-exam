export async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(path);
  return r.json();
}

export function $(sel, root = document) {
  return root.querySelector(sel);
}

export function shuffle(arr, rng = Math) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pick(arr, n, rng = Math) {
  return shuffle(arr, rng).slice(0, n);
}

export function showHowtoOnce() {
  if (localStorage.getItem("sonnote-howto") === "1") return;
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <div class="box">
      <h2 style="margin:0 0 8px">이렇게 넘기면 됩니다</h2>
      <p class="tiny">손글씨 메모를 넘기고, 객관식·서술형으로 스스로 채점합니다.</p>
      <img src="assets/howto.gif" alt="손글씨 메모 넘기는 예시">
      <div class="row" style="margin-top:12px;justify-content:flex-end">
        <button class="btn primary" type="button">시작</button>
      </div>
    </div>`;
  modal.querySelector("button").onclick = () => {
    localStorage.setItem("sonnote-howto", "1");
    modal.remove();
  };
  document.body.appendChild(modal);
}

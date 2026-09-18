import { useEffect, useState } from "react";
import Chrome from "./Chrome.jsx";
import AiGate from "./AiGate.jsx";
import { clean, pick, usable, scoreLocal } from "./text.js";
import { lastKey, rememberKey, sessionId } from "./settings.jsx";

export default function Exam() {
  const prev = lastKey();
  const [pack, setPack] = useState(null);
  const [mc, setMc] = useState("");
  const [blank, setBlank] = useState("");
  const [essay, setEssay] = useState("");
  const [provider, setProvider] = useState(prev.provider || "gemini");
  const [keyVal, setKey] = useState(prev.key || "");
  const [ask, setAsk] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [status, setStatus] = useState("");
  const [out, setOut] = useState(null);

  function draw(qs, es) {
    const mcs = qs.filter((q) => q.type === "mc" && usable(q));
    const blanks = qs.filter((q) => q.type === "blank" && usable(q));
    const mcQ = pick(mcs);
    const blankQ = pick(blanks);
    const essayQ = pick(es);
    if (!mcQ || !blankQ || !essayQ) return;
    setPack({ mc: mcQ, blank: blankQ, essay: essayQ });
    setMc("");
    setBlank("");
    setEssay("");
    setOut(null);
    setStatus("");
    setAsk(false);
  }

  useEffect(() => {
    Promise.all([
      fetch("/data/questions.json").then((r) => r.json()),
      fetch("/data/essays.json").then((r) => r.json()),
    ]).then(([qs, es]) => draw(qs, es));
  }, []);

  async function reload() {
    const [qs, es] = await Promise.all([
      fetch("/data/questions.json").then((r) => r.json()),
      fetch("/data/essays.json").then((r) => r.json()),
    ]);
    draw(qs, es);
  }

  function payload() {
    return {
      sessionId: sessionId(),
      items: [
        { ...pack.mc, userAnswer: mc },
        { ...pack.blank, userAnswer: blank },
        { ...pack.essay, type: "essay", userAnswer: essay },
      ],
    };
  }

  function clickGrade() {
    if (!keyVal.trim()) {
      setAsk(true);
      setStatus("API 키를 넣거나 임시 사용을 눌러 주세요.");
      return;
    }
    return runGrade({ mode: "key" });
  }

  async function runGrade({ mode }) {
    if (!pack) return;
    if (mode === "key" && !keyVal.trim()) {
      setAsk(true);
      setStatus("API 키를 넣거나 임시 사용을 눌러 주세요.");
      return;
    }
    setAsk(true);
    setWaiting(true);
    setOut(null);
    setStatus(mode === "temp" ? "잠시 기다려 채점합니다…" : "채점 중");
    try {
      const url = mode === "temp" && !keyVal.trim() ? "/api/grade-temp" : "/api/grade";
      const body = mode === "temp" && !keyVal.trim()
        ? payload()
        : { provider, apiKey: keyVal.trim() || lastKey().key, ...payload() };
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || r.statusText);
      if (mode === "key" || keyVal.trim()) rememberKey(provider, keyVal.trim() || lastKey().key);
      setOut(mergeLocal(pack, { mc, blank, essay }, data));
      setStatus(`총점 ${data.total} / ${data.max}`);
    } catch (err) {
      const local = mergeLocal(pack, { mc, blank, essay }, null);
      setOut(local);
      setStatus(String(err.message || err));
    } finally {
      setWaiting(false);
    }
  }

  function onTemp() {
    const saved = lastKey();
    if (saved.key) {
      setKey(saved.key);
      setProvider(saved.provider);
      return runGrade({ mode: "key" });
    }
    return runGrade({ mode: "temp" });
  }

  if (!pack) return <Chrome title="시험">불러오는 중</Chrome>;

  const items = [
    { key: "mc", label: "객관식", q: pack.mc },
    { key: "blank", label: "빈칸", q: pack.blank },
    { key: "essay", label: "서술형", q: pack.essay },
  ];

  return (
    <Chrome title="시험">
      <h1>객관식 · 빈칸 · 서술형을 한 문항씩 뽑았습니다.</h1>
      <div className="row">
        <button type="button" onClick={reload}>다시 뽑기</button>
        <button type="button" onClick={clickGrade} disabled={waiting}>채점</button>
      </div>

      {items.map((it, i) => {
        const q = it.q;
        const mark = out?.byId?.[q.id];
        return (
          <div className="card q" key={q.id}>
            <p className="kicker">{i + 1}. {it.label}</p>
            <h3>{clean(q.prompt || q.title)}</h3>
            {it.key === "mc" && (q.choices || []).map((c, ci) => {
              const cls = mark
                ? (ci === q.answer ? "choice ok" : Number(mc) === ci ? "choice bad" : "choice")
                : Number(mc) === ci ? "choice on" : "choice";
              return (
                <label className={cls} key={ci}>
                  <input type="radio" name="exam-mc" checked={Number(mc) === ci} onChange={() => setMc(ci)} />
                  <span>{clean(c)}</span>
                </label>
              );
            })}
            {it.key === "blank" && (
              <input value={blank} onChange={(e) => setBlank(e.target.value)} placeholder="용어를 쓰세요" />
            )}
            {it.key === "essay" && (
              <textarea value={essay} onChange={(e) => setEssay(e.target.value)} placeholder="답을 작성하세요." />
            )}
            {mark && (
              <div className="explain">
                <p>{mark.good === true ? "맞음" : mark.good === false ? "틀림" : `점수 ${mark.score} / ${mark.max}`}</p>
                {mark.explain && <p>{mark.explain}</p>}
                {mark.comment && <p>{mark.comment}</p>}
              </div>
            )}
          </div>
        );
      })}

      {(ask || out) && (
        <AiGate
          provider={provider}
          setProvider={setProvider}
          keyVal={keyVal}
          setKey={setKey}
          onGrade={() => runGrade({ mode: "key" })}
          onTemp={onTemp}
          status={status}
          waiting={waiting}
        />
      )}

      {out?.feedback && <div className="card explain"><p className="kicker">총평</p><p>{out.feedback}</p></div>}
    </Chrome>
  );
}

function mergeLocal(pack, answers, data) {
  const localMc = scoreLocal(pack.mc, answers.mc);
  const localBlank = scoreLocal(pack.blank, answers.blank);
  const byId = {
    [pack.mc.id]: { ...localMc },
    [pack.blank.id]: { ...localBlank },
    [pack.essay.id]: { good: null, score: 0, max: pack.essay.rubric.reduce((s, r) => s + r.max, 0), explain: "" },
  };
  if (data?.items) {
    for (const it of data.items) {
      byId[it.id] = { ...byId[it.id], ...it };
    }
  }
  return {
    byId,
    total: data?.total,
    max: data?.max,
    feedback: data?.feedback || "",
  };
}
